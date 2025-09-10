import { RedisService } from './RedisService';
import { logger } from '../utils/logger';
import { IFileChunk, IFileInfo } from '../types';
import { RedisValue } from 'ioredis';

export class FileTracker {
  private redisService: RedisService;
  private readonly FILE_PREFIX = 'file:';
  private readonly CHUNK_PREFIX = 'chunk:';
  private readonly PEER_FILES_PREFIX = 'peer_files:';
  private readonly FILE_PEERS_PREFIX = 'file_peers:';
  private readonly FILE_INDEX = 'file_index';
  private readonly FILE_STATS_KEY = 'file_stats';

  constructor(redisService: RedisService) {
    this.redisService = redisService;
  }

  /**
   * Announce chunks that a peer has available
   */
  public async announceChunks(peerId: string, chunks: IFileChunk[]): Promise<void> {
    try {
      const pipeline = this.redisService.pipeline();
      const processedFiles = new Set<string>();

      for (const chunk of chunks) {
        // Store chunk information
        const chunkKey = this.getChunkKey(chunk.fileHash, chunk.chunkIndex);
        const chunkData: { [key: string]: RedisValue } = {
          fileHash: chunk.fileHash,
          chunkIndex: chunk.chunkIndex,
          size: chunk.size,
          peerId: peerId,
          timestamp: new Date().toISOString(),
        };
        if(chunk.checksum) {
            chunkData.checksum = chunk.checksum;
        }

        pipeline.hset(chunkKey, chunkData);

        // Add peer to file's peer list
        pipeline.sadd(this.getFilePeersKey(chunk.fileHash), peerId);
        
        // Add file to peer's file list
        pipeline.sadd(this.getPeerFilesKey(peerId), chunk.fileHash);

        // Update file information (only once per file)
        if (!processedFiles.has(chunk.fileHash)) {
          processedFiles.add(chunk.fileHash);
          
          const fileKey = this.getFileKey(chunk.fileHash);
          const fileData: { [key: string]: RedisValue } = {
            'hash': chunk.fileHash,
            'lastUpdated': new Date().toISOString()
          };
          
          // Add to file index for searching
          if (chunk.fileName) {
            fileData['name'] = chunk.fileName;
            pipeline.sadd(this.FILE_INDEX, chunk.fileHash);
          }
          
          if (chunk.fileSize) {
            fileData['size'] = chunk.fileSize;
          }
          pipeline.hset(fileKey, fileData);
        }

        // Set expiration for chunk (peer should re-announce periodically)
        pipeline.expire(chunkKey, 7200); // 2 hours
      }

      // Update statistics
      pipeline.incrby(`${this.FILE_STATS_KEY}:total_chunks`, chunks.length);
      
      if(processedFiles.size > 0){
          const fileKeys = Array.from(processedFiles).map(hash => this.getFileKey(hash));
          pipeline.sadd(this.FILE_INDEX, ...fileKeys);
      }


      await pipeline.exec();
      
      logger.info(`Announced ${chunks.length} chunks from peer ${peerId} for ${processedFiles.size} files`);
    } catch (error) {
      logger.error(`Error announcing chunks for peer ${peerId}:`, error);
      throw error;
    }
  }

  /**
   * Get all peers that have a specific file
   */
  public async getPeersWithFile(fileHash: string): Promise<string[]> {
    try {
      const filePeersKey = this.getFilePeersKey(fileHash);
      return await this.redisService.smembers(filePeersKey);
    } catch (error) {
      logger.error(`Error getting peers for file ${fileHash}:`, error);
      throw error;
    }
  }

  /**
   * Get all files that a peer has
   */
  public async getFilesForPeer(peerId: string): Promise<string[]> {
    try {
      const peerFilesKey = this.getPeerFilesKey(peerId);
      return await this.redisService.smembers(peerFilesKey);
    } catch (error) {
      logger.error(`Error getting files for peer ${peerId}:`, error);
      throw error;
    }
  }

  /**
   * Get file information
   */
  public async getFileInfo(fileHash: string): Promise<IFileInfo | null> {
    try {
      const fileKey = this.getFileKey(fileHash);
      const fileData = await this.redisService.hgetall(fileKey);
      
      if (!fileData || Object.keys(fileData).length === 0) {
        return null;
      }

      const peers = await this.getPeersWithFile(fileHash);
      const chunks = await this.getFileChunks(fileHash);

      return {
        hash: fileData.hash,
        name: fileData.name || '',
        size: fileData.size ? parseInt(fileData.size) : 0,
        lastUpdated: fileData.lastUpdated ? new Date(fileData.lastUpdated) : new Date(),
        peerCount: peers.length,
        chunkCount: chunks.length,
        peers
      };
    } catch (error) {
      logger.error(`Error getting file info for ${fileHash}:`, error);
      throw error;
    }
  }

  /**
   * Get all chunks for a file
   */
  public async getFileChunks(fileHash: string): Promise<IFileChunk[]> {
    try {
      // Get all chunk keys for this file
      const chunkKeys = await this.redisService.keys(`${this.CHUNK_PREFIX}${fileHash}:*`);
      
      if (chunkKeys.length === 0) {
        return [];
      }

      // Use pipeline to get all chunk data
      const pipeline = this.redisService.pipeline();
      chunkKeys.forEach(key => pipeline.hgetall(key));
      
      const results = await pipeline.exec();
      const chunks: IFileChunk[] = [];

      if (results) {
        results.forEach((result: [Error | null, any], index: number) => {
          const [error, chunkData] = result;
          if (error) {
              logger.error(`Error retrieving chunk ${chunkKeys[index]} from pipeline:`, error);
              return;
          }

          if (chunkData && Object.keys(chunkData).length > 0) {
            try {
              chunks.push({
                fileHash: chunkData.fileHash,
                chunkIndex: parseInt(chunkData.chunkIndex),
                size: parseInt(chunkData.size),
                ...(chunkData.checksum && { checksum: chunkData.checksum }),
                ...(chunkData.fileName && { fileName: chunkData.fileName }),
                ...(chunkData.fileSize && { fileSize: parseInt(chunkData.fileSize) })
              });
            } catch (err) {
              logger.error(`Error deserializing chunk ${chunkKeys[index]}:`, err);
            }
          }
        });
      }

      // Sort chunks by index
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      return chunks;
    } catch (error) {
      logger.error(`Error getting chunks for file ${fileHash}:`, error);
      throw error;
    }
  }

  /**
   * Search for files by name or hash
   */
  public async searchFiles(query: string, limit: number = 50): Promise<IFileInfo[]> {
    try {
      const fileHashes = await this.redisService.smembers(this.FILE_INDEX);
      const results: IFileInfo[] = [];
      
      if (fileHashes.length === 0) {
        return results;
      }

      // Get file information for all indexed files
      const pipeline = this.redisService.pipeline();
      fileHashes.forEach(hash => pipeline.hgetall(this.getFileKey(hash)));
      
      const fileResults = await pipeline.exec();
      
      if (!fileResults) {
        return results;
      }

      // Filter and score results
      const scoredResults: { info: IFileInfo; score: number }[] = [];
      
      for (let i = 0; i < fileResults.length; i++) {
        const [error, fileData] = fileResults[i];
        if (error || !fileData || Object.keys(fileData).length === 0) {
          continue;
        }
        
        const fileHash = fileHashes[i];
        
        // Calculate relevance score
        let score = 0;
        const queryLower = query.toLowerCase();
        
        // Exact hash match gets highest score
        if (fileHash.toLowerCase() === queryLower) {
          score = 100;
        }
        // Partial hash match
        else if (fileHash.toLowerCase().includes(queryLower)) {
          score = 80;
        }
        // File name matches
        else if (fileData.name) {
          const nameLower = fileData.name.toLowerCase();
          if (nameLower === queryLower) {
            score = 90;
          } else if (nameLower.includes(queryLower)) {
            score = 70 - (nameLower.length - queryLower.length) * 0.1;
          }
        }

        if (score > 0) {
          const peers = await this.getPeersWithFile(fileHash);
          const chunks = await this.getFileChunks(fileHash);
          
          const fileInfo: IFileInfo = {
            hash: fileHash,
            name: fileData.name || '',
            size: fileData.size ? parseInt(fileData.size) : 0,
            lastUpdated: fileData.lastUpdated ? new Date(fileData.lastUpdated) : new Date(),
            peerCount: peers.length,
            chunkCount: chunks.length,
            peers
          };
          
          scoredResults.push({ info: fileInfo, score });
        }
      }

      // Sort by score (descending) and return limited results
      scoredResults.sort((a, b) => b.score - a.score);
      return scoredResults.slice(0, limit).map(result => result.info);
      
    } catch (error) {
      logger.error(`Error searching files with query "${query}":`, error);
      throw error;
    }
  }

  /**
   * Remove all chunks associated with a peer
   */
  public async removePeerChunks(peerId: string): Promise<void> {
    try {
      const files = await this.getFilesForPeer(peerId);
      if (files.length === 0) return;

      const pipeline = this.redisService.pipeline();
      
      for (const fileHash of files) {
        // Remove peer from file's peer list
        pipeline.srem(this.getFilePeersKey(fileHash), peerId);
        
        const chunkKeysPattern = `${this.CHUNK_PREFIX}${fileHash}:*`;
        const chunkKeys = await this.redisService.keys(chunkKeysPattern);

        for (const chunkKey of chunkKeys) {
            const chunkPeerId = await this.redisService.hget(chunkKey, 'peerId');
            if (chunkPeerId === peerId) {
                pipeline.del(chunkKey);
            }
        }
      }
      
      // Remove the peer's own list of files
      pipeline.del(this.getPeerFilesKey(peerId));
      
      await pipeline.exec();
      logger.info(`Removed all chunk announcements for peer ${peerId}`);
    } catch (error) {
      logger.error(`Error removing chunks for peer ${peerId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get total number of tracked files.
   */
  public async getTotalFiles(): Promise<number> {
      try {
          const count = await this.redisService.scard(this.FILE_INDEX);
          return count;
      } catch (error) {
          logger.error('Error getting total files:', error);
          return 0;
      }
  }

  /**
   * Get total number of tracked chunks.
   */
  public async getTotalChunks(): Promise<number> {
      try {
          const total = await this.redisService.get(`${this.FILE_STATS_KEY}:total_chunks`);
          return total ? parseInt(total, 10) : 0;
      } catch (error) {
          logger.error('Error getting total chunks:', error);
          return 0;
      }
  }


  // Key generation utility methods
  private getFileKey(fileHash: string): string {
    return `${this.FILE_PREFIX}${fileHash}`;
  }

  private getChunkKey(fileHash: string, chunkIndex: number): string {
    return `${this.CHUNK_PREFIX}${fileHash}:${chunkIndex}`;
  }

  private getPeerFilesKey(peerId: string): string {
    return `${this.PEER_FILES_PREFIX}${peerId}`;
  }

  private getFilePeersKey(fileHash: string): string {
    return `${this.FILE_PEERS_PREFIX}${fileHash}`;
  }
}

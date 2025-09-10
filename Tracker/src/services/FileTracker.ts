// src/services/FileTracker.ts

import { RedisService } from './RedisService';
import { IFileChunk, IFileInfo } from '../types';
import { logger } from '../utils/logger';

// --- Redis Key Prefixes ---
const FILE_INFO_PREFIX = 'file:'; // HASH: Stores metadata for a file hash
const CHUNK_PEERS_PREFIX = 'chunk:'; // SET: Stores peer IDs that have a specific chunk
const PEER_FILES_PREFIX = 'peer_files:'; // SET: Stores file hashes a peer is seeding
const ALL_FILES_SET = 'all_files'; // SET: Stores all unique file hashes for stats
const FILE_SEARCH_KEY = 'file_search'; // ZSET: For searching files by name

export class FileTracker {
  private redis: RedisService;

  constructor(redisService: RedisService) {
    this.redis = redisService;
  }

  /**
   * Called when a peer announces it has chunks for a file.
   * This method registers the file and associates the peer with its chunks.
   */
  public async announceChunks(
    peerId: string,
    fileInfo: IFileInfo,
    chunks: IFileChunk[]
  ): Promise<void> {
    const redis = this.redis.getClient();
    const fileKey = `${FILE_INFO_PREFIX}${fileInfo.hash}`;

    const pipeline = redis.pipeline();

    // 1. Store the file's metadata if it's the first time we've seen it.
    pipeline.hsetnx(fileKey, 'name', fileInfo.name);
    pipeline.hsetnx(fileKey, 'size', fileInfo.size);
    pipeline.hsetnx(fileKey, 'chunkCount', fileInfo.chunkCount);

    // 2. Add the file to the set of all unique files for stats.
    pipeline.sadd(ALL_FILES_SET, fileInfo.hash);

    // 3. Add the file to the searchable sorted set. Score is 0 for alphabetical sorting.
    const searchMember = `${fileInfo.name.toLowerCase()}:${fileInfo.hash}`;
    pipeline.zadd(FILE_SEARCH_KEY, 0, searchMember);
    
    // 4. For each chunk, add the peer to the set of peers who have that chunk.
    for (const chunk of chunks) {
      const chunkKey = `${CHUNK_PEERS_PREFIX}${chunk.fileHash}:${chunk.chunkIndex}`;
      pipeline.sadd(chunkKey, peerId);
    }
    
    // 5. Record that this peer is seeding this file (for easy cleanup on disconnect).
    const peerFilesKey = `${PEER_FILES_PREFIX}${peerId}`;
    pipeline.sadd(peerFilesKey, fileInfo.hash);
    
    await pipeline.exec();
    logger.info(`Peer ${peerId} announced ${chunks.length} chunks for file ${fileInfo.name}`);
  }

  /**
   * Retrieves a list of peer IDs that have a specific chunk of a file.
   * @returns An array of peer IDs.
   */
  public async getPeersForChunk(fileHash: string, chunkIndex: number): Promise<string[]> {
    const chunkKey = `${CHUNK_PEERS_PREFIX}${fileHash}:${chunkIndex}`;
    return this.redis.getClient().smembers(chunkKey);
  }
  
  /**
   * Cleans up all records associated with a peer when they disconnect.
   */
  public async removePeerChunks(peerId: string): Promise<void> {
    const redis = this.redis.getClient();
    const peerFilesKey = `${PEER_FILES_PREFIX}${peerId}`;

    // Find all files the peer was seeding
    const fileHashes = await redis.smembers(peerFilesKey);
    if (fileHashes.length === 0) {
      return; // Nothing to clean up
    }
    
    const pipeline = redis.pipeline();

    for (const hash of fileHashes) {
      const fileKey = `${FILE_INFO_PREFIX}${hash}`;
      const chunkCountStr = await redis.hget(fileKey, 'chunkCount');
      const chunkCount = parseInt(chunkCountStr || '0', 10);
      
      // For each chunk of the file, remove the peer from the set
      for (let i = 0; i < chunkCount; i++) {
        const chunkKey = `${CHUNK_PEERS_PREFIX}${hash}:${i}`;
        pipeline.srem(chunkKey, peerId);
      }
    }
    
    // Finally, delete the record of files this peer was seeding
    pipeline.del(peerFilesKey);

    await pipeline.exec();
    logger.info(`Cleaned up chunk records for disconnected peer ${peerId}`);
  }
  
  /**
   * Searches for files by name (prefix search).
   * @returns A list of file metadata objects matching the query.
   */
  public async searchFiles(query: string, limit = 50): Promise<IFileInfo[]> {
    const redis = this.redis.getClient();
    // ZRANGEBYLEX is used for alphabetical range queries on a sorted set
    const members = await redis.zrangebylex(
      FILE_SEARCH_KEY,
      `[${query.toLowerCase()}`,
      `[${query.toLowerCase()}\xff` // `\xff` is the highest possible character
    );

    if (members.length === 0) return [];
    
    const pipeline = redis.pipeline();
    const fileHashes: string[] = [];

    // Extract file hashes from the search results
    for (const member of members.slice(0, limit)) {
      const hash = member.split(':').pop();
      if (hash) {
        fileHashes.push(hash);
        pipeline.hgetall(`${FILE_INFO_PREFIX}${hash}`);
      }
    }

    const results = await pipeline.exec();
    if (!results) return [];

    return results
      .map(([, data]) => {
        const fileData = data as Record<string, string>;
        if (!fileData || !fileData.name) return null;
        return {
          hash: fileHashes.shift()!, // Assuming order is preserved
          name: fileData.name,
          size: parseInt(fileData.size, 10),
          chunkCount: parseInt(fileData.chunkCount, 10),
        };
      })
      .filter((f): f is IFileInfo => f !== null);
  }

  /**
   * Gets the total count of unique files known to the tracker.
   */
  public async getTotalFiles(): Promise<number> {
    return this.redis.getClient().scard(ALL_FILES_SET);
  }

  // Note: getTotalChunks is more complex as it requires summing up all chunks of all files.
  // It can be computationally expensive and is often omitted or estimated.
  public async getTotalChunks(): Promise<number> {
    return 0; // Placeholder
  }
}
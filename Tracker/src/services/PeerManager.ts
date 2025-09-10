import { RedisService } from './RedisService';
import { logger } from '../utils/logger';
import { IPeer } from '../types';
import { Pipeline, RedisValue } from 'ioredis';

export class PeerManager {
  private redisService: RedisService;
  private readonly PEER_PREFIX = 'peer:';
  private readonly ACTIVE_PEERS_SET = 'active_peers';
  private readonly PEER_STATS_KEY = 'peer_stats';

  constructor(redisService: RedisService) {
    this.redisService = redisService;
  }

  /**
   * Register a new peer in the system
   */
  public async registerPeer(peer: IPeer): Promise<void> {
    try {
      const peerKey = this.getPeerKey(peer.id);
      const peerData = this.serializePeer(peer);

      // Use pipeline for atomic operations
      const pipeline = this.redisService.pipeline();
      
      // Store peer data
      pipeline.hset(peerKey, peerData);
      
      // Add to active peers set
      pipeline.sadd(this.ACTIVE_PEERS_SET, peer.id);
      
      // Set expiration for peer key (cleanup backup)
      pipeline.expire(peerKey, 3600); // 1 hour
      
      // Update peer count
      const isNewPeer = await this.redisService.hset(this.PEER_STATS_KEY, 'total', '0');
      if (isNewPeer) {
          pipeline.hincrby(this.PEER_STATS_KEY, 'total', 1);
      }
      
      await pipeline.exec();
      
      logger.info(`Peer registered: ${peer.id} at ${peer.address}:${peer.port}`);
    } catch (error) {
      logger.error(`Error registering peer ${peer.id}:`, error);
      throw error;
    }
  }

  /**
   * Update the last seen timestamp for a peer
   */
  public async updateLastSeen(peerId: string): Promise<void> {
    try {
      const peerKey = this.getPeerKey(peerId);
      const exists = await this.redisService.exists(peerKey);
      
      if (!exists) {
        logger.warn(`Attempted to update non-existent peer: ${peerId}`);
        return;
      }

      await this.redisService.hset(peerKey, 'lastSeen', new Date().toISOString());
      await this.redisService.expire(peerKey, 3600); // Refresh expiration
      
    } catch (error) {
      logger.error(`Error updating last seen for peer ${peerId}:`, error);
      throw error;
    }
  }

  /**
   * Unregister a peer from the system
   */
  public async unregisterPeer(peerId: string): Promise<void> {
    try {
      const peerKey = this.getPeerKey(peerId);
      
      // Use pipeline for atomic operations
      const pipeline = this.redisService.pipeline();
      
      // Remove peer data
      pipeline.del(peerKey);
      
      // Remove from active peers set
      pipeline.srem(this.ACTIVE_PEERS_SET, peerId);
      
      await pipeline.exec();
      
      logger.info(`Peer unregistered: ${peerId}`);
    } catch (error) {
      logger.error(`Error unregistering peer ${peerId}:`, error);
      throw error;
    }
  }

  /**
   * Get peer information by ID
   */
  public async getPeer(peerId: string): Promise<IPeer | null> {
    try {
      const peerKey = this.getPeerKey(peerId);
      const peerData = await this.redisService.hgetall(peerKey);
      
      if (!peerData || Object.keys(peerData).length === 0) {
        return null;
      }
      
      return this.deserializePeer(peerData);
    } catch (error) {
      logger.error(`Error getting peer ${peerId}:`, error);
      throw error;
    }
  }

  /**
   * Get all active peer IDs
   */
  public async getActivePeerIds(): Promise<string[]> {
    try {
      return await this.redisService.smembers(this.ACTIVE_PEERS_SET);
    } catch (error) {
      logger.error('Error getting active peer IDs:', error);
      throw error;
    }
  }

  /**
   * Get all active peers with full information
   */
  public async getActivePeersInfo(): Promise<IPeer[]> {
    try {
      const peerIds = await this.getActivePeerIds();
      if (peerIds.length === 0) return [];

      const peers: IPeer[] = [];
      
      // Use pipeline for efficient batch operations
      const pipeline = this.redisService.pipeline();
      
      peerIds.forEach(peerId => {
        pipeline.hgetall(this.getPeerKey(peerId));
      });
      
      const results = await pipeline.exec();
      
      if (results) {
        results.forEach((result : [Error | null, any], index: number) => {
          const [error, peerData] = result;
          if (error) {
              logger.error(`Error retrieving peer ${peerIds[index]} from pipeline:`, error);
              return;
          }

          if (peerData && Object.keys(peerData).length > 0) {
            try {
              const peer = this.deserializePeer(peerData as Record<string, string>);
              peers.push(peer);
            } catch (err) {
              logger.error(`Error deserializing peer ${peerIds[index]}:`, err);
            }
          }
        });
      }
      
      return peers;
    } catch (error) {
      logger.error('Error getting active peers:', error);
      throw error;
    }
  }

  /**
   * Get total number of peers ever registered.
   */
  public async getTotalPeers(): Promise<number> {
    try {
      const total = await this.redisService.hget(this.PEER_STATS_KEY, 'total');
      return total ? parseInt(total, 10) : 0;
    } catch (error) {
      logger.error('Error getting total peers:', error);
      return 0;
    }
  }

  /**
   * Get number of currently active peers.
   */
  public async getActivePeers(): Promise<number> {
    try {
      return await this.redisService.scard(this.ACTIVE_PEERS_SET);
    } catch (error) {
      logger.error('Error getting active peers count:', error);
      return 0;
    }
  }

  /**
   * Clean up inactive peers based on last seen timestamp
   */
  public async cleanupInactivePeers(inactiveThresholdMs: number): Promise<number> {
    try {
      const cutoffTime = new Date(Date.now() - inactiveThresholdMs);
      const activePeerIds = await this.getActivePeerIds();
      let cleanedCount = 0;

      if (activePeerIds.length === 0) return 0;

      logger.info(`Starting cleanup of ${activePeerIds.length} peers, cutoff: ${cutoffTime.toISOString()}`);

      const batchSize = 50;
      for (let i = 0; i < activePeerIds.length; i += batchSize) {
        const batch = activePeerIds.slice(i, i + batchSize);
        const cleanupPromises = batch.map(async (peerId) => {
          try {
            const peer = await this.getPeer(peerId);
            if (!peer) {
              await this.redisService.srem(this.ACTIVE_PEERS_SET, peerId);
              return 1;
            }

            if (new Date(peer.lastSeen) < cutoffTime) {
              logger.info(`Cleaning up inactive peer: ${peerId}, last seen: ${peer.lastSeen.toISOString()}`);
              await this.unregisterPeer(peerId);
              return 1;
            }
            return 0;
          } catch (error) {
            logger.error(`Error during cleanup of peer ${peerId}:`, error);
            return 0;
          }
        });

        const batchResults = await Promise.all(cleanupPromises);
        cleanedCount += batchResults.reduce((sum: number, count: number) => sum + count, 0);
      }

      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} inactive peers`);
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Error during peer cleanup:', error);
      throw error;
    }
  }

  /**
   * Check if a peer is active
   */
  public async isPeerActive(peerId: string): Promise<boolean> {
    try {
      const result = await this.redisService.sismember(this.ACTIVE_PEERS_SET, peerId);
      return result === 1;
    } catch (error) {
      logger.error(`Error checking if peer ${peerId} is active:`, error);
      return false;
    }
  }

  private getPeerKey(peerId: string): string {
    return `${this.PEER_PREFIX}${peerId}`;
  }

  private serializePeer(peer: IPeer): Record<string, RedisValue> {
    return {
      id: peer.id,
      address: peer.address,
      port: peer.port,
      lastSeen: peer.lastSeen.toISOString(),
      connected: peer.connected.toString(),
    };
  }

  private deserializePeer(data: Record<string, string>): IPeer {
  return {
    id: data.id,
    address: data.address,
    port: parseInt(data.port) || 0,
    lastSeen: data.lastSeen ? new Date(data.lastSeen) : new Date(0),
    connected: data.connected === 'true',
  };
}
}

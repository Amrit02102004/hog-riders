import { RedisService } from './RedisService';
import { IPeer } from '../types'; 
import { logger } from '../utils/logger'; // Assuming you have a logger utility

// Define a type for the raw data returned by Redis HGETALL
type RedisPeerData = Record<string, string>;

const PEER_KEY_PREFIX = 'peer:';
const ACTIVE_PEERS_SET = 'active_peers';

export class PeerManager {
  private redisClient: RedisService;

  constructor(redisService: RedisService) {
    this.redisClient = redisService;
  }

  public async registerPeer(peer: IPeer): Promise<void> {
    const peerKey = `${PEER_KEY_PREFIX}${peer.id}`;
    const redis = this.redisClient.getClient();

    const pipeline = redis.pipeline();
    pipeline.hset(peerKey, {
      id: peer.id,
      address: peer.address,
      port: peer.port.toString(),
      lastSeen: peer.lastSeen.toISOString(),
    });
    pipeline.sadd(ACTIVE_PEERS_SET, peer.id);

    await pipeline.exec();
  }

  public async unregisterPeer(peerId: string): Promise<void> {
    const redis = this.redisClient.getClient();
    const pipeline = redis.pipeline();

    pipeline.srem(ACTIVE_PEERS_SET, peerId);
    pipeline.del(`${PEER_KEY_PREFIX}${peerId}`);

    await pipeline.exec();
  }

  public async getAllActivePeers(): Promise<IPeer[]> {
    const redis = this.redisClient.getClient();
    const peerIds = await redis.smembers(ACTIVE_PEERS_SET);
    
    if (!peerIds || peerIds.length === 0) {
      return [];
    }

    const pipeline = redis.pipeline();
    peerIds.forEach(id => pipeline.hgetall(`${PEER_KEY_PREFIX}${id}`));
    const results = await pipeline.exec();

    if (!results) {
      return [];
    }
    
    const peers: IPeer[] = results
      .map(([, data]) => {
        // (FIX) Assert the type of data to fix the 'property does not exist' error
        const peerData = data as RedisPeerData; 

        if (typeof peerData !== 'object' || peerData === null || !peerData.id) {
          return null;
        }

        // Now TypeScript knows the shape of peerData
        return {
          id: peerData.id,
          address: peerData.address,
          port: parseInt(peerData.port, 10),
          lastSeen: new Date(peerData.lastSeen),
          connected: true,
        };
      })
      .filter((p): p is IPeer => p !== null);
      
    return peers;
  }

  public async updateLastSeen(peerId: string): Promise<void> {
    const peerKey = `${PEER_KEY_PREFIX}${peerId}`;
    await this.redisClient.getClient().hset(peerKey, 'lastSeen', new Date().toISOString());
  }
  
  /**
   * (FIX) Added the missing method that server.ts requires.
   * It finds and removes peers that haven't sent a heartbeat recently.
   */
  public async cleanupInactivePeers(thresholdMs: number): Promise<void> {
    const now = Date.now();
    const allPeers = await this.getAllActivePeers();
    
    for (const peer of allPeers) {
      const lastSeenTime = peer.lastSeen.getTime();
      if (now - lastSeenTime > thresholdMs) {
        logger.info(`Cleaning up inactive peer: ${peer.id}`);
        await this.unregisterPeer(peer.id);
      }
    }
  }

  public async getActivePeers(): Promise<number> {
    return this.redisClient.getClient().scard(ACTIVE_PEERS_SET);
  }

  public async getTotalPeers(): Promise<number> {
    return this.getActivePeers();
  }
}
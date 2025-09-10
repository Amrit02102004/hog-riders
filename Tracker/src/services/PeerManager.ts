import { RedisService } from './RedisService';
import { IPeer } from '../types';
import { logger } from '../utils/logger';

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
            connected: 'true', // Store connected status
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

    /**
     * ✨ NEW: Retrieves full peer details for a given list of peer IDs.
     * This is used by the server to provide connectable addresses to leechers.
     * @param peerIds - An array of peer IDs (socket.id) to look up.
     * @returns A promise that resolves to an array of IPeer objects.
     */
    public async getPeersByIds(peerIds: string[]): Promise<IPeer[]> {
        if (!peerIds || peerIds.length === 0) {
            return [];
        }

        const redis = this.redisClient.getClient();
        const pipeline = redis.pipeline();
        peerIds.forEach(id => pipeline.hgetall(`${PEER_KEY_PREFIX}${id}`));
        const results = await pipeline.exec();

        if (!results) {
            return [];
        }

        const peers: IPeer[] = results
            .map(([, data]) => {
                const peerData = data as RedisPeerData;
                if (typeof peerData !== 'object' || peerData === null || !peerData.id) {
                    return null;
                }

                return {
                    id: peerData.id,
                    address: peerData.address,
                    port: parseInt(peerData.port, 10),
                    lastSeen: new Date(peerData.lastSeen),
                    connected: peerData.connected === 'true',
                };
            })
            .filter((p): p is IPeer => p !== null);

        return peers;
    }

    public async getAllActivePeers(): Promise<IPeer[]> {
        const redis = this.redisClient.getClient();
        const peerIds = await redis.smembers(ACTIVE_PEERS_SET);
        return this.getPeersByIds(peerIds);
    }

    public async updateLastSeen(peerId: string): Promise<void> {
        const peerKey = `${PEER_KEY_PREFIX}${peerId}`;
        await this.redisClient.getClient().hset(peerKey, 'lastSeen', new Date().toISOString());
    }

    /**
     * Finds and removes peers that haven't sent a heartbeat recently.
     * 💡 FIX: Returns the number of peers that were cleaned up.
     */
    public async cleanupInactivePeers(thresholdMs: number): Promise<number> {
        const now = Date.now();
        const allPeers = await this.getAllActivePeers();
        let inactiveCount = 0;

        const cleanupPromises: Promise<void>[] = [];

        for (const peer of allPeers) {
            const lastSeenTime = peer.lastSeen.getTime();
            if (now - lastSeenTime > thresholdMs) {
                logger.info(`Cleaning up inactive peer: ${peer.id}`);
                cleanupPromises.push(this.unregisterPeer(peer.id));
                inactiveCount++;
            }
        }

        await Promise.all(cleanupPromises);
        return inactiveCount;
    }

    public async getActivePeers(): Promise<number> {
        return this.redisClient.getClient().scard(ACTIVE_PEERS_SET);
    }

    public async getTotalPeers(): Promise<number> {
        // This could be a separate metric if you want to track historical peers
        return this.getActivePeers();
    }
}
import Redis from 'ioredis';
import { IPeer } from '../types';
import { RedisManager } from './RedisManager';
import { IPeerManager } from './IPeerManager';

export class RedisPeerManager implements IPeerManager {
    private redis: Redis;
    private peerKeyPrefix = 'peer:';
    private activePeersSetKey = 'active_peers';
    private peersByLastSeenKey = 'peers_by_last_seen';

    constructor() {
        this.redis = RedisManager.getInstance();
    }

    private getPeerKey(peerId: string): string {
        return `${this.peerKeyPrefix}${peerId}`;
    }

    private parsePeer(data: { [key: string]: string } | null): IPeer | undefined {
        if (!data || Object.keys(data).length === 0) {
            return undefined;
        }
        return {
            id: data.id,
            address: data.address,
            port: parseInt(data.port, 10),
            lastSeen: new Date(data.lastSeen),
            connected: data.connected === 'true'
        };
    }

    async registerPeer(peer: IPeer): Promise<void> {
        const peerKey = this.getPeerKey(peer.id);
        const peerData = {
            ...peer,
            lastSeen: peer.lastSeen.toISOString(),
            connected: String(peer.connected)
        };

        const pipeline = this.redis.pipeline();
        pipeline.hmset(peerKey, peerData);
        if (peer.connected) {
            pipeline.sadd(this.activePeersSetKey, peer.id);
        }
        pipeline.zadd(this.peersByLastSeenKey, peer.lastSeen.getTime(), peer.id);
        await pipeline.exec();
    }

    async unregisterPeer(peerId: string): Promise<void> {
        const pipeline = this.redis.pipeline();
        pipeline.del(this.getPeerKey(peerId));
        pipeline.srem(this.activePeersSetKey, peerId);
        pipeline.zrem(this.peersByLastSeenKey, peerId);
        await pipeline.exec();
    }

    async getPeer(peerId: string): Promise<IPeer | undefined> {
        const peerData = await this.redis.hgetall(this.getPeerKey(peerId));
        return this.parsePeer(peerData);
    }

    async getTotalPeers(): Promise<number> {
        return this.redis.zcard(this.peersByLastSeenKey);
    }

    async getActivePeers(): Promise<number> {
        return this.redis.scard(this.activePeersSetKey);
    }

    async getAllActivePeers(): Promise<IPeer[]> {
        const activePeerIds = await this.redis.smembers(this.activePeersSetKey);
        return this.getPeersByIds(activePeerIds);
    }

    async getPeersByIds(ids: string[]): Promise<IPeer[]> {
        if (ids.length === 0) return [];

        const pipeline = this.redis.pipeline();
        ids.forEach(id => pipeline.hgetall(this.getPeerKey(id)));
        const results = await pipeline.exec();

        const peers: IPeer[] = [];
        if (results) {
             results.forEach(([err, data]) => {
                if (!err && data) {
                    const peer = this.parsePeer(data as any);
                    if (peer) peers.push(peer);
                }
            });
        }
        return peers;
    }

    async cleanupInactivePeers(timeout: number): Promise<number> {
        const threshold = Date.now() - timeout;
        const inactivePeerIds = await this.redis.zrangebyscore(this.peersByLastSeenKey, 0, threshold);

        if (inactivePeerIds.length === 0) return 0;

        const pipeline = this.redis.pipeline();
        inactivePeerIds.forEach(id => {
            pipeline.del(this.getPeerKey(id));
            pipeline.srem(this.activePeersSetKey, id);
        });
        pipeline.zremrangebyscore(this.peersByLastSeenKey, 0, threshold);
        await pipeline.exec();

        return inactivePeerIds.length;
    }
}
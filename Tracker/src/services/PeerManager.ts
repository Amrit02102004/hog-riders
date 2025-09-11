import {IFileInfo, IPeer} from "../types";

export class InMemoryPeerManager {
    private peers: Map<string, IPeer>;

    constructor() {
        this.peers = new Map();
    }

    async registerPeer(peer: IPeer): Promise<void> {
        this.peers.set(peer.id, peer);
    }

    async unregisterPeer(peerId: string): Promise<void> {
        this.peers.delete(peerId);
    }

    async getTotalPeers(): Promise<number> {
        return this.peers.size;
    }

    async getActivePeers(): Promise<number> {
        return [...this.peers.values()].filter(p => p.connected).length;
    }

    async getAllActivePeers(): Promise<IPeer[]> {
        return [...this.peers.values()].filter(p => p.connected);
    }

    async getPeersByIds(ids: string[]): Promise<IPeer[]> {
        return ids.map(id => this.peers.get(id)).filter((p): p is IPeer => p !== undefined);
    }

    async cleanupInactivePeers(timeout: number): Promise<number> {
        const now = Date.now();
        let removed = 0;
        for (const [id, peer] of this.peers.entries()) {
            if (now - peer.lastSeen.getTime() > timeout) {
                this.peers.delete(id);
                removed++;
            }
        }
        return removed;
    }

    async getPeer(peerId: string): Promise<IPeer | undefined> {
        return this.peers.get(peerId);
    }
}

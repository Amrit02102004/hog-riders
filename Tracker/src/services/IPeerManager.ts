import { IPeer } from '../types';

/**
 * Defines the contract for a peer management service.
 * This allows for interchangeable implementations (e.g., in-memory, Redis).
 */
export interface IPeerManager {
    registerPeer(peer: IPeer): Promise<void>;
    unregisterPeer(peerId: string): Promise<void>;
    getPeer(peerId: string): Promise<IPeer | undefined>;
    getTotalPeers(): Promise<number>;
    getActivePeers(): Promise<number>;
    getAllActivePeers(): Promise<IPeer[]>;
    getPeersByIds(ids: string[]): Promise<IPeer[]>;
    cleanupInactivePeers(timeout: number): Promise<number>;
}
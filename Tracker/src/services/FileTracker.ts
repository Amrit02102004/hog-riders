import {IFileChunk, IFileInfo, IPeer} from "../types";
import {InMemoryPeerManager} from "./PeerManager";

export class InMemoryFileTracker {
    private files: Map<string, IFileInfo>;
    private chunks: Map<string, Map<number, Set<string>>>;
    // fileHash → (chunkIndex → Set(peerId))

    constructor() {
        this.files = new Map();
        this.chunks = new Map();
    }

    async getTotalFiles(): Promise<number> {
        return this.files.size;
    }

    async getTotalChunks(): Promise<number> {
        let count = 0;
        for (const chunkMap of this.chunks.values()) {
            count += chunkMap.size;
        }
        return count;
    }

    public async findFileByName(name: string): Promise<IFileInfo | undefined> {
        const files = await this.getAllFiles();
        return files.find(f => f.name === name);
    }


    async getFileChunkMapWithPeers(peerManager: InMemoryPeerManager): Promise<Record<string, IPeer[][]>> {
        const result: Record<string, IPeer[][]> = {};
        for (const [fileHash, chunkMap] of this.chunks.entries()) {
            // Pre-size the array with chunkCount if file info is available
            const fileInfo = this.files.get(fileHash);
            const chunkArr: IPeer[][] = fileInfo ? Array.from({ length: fileInfo.chunkCount }, () => []) : [];

            for (const [chunkIndex, peerIds] of chunkMap.entries()) {
                const peers = await peerManager.getPeersByIds([...peerIds]);
                chunkArr[chunkIndex] = peers;
            }

            result[fileHash] = chunkArr;
        }
        return result;
    }



    async announceChunks(peerId: string, fileInfo: IFileInfo, chunks: IFileChunk[]): Promise<void> {
        this.files.set(fileInfo.hash, fileInfo);

        if (!this.chunks.has(fileInfo.hash)) {
            this.chunks.set(fileInfo.hash, new Map());
        }
        const chunkMap = this.chunks.get(fileInfo.hash)!;

        for (const chunk of chunks) {
            if (!chunkMap.has(chunk.chunkIndex)) {
                chunkMap.set(chunk.chunkIndex, new Set());
            }
            chunkMap.get(chunk.chunkIndex)!.add(peerId);
        }
    }

    async getPeersForChunk(fileHash: string, chunkIndex: number): Promise<string[]> {
        const chunkMap = this.chunks.get(fileHash);
        if (!chunkMap) return [];
        const peers = chunkMap.get(chunkIndex);
        return peers ? [...peers] : [];
    }

    async removePeerChunks(peerId: string): Promise<void> {
        for (const chunkMap of this.chunks.values()) {
            for (const peers of chunkMap.values()) {
                peers.delete(peerId);
            }
        }
    }

    async getAllFiles(): Promise<IFileInfo[]> {
        return [...this.files.values()];
    }

    async getFileInfo(fileHash: string, peerManager: InMemoryPeerManager): Promise<{ fileInfo: IFileInfo; chunkOwnership: IPeer[][] } | null> {
        const fileInfo = this.files.get(fileHash);
        if (!fileInfo) {
            return null;
        }

        // Get chunk ownership data
        const chunkMap = this.chunks.get(fileHash);
        const chunkOwnership: IPeer[][] = Array.from({ length: fileInfo.chunkCount }, () => []);

        if (chunkMap) {
            for (const [chunkIndex, peerIds] of chunkMap.entries()) {
                if (chunkIndex < fileInfo.chunkCount) {
                    const peers = await peerManager.getPeersByIds([...peerIds]);
                    chunkOwnership[chunkIndex] = peers;
                }
            }
        }

        return {
            fileInfo,
            chunkOwnership
        };
    }


}

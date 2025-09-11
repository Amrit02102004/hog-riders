// client/src/leecher.ts
import { io, Socket } from "socket.io-client";
import { IPeer } from "./Types/PeerTypes";

interface FileListItem {
    name: string;
    hash: string;
    size?: number;
    chunks?: number;
}

class Leecher {
    private trackerURL: string;
    private trackerSocket: Socket;
    private isConnected = false;
    private connectionPromise: Promise<void>;

    constructor(trackerURL: string) {
        this.trackerURL = trackerURL;
        this.trackerSocket = io(trackerURL);

        this.connectionPromise = new Promise<void>((resolve, reject) => {
            this.trackerSocket.on("connect", () => {
                console.log("✅ Leecher connected to tracker at", trackerURL);

                this.trackerSocket.emit("register_peer")
                this.isConnected = true;
                resolve();
            });

            this.trackerSocket.on("disconnect", () => {
                console.log("🔌 Leecher disconnected from tracker at", trackerURL);
                this.isConnected = false;
            });

            this.trackerSocket.on("error", (err) => {
                console.error("❌ Error with leecher tracker connection:", err);
                this.isConnected = false;
                reject(err);
            });

            this.trackerSocket.on("peers_for_chunk_response", (data: { fileHash: string; chunkIndex: number; peers: IPeer[] }) => {
                console.log(`🔎 Received peer connection details for chunk ${data.chunkIndex} of file ${data.fileHash.substring(0,10)}...:`);
                if (data.peers && data.peers.length > 0) {
                    data.peers.forEach(peer => {
                        console.log(`   - Peer ${peer.id} available at ${peer.address}:${peer.port}`);
                    });
                } else {
                    console.log("   - No peers found for this chunk.");
                }
            });

            this.trackerSocket.on("filesList", (data: { files: FileListItem[] }) => {
                console.log("📄 Received files list from tracker:", data);
            });

            this.trackerSocket.on("file_info_response", (data) => {
                data.chunkOwnership.forEach((peers: any, index: any) => {
                    console.log(`Chunk ${index} peers:`, peers);
                });
            });

            // Optional: response for hash resolution if server implemented.
            this.trackerSocket.on("resolve_file_hash_response", (data: { found: boolean; fileHash?: string }) => {
                if (!data.found) {
                    console.warn("⚠️ File name not found during hash resolution.");
                } else {
                    console.log("🔐 Resolved file hash:", data.fileHash);
                }
            });
        });
    }

    private async waitForConnection(): Promise<void> {
        if (!this.isConnected) {
            await this.connectionPromise;
        }
    }

    public async ensureConnected(): Promise<void> {
        await this.waitForConnection();
    }

    public async requestPeersForChunk(fileHash: string, chunkIndex: number): Promise<void> {
        await this.waitForConnection();
        this.trackerSocket.emit("request_peers_for_chunk", { fileHash, chunkIndex });
        console.log(`🙏 Requesting peers for chunk ${chunkIndex} of file hash ${fileHash.substring(0,10)}...`);
    }

    public async requestFilesList(): Promise<void> {
        await this.waitForConnection();
        this.trackerSocket.emit("file_list");
    }

    // accepts only fileName.
    public async requestFileInfo(fileName?: string ): Promise<void> {
        console.log("test")
        await this.waitForConnection();
        try{
            this.trackerSocket.emit("request_file_info", fileName );
        }
        catch(err) {
            console.error("Error requesting file info:", err);
        }
    }


    public async computeSHA256(file: File): Promise<string> {
        const buf = await file.arrayBuffer();
        const hashBuf = await crypto.subtle.digest("SHA-256", buf);
        return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
    }
}

export default Leecher;

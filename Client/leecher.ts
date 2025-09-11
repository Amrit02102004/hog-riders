// client/src/leecher.ts
import { io, Socket } from "socket.io-client";
import { IPeer } from "./Types/PeerTypes";
import { IFileInfo } from "./Types/ServerTypes";

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
                this.trackerSocket.emit("register_peer");
                this.isConnected = true;
                resolve();
            });

            this.trackerSocket.on("disconnect", () => {
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

            this.trackerSocket.on("filesList", (data: { files: IFileInfo[] }) => {
                console.log("\n--- Files Available on the Network ---");
                if (data.files && data.files.length > 0) {
                    data.files.forEach(file => {
                        console.log(`- Name: ${file.name}, Size: ${file.size} bytes, Chunks: ${file.chunkCount}`);
                    });
                } else {
                    console.log("No files found on the network.");
                }
                console.log("------------------------------------");
            });

            this.trackerSocket.on("file_info_response", (data) => {
                if (!data || !data.fileInfo) {
                    console.error("Received invalid file info response from tracker.");
                    return;
                }
                console.log(`\n--- Chunk Info for: ${data.fileInfo.name} ---`);
                console.log(`Hash: ${data.fileInfo.hash.substring(0, 15)}...`);
                data.chunkOwnership.forEach((peers: IPeer[], index: number) => {
                    const peerIds = peers.map(p => p.id.substring(0, 5) + '...').join(', ') || 'None';
                    console.log(`- Chunk ${index}: Held by peers -> [${peerIds}]`);
                });
                console.log("-----------------------------------------");
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
    }

    public async requestFilesList(): Promise<void> {
        await this.waitForConnection();
        this.trackerSocket.emit("file_list");
    }

    public async requestFileInfo(fileName?: string ): Promise<void> {
        await this.waitForConnection();
        try{
            this.trackerSocket.emit("request_file_info", fileName );
        }
        catch(err) {
            console.error("Error requesting file info:", err);
        }
    }
}

export default Leecher;
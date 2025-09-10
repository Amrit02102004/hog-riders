// client/src/leecher.ts
import { io, Socket } from "socket.io-client";
import { IPeer } from "./Types/PeerTypes"; // ✨ FIX: Import the IPeer interface

class Leecher {
    private trackerURL: string;
    private trackerSocket: Socket;
    private isConnected: boolean = false;
    private connectionPromise: Promise<void>;

    constructor(trackerURL: string) {
        this.trackerURL = trackerURL;
        this.trackerSocket = io(trackerURL);

        this.connectionPromise = new Promise<void>((resolve, reject) => {
            this.trackerSocket.on("connect", () => {
                console.log("✅ Leecher connected to tracker at", trackerURL);
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

            // ✨ FIX: Updated handler to process the array of IPeer objects.
            this.trackerSocket.on("peers_for_chunk_response", (data: { fileHash: string; chunkIndex: number; peers: IPeer[] }) => {
                console.log(`🔎 Received peer connection details for chunk ${data.chunkIndex} of file ${data.fileHash.substring(0,10)}...:`);
                if (data.peers && data.peers.length > 0) {
                    data.peers.forEach(peer => {
                        console.log(`   - Peer ${peer.id} available at ${peer.address}:${peer.port}`);
                    });
                } else {
                    console.log(`   - No peers found for this chunk.`);
                }
            });

            this.trackerSocket.on("filesList", (data) => {
                console.log("📄 Received files list from tracker:", data);
            })
        });
    }

    private async waitForConnection(): Promise<void> {
        if (this.isConnected) {
            return;
        }
        await this.connectionPromise;
    }

    /**
     * Requests a list of peers that have a specific chunk of a file.
     * This method is the integration point with the server's `request_peers_for_chunk` handler.
     * @param fileHash The hash of the file.
     * @param chunkIndex The index of the chunk requested.
     */
    public async requestPeersForChunk(fileHash: string, chunkIndex: number): Promise<void> {
        await this.waitForConnection();
        const payload = { fileHash, chunkIndex };
        this.trackerSocket.emit("request_peers_for_chunk", payload);
        console.log(`🙏 Requesting peers for chunk ${chunkIndex} of file hash ${fileHash.substring(0,10)}...`);
    }

    public async ensureConnected(): Promise<void> {
        await this.waitForConnection();
    }


    public async requestFilesList(): Promise<void> {
        await this.waitForConnection();
        this.trackerSocket.emit("file_list");
    }

    public async requestFile(fileName: string): Promise<void> {
        console.warn("`requestFile` is not supported by the server.");
    }
}

export default Leecher;
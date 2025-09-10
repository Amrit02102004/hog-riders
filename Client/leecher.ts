// client/src/leecher.ts
import { io, Socket } from "socket.io-client";

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

            // Listen for the correct server response event.
            this.trackerSocket.on("peers_for_chunk_response", (data) => {
                console.log(`🔎 Received peers for chunk ${data.chunkIndex} of file hash ${data.fileHash.substring(0,10)}...:`, data.peerIds);
            });
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

    // NOTE: The methods below (requestFilesList, requestFile, etc.) will not work
    // because the server does not have corresponding event handlers.
    // They are left here to show the original structure but are not functional
    // in this integrated version.

    public async requestFilesList(): Promise<void> {
        console.warn("`requestFilesList` is not supported by the server.");
    }

    public async requestFile(fileName: string): Promise<void> {
        console.warn("`requestFile` is not supported by the server.");
    }
}

export default Leecher;
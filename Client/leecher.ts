// client/src/leecher.ts
import { io, Socket } from "socket.io-client";
import { IPeer } from "./Types/PeerTypes";
import { IFileInfo } from "./Types/ServerTypes";

// This interface combines the file info with the chunk ownership details
export interface IFileDetails {
    fileInfo: IFileInfo;
    chunkOwnership: IPeer[][];
}

class Leecher {
    private trackerURL: string;
    private peerPort: number;
    private trackerSocket: Socket;
    private isConnected = false;
    private connectionPromise: Promise<void>;
    private fileInfoPromises: Map<string, { resolve: (value: IFileDetails) => void, reject: (reason?: any) => void }>;


    constructor(trackerURL: string, peerPort: number) {
        this.trackerURL = trackerURL;
        this.peerPort = peerPort;
        this.trackerSocket = io(trackerURL);
        this.isConnected = false;
        this.fileInfoPromises = new Map();

        this.connectionPromise = new Promise<void>((resolve, reject) => {
            this.trackerSocket.on("connect", () => {
                // Register with the port it's listening on for peer connections
                this.trackerSocket.emit("register_peer", { address: '127.0.0.1', port: this.peerPort });
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

            this.trackerSocket.on("file_info_response", (data: IFileDetails) => {
                if (!data || !data.fileInfo) {
                    console.error("Received invalid file info response from tracker.");
                    if(this.fileInfoPromises.has(data.fileInfo.name)) {
                        this.fileInfoPromises.get(data.fileInfo.name)?.reject("Invalid data");
                    }
                    return;
                }

                // Resolve the promise for the corresponding file request
                if (this.fileInfoPromises.has(data.fileInfo.name)) {
                    this.fileInfoPromises.get(data.fileInfo.name)?.resolve(data);
                    this.fileInfoPromises.delete(data.fileInfo.name);
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

    public async requestFilesList(): Promise<void> {
        await this.waitForConnection();
        this.trackerSocket.emit("file_list");
    }

    public async requestFileInfo(fileName: string): Promise<IFileDetails> {
        await this.waitForConnection();
        return new Promise((resolve, reject) => {
            this.fileInfoPromises.set(fileName, { resolve, reject });
            this.trackerSocket.emit("request_file_info", fileName);
            setTimeout(() => {
                if(this.fileInfoPromises.has(fileName)) {
                    reject(new Error(`Request for file info "${fileName}" timed out.`));
                    this.fileInfoPromises.delete(fileName);
                }
            }, 10000); // 10 second timeout
        });
    }
}

export default Leecher;
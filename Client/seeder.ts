// client/src/seeder.ts
import * as fs from "fs";
import * as path from "path";
import { io, Socket } from "socket.io-client";
import * as crypto from "crypto";
import FileMetadata from "./Types/FileMetadata.js";
import { IFileInfo, IFileChunk } from "./Types/ServerTypes.js";

const MB : number = 1024 * 1024;

class Seeder {
    private trackerURL: string;
    private peerPort: number;
    private partSize: number = MB; // 1 MB per chunk
    private trackerSocket: Socket;
    public fileMap: Map<string, string>; // Maps fileHash to absoluteFilePath
    private isConnected: boolean = false;
    private connectionPromise: Promise<void>;

    constructor(trackerURL: string, peerPort: number) {
        this.trackerURL = trackerURL;
        this.peerPort = peerPort;
        this.trackerSocket = io(trackerURL);
        this.fileMap = new Map();



        this.connectionPromise = new Promise<void>((resolve, reject) => {
            this.trackerSocket.on("connect", () => {
                this.isConnected = true;
                // Register with the port it's listening on for peer connections
                this.trackerSocket.emit("register_peer", { address: '127.0.0.1', port: this.peerPort });
                resolve();
            });

            this.trackerSocket.on("disconnect", () => {
                this.isConnected = false;
            });

            this.trackerSocket.on("error", (err) => {
                this.isConnected = false;
                reject(err);
            });
        });
    }

    private async waitForConnection(): Promise<void> {
        if (this.isConnected) {
            return;
        }
        await this.connectionPromise;
    }

    public parseMetadata(absoluteFilePath: string): FileMetadata | null {
        try {
            const stats = fs.statSync(absoluteFilePath);
            const fileName = path.basename(absoluteFilePath);
            const fileSize = stats.size;

            const hashSource = `${fileName}-${fileSize}`;
            const fileHash = crypto.createHash('sha256').update(hashSource).digest('hex');

            const metadata: FileMetadata = {
                hash: fileHash,
                name: fileName,
                size: fileSize,
                extension: path.extname(absoluteFilePath),
                numParts: Math.ceil(fileSize / this.partSize),
            };
            return metadata;
        } catch (error) {
            console.error("Error parsing file:", error);
            return null;
        }
    }

    private async announceChunks(metadata: FileMetadata, parts: number[]): Promise<void> {
        await this.waitForConnection();

        const fileInfo: IFileInfo = {
            hash: metadata.hash,
            name: metadata.name,
            size: metadata.size,
            chunkCount: metadata.numParts,
        };

        const chunks: IFileChunk[] = parts.map(partIndex => ({
            fileHash: metadata.hash,
            chunkIndex: partIndex,
        }));

        this.trackerSocket.emit("announce_chunks", { fileInfo, chunks });
    }

    public async uploadFile(absoluteFilePath: string): Promise<void> {
        await this.waitForConnection();

        const metadata = this.parseMetadata(absoluteFilePath);
        if (!metadata) {
            console.error("Failed to parse metadata. Upload aborted.");
            return;
        }

        // Store the file path for serving chunks later
        this.fileMap.set(metadata.hash, absoluteFilePath);

        const parts = Array.from({ length: metadata.numParts }, (_, i) => i);
        await this.announceChunks(metadata, parts);
    }

    public async ensureConnected(): Promise<void> {
        await this.waitForConnection();
    }
}

export default Seeder;
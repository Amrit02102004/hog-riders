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
    private partSize: number = MB; // 1 MB per chunk
    private trackerSocket: Socket;
    private partsMap: Map<string, number[]> = new Map(); // Maps absoluteFilePath to array of part indices
    private isConnected: boolean = false;
    private connectionPromise: Promise<void>;

    constructor(trackerURL: string) {
        this.trackerURL = trackerURL;
        this.trackerSocket = io(trackerURL);

        this.connectionPromise = new Promise<void>((resolve, reject) => {
            this.trackerSocket.on("connect", () => {
                console.log("✅ Seeder connected to tracker at", trackerURL);
                this.isConnected = true;
                this.trackerSocket.emit("register_peer")
                resolve();
            });

            this.trackerSocket.on("disconnect", () => {
                console.log("🔌 Seeder disconnected from tracker at", trackerURL);
                this.isConnected = false;
            });

            this.trackerSocket.on("error", (err) => {
                console.error("❌ Error with seeder tracker connection:", err);
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

            // Generate a consistent hash. For a real app, hash the file content.
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

    /**
     * Announces available file chunks to the tracker.
     * This method is the integration point with the server's `announce_chunks` handler.
     */
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

        console.log(`📢 Announcing ${chunks.length} chunks for file: ${fileInfo.name}`);
        this.trackerSocket.emit("announce_chunks", { fileInfo, chunks });
    }

    public async addPart(absoluteFilePath: string, metadata: FileMetadata, partIndex: number): Promise<void> {
        await this.waitForConnection();

        const existingParts = this.partsMap.get(absoluteFilePath) || [];

        if (existingParts.includes(partIndex)) {
            console.log(`Part ${partIndex} already exists for file: ${metadata.name}`);
            return;
        }

        const updatedParts = [...existingParts, partIndex].sort((a, b) => a - b);
        this.partsMap.set(absoluteFilePath, updatedParts);

        await this.announceChunks(metadata, updatedParts);
    }

    public async uploadFile(absoluteFilePath: string): Promise<void> {
        await this.waitForConnection();

        const metadata = this.parseMetadata(absoluteFilePath);
        if (!metadata) {
            console.error("Failed to parse metadata. Upload aborted.");
            return;
        }

        const parts = Array.from({ length: metadata.numParts }, (_, i) => i);
        this.partsMap.set(absoluteFilePath, parts);
        await this.announceChunks(metadata, parts);
        console.log(`✅ Announced complete file: ${metadata.name} with ${metadata.numParts} parts`);
    }

    public async ensureConnected(): Promise<void> {
        await this.waitForConnection();
    }

}

export default Seeder;
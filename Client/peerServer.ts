// Client/peerServer.ts
import { Server, Socket } from "socket.io";
import * as fs from "fs";
import * as path from "path";

const CHUNK_SIZE = 1024 * 1024; // 1 MB

export class PeerServer {
    private io: Server;
    private seededFiles: Map<string, string>; // Maps fileHash to absoluteFilePath

    constructor(port: number) {
        this.io = new Server(port, {
            cors: { origin: "*" }
        });
        this.seededFiles = new Map();
        console.log(`📡 Peer server listening on port ${port}`);
        this.handleConnections();
    }

    // This method allows the main client to tell the server which files it is seeding
    public addSeededFile(fileHash: string, filePath: string): void {
        console.log(`[PeerServer] Now seeding file ${filePath} with hash ${fileHash}`);
        this.seededFiles.set(fileHash, filePath);
    }

    private handleConnections(): void {
        this.io.on("connection", (socket: Socket) => {
            console.log(`[PeerServer] Peer connected: ${socket.id}`);
            socket.on("request_chunk", (data: { fileHash: string, chunkIndex: number }, callback) => {
                const { fileHash, chunkIndex } = data;
                console.log(`[PeerServer] Received request for chunk ${chunkIndex} of file ${fileHash}`);
                const filePath = this.seededFiles.get(fileHash);

                if (!filePath || !fs.existsSync(filePath)) {
                    console.error(`[PeerServer] File not found for hash ${fileHash}`);
                    return callback({ error: "File not found or not seeded." });
                }

                try {
                    const fileDescriptor = fs.openSync(filePath, 'r');
                    const buffer = Buffer.alloc(CHUNK_SIZE);
                    const startPosition = chunkIndex * CHUNK_SIZE;

                    fs.readSync(fileDescriptor, buffer, 0, CHUNK_SIZE, startPosition);
                    fs.closeSync(fileDescriptor);

                    console.log(`[PeerServer] Sending chunk ${chunkIndex} of file ${fileHash}`);
                    callback({ data: buffer });
                } catch (error) {
                    console.error(`[PeerServer] Error reading chunk ${chunkIndex} of file ${fileHash}:`, error);
                    callback({ error: "Failed to read file chunk." });
                }
            });
        });
    }
}
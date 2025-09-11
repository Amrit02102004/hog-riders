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

                const buffer = Buffer.alloc(CHUNK_SIZE);
                const startPosition = chunkIndex * CHUNK_SIZE;

                fs.open(filePath, 'r', (err, fd) => {
                    if (err) {
                        console.error(`[PeerServer] Error opening file ${filePath}:`, err);
                        return callback({ error: "Failed to open file." });
                    }

                    fs.read(fd, buffer, 0, CHUNK_SIZE, startPosition, (err, bytesRead, readBuffer) => {
                        fs.close(fd, () => {});
                        if (err) {
                            console.error(`[PeerServer] Error reading chunk ${chunkIndex} of file ${fileHash}:`, err);
                            return callback({ error: "Failed to read file chunk." });
                        }
                        console.log(`[PeerServer] Sending chunk ${chunkIndex} of file ${fileHash}`);
                        callback({ data: readBuffer.slice(0, bytesRead) });
                    });
                });
            });
        });
    }
}
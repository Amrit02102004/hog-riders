import { io, Socket } from "socket.io-client";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { PeerServer } from './peerServer.js';
import { downloadChunkFromPeer } from './peerConnection.js';
import FileMetadata from "./Types/FileMetadata.js";
import { IFileInfo, IFileChunk } from "./Types/ServerTypes.js";
import { IPeer } from "./Types/PeerTypes.js";

const MB: number = 1024 * 1024;

export interface IFileDetails {
    fileInfo: IFileInfo;
    chunkOwnership: IPeer[][];
}

class Client {
    private trackerURL: string = 'http://localhost:3000';
    private trackerSocket!: Socket;
    private peerServer!: PeerServer;
    private peerPort!: number;

    // Seeder properties
    private fileMap: Map<string, string>; // Maps fileHash to its absoluteFilePath

    // Leecher properties
    private fileInfoPromises: Map<string, { resolve: (value: IFileDetails) => void, reject: (reason?: any) => void }>;

    constructor() {
        this.fileMap = new Map();
        this.fileInfoPromises = new Map();
    }

    public async initialize(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.trackerSocket = io(this.trackerURL);

            this.trackerSocket.on('connect', () => {
                this.trackerSocket.emit('request_port', (response: { port?: number, error?: string }) => {
                    if (response.error || !response.port) {
                        return reject(new Error(response.error || "Tracker did not assign a port."));
                    }

                    this.peerPort = response.port;
                    this.peerServer = new PeerServer(this.peerPort);

                    // Now register with the assigned port
                    this.trackerSocket.emit("register_peer", { address: '127.0.0.1', port: this.peerPort });
                });
            });

            this.trackerSocket.on('registered', () => {
                console.log("🔗 Client registered with tracker.");
                this.setupListeners();
                resolve();
            });

            this.trackerSocket.on('connect_error', (err) => {
                reject(new Error(`Could not connect to tracker: ${err.message}`));
            });
        });
    }

    private setupListeners(): void {
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
            if (!data || !data.fileInfo || !this.fileInfoPromises.has(data.fileInfo.name)) {
                return;
            }
            this.fileInfoPromises.get(data.fileInfo.name)?.resolve(data);
            this.fileInfoPromises.delete(data.fileInfo.name);
        });

        this.trackerSocket.on("error", (err) => {
            console.error("❌ An error occurred with the tracker connection:", err.message);
        });
    }

    // --- Seeder Logic ---

    public parseMetadata(absoluteFilePath: string): FileMetadata | null {
        try {
            const stats = fs.statSync(absoluteFilePath);
            const fileName = path.basename(absoluteFilePath);
            const fileSize = stats.size;
            const hashSource = `${fileName}-${fileSize}`;
            const fileHash = crypto.createHash('sha256').update(hashSource).digest('hex');

            return {
                hash: fileHash,
                name: fileName,
                size: fileSize,
                extension: path.extname(absoluteFilePath),
                numParts: Math.ceil(fileSize / MB),
            };
        } catch (error) {
            console.error("Error parsing file metadata:", error);
            return null;
        }
    }

    public async uploadFile(absoluteFilePath: string): Promise<void> {
        const metadata = this.parseMetadata(absoluteFilePath);
        if (!metadata) {
            console.error("Failed to parse metadata. Upload aborted.");
            return;
        }

        this.fileMap.set(metadata.hash, absoluteFilePath);
        this.peerServer.addSeededFile(metadata.hash, absoluteFilePath);

        const fileInfo: IFileInfo = {
            hash: metadata.hash,
            name: metadata.name,
            size: metadata.size,
            chunkCount: metadata.numParts,
        };

        const chunks: IFileChunk[] = Array.from({ length: metadata.numParts }, (_, i) => ({
            fileHash: metadata.hash,
            chunkIndex: i,
        }));

        this.trackerSocket.emit("announce_chunks", { fileInfo, chunks });
    }

    // --- Leecher Logic ---

    public async requestFilesList(): Promise<void> {
        this.trackerSocket.emit("file_list");
    }

    public async requestFileInfo(fileName: string): Promise<IFileDetails> {
        return new Promise((resolve, reject) => {
            this.fileInfoPromises.set(fileName, { resolve, reject });
            this.trackerSocket.emit("request_file_info", fileName);
            setTimeout(() => {
                if (this.fileInfoPromises.has(fileName)) {
                    reject(new Error(`Request for file info "${fileName}" timed out.`));
                    this.fileInfoPromises.delete(fileName);
                }
            }, 10000); // 10 second timeout
        });
    }

    public async downloadFile(fileName: string): Promise<void> {
        try {
            console.log(`[Downloader] Requesting info for ${fileName}...`);
            const fileDetails = await this.requestFileInfo(fileName);
            const { fileInfo, chunkOwnership } = fileDetails;

            console.log(`[Downloader] Starting download for ${fileName}. Total chunks: ${fileInfo.chunkCount}`);

            const downloadedChunks: (Buffer | null)[] = new Array(fileInfo.chunkCount).fill(null);
            const downloadPromises = [];

            for (let i = 0; i < fileInfo.chunkCount; i++) {
                const peersWithChunk = chunkOwnership[i];
                if (!peersWithChunk || peersWithChunk.length === 0) {
                    throw new Error(`No peers found for chunk ${i}. Download aborted.`);
                }

                const peer = peersWithChunk[0];
                console.log(`[Downloader] Requesting chunk ${i} from peer ${peer.id}...`);

                downloadPromises.push(
                    downloadChunkFromPeer(peer, fileInfo.hash, i)
                        .then(chunkData => {
                            downloadedChunks[i] = chunkData;
                            console.log(`[Downloader] Successfully downloaded chunk ${i}`);
                        })
                        .catch(err => {
                            console.error(`[Downloader] Error downloading chunk ${i}: ${err.message}`);
                        })
                );
            }

            await Promise.all(downloadPromises);

            const downloadedCount = downloadedChunks.filter(c => c !== null).length;
            if (downloadedCount !== fileInfo.chunkCount) {
                throw new Error(`Failed to download all chunks. Got ${downloadedCount}/${fileInfo.chunkCount}.`);
            }

            console.log("[Downloader] All chunks downloaded. Assembling file...");
            const finalBuffer = Buffer.concat(downloadedChunks as Buffer[]);

            const downloadsDir = path.join(process.cwd(), 'Downloads');
            if (!fs.existsSync(downloadsDir)) {
                fs.mkdirSync(downloadsDir);
            }

            const savePath = path.join(downloadsDir, fileName);
            fs.writeFileSync(savePath, finalBuffer.slice(0, fileInfo.size));
            console.log(`✅ File saved successfully to ${savePath}`);

        } catch (error) {
            console.error(`❌ Download failed: ${(error as Error).message}`);
        }
    }
}

export default Client;
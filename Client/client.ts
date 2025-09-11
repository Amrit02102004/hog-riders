import { io, Socket } from "socket.io-client";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { PeerServer } from './peerServer.js';
import { downloadChunkFromPeer } from './peerConnection.js';
import FileMetadata from "./Types/FileMetadata.js";
import { IFileInfo, IFileChunk } from "./Types/ServerTypes.js";
import { IPeer } from "./Types/PeerTypes.js";
import { networkInterfaces } from 'os';

const MB: number = 1024 * 1024;

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function getLocalIpAddress(): string {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]!) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}

export interface IFileDetails {
    fileInfo: IFileInfo;
    chunkOwnership: IPeer[][];
}

class Client {
    private trackerURL: string = 'http://10.104.187.10:3000';
    private trackerSocket!: Socket;
    private peerServer!: PeerServer;
    private peerPort!: number;

    private clientName:string;

    private fileMap: Map<string, string>;
    private fileInfoPromises: Map<string, { resolve: (value: IFileDetails) => void, reject: (reason?: any) => void }>;
    private fileDetailsCache: Map<string, IFileDetails>;
    private listenersSetup: boolean = false;

    constructor(name:string) {
        this.fileMap = new Map();
        this.fileInfoPromises = new Map();
        this.fileDetailsCache = new Map();
        this.clientName = name;
    }

    public async initialize(): Promise<void> {
        this.trackerSocket = io(this.trackerURL);

        // This handler will run on initial connection and all subsequent reconnections
        this.trackerSocket.on('connect', () => {
            console.log('[Client] Connected to tracker. Requesting port and registering...');
            this.trackerSocket.emit('request_port', (response: { port?: number, error?: string }) => {
                if (response.error || !response.port) {
                    console.error('[Client] Error requesting port:', response.error || "Tracker did not assign a port.");
                    return;
                }

                if (!this.peerServer) {
                    this.peerPort = response.port;
                    console.log(`[Client] Received port ${this.peerPort} from tracker`);
                    this.peerServer = new PeerServer(this.peerPort);
                }
                
                const ipAddress = getLocalIpAddress();
                this.trackerSocket.emit("register_peer", { address: ipAddress, port: this.peerPort });
            });
        });

        // This handler is for our custom 'registered' event from the server
        this.trackerSocket.on('registered', () => {
            console.log(`🔗 Client registered with tracker (ID: ${this.trackerSocket.id}).`);

            if (this.fileMap.size > 0) {
                console.log(`[Client] Re-announcing ${this.fileMap.size} files after (re)connection.`);
                for (const filePath of this.fileMap.values()) {
                    const metadata = this.parseMetadata(filePath);
                    if (metadata) {
                        const fileInfo: IFileInfo = { hash: metadata.hash, name: metadata.name, size: metadata.size, chunkCount: metadata.numParts };
                        const chunks: IFileChunk[] = Array.from({ length: metadata.numParts }, (_, i) => ({ fileHash: metadata.hash, chunkIndex: i }));
                        this.trackerSocket.emit("announce_chunks", { fileInfo, chunks });
                         console.log(`[Client] Re-announced: ${metadata.name}`);
                    }
                }
            }
        });

        // This promise will resolve only on the FIRST successful registration
        return new Promise((resolve, reject) => {
            this.trackerSocket.once('registered', () => {
                if (!this.listenersSetup) {
                    this.setupListeners();
                }
                console.log("✅ P2P Client is ready.");
                resolve();
            });

            this.trackerSocket.on('connect_error', (err) => {
                if (!this.peerServer) {
                     console.error('[Client] Initial connection error:', err.message);
                    reject(new Error(`Could not connect to tracker: ${err.message}`));
                } else {
                    console.error('[Client] Reconnection error:', err.message);
                }
            });
        });
    }

    private setupListeners(): void {
        this.listenersSetup = true;

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
                console.error('[Client] Invalid file info response received');
                return;
            }
            console.log(`[Client] Received file info for ${data.fileInfo.name}`);
            this.fileDetailsCache.set(data.fileInfo.hash, data);
            if (this.fileInfoPromises.has(data.fileInfo.name)) {
                this.fileInfoPromises.get(data.fileInfo.name)?.resolve(data);
                this.fileInfoPromises.delete(data.fileInfo.name);
            }
        });

        this.trackerSocket.on('chunk_ownership_update', (data: { fileHash: string, chunkIndex: number, peer: IPeer }) => {
            const { fileHash, chunkIndex, peer } = data;
            const details = this.fileDetailsCache.get(fileHash);
            if (details) {
                const ownership = details.chunkOwnership;
                const peerExists = ownership[chunkIndex]?.some(p => p.id === peer.id);
                if (ownership[chunkIndex] && !peerExists) {
                    ownership[chunkIndex].push(peer);
                    console.log(`\n[Live Update] Peer ${peer.id.substring(0,5)}... now has chunk ${chunkIndex} of file ${details.fileInfo.name}`);
                }
            }
        });

        this.trackerSocket.on("error", (err) => {
            console.error("❌ An error occurred with the tracker connection:", err.message);
        });
    }

    public parseMetadata(absoluteFilePath: string): FileMetadata | null {
        try {
            const stats = fs.statSync(absoluteFilePath);
            const fileName = path.basename(absoluteFilePath);
            const fileSize = stats.size;
            const hashSource = `${fileName}-${fileSize}`;
            const fileHash = crypto.createHash('sha256').update(hashSource).digest('hex');
            return { hash: fileHash, name: fileName, size: fileSize, extension: path.extname(absoluteFilePath), numParts: Math.ceil(fileSize / MB) };
        } catch (error) {
            console.error("Error parsing file metadata:", error);
            return null;
        }
    }

    public async uploadFile(absoluteFilePath: string): Promise<void> {
        const metadata = this.parseMetadata(absoluteFilePath);
        if (!metadata) {
            console.error(`[Uploader] Could not parse metadata for ${absoluteFilePath}. Aborting upload announcement.`);
            return;
        }
        console.log(`[Uploader] Announcing file: ${metadata.name} with hash ${metadata.hash}`);
        this.fileMap.set(metadata.hash, absoluteFilePath);
        this.peerServer.addSeededFile(metadata.hash, absoluteFilePath);
        const fileInfo: IFileInfo = { hash: metadata.hash, name: metadata.name, size: metadata.size, chunkCount: metadata.numParts };
        const chunks: IFileChunk[] = Array.from({ length: metadata.numParts }, (_, i) => ({ fileHash: metadata.hash, chunkIndex: i }));
        this.trackerSocket.emit("announce_chunks", { fileInfo, chunks });
        console.log(`[Uploader] Announcement for ${metadata.name} sent to tracker.`);
    }

    private announceSingleChunk(fileInfo: IFileInfo, chunkIndex: number): void {
        console.log(`[Client] Announcing chunk ${chunkIndex} for file ${fileInfo.name}`);
        const chunk: IFileChunk = { fileHash: fileInfo.hash, chunkIndex: chunkIndex };
        this.trackerSocket.emit("announce_chunks", { fileInfo, chunks: [chunk] });
    }

    public requestFilesList(): Promise<IFileInfo[]> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Request for file list timed out after 10 seconds."));
            }, 10000);
            this.trackerSocket.once("filesList", (data: { files: IFileInfo[] }) => {
                clearTimeout(timeout);
                resolve(data?.files || []);
            });
            this.trackerSocket.emit("file_list");
        });
    }

    public requestFileInfo(fileName: string): Promise<IFileDetails> {
        return new Promise((resolve, reject) => {
            console.log(`[Client] Requesting file info for ${fileName}`);
            this.fileInfoPromises.set(fileName, { resolve, reject });
            this.trackerSocket.emit("request_file_info", fileName);
            setTimeout(() => {
                if (this.fileInfoPromises.has(fileName)) {
                    reject(new Error(`Request for file info "${fileName}" timed out.`));
                    this.fileInfoPromises.delete(fileName);
                }
            }, 10000);
        });
    }

    public async downloadFile(fileName: string, customSaveDir?: string): Promise<void> {
        try {
            console.log(`[Downloader] Requesting info for ${fileName}...`);
            const fileDetails = await this.requestFileInfo(fileName);
            const { fileInfo, chunkOwnership } = fileDetails;

            console.log(`[Downloader] Starting download for ${fileName}. Total chunks: ${fileInfo.chunkCount}`);
            console.log('[Downloader] Chunk ownership:', chunkOwnership);

            const downloadedChunks: (Buffer | null)[] = new Array(fileInfo.chunkCount).fill(null);
            const chunkQueue = Array.from({ length: fileInfo.chunkCount }, (_, i) => i);
            const concurrency = 5; // Limit to 5 concurrent downloads

            const downloadWorker = async () => {
                while (chunkQueue.length > 0) {
                    const chunkIndex = chunkQueue.shift();
                    if (chunkIndex === undefined) continue;

                    const peersForChunk = chunkOwnership[chunkIndex];
                    if (!peersForChunk || peersForChunk.length === 0) {
                        console.error(`[Downloader] No peers found for chunk ${chunkIndex}. Download aborted.`);
                        throw new Error(`No peers found for chunk ${chunkIndex}. Download aborted.`);
                    }
                    const randomizedPeers = shuffleArray([...peersForChunk]);

                    await tryDownloadChunk(chunkIndex, randomizedPeers);
                }
            };

            const tryDownloadChunk = async (chunkIndex: number, availablePeers: IPeer[]): Promise<void> => {
                if (availablePeers.length === 0) {
                    console.error(`[Downloader] No more peers to try for chunk ${chunkIndex}`);
                    throw new Error(`All peers failed to provide chunk ${chunkIndex}.`);
                }
                const peerToTry = availablePeers[0];
                console.log(`[Downloader] Attempting to download chunk ${chunkIndex} from peer ${peerToTry.id}`);
                try {
                    const chunkData = await downloadChunkFromPeer(peerToTry, fileInfo.hash, chunkIndex);
                    await sleep(1000); // Increased delay between chunks
                    downloadedChunks[chunkIndex] = chunkData;
                    console.log(`[Downloader] Peer ${peerToTry.id.substring(0, 5)}... DELIVERED chunk ${chunkIndex}`);
                    this.announceSingleChunk(fileInfo, chunkIndex);
                } catch (error) {
                    console.warn(`[Downloader] Peer ${peerToTry.id.substring(0, 5)}... FAILED chunk ${chunkIndex}. Retrying with another peer...`);
                    await tryDownloadChunk(chunkIndex, availablePeers.slice(1));
                }
            };

            const downloadPromises = Array.from({ length: concurrency }, () => downloadWorker());
            await Promise.all(downloadPromises);


            const downloadedCount = downloadedChunks.filter(c => c !== null).length;
            if (downloadedCount !== fileInfo.chunkCount) {
                throw new Error(`Failed to download all chunks. Got ${downloadedCount}/${fileInfo.chunkCount}.`);
            }

            console.log("[Downloader] All chunks downloaded. Assembling file...");
            const finalBuffer = Buffer.concat(downloadedChunks as Buffer[]);

            const finalDownloadsDir = customSaveDir || path.join(process.cwd(), 'Downloads');

            if (!fs.existsSync(finalDownloadsDir)) {
                fs.mkdirSync(finalDownloadsDir, { recursive: true });
            }

            const savePath = path.join(finalDownloadsDir, fileName);

            fs.writeFileSync(savePath, finalBuffer.slice(0, fileInfo.size));
            console.log(`✅ File saved successfully to ${savePath}`);

            console.log(`[Seeder] Now attempting to seed the newly downloaded file: ${fileName}`);
            try {
                await this.uploadFile(savePath);
                console.log(`[Seeder] Successfully announced and started seeding: ${fileName}`);
            } catch (e) {
                console.error(`[Seeder] FAILED to start seeding the new file:`, e);
            }

        } catch (error) {
            console.error(`❌ Download failed: ${(error as Error).message}`);
            throw error;
        }
    }
}

export default Client;
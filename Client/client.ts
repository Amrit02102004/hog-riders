// Client/client.ts
import Seeder from "./seeder.js";
import Leecher from "./leecher.js";
import { PeerServer } from './peerServer.js';
import { downloadChunkFromPeer } from './peerConnection.js';
import * as fs from 'fs';
import * as path from 'path';

class Client {
    private seeder: Seeder;
    private leecher: Leecher;
    private peerServer: PeerServer;
    private TRACKER_URL: string = 'http://localhost:3000';

    constructor(peerPort: number) {
        this.peerServer = new PeerServer(peerPort);
        this.seeder = new Seeder(this.TRACKER_URL, peerPort);
        this.leecher = new Leecher(this.TRACKER_URL, peerPort);
    }

    public async ensureConnected(): Promise<void> {
        await Promise.all([
            this.seeder.ensureConnected(),
            this.leecher.ensureConnected()
        ]);
        console.log("🔗 All client connections to tracker established");
    }

    public async uploadFile(absoluteFilePath: string): Promise<void> {
        await this.seeder.uploadFile(absoluteFilePath);
        // After seeding, tell our own peer server about the file
        const metadata = this.seeder.parseMetadata(absoluteFilePath);
        if (metadata) {
            this.peerServer.addSeededFile(metadata.hash, absoluteFilePath);
        }
    }

    public async requestFilesList(): Promise<void> {
        await this.leecher.requestFilesList();
    }

    public async downloadFile(fileName: string): Promise<void> {
        try {
            console.log(`[Downloader] Requesting info for ${fileName}...`);
            const fileDetails = await this.leecher.requestFileInfo(fileName);
            const { fileInfo, chunkOwnership } = fileDetails;

            console.log(`[Downloader] Starting download for ${fileName}. Total chunks: ${fileInfo.chunkCount}`);

            const downloadedChunks: (Buffer | null)[] = new Array(fileInfo.chunkCount).fill(null);

            const downloadPromises = [];

            for (let i = 0; i < fileInfo.chunkCount; i++) {
                const peersWithChunk = chunkOwnership[i];
                if (!peersWithChunk || peersWithChunk.length === 0) {
                    throw new Error(`No peers found for chunk ${i}. Download aborted.`);
                }

                // For simplicity, we'll try to download from the first available peer.
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
                            // In a real client, you would retry with another peer here.
                        })
                );
            }

            await Promise.all(downloadPromises);

            const downloadedCount = downloadedChunks.filter(c => c !== null).length;
            if (downloadedCount !== fileInfo.chunkCount) {
                throw new Error(`Failed to download all chunks. Got ${downloadedCount}/${fileInfo.chunkCount}.`);
            }

            // Assemble the file
            console.log("[Downloader] All chunks downloaded. Assembling file...");
            const finalBuffer = Buffer.concat(downloadedChunks as Buffer[]);


            // Ensure Downloads directory exists
            const downloadsDir = path.join(process.cwd(),'Downloads');
            if (!fs.existsSync(downloadsDir)) {
                fs.mkdirSync(downloadsDir);
            }

            const savePath = path.join(downloadsDir, fileName + " " + new Date().getTime().toString());
            fs.writeFileSync(savePath, finalBuffer.slice(0, fileInfo.size)); // Trim padding from last chunk
            console.log(`✅ File saved successfully to ${savePath}`);

        } catch (error:any) {
            console.error(`❌ Download failed: ${error.message}`);
        }
    }
}

export default Client;
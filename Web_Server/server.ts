import express, { Request, Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import process from 'node:process';
import Client from '../Client/client.js';
import cors from 'cors';
import { createServer } from 'http';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// In-memory store for download progress
const downloadProgress = new Map<string, number>();

app.use(express.json());
app.use(cors());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DOWNLOADS_DIR = path.join(PROJECT_ROOT, 'Downloads');

let p2pClient: Client;

app.get('/', (req: Request, res: Response) => {
    res.status(200).send('Hog Riders P2P Web Server is running!');
});

app.post('/seed', async (req: Request, res: Response) => {
    const { filePath } = req.body;
    if (!filePath) {
        return res.status(400).json({ error: 'Request body must contain a "filePath" property.' });
    }
    try {
        await fs.access(filePath);
        console.log(`[API] Seeding file from local path: ${filePath}`);
        await p2pClient.uploadFile(filePath);
        res.status(200).json({
            message: `File "${path.basename(filePath)}" is now being seeded on the network.`
        });
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.error(`[API] Error: File not found at path: ${filePath}`);
            return res.status(404).json({ error: 'File not found at the provided path.', details: filePath });
        }
        console.error('[API] Error seeding file:', error);
        res.status(500).json({ error: 'Failed to seed the file.', details: error.message });
    }
});

app.get('/files', async (req: Request, res: Response) => {
    try {
        console.log("\n[API] Requesting file list from tracker...");
        const files = await p2pClient.requestFilesList();
        res.status(200).json({
            message: "Successfully retrieved the list of available files.",
            count: files.length,
            files: files
        });
    } catch (error: any) {
        console.error('[API] Error requesting file list:', error);
        res.status(500).json({ error: 'Failed to request the file list.', details: error.message });
    }
});

app.post('/download', async (req: Request, res: Response) => {
    const { fileName, downloadPath } = req.body;
    if (!fileName) {
        return res.status(400).json({ error: 'Request body must contain a "fileName" property.' });
    }

    try {
        console.log(`[API] Initiating download for: ${fileName}`);
        downloadProgress.set(fileName, 0); // Set initial progress

        // Run download in the background, don't await it
        p2pClient.downloadFile(fileName, downloadPath, (progress) => {
            downloadProgress.set(fileName, progress);
        }).then(() => {
            console.log(`[API] Download complete for ${fileName}`);
            // Optionally remove from progress map after some delay
            setTimeout(() => downloadProgress.delete(fileName), 10000);
        }).catch(err => {
            console.error(`[API] Background download failed for ${fileName}:`, err);
            downloadProgress.delete(fileName);
        });

        const finalDir = downloadPath || DOWNLOADS_DIR;
        const finalPath = path.join(finalDir, fileName);

        res.status(202).json({
            message: `Download for "${fileName}" started.`,
            location: `Will be saved on server at: ${finalPath}`
        });
    } catch (error: any) {
        console.error(`[API] Download failed for ${fileName}:`, error);
        res.status(500).json({ error: `Download failed for "${fileName}".`, details: error.message });
    }
});

// New endpoint for polling download status
app.get('/download-status', (req: Request, res: Response) => {
    res.status(200).json(Object.fromEntries(downloadProgress));
});

async function startServer() {
    try {
        await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
        console.log("Initializing P2P client for the web server...");
        p2pClient = new Client('WebServerPeer_HogRider');
        await p2pClient.initialize();
        console.log("✅ P2P Client is ready and integrated.");
        httpServer.listen(PORT, () => {
            console.log(`\n🚀 Express server is live on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("❌ Fatal error during server startup:", error);
        process.exit(1);
    }
}

startServer();
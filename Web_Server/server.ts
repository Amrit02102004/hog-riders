import express, { Request, Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import process from 'node:process';
import Client from '../Client/client.js';

// --- Basic Server and Path Setup ---
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware to parse JSON bodies
app.use(express.json());

// Helper to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define project root and directories for uploads/downloads
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DOWNLOADS_DIR = path.join(PROJECT_ROOT, 'Downloads');

// --- P2P Client Initialization ---
let p2pClient: Client;

// --- API Endpoints ---

app.get('/', (req: Request, res: Response) => {
    res.status(200).send('Hog Riders P2P Web Server is running!');
});

/**
 * @api {post} /seed
 * @description Takes an absolute file path from the request body and seeds the corresponding file on the P2P network.
 * The request body must be JSON with a "filePath" property. e.g., { "filePath": "/path/to/your/file.txt" }
 */
app.post('/seed', async (req: Request, res: Response) => {
    const { filePath } = req.body;

    if (!filePath) {
        return res.status(400).json({ error: 'Request body must contain a "filePath" property.' });
    }

    try {
        // SECURITY/VALIDATION: Check if the file actually exists before trying to seed it.
        await fs.access(filePath); // This will throw an error if the file doesn't exist or is not accessible.

        console.log(`[API] Seeding file from local path: ${filePath}`);
        await p2pClient.uploadFile(filePath);
        
        res.status(200).json({ 
            message: `File "${path.basename(filePath)}" is now being seeded on the network.` 
        });
    } catch (error: any) {
        // Handle file not found error specifically
        if (error.code === 'ENOENT') {
            console.error(`[API] Error: File not found at path: ${filePath}`);
            return res.status(404).json({ error: 'File not found at the provided path.', details: filePath });
        }
        // Handle other potential errors during seeding
        console.error('[API] Error seeding file:', error);
        res.status(500).json({ error: 'Failed to seed the file.', details: error.message });
    }
});


/**
 * @api {get} /files
 * @description Requests and returns the list of all files available on the network.
 */
app.get('/files', async (req: Request, res: Response) => {
    try {
        console.log("\n[API] Requesting file list from tracker...");
        
        // This now waits for the file list and returns it
        const files = await p2pClient.requestFilesList();
        
        // Send the retrieved list back to the API client with a 200 OK status
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

/**
 * @api {get} /download/:fileName
 * @description Downloads a specified file from the P2P network to the server's local "Downloads" directory.
 */
app.get('/download/:fileName', async (req: Request, res: Response) => {
    const { fileName } = req.params;
    if (!fileName) {
        return res.status(400).json({ error: 'File name parameter is required.' });
    }

    try {
        console.log(`[API] Initiating download for: ${fileName}`);
        await p2pClient.downloadFile(fileName);
        
        const finalPath = path.join(DOWNLOADS_DIR, fileName);
        res.status(200).json({ 
            message: `File "${fileName}" downloaded successfully and is now being seeded.`,
            location: `Saved on server at: ${finalPath}`
        });
    } catch (error: any) {
        console.error(`[API] Download failed for ${fileName}:`, error);
        res.status(500).json({ error: `Download failed for "${fileName}".`, details: error.message });
    }
});

// --- Server Startup Logic ---
async function startServer() {
    try {
        await fs.mkdir(DOWNLOADS_DIR, { recursive: true });

        console.log("Initializing P2P client for the web server...");
        p2pClient = new Client('WebServerPeer_HogRider'); // Unique name for the server peer
        await p2pClient.initialize();
        console.log("✅ P2P Client is ready and integrated.");

        app.listen(PORT, () => {
            console.log(`\n🚀 Express server is live on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("❌ Fatal error during server startup:", error);
        process.exit(1);
    }
}

startServer();


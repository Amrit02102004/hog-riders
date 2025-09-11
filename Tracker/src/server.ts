import * as dotenv from 'dotenv';
dotenv.config(); // Load .env file

import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { IPeer, IFileChunk, ITrackerStats, IFileInfo } from './types';
import { logger } from './utils/logger';
import { validatePeerRegistration } from './utils/validation';
import { InMemoryFileTracker } from "./services/FileTracker";
import { IPeerManager } from "./services/IPeerManager";
import { RedisPeerManager } from "./services/RedisPeerManager";
import { RedisManager } from "./services/RedisManager";


class TrackerServer {
    private app: express.Application;
    private httpServer: any;
    private io: SocketServer;
    private peerManager: IPeerManager;
    private fileTracker: InMemoryFileTracker;
    private port: number;
    // --- Port Management ---
    private peerPortPool: Set<number>;
    private nextPeerPort: number;
    private readonly PEER_PORT_RANGE_START = 4001;
    private readonly PEER_PORT_RANGE_END = 4999;
    // ---------------------

    constructor() {
        this.app = express();
        this.httpServer = createServer(this.app);
        this.io = new SocketServer(this.httpServer, {
            cors: {
                origin: "*", // Allow all origins
                methods: ["GET", "POST"]
            },
            transports: ['websocket', 'polling']
        });

        this.port = parseInt(process.env.PORT || '3000');
        this.peerManager = new RedisPeerManager();
        this.fileTracker = new InMemoryFileTracker();

        // --- Initialize Port Pool ---
        this.peerPortPool = new Set();
        this.nextPeerPort = this.PEER_PORT_RANGE_START;
        // --------------------------

        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
    }

    private setupMiddleware(): void {
        this.app.use(helmet());
        this.app.use(compression());
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(morgan('combined', {
            stream: { write: (message) => logger.info(message.trim()) }
        }));
    }

    private setupRoutes(): void {
        this.app.get('/health', async (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        });

        this.app.get('/stats', async (req, res) => {
            try {
                const stats: ITrackerStats = {
                    totalPeers: await this.peerManager.getTotalPeers(),
                    activePeers: await this.peerManager.getActivePeers(),
                    totalFiles: await this.fileTracker.getTotalFiles(),
                    totalChunks: await this.fileTracker.getTotalChunks()
                };
                res.json(stats);
            } catch (error) {
                logger.error('Error getting stats:', error);
                res.status(500).json({ error: 'Failed to retrieve statistics' });
            }
        });

        // --- ADDED ROUTE START ---
        this.app.post('/dev/clear-redis', async (req, res) => {
            try {
                const redis = RedisManager.getInstance();
                await redis.flushdb();
                logger.info('✅ Redis database cleared via /dev/clear-redis endpoint.');
                res.status(200).json({ message: 'Redis database cleared successfully.' });
            } catch (error) {
                logger.error('❌ Error clearing Redis database:', error);
                res.status(500).json({ error: 'Failed to clear Redis database.' });
            }
        });
        // --- ADDED ROUTE END ---
    }

    private getAvailablePort(): number | null {
        let attempts = 0;
        const maxAttempts = this.PEER_PORT_RANGE_END - this.PEER_PORT_RANGE_START + 1;

        while (attempts < maxAttempts) {
            const port = this.nextPeerPort;
            this.nextPeerPort++;
            if (this.nextPeerPort > this.PEER_PORT_RANGE_END) {
                this.nextPeerPort = this.PEER_PORT_RANGE_START;
            }
            if (!this.peerPortPool.has(port)) {
                this.peerPortPool.add(port);
                return port;
            }
            attempts++;
        }
        return null; // No available ports
    }

    private releasePort(port: number): void {
        this.peerPortPool.delete(port);
    }

    private async broadcastPeerList(): Promise<void> {
        try {
            const allPeers = await this.peerManager.getAllActivePeers();
            this.io.emit('update_peer_list', allPeers);
            logger.info(`📡 Broadcasted updated peer list. Total peers: ${allPeers.length}`);
        } catch (error) {
            logger.error('Failed to broadcast peer list:', error);
        }
    }

    private setupSocketHandlers(): void {
        this.io.on('connection', (socket) => {
            logger.info(`🔗 Peer connected: ${socket.id}`);

            let assignedPort: number | null = null;

            socket.on('request_port', (callback) => {
                assignedPort = this.getAvailablePort();
                if (assignedPort) {
                    logger.info(`Assigning port ${assignedPort} to peer ${socket.id}`);
                    callback({ port: assignedPort });
                } else {
                    logger.error(`No available ports for peer ${socket.id}`);
                    callback({ error: 'No available ports on the tracker.' });
                }
            });

            socket.on('register_peer', async (data) => {
                try {
                    if (data.port !== assignedPort) {
                        return socket.emit('error', { message: 'Registered port does not match assigned port.' });
                    }

                    const { error, value } = validatePeerRegistration(data);
                    if (error) {
                        return socket.emit('error', { message: error.details[0].message });
                    }

                    const peer: IPeer = { id: socket.id, ...value, lastSeen: new Date(), connected: true };

                    await this.peerManager.registerPeer(peer);
                    socket.emit('registered', { peerId: socket.id });
                    logger.info(`✅ Peer registered: ${socket.id} at ${peer.address}:${peer.port}`);
                    await this.broadcastPeerList();
                } catch (error) {
                    logger.error('Error registering peer:', error);
                    socket.emit('error', { message: 'Failed to register peer' });
                }
            });

            socket.on('file_list', async () => {
                try {
                    const files = await this.fileTracker.getAllFiles();
                    socket.emit('filesList', { files });
                    logger.info(`✅ Sent file list (${files.length} files) to peer ${socket.id}`);
                } catch (error) {
                    logger.error(`Error fetching file list for peer ${socket.id}:`, error);
                    socket.emit('error', { message: 'Failed to retrieve file list' });
                }
            });

// In Tracker/src/server.ts
// Find the 'announce_chunks' handler and replace it with this:

            socket.on('announce_chunks', async (data: { fileInfo: IFileInfo, chunks: IFileChunk[] }) => {
                try {
                    const { fileInfo, chunks } = data;
                    if (!fileInfo || !chunks || chunks.length === 0) {
                        return socket.emit('error', { message: 'Invalid chunk announcement data' });
                    }
                    logger.info(`📢 [Tracker] Peer ${socket.id} announced ${chunks.length} chunks for file ${fileInfo.name}`);

                    await this.fileTracker.announceChunks(socket.id, fileInfo, chunks);
                    logger.info(`📢 Peer ${socket.id} announced ${chunks.length} chunks for file ${fileInfo.name} (${fileInfo.hash})`);

                    const peer = await this.peerManager.getPeer(socket.id);
                    if (peer) {
                        for (const chunk of chunks) {
                            socket.broadcast.emit('chunk_ownership_update', {
                                fileHash: chunk.fileHash,
                                chunkIndex: chunk.chunkIndex,
                                peer: peer
                            });
                        }
                    }
                } catch (error) {
                    logger.error(`Error announcing chunks for peer ${socket.id}:`, error);
                    socket.emit('error', { message: 'Failed to announce chunks' });
                }
            });

            socket.on("request_file_info", async (fileName: string) => {
                try {
                    logger.info(`[Tracker] Received request for file info: ${fileName}`);
                    if (!fileName) {
                        return socket.emit('error', { message: 'Provide fileHash or fileName' });
                    }

                    const fileByName = await this.fileTracker.findFileByName(fileName);

                    if (!fileByName) {
                        return socket.emit('error', { message: 'File name not found' });
                    }
                    const fileHash: string = fileByName.hash;
                    logger.info(`[Tracker] Found file hash: ${fileHash}`);

                    const result = await this.fileTracker.getFileInfo(fileHash, this.peerManager);

                    if (!result) {
                        return socket.emit('error', { message: 'File not found' });
                    }
                    logger.info(`[Tracker] Sending file info for ${fileName} to peer ${socket.id}`);

                    socket.emit('file_info_response', result);
                } catch (error) {
                    logger.error(`Error fetching file info for peer ${socket.id}:`, error);
                    socket.emit('error', { message: 'Failed to retrieve file info' });
                }
            });

            socket.on('request_peers_for_chunk', async (data: { fileHash: string; chunkIndex: number }) => {
                try {
                    const { fileHash, chunkIndex } = data;
                    const peerIds = await this.fileTracker.getPeersForChunk(fileHash, chunkIndex);
                    const peersWithChunk = await this.peerManager.getPeersByIds(peerIds);
                    socket.emit('peers_for_chunk_response', { fileHash, chunkIndex, peers: peersWithChunk });
                } catch (error) {
                    logger.error(`Error getting peers for chunk:`, error);
                    socket.emit('error', { message: 'Failed to get peers for chunk' });
                }
            });

            socket.on('disconnect', async () => {
                try {
                    if (assignedPort) {
                        this.releasePort(assignedPort);
                        logger.info(`Released port ${assignedPort} from peer ${socket.id}`);
                    }
                    await this.fileTracker.removePeerChunks(socket.id);
                    await this.peerManager.unregisterPeer(socket.id);
                    logger.info(`🔌 Peer disconnected: ${socket.id}`);
                    await this.broadcastPeerList();
                } catch (error) {
                    logger.error('Error during peer disconnect handling:', error);
                }
            });

            socket.on('error', (error) => {
                logger.error(`Socket error from ${socket.id}:`, error.message);
            });
        });
    }

    public async start(): Promise<void> {
        try {
            this.startCleanupJob();
            this.httpServer.listen(this.port, () => {
                logger.info(`🚀 Tracker server running on port ${this.port}`);
            });
        } catch (error) {
            logger.error('❌ Failed to start server:', error);
            process.exit(1);
        }
    }

    private startCleanupJob(): void {
        const cleanupInterval = 5 * 60 * 1000;
        setInterval(async () => {
            logger.info('Running cleanup job for inactive peers...');
            try {
                const inactivePeerCount = await this.peerManager.cleanupInactivePeers(cleanupInterval);
                if (inactivePeerCount > 0) {
                    logger.info(`🧹 Cleaned up ${inactivePeerCount} inactive peers.`);
                    await this.broadcastPeerList();
                }
            } catch (error) {
                logger.error('Error during cleanup job:', error);
            }
        }, cleanupInterval);
    }

    public async stop(): Promise<void> {
        try {
            this.io.close();
            this.httpServer.close();
            await RedisManager.disconnect();
            logger.info('Server stopped gracefully.');
        } catch (error) {
            logger.error('Error during server shutdown:', error);
        }
    }
}

const server = new TrackerServer();

const shutdown = async () => {
    logger.info('Shutdown signal received, closing server...');
    await server.stop();
    process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.start();
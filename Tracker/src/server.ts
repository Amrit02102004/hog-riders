import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import * as dotenv from 'dotenv';
import { RedisService } from './services/RedisService';
import { PeerManager } from './services/PeerManager';
import { FileTracker } from './services/FileTracker';
import { IPeer, IFileChunk, ITrackerStats, IFileInfo } from './types';
import { logger } from './utils/logger';
import { validatePeerRegistration } from './utils/validation';

// Load environment variables from .env file
dotenv.config();

class TrackerServer {
    private app: express.Application;
    private httpServer: any;
    private io: SocketServer;
    private redisService: RedisService;
    private peerManager: PeerManager;
    private fileTracker: FileTracker;
    private port: number;

    constructor() {
        this.app = express();
        this.httpServer = createServer(this.app);
        this.io = new SocketServer(this.httpServer, {
            cors: {
                origin: "*", // Allow all origins for simplicity
                methods: ["GET", "POST"]
            },
            transports: ['websocket', 'polling']
        });

        this.port = parseInt(process.env.PORT || '3000');
        this.redisService = new RedisService();
        this.peerManager = new PeerManager(this.redisService);
        this.fileTracker = new FileTracker(this.redisService);

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
            try {
                await this.redisService.ping();
                res.json({
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime()
                });
            } catch (error) {
                res.status(503).json({
                    status: 'unhealthy',
                    error: 'Redis connection failed'
                });
            }
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

            // ✨ NEW: Handler for clients requesting the list of available files.
            socket.on('requestFilesList', async () => {
                try {
                    const redisClient = this.redisService.getClient();
                    const fileKeys: string[] = [];

                    // Use SCAN for IORedis with different implementation pattern
                    let cursor = '0';
                    do {
                        const [nextCursor, keys] = await redisClient.scan(
                            cursor,
                            'MATCH',
                            'fileinfo:*',
                            'COUNT',
                            '100'
                        );
                        cursor = nextCursor;
                        fileKeys.push(...keys);
                    } while (cursor !== '0');

                    if (fileKeys.length === 0) {
                        return socket.emit('filesList', []); // Send empty list if no files
                    }

                    const filesData = await redisClient.mget(fileKeys);
                    const files: IFileInfo[] = filesData
                        .filter((data): data is string => data !== null) // Filter out potential nulls
                        .map((data) => JSON.parse(data));

                    socket.emit('filesList', files);
                    logger.info(`✅ Sent file list (${files.length} files) to peer ${socket.id}`);
                } catch (error) {
                    logger.error(`Error fetching file list for peer ${socket.id}:`, error);
                    socket.emit('error', { message: 'Failed to retrieve file list' });
                }
            });

            socket.on('announce_chunks', async (data: { fileInfo: IFileInfo, chunks: IFileChunk[] }) => {
                try {
                    // You should add Joi validation here for production code
                    const { fileInfo, chunks } = data;
                    if (!fileInfo || !chunks || chunks.length === 0) {
                        return socket.emit('error', { message: 'Invalid chunk announcement data' });
                    }

                    await this.fileTracker.announceChunks(socket.id, fileInfo, chunks);
                    socket.broadcast.emit('new_content_available', { fileHash: fileInfo.hash });

                } catch (error) {
                    logger.error(`Error announcing chunks for peer ${socket.id}:`, error);
                    socket.emit('error', { message: 'Failed to announce chunks' });
                }
            });

            socket.on('request_peers_for_chunk', async (data: { fileHash: string; chunkIndex: number }) => {
                try {
                    const { fileHash, chunkIndex } = data;
                    const peerIds = await this.fileTracker.getPeersForChunk(fileHash, chunkIndex);
                    socket.emit('peers_for_chunk_response', { fileHash, chunkIndex, peerIds });
                } catch (error) {
                    logger.error(`Error getting peers for chunk:`, error);
                    socket.emit('error', { message: 'Failed to get peers for chunk' });
                }
            });

            socket.on('register_peer', async (data) => {
                try {
                    const { error, value } = validatePeerRegistration(data);
                    if (error) {
                        return socket.emit('error', { message: error.details[0].message });
                    }

                    const peer: IPeer = {
                        id: socket.id,
                        ...value,
                        lastSeen: new Date(),
                        connected: true
                    };

                    await this.peerManager.registerPeer(peer);
                    socket.emit('registered', { peerId: socket.id });
                    logger.info(`✅ Peer registered: ${socket.id} at ${peer.address}:${peer.port}`);
                    await this.broadcastPeerList();
                } catch (error) {
                    logger.error('Error registering peer:', error);
                    socket.emit('error', { message: 'Failed to register peer' });
                }
            });

            socket.on('heartbeat', async () => {
                try {
                    await this.peerManager.updateLastSeen(socket.id);
                    socket.emit('heartbeat_ack');
                } catch (error) {
                    logger.warn(`Failed to update heartbeat for ${socket.id}:`, error);
                }
            });

            socket.on('disconnect', async () => {
                try {
                    await this.peerManager.unregisterPeer(socket.id);
                    await this.fileTracker.removePeerChunks(socket.id);
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
            await this.redisService.connect();
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
        const cleanupInterval = 5 * 60 * 1000; // 5 minutes
        setInterval(async () => {
            logger.info('Running cleanup job for inactive peers...');
            try {
                await this.peerManager.cleanupInactivePeers(cleanupInterval);
                await this.broadcastPeerList();
            } catch (error) {
                logger.error('Error during cleanup job:', error);
            }
        }, cleanupInterval);
    }

    public async stop(): Promise<void> {
        try {
            this.io.close();
            this.httpServer.close();
            await this.redisService.disconnect();
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
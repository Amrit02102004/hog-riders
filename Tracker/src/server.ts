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
import {InMemoryPeerManager} from "./services/PeerManager";
import {InMemoryFileTracker} from "./services/FileTracker";


class TrackerServer {
    private app: express.Application;
    private httpServer: any;
    private io: SocketServer;
    private peerManager: InMemoryPeerManager;
    private fileTracker: InMemoryFileTracker;
    private port: number;

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
        this.peerManager = new InMemoryPeerManager();
        this.fileTracker = new InMemoryFileTracker();

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

            socket.on('file_list', async () => {
                try {
                    const files = await this.fileTracker.getAllFiles();
                    const chunkMap = await this.fileTracker.getFileChunkMapWithPeers(this.peerManager);

                    socket.emit('filesList', { files, chunkMap });

                    logger.info(`✅ Sent file list (${files.length} files) with chunk ownership to peer ${socket.id}`);
                } catch (error) {
                    logger.error(`Error fetching file list for peer ${socket.id}:`, error);
                    socket.emit('error', { message: 'Failed to retrieve file list' });
                }
            });

            socket.on("request_file_info", async (data: { fileHash?: string; fileName?: string }) => {
                try {
                    let { fileHash, fileName } = data || {};

                    if (!fileHash && !fileName) {
                        return socket.emit('error', { message: 'Provide fileHash or fileName' });
                    }

                    if (!fileHash && fileName) {
                        const fileByName = await this.fileTracker.findFileByName(fileName);
                        if (!fileByName) {
                            return socket.emit('error', { message: 'File name not found' });
                        }
                        fileHash = fileByName.hash;
                    }

                    const fileInfo = await this.fileTracker.getFileInfo(fileHash!, this.peerManager);
                    if (!fileInfo) {
                        return socket.emit('error', { message: 'File not found' });
                    }

                    socket.emit('file_info_response', { fileInfo });
                } catch (error) {
                    logger.error(`Error fetching file info for peer ${socket.id}:`, error);
                    socket.emit('error', { message: 'Failed to retrieve file info' });
                }
            });



            socket.on('announce_chunks', async (data: { fileInfo: IFileInfo, chunks: IFileChunk[] }) => {
                try {
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
                    const peersWithChunk = await this.peerManager.getPeersByIds(peerIds);
                    socket.emit('peers_for_chunk_response', { fileHash, chunkIndex, peers: peersWithChunk });
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

            socket.on('disconnect', async () => {
                try {
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

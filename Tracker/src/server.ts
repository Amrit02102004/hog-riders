import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { RedisService } from './services/RedisService';
import { PeerManager } from './services/PeerManager';
import { FileTracker } from './services/FileTracker';
import { logger } from './utils/logger';
import { validatePeerRegistration, validateFileChunk } from './utils/validation';
import { IPeer, IFileChunk, ITrackerStats } from './types';

// Load environment variables
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
        origin: "*",
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
    // Security and performance middleware
    this.app.use(helmet());
    this.app.use(compression());
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Logging
    this.app.use(morgan('combined', {
      stream: { write: (message) => logger.info(message.trim()) }
    }));
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        await this.redisService.ping();
        res.json({ 
          status: 'healthy', 
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        });
      } catch (error) {
        res.status(500).json({ 
          status: 'unhealthy', 
          error: 'Redis connection failed' 
        });
      }
    });

    // Get tracker statistics
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
        res.status(500).json({ error: 'Failed to get statistics' });
      }
    });

    // Get peers for a specific file
    this.app.get('/files/:fileHash/peers', async (req, res) => {
      try {
        const { fileHash } = req.params;
        const peers = await this.fileTracker.getPeersWithFile(fileHash);
        res.json({ fileHash, peers });
      } catch (error) {
        logger.error('Error getting peers for file:', error);
        res.status(500).json({ error: 'Failed to get peers for file' });
      }
    });

    // Search for files
    this.app.get('/search', async (req, res) => {
      try {
        const { query, limit = 50 } = req.query;
        if (!query) {
          return res.status(400).json({ error: 'Query parameter is required' });
        }
        
        const results = await this.fileTracker.searchFiles(
          query as string, 
          parseInt(limit as string)
        );
        res.json(results);
      } catch (error) {
        logger.error('Error searching files:', error);
        res.status(500).json({ error: 'Failed to search files' });
      }
    });
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      logger.info(`Peer connected: ${socket.id}`);

      // Peer registration
      socket.on('register_peer', async (data) => {
        try {
          const { error, value } = validatePeerRegistration(data);
          if (error) {
            socket.emit('error', { message: error.details[0].message });
            return;
          }

          const peer: IPeer = {
            id: socket.id,
            ...value,
            lastSeen: new Date(),
            connected: true
          };

          await this.peerManager.registerPeer(peer);
          socket.emit('registered', { peerId: socket.id });
          
          // Broadcast peer joined to other peers
          socket.broadcast.emit('peer_joined', { 
            peerId: socket.id,
            address: peer.address,
            port: peer.port
          });

          logger.info(`Peer registered: ${socket.id} at ${peer.address}:${peer.port}`);
        } catch (error) {
          logger.error('Error registering peer:', error);
          socket.emit('error', { message: 'Failed to register peer' });
        }
      });

      // File chunk announcement
      socket.on('announce_chunks', async (data) => {
        try {
          const { error, value } = validateFileChunk(data);
          if (error) {
            socket.emit('error', { message: error.details[0].message });
            return;
          }

          await this.fileTracker.announceChunks(socket.id, value.chunks);
          
          // Notify interested peers about new chunks
          for (const chunk of value.chunks) {
            socket.broadcast.emit('chunk_available', {
              fileHash: chunk.fileHash,
              chunkIndex: chunk.chunkIndex,
              peerId: socket.id
            });
          }

          logger.info(`Peer ${socket.id} announced ${value.chunks.length} chunks`);
        } catch (error) {
          logger.error('Error announcing chunks:', error);
          socket.emit('error', { message: 'Failed to announce chunks' });
        }
      });

      // Request peers for file
      socket.on('request_peers', async (data) => {
        try {
          const { fileHash } = data;
          if (!fileHash) {
            socket.emit('error', { message: 'File hash is required' });
            return;
          }

          const peers = await this.fileTracker.getPeersWithFile(fileHash);
          socket.emit('peers_response', { fileHash, peers });
        } catch (error) {
          logger.error('Error getting peers for file:', error);
          socket.emit('error', { message: 'Failed to get peers' });
        }
      });

      // Heartbeat to keep connection alive
      socket.on('heartbeat', async () => {
        try {
          await this.peerManager.updateLastSeen(socket.id);
          socket.emit('heartbeat_ack');
        } catch (error) {
          logger.error('Error updating heartbeat:', error);
        }
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        try {
          await this.peerManager.unregisterPeer(socket.id);
          await this.fileTracker.removePeerChunks(socket.id);
          
          socket.broadcast.emit('peer_left', { peerId: socket.id });
          logger.info(`Peer disconnected: ${socket.id}`);
        } catch (error) {
          logger.error('Error handling disconnect:', error);
        }
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error(`Socket error for ${socket.id}:`, error);
      });
    });
  }

  public async start(): Promise<void> {
    try {
      // Initialize Redis connection
      await this.redisService.connect();
      logger.info('Connected to Redis');

      // Start cleanup job for inactive peers
      this.startCleanupJob();

      // Start HTTP server
      this.httpServer.listen(this.port, () => {
        logger.info(`Tracker server running on port ${this.port}`);
        logger.info(`Socket.IO server running on port ${this.port}`);
      });

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private startCleanupJob(): void {
    // Clean up inactive peers every 5 minutes
    setInterval(async () => {
      try {
        const inactiveThreshold = 5 * 60 * 1000; // 5 minutes
        await this.peerManager.cleanupInactivePeers(inactiveThreshold);
        logger.info('Completed cleanup of inactive peers');
      } catch (error) {
        logger.error('Error during cleanup:', error);
      }
    }, 5 * 60 * 1000);
  }

  public async stop(): Promise<void> {
    try {
      this.httpServer.close();
      await this.redisService.disconnect();
      logger.info('Server stopped gracefully');
    } catch (error) {
      logger.error('Error stopping server:', error);
    }
  }
}

// Handle graceful shutdown
const server = new TrackerServer();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await server.stop();
  process.exit(0);
});

// Start the server
if (require.main === module) {
  server.start().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default TrackerServer;
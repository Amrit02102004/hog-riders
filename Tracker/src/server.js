"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/server.ts
var express_1 = require("express");
var http_1 = require("http");
var socket_io_1 = require("socket.io");
var cors = require("cors");
var helmet = require("helmet");
var compression = require("compression");
var morgan = require("morgan");
var dotenv = require("dotenv");
var RedisService_1 = require("./services/RedisService");
var PeerManager_1 = require("./services/PeerManager");
var FileTracker_1 = require("./services/FileTracker");
var logger_1 = require("./utils/logger");
var validation_1 = require("./utils/validation");
// Load environment variables from .env file
dotenv.config();
var TrackerServer = /** @class */ (function () {
    function TrackerServer() {
        this.app = (0, express_1.default)();
        this.httpServer = (0, http_1.createServer)(this.app);
        this.io = new socket_io_1.Server(this.httpServer, {
            cors: {
                origin: "*", // Allow all origins for simplicity
                methods: ["GET", "POST"]
            },
            transports: ['websocket', 'polling']
        });
        this.port = parseInt(process.env.PORT || '3000');
        this.redisService = new RedisService_1.RedisService();
        this.peerManager = new PeerManager_1.PeerManager(this.redisService);
        this.fileTracker = new FileTracker_1.FileTracker(this.redisService);
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
    }
    TrackerServer.prototype.setupMiddleware = function () {
        this.app.use(helmet());
        this.app.use(compression.default());
        this.app.use(cors.default());
        this.app.use(express_1.default.json());
        this.app.use(morgan.default('combined', {
            stream: { write: function (message) { return logger_1.logger.info(message.trim()); } }
        }));
    };
    TrackerServer.prototype.setupRoutes = function () {
        var _this = this;
        this.app.get('/health', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.redisService.ping()];
                    case 1:
                        _a.sent();
                        res.json({
                            status: 'healthy',
                            timestamp: new Date().toISOString(),
                            uptime: process.uptime()
                        });
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        res.status(503).json({
                            status: 'unhealthy',
                            error: 'Redis connection failed'
                        });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        this.app.get('/stats', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var stats, error_2;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 5, , 6]);
                        _a = {};
                        return [4 /*yield*/, this.peerManager.getTotalPeers()];
                    case 1:
                        _a.totalPeers = _b.sent();
                        return [4 /*yield*/, this.peerManager.getActivePeers()];
                    case 2:
                        _a.activePeers = _b.sent();
                        return [4 /*yield*/, this.fileTracker.getTotalFiles()];
                    case 3:
                        _a.totalFiles = _b.sent();
                        return [4 /*yield*/, this.fileTracker.getTotalChunks()];
                    case 4:
                        stats = (_a.totalChunks = _b.sent(),
                            _a);
                        res.json(stats);
                        return [3 /*break*/, 6];
                    case 5:
                        error_2 = _b.sent();
                        logger_1.logger.error('Error getting stats:', error_2);
                        res.status(500).json({ error: 'Failed to retrieve statistics' });
                        return [3 /*break*/, 6];
                    case 6: return [2 /*return*/];
                }
            });
        }); });
    };
    TrackerServer.prototype.broadcastPeerList = function () {
        return __awaiter(this, void 0, void 0, function () {
            var allPeers, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.peerManager.getAllActivePeers()];
                    case 1:
                        allPeers = _a.sent();
                        this.io.emit('update_peer_list', allPeers);
                        logger_1.logger.info("\uD83D\uDCE1 Broadcasted updated peer list. Total peers: ".concat(allPeers.length));
                        return [3 /*break*/, 3];
                    case 2:
                        error_3 = _a.sent();
                        logger_1.logger.error('Failed to broadcast peer list:', error_3);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    TrackerServer.prototype.setupSocketHandlers = function () {
        var _this = this;
        this.io.on('connection', function (socket) {
            logger_1.logger.info("\uD83D\uDD17 Peer connected: ".concat(socket.id));
            socket.on('announce_chunks', function (data) { return __awaiter(_this, void 0, void 0, function () {
                var fileInfo, chunks, error_4;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            fileInfo = data.fileInfo, chunks = data.chunks;
                            if (!fileInfo || !chunks || chunks.length === 0) {
                                return [2 /*return*/, socket.emit('error', { message: 'Invalid chunk announcement data' })];
                            }
                            return [4 /*yield*/, this.fileTracker.announceChunks(socket.id, fileInfo, chunks)];
                        case 1:
                            _a.sent();
                            socket.broadcast.emit('new_content_available', { fileHash: fileInfo.hash });
                            return [3 /*break*/, 3];
                        case 2:
                            error_4 = _a.sent();
                            logger_1.logger.error("Error announcing chunks for peer ".concat(socket.id, ":"), error_4);
                            socket.emit('error', { message: 'Failed to announce chunks' });
                            return [3 /*break*/, 3];
                        case 3: return [2 /*return*/];
                    }
                });
            }); });
            socket.on('request_peers_for_chunk', function (data) { return __awaiter(_this, void 0, void 0, function () {
                var fileHash, chunkIndex, peerIds, error_5;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            fileHash = data.fileHash, chunkIndex = data.chunkIndex;
                            return [4 /*yield*/, this.fileTracker.getPeersForChunk(fileHash, chunkIndex)];
                        case 1:
                            peerIds = _a.sent();
                            socket.emit('peers_for_chunk_response', { fileHash: fileHash, chunkIndex: chunkIndex, peerIds: peerIds });
                            return [3 /*break*/, 3];
                        case 2:
                            error_5 = _a.sent();
                            logger_1.logger.error("Error getting peers for chunk:", error_5);
                            socket.emit('error', { message: 'Failed to get peers for chunk' });
                            return [3 /*break*/, 3];
                        case 3: return [2 /*return*/];
                    }
                });
            }); });
            socket.on('register_peer', function (data) { return __awaiter(_this, void 0, void 0, function () {
                var _a, error, value, peer, error_6;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _b.trys.push([0, 3, , 4]);
                            _a = (0, validation_1.validatePeerRegistration)(data), error = _a.error, value = _a.value;
                            if (error) {
                                return [2 /*return*/, socket.emit('error', { message: error.details[0].message })];
                            }
                            peer = __assign(__assign({ id: socket.id }, value), { lastSeen: new Date(), connected: true });
                            return [4 /*yield*/, this.peerManager.registerPeer(peer)];
                        case 1:
                            _b.sent();
                            socket.emit('registered', { peerId: socket.id });
                            logger_1.logger.info("\u2705 Peer registered: ".concat(socket.id, " at ").concat(peer.address, ":").concat(peer.port));
                            return [4 /*yield*/, this.broadcastPeerList()];
                        case 2:
                            _b.sent();
                            return [3 /*break*/, 4];
                        case 3:
                            error_6 = _b.sent();
                            logger_1.logger.error('Error registering peer:', error_6);
                            socket.emit('error', { message: 'Failed to register peer' });
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/];
                    }
                });
            }); });
            socket.on('heartbeat', function () { return __awaiter(_this, void 0, void 0, function () {
                var error_7;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            return [4 /*yield*/, this.peerManager.updateLastSeen(socket.id)];
                        case 1:
                            _a.sent();
                            socket.emit('heartbeat_ack');
                            return [3 /*break*/, 3];
                        case 2:
                            error_7 = _a.sent();
                            logger_1.logger.warn("Failed to update heartbeat for ".concat(socket.id, ":"), error_7);
                            return [3 /*break*/, 3];
                        case 3: return [2 /*return*/];
                    }
                });
            }); });
            socket.on('disconnect', function () { return __awaiter(_this, void 0, void 0, function () {
                var error_8;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 4, , 5]);
                            return [4 /*yield*/, this.peerManager.unregisterPeer(socket.id)];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, this.fileTracker.removePeerChunks(socket.id)];
                        case 2:
                            _a.sent();
                            logger_1.logger.info("\uD83D\uDD0C Peer disconnected: ".concat(socket.id));
                            return [4 /*yield*/, this.broadcastPeerList()];
                        case 3:
                            _a.sent();
                            return [3 /*break*/, 5];
                        case 4:
                            error_8 = _a.sent();
                            logger_1.logger.error('Error during peer disconnect handling:', error_8);
                            return [3 /*break*/, 5];
                        case 5: return [2 /*return*/];
                    }
                });
            }); });
            socket.on('error', function (error) {
                logger_1.logger.error("Socket error from ".concat(socket.id, ":"), error.message);
            });
        });
    };
    TrackerServer.prototype.start = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_9;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.redisService.connect()];
                    case 1:
                        _a.sent();
                        this.startCleanupJob();
                        this.httpServer.listen(this.port, function () {
                            logger_1.logger.info("\uD83D\uDE80 Tracker server running on port ".concat(_this.port));
                        });
                        return [3 /*break*/, 3];
                    case 2:
                        error_9 = _a.sent();
                        logger_1.logger.error('❌ Failed to start server:', error_9);
                        process.exit(1);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    TrackerServer.prototype.startCleanupJob = function () {
        var _this = this;
        var cleanupInterval = 5 * 60 * 1000; // 5 minutes
        setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
            var error_10;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger_1.logger.info('Running cleanup job for inactive peers...');
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, this.peerManager.cleanupInactivePeers(cleanupInterval)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.broadcastPeerList()];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        error_10 = _a.sent();
                        logger_1.logger.error('Error during cleanup job:', error_10);
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        }); }, cleanupInterval);
    };
    TrackerServer.prototype.stop = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_11;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        this.io.close();
                        this.httpServer.close();
                        return [4 /*yield*/, this.redisService.disconnect()];
                    case 1:
                        _a.sent();
                        logger_1.logger.info('Server stopped gracefully.');
                        return [3 /*break*/, 3];
                    case 2:
                        error_11 = _a.sent();
                        logger_1.logger.error('Error during server shutdown:', error_11);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return TrackerServer;
}());
var server = new TrackerServer();
var shutdown = function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                logger_1.logger.info('Shutdown signal received, closing server...');
                return [4 /*yield*/, server.stop()];
            case 1:
                _a.sent();
                process.exit(0);
                return [2 /*return*/];
        }
    });
}); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
server.start();

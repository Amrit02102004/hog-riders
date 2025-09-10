"use strict";
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
exports.PeerManager = void 0;
var logger_1 = require("../utils/logger"); // Assuming you have a logger utility
var PEER_KEY_PREFIX = 'peer:';
var ACTIVE_PEERS_SET = 'active_peers';
var PeerManager = /** @class */ (function () {
    function PeerManager(redisService) {
        this.redisClient = redisService;
    }
    PeerManager.prototype.registerPeer = function (peer) {
        return __awaiter(this, void 0, void 0, function () {
            var peerKey, redis, pipeline;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        peerKey = "".concat(PEER_KEY_PREFIX).concat(peer.id);
                        redis = this.redisClient.getClient();
                        pipeline = redis.pipeline();
                        pipeline.hset(peerKey, {
                            id: peer.id,
                            address: peer.address,
                            port: peer.port.toString(),
                            lastSeen: peer.lastSeen.toISOString(),
                        });
                        pipeline.sadd(ACTIVE_PEERS_SET, peer.id);
                        return [4 /*yield*/, pipeline.exec()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    PeerManager.prototype.unregisterPeer = function (peerId) {
        return __awaiter(this, void 0, void 0, function () {
            var redis, pipeline;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        redis = this.redisClient.getClient();
                        pipeline = redis.pipeline();
                        pipeline.srem(ACTIVE_PEERS_SET, peerId);
                        pipeline.del("".concat(PEER_KEY_PREFIX).concat(peerId));
                        return [4 /*yield*/, pipeline.exec()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    PeerManager.prototype.getAllActivePeers = function () {
        return __awaiter(this, void 0, void 0, function () {
            var redis, peerIds, pipeline, results, peers;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        redis = this.redisClient.getClient();
                        return [4 /*yield*/, redis.smembers(ACTIVE_PEERS_SET)];
                    case 1:
                        peerIds = _a.sent();
                        if (!peerIds || peerIds.length === 0) {
                            return [2 /*return*/, []];
                        }
                        pipeline = redis.pipeline();
                        peerIds.forEach(function (id) { return pipeline.hgetall("".concat(PEER_KEY_PREFIX).concat(id)); });
                        return [4 /*yield*/, pipeline.exec()];
                    case 2:
                        results = _a.sent();
                        if (!results) {
                            return [2 /*return*/, []];
                        }
                        peers = results
                            .map(function (_a) {
                            var data = _a[1];
                            // (FIX) Assert the type of data to fix the 'property does not exist' error
                            var peerData = data;
                            if (typeof peerData !== 'object' || peerData === null || !peerData.id) {
                                return null;
                            }
                            // Now TypeScript knows the shape of peerData
                            return {
                                id: peerData.id,
                                address: peerData.address,
                                port: parseInt(peerData.port, 10),
                                lastSeen: new Date(peerData.lastSeen),
                                connected: true,
                            };
                        })
                            .filter(function (p) { return p !== null; });
                        return [2 /*return*/, peers];
                }
            });
        });
    };
    PeerManager.prototype.updateLastSeen = function (peerId) {
        return __awaiter(this, void 0, void 0, function () {
            var peerKey;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        peerKey = "".concat(PEER_KEY_PREFIX).concat(peerId);
                        return [4 /*yield*/, this.redisClient.getClient().hset(peerKey, 'lastSeen', new Date().toISOString())];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * (FIX) Added the missing method that server.ts requires.
     * It finds and removes peers that haven't sent a heartbeat recently.
     */
    PeerManager.prototype.cleanupInactivePeers = function (thresholdMs) {
        return __awaiter(this, void 0, void 0, function () {
            var now, allPeers, _i, allPeers_1, peer, lastSeenTime;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        now = Date.now();
                        return [4 /*yield*/, this.getAllActivePeers()];
                    case 1:
                        allPeers = _a.sent();
                        _i = 0, allPeers_1 = allPeers;
                        _a.label = 2;
                    case 2:
                        if (!(_i < allPeers_1.length)) return [3 /*break*/, 5];
                        peer = allPeers_1[_i];
                        lastSeenTime = peer.lastSeen.getTime();
                        if (!(now - lastSeenTime > thresholdMs)) return [3 /*break*/, 4];
                        logger_1.logger.info("Cleaning up inactive peer: ".concat(peer.id));
                        return [4 /*yield*/, this.unregisterPeer(peer.id)];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    PeerManager.prototype.getActivePeers = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.redisClient.getClient().scard(ACTIVE_PEERS_SET)];
            });
        });
    };
    PeerManager.prototype.getTotalPeers = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.getActivePeers()];
            });
        });
    };
    return PeerManager;
}());
exports.PeerManager = PeerManager;

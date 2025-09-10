"use strict";
// src/services/FileTracker.ts
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
exports.FileTracker = void 0;
var logger_1 = require("../utils/logger");
// --- Redis Key Prefixes ---
var FILE_INFO_PREFIX = 'file:'; // HASH: Stores metadata for a file hash
var CHUNK_PEERS_PREFIX = 'chunk:'; // SET: Stores peer IDs that have a specific chunk
var PEER_FILES_PREFIX = 'peer_files:'; // SET: Stores file hashes a peer is seeding
var ALL_FILES_SET = 'all_files'; // SET: Stores all unique file hashes for stats
var FILE_SEARCH_KEY = 'file_search'; // ZSET: For searching files by name
var FileTracker = /** @class */ (function () {
    function FileTracker(redisService) {
        this.redis = redisService;
    }
    /**
     * Called when a peer announces it has chunks for a file.
     * This method registers the file and associates the peer with its chunks.
     */
    FileTracker.prototype.announceChunks = function (peerId, fileInfo, chunks) {
        return __awaiter(this, void 0, void 0, function () {
            var redis, fileKey, pipeline, searchMember, _i, chunks_1, chunk, chunkKey, peerFilesKey;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        redis = this.redis.getClient();
                        fileKey = "".concat(FILE_INFO_PREFIX).concat(fileInfo.hash);
                        pipeline = redis.pipeline();
                        // 1. Store the file's metadata if it's the first time we've seen it.
                        pipeline.hsetnx(fileKey, 'name', fileInfo.name);
                        pipeline.hsetnx(fileKey, 'size', fileInfo.size);
                        pipeline.hsetnx(fileKey, 'chunkCount', fileInfo.chunkCount);
                        // 2. Add the file to the set of all unique files for stats.
                        pipeline.sadd(ALL_FILES_SET, fileInfo.hash);
                        searchMember = "".concat(fileInfo.name.toLowerCase(), ":").concat(fileInfo.hash);
                        pipeline.zadd(FILE_SEARCH_KEY, 0, searchMember);
                        // 4. For each chunk, add the peer to the set of peers who have that chunk.
                        for (_i = 0, chunks_1 = chunks; _i < chunks_1.length; _i++) {
                            chunk = chunks_1[_i];
                            chunkKey = "".concat(CHUNK_PEERS_PREFIX).concat(chunk.fileHash, ":").concat(chunk.chunkIndex);
                            pipeline.sadd(chunkKey, peerId);
                        }
                        peerFilesKey = "".concat(PEER_FILES_PREFIX).concat(peerId);
                        pipeline.sadd(peerFilesKey, fileInfo.hash);
                        return [4 /*yield*/, pipeline.exec()];
                    case 1:
                        _a.sent();
                        logger_1.logger.info("Peer ".concat(peerId, " announced ").concat(chunks.length, " chunks for file ").concat(fileInfo.name));
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Retrieves a list of peer IDs that have a specific chunk of a file.
     * @returns An array of peer IDs.
     */
    FileTracker.prototype.getPeersForChunk = function (fileHash, chunkIndex) {
        return __awaiter(this, void 0, void 0, function () {
            var chunkKey;
            return __generator(this, function (_a) {
                chunkKey = "".concat(CHUNK_PEERS_PREFIX).concat(fileHash, ":").concat(chunkIndex);
                return [2 /*return*/, this.redis.getClient().smembers(chunkKey)];
            });
        });
    };
    /**
     * Cleans up all records associated with a peer when they disconnect.
     */
    FileTracker.prototype.removePeerChunks = function (peerId) {
        return __awaiter(this, void 0, void 0, function () {
            var redis, peerFilesKey, fileHashes, pipeline, _i, fileHashes_1, hash, fileKey, chunkCountStr, chunkCount, i, chunkKey;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        redis = this.redis.getClient();
                        peerFilesKey = "".concat(PEER_FILES_PREFIX).concat(peerId);
                        return [4 /*yield*/, redis.smembers(peerFilesKey)];
                    case 1:
                        fileHashes = _a.sent();
                        if (fileHashes.length === 0) {
                            return [2 /*return*/]; // Nothing to clean up
                        }
                        pipeline = redis.pipeline();
                        _i = 0, fileHashes_1 = fileHashes;
                        _a.label = 2;
                    case 2:
                        if (!(_i < fileHashes_1.length)) return [3 /*break*/, 5];
                        hash = fileHashes_1[_i];
                        fileKey = "".concat(FILE_INFO_PREFIX).concat(hash);
                        return [4 /*yield*/, redis.hget(fileKey, 'chunkCount')];
                    case 3:
                        chunkCountStr = _a.sent();
                        chunkCount = parseInt(chunkCountStr || '0', 10);
                        // For each chunk of the file, remove the peer from the set
                        for (i = 0; i < chunkCount; i++) {
                            chunkKey = "".concat(CHUNK_PEERS_PREFIX).concat(hash, ":").concat(i);
                            pipeline.srem(chunkKey, peerId);
                        }
                        _a.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5:
                        // Finally, delete the record of files this peer was seeding
                        pipeline.del(peerFilesKey);
                        return [4 /*yield*/, pipeline.exec()];
                    case 6:
                        _a.sent();
                        logger_1.logger.info("Cleaned up chunk records for disconnected peer ".concat(peerId));
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Searches for files by name (prefix search).
     * @returns A list of file metadata objects matching the query.
     */
    FileTracker.prototype.searchFiles = function (query_1) {
        return __awaiter(this, arguments, void 0, function (query, limit) {
            var redis, members, pipeline, fileHashes, _i, _a, member, hash, results;
            if (limit === void 0) { limit = 50; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        redis = this.redis.getClient();
                        return [4 /*yield*/, redis.zrangebylex(FILE_SEARCH_KEY, "[".concat(query.toLowerCase()), "[".concat(query.toLowerCase(), "\u00FF") // `\xff` is the highest possible character
                            )];
                    case 1:
                        members = _b.sent();
                        if (members.length === 0)
                            return [2 /*return*/, []];
                        pipeline = redis.pipeline();
                        fileHashes = [];
                        // Extract file hashes from the search results
                        for (_i = 0, _a = members.slice(0, limit); _i < _a.length; _i++) {
                            member = _a[_i];
                            hash = member.split(':').pop();
                            if (hash) {
                                fileHashes.push(hash);
                                pipeline.hgetall("".concat(FILE_INFO_PREFIX).concat(hash));
                            }
                        }
                        return [4 /*yield*/, pipeline.exec()];
                    case 2:
                        results = _b.sent();
                        if (!results)
                            return [2 /*return*/, []];
                        return [2 /*return*/, results
                                .map(function (_a) {
                                var data = _a[1];
                                var fileData = data;
                                if (!fileData || !fileData.name)
                                    return null;
                                return {
                                    hash: fileHashes.shift(), // Assuming order is preserved
                                    name: fileData.name,
                                    size: parseInt(fileData.size, 10),
                                    chunkCount: parseInt(fileData.chunkCount, 10),
                                };
                            })
                                .filter(function (f) { return f !== null; })];
                }
            });
        });
    };
    /**
     * Gets the total count of unique files known to the tracker.
     */
    FileTracker.prototype.getTotalFiles = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.redis.getClient().scard(ALL_FILES_SET)];
            });
        });
    };
    // Note: getTotalChunks is more complex as it requires summing up all chunks of all files.
    // It can be computationally expensive and is often omitted or estimated.
    FileTracker.prototype.getTotalChunks = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, 0]; // Placeholder
            });
        });
    };
    return FileTracker;
}());
exports.FileTracker = FileTracker;

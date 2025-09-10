// src/types.ts

/**
 * Represents a peer connected to the tracker.
 */
export interface IPeer {
  id: string; // socket.id
  address: string;
  port: number;
  lastSeen: Date;
  connected: boolean;
}

/**
 * Represents a single piece of a file that a peer has.
 */
export interface IFileChunk {
  fileHash: string;
  chunkIndex: number;
}

/**
 * Represents the metadata for a file being tracked.
 */
export interface IFileInfo {
  hash: string;
  name: string;
  size: number;
  chunkCount: number;
}

/**
 * Represents the overall statistics of the tracker.
 */
export interface ITrackerStats {
  totalPeers: number;
  activePeers: number;
  totalFiles: number;
  totalChunks: number;
}
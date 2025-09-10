/**
 * Represents a peer connected to the tracker.
 * Used by PeerManager.
 */
export interface IPeer {
  id: string; // Socket.IO ID
  address: string;
  port: number;
  lastSeen: Date;
  connected: boolean;
  capabilities?: string[];
  clientId?: string;
}

/**
 * Represents a single chunk of a file that a peer has.
 * Used by FileTracker.
 */
export interface IFileChunk {
  fileHash: string;
  chunkIndex: number;
  size: number;
  checksum?: string;
  // Optional metadata that may be sent with the first chunk announcement
  fileName?: string;
  fileSize?: number;
}

/**
 * Represents metadata about a tracked file.
 * Used by FileTracker.
 */
export interface IFileInfo {
  hash: string;
  name: string;
  size: number;
  lastUpdated: Date;
  peerCount: number;
  chunkCount: number;
  peers: string[]; // Array of peer IDs
}

/**
 * Represents the overall statistics of the tracker.
 * Used by the /stats endpoint in server.ts.
 */
export interface ITrackerStats {
  totalPeers: number;
  activePeers: number;
  totalFiles: number;
  totalChunks: number;
}
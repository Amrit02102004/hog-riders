export interface IFileChunk {
    fileHash: string;
    chunkIndex: number;
}

export interface IFileInfo {
    hash: string;
    name: string;
    size: number;
    chunkCount: number;
}
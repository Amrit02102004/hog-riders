import Seeder from "./seeder.js";
import Leecher from "./leecher.js";
import FileMetadata from "./Types/FileMetadata.js";

class Client {
    private seeder: Seeder;
    private leecher: Leecher;
    private TRACKER_URL: string = 'http://localhost:3000';

    constructor() {
        this.seeder = new Seeder(this.TRACKER_URL);
        this.leecher = new Leecher(this.TRACKER_URL);
    }

    public async ensureConnected(): Promise<void> {
        await Promise.all([
            this.seeder.ensureConnected(),
            this.leecher.ensureConnected()
        ]);
        console.log("🔗 All client connections established");
    }

    public async uploadFile(absoluteFilePath: string): Promise<void> {
        await this.seeder.uploadFile(absoluteFilePath);
    }

    public parseFileMetadata(absoluteFilePath: string): FileMetadata | null {
        return this.seeder.parseMetadata(absoluteFilePath);
    }


    public async requestFilePart(absoluteFilePath: string, partIndex: number): Promise<void> {
        const metadata = this.parseFileMetadata(absoluteFilePath);
        if (metadata) {
            await this.leecher.requestPeersForChunk(metadata.hash, partIndex);
        } else {
            console.error(`Could not request part ${partIndex}. Failed to get metadata for file: ${absoluteFilePath}`);
        }
    }

    public async requestFilesList(): Promise<void> {
        await this.leecher.requestFilesList();
    }

    // public async requestFileInfo(fileHash: string): Promise<void> {
    //     await this.leecher.requestFileInfo(fileHash);
    // }

    public async requestFileInfo(fileName: string): Promise<void> {
        await this.leecher.requestFileInfo(fileName);
    }
    //
    // public async requestFileInfoByName(fileName: string): Promise<void> {
    //     await this.leecher.requestFileInfo({ fileName });
    // }

    // public async requestFileInfoViaListLookup(fileName: string): Promise<void> {
    //     await this.leecher.requestFileInfoViaListLookup(fileName);
    // }


}

export default Client;
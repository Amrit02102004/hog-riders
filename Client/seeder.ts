import * as fs from "fs";
import * as path from "path";
import { io, Socket } from "socket.io-client";
import FileMetadata from "./Types/FileMetadata";

class Seeder {
    private trackerURL: string;
    private partSize: number = 1024 * 1024; // 1 MB per chunk
    private trackerSocket: Socket;
    private partsMap: Map<string, number[]> = new Map(); // Maps absoluteFilePath to array of part indices

    constructor(trackerURL: string) {
        this.trackerURL = trackerURL;
        this.trackerSocket = io(trackerURL);

        this.trackerSocket.on("connect", () => {
            console.log("Connected to tracker at", trackerURL);
        });

        this.trackerSocket.on("disconnect", () => {
            console.log("Disconnected from tracker at", trackerURL);
        });

        this.trackerSocket.on("error", (err) => {
            console.error("Error with tracker connection:", err);
        });

        this.trackerSocket.on("received", () => {
            console.log("Tracker received data:");
        })
    }

    public parseMetadata(absoluteFilePath: string): FileMetadata | null {
        try {
            const stats = fs.statSync(absoluteFilePath);
            const fileName = path.basename(absoluteFilePath);
            const fileSize = stats.size;
            const fileExtension = path.extname(absoluteFilePath);
            const partCount = this.numParts(fileSize, this.partSize);

            const metadata: FileMetadata = {
                name: fileName,
                size: fileSize,
                extension: fileExtension,
                numParts: partCount,
            };
            return metadata;
        } catch (error) {
            console.error("Error parsing file:", error);
            return null;
        }
    }

    private numParts(fileSize: number, partSize: number): number {
        return Math.ceil(fileSize / partSize);
    }

    private updateTracker(metadata: FileMetadata, parts: number[]): void {
        this.trackerSocket.emit("updateTracker", metadata, parts);
    }

    public addPart(absoluteFilePath: string, metadata: FileMetadata, partIndex: number): void {
        const existingParts = this.partsMap.get(absoluteFilePath) || [];
        const updatedParts = [...existingParts, partIndex];
        this.partsMap.set(absoluteFilePath, updatedParts);

        this.updateTracker(metadata, updatedParts);
    }

    public uploadFile(absoluteFilePath: string): void {
        const metadata = this.parseMetadata(absoluteFilePath);
        if (!metadata) {
            console.error("Failed to parse metadata. Upload aborted.");
            return;
        }

        const parts = Array.from({ length: metadata.numParts }, (_, i) => i);
        this.partsMap.set(absoluteFilePath, parts);
        this.updateTracker(metadata, parts);
    }
}

const s: Seeder = new Seeder("");
console.log(s.parseMetadata("../README.md"));

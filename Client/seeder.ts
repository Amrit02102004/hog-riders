import * as fs from "fs";
import * as path from "path";
import FileMetadata from "./Types/FileMetadata";

class Seeder {
    private trackerURL: string;
    constructor(trackerURL:string) {
        this.trackerURL = trackerURL;
    }

    public parseMetadata(absoluteFilePath: string): FileMetadata | null {
        try {
            const stats = fs.statSync(absoluteFilePath);
            const fileName = path.basename(absoluteFilePath);
            const fileSize = stats.size;
            const fileExtension = path.extname(absoluteFilePath);
            const metadata: FileMetadata = {
                name: fileName,
                size: fileSize,
                extension: fileExtension
            };
            return metadata;
        } catch (error) {
            console.error("Error parsing file : ", error);
            return null;
        }
    }



    public uploadFile(filePath: string): void {

    }
}


const s : Seeder = new Seeder("");
console.log(s.parseMetadata("/home/a7x/WebstormProjects/hog-riders/README.md"));
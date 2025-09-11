import Client from "./client.js";
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import * as path from 'path';
import * as fs from 'fs';

// --- Define a default download directory for the CLI ---
const DOWNLOADS_DIR = path.join(process.cwd(), 'ClientDownloads');

const rl = readline.createInterface({ input, output });

async function main() {
    // --- Ensure the download directory exists ---
    if (!fs.existsSync(DOWNLOADS_DIR)) {
        console.log(`Creating download directory at: ${DOWNLOADS_DIR}`);
        fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    }

    console.log("Initializing client and requesting port from tracker...");
    const name :string = await rl.question("Enter your name: ");
    const client = new Client(name);
    await client.initialize();

    console.log("✅ Client is ready.");


    while (true) {
        console.log("\n--- Hog Riders P2P Menu ---");
        console.log("1. Seed a file (upload)");
        console.log("2. List all files on the network");
        console.log("3. Download a file");
        console.log("4. Exit");

        const choice = await rl.question("Enter your choice: ");

        switch (choice) {
            case '1':
                const fileUploadName:string = await rl.question("Enter the absolute file path to seed: ");
                try {
                    console.log(`Seeding file from path: ${fileUploadName}`);
                    await client.uploadFile(fileUploadName);
                    console.log(`\n✅ File "${path.basename(fileUploadName)}" announced to the tracker.`);
                } catch (error) {
                    console.error('\n❌ Error seeding file:', error);
                }
                break;

            case '2':
                console.log("\n📄 Requesting file list from tracker...");
                try {
                    const files = await client.requestFilesList();
                    console.log("\n--- Files Available on the Network ---");
                    if (files.length > 0) {
                        files.forEach(file => {
                            console.log(`- Name: ${file.name}, Size: ${file.size} bytes, Chunks: ${file.chunkCount}`);
                        });
                    } else {
                        console.log("No files found on the network.");
                    }
                    console.log("------------------------------------");
                } catch (error) {
                    console.error('\n❌ Failed to retrieve file list:', error);
                }
                break;

            case '3':
                const fileName = await rl.question("Enter the file name to download: ");
                try {
                    console.log(`\n⬇️  Downloading "${fileName}" to ${DOWNLOADS_DIR}...`);
                    await client.downloadFile(fileName, DOWNLOADS_DIR);
                    console.log(`\n✅ File downloaded successfully.`);
                } catch(error) {
                    console.error('\n❌ Download failed:', error);
                }
                break;

            case '4':
                console.log("👋 Exiting...");
                rl.close();
                process.exit(0);

            default:
                console.log("Invalid choice. Please try again.");
                break;
        }
    }
}

main().catch(err => {
    console.error("An error occurred:", err);
    rl.close();
    process.exit(1);
});

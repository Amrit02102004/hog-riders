import Client from "./client.js";
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import * as path from 'path';

const rl = readline.createInterface({ input, output });

async function main() {
    console.log("Initializing client and requesting port from tracker...");
    const client = new Client();
    await client.initialize();

    console.log("✅ Client is ready.");

    const testFilePath = path.join(process.cwd(), 'TestFiles', 'test.txt');

    while (true) {
        console.log("\n--- Hog Riders P2P Menu ---");
        console.log("1. Seed a file (upload)");
        console.log("2. List all files on the network");
        console.log("3. Download a file");
        console.log("4. Exit");

        const choice = await rl.question("Enter your choice: ");

        switch (choice) {
            case '1':
                const fileUploadName:string = await rl.question("Enter the file name to seed: ");
                console.log(`Seeding file from path: ${fileUploadName}`);
                await client.uploadFile(fileUploadName);
                console.log(`\n✅ File "${path.basename(fileUploadName)}" announced to the tracker.`);
                break;

            case '2':
                console.log("\n📄 Requesting file list from tracker...");
                await client.requestFilesList();
                break;

            case '3':
                const fileName = await rl.question("Enter the file name to download: ");
                await client.downloadFile(fileName);
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
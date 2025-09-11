import Client from "./client.js";
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import * as path from 'path';

const rl = readline.createInterface({ input, output });

async function main() {
    const portStr = await rl.question("Enter a port for this peer to listen on (e.g., 4001, 4002): ");
    const peerPort = parseInt(portStr);
    if (isNaN(peerPort)) {
        console.log("Invalid port. Exiting.");
        process.exit(1);
    }

    const client = new Client(peerPort);
    await client.ensureConnected();
    console.log("✅ Client is ready.");

    while (true) {
        console.log("\n--- Hog Riders P2P Menu ---");
        console.log("1. Seed file (upload)");
        console.log("2. List all files on the network");
        console.log("3. Download a file");
        console.log("4. Exit");

        const choice = await rl.question("Enter your choice: ");

        switch (choice) {
            case '1':
                const filePath = await rl.question("Enter the file name to seed : ");
                console.log(`Seeding file from path: ${filePath}`);
                await client.uploadFile(filePath);
                console.log(`\n✅ File "${path.basename(filePath)}" announced to the tracker.`);
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
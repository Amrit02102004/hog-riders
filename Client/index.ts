import Client from "./client.js";
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import * as path from 'path';

const rl = readline.createInterface({ input, output });

async function main() {
    const client = new Client();
    await client.ensureConnected();
    console.log("✅ Client is ready.");

    // Create a path to the test file
    const testFilePath = '/home/a7x/WebstormProjects/hog-riders/TestFiles/ROG_G14_Knolling(3840x2160).jpg'

    while (true) {
        console.log("\n--- Hog Riders P2P Menu ---");
        console.log("1. Seed a test file (upload)");
        console.log("2. List all files on the network");
        console.log("3. Get info for a specific file");
        console.log("4. Exit");

        const choice = await rl.question("Enter your choice: ");

        switch (choice) {
            case '1':
                console.log(`Seeding file from path: ${testFilePath}`);
                await client.uploadFile(testFilePath);
                console.log(`\n✅ File "${path.basename(testFilePath)}" announced to the tracker.`);
                break;

            case '2':
                console.log("\n📄 Requesting file list from tracker...");
                await client.requestFilesList();
                break;

            case '3':
                const fileName = await rl.question("Enter the file name to get info for: ");
                console.log(`\nℹ️  Requesting info for "${fileName}"...`);
                await client.requestFileInfo(fileName);
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
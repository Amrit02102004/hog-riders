import Client from "./client.js";

const client = new Client();

// First ensure connection is established
await client.ensureConnected();
console.log("Client is ready to use");

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });

const choice = await rl.question('Enter 1 to list files, 2 to upload a file: ');

if (choice === '1') {
    await client.requestFilesList();
} else if (choice === '2') {
    const filePath = await rl.question('Enter the file path to upload: ');
    await client.uploadFile(filePath);

}else if (choice === '3') {
    const fileName = await rl.question('Enter the file name to search: ');
    await client.requestFileInfoByName(fileName);
}
else {
    console.log('Invalid choice.');
}

rl.close();

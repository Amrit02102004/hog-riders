import Client from "./client.js";

const client = new Client();

// First ensure connection is established
await client.ensureConnected();
console.log("Client is ready to use");

await client.requestFilesList();

// Example usage: Upload a file
// await client.uploadFile('/home/a7x/WebstormProjects/hog-riders/README.md')
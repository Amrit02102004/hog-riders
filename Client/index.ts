import Client from "./client.js";

const client = new Client();

// First ensure connection is established
await client.ensureConnected();
console.log("Client is ready to use");

// Upload a file - this will announce all chunks to the tracker
await client.uploadFile("/home/a7x/WebstormProjects/hog-riders/README.md");

console.log("File upload completed");

// Get file metadata
const metadata = client.parseFileMetadata("/home/a7x/WebstormProjects/hog-riders/README.md");
if (metadata) {
    console.log(`File: ${metadata.name}, Size: ${metadata.size} bytes, Parts: ${metadata.numParts}, Hash: ${metadata.hash}`);

    // Request a specific part of the file from peers
    const partIndex = 0; // First part
    await client.requestFilePart("/home/a7x/WebstormProjects/hog-riders/README.md", partIndex);
    console.log(`Requested part ${partIndex} of file ${metadata.name}`);
} else {
    console.error("Failed to retrieve file metadata");
}

// Keep the process alive for a while to allow for connections and responses
console.log("Client running. Press Ctrl+C to exit.");
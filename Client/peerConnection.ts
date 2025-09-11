// Client/peerConnection.ts
import { io, Socket } from "socket.io-client";
import { IPeer } from "./Types/PeerTypes.js";

export function downloadChunkFromPeer(peer: IPeer, fileHash: string, chunkIndex: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const peerAddress = `http://${peer.address}:${peer.port}`;
        const socket = io(peerAddress, {
            reconnection: false,
            timeout: 5000
        });

        socket.on('connect', () => {
            socket.emit("request_chunk", { fileHash, chunkIndex }, (response: { data?: Buffer, error?: string }) => {
                if (response.error) {
                    reject(new Error(response.error));
                } else if (response.data) {
                    // The buffer data is sent as an array of bytes over JSON
                    resolve(Buffer.from(response.data));
                } else {
                    reject(new Error("Invalid response from peer."));
                }
                socket.disconnect();
            });
        });

        socket.on('connect_error', (err) => {
            reject(new Error(`Failed to connect to peer ${peer.id} at ${peerAddress}: ${err.message}`));
        });
    });
}
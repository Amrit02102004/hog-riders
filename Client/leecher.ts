import { io, Socket } from "socket.io-client";

class Leecher {
    private trackerURL:string;
    private trackerSocket:Socket;

    constructor(trackerURL:string) {
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
    }

    public requestFilesList():void {
        this.trackerSocket.emit("requestFilesList");
    }
}

const l : Leecher = new Leecher("http://localhost:3000");

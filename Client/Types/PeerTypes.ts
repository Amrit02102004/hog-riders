export interface IPeer {
    id: string; // socket.id
    address: string;
    port: number;
    lastSeen: Date;
    connected: boolean;
}
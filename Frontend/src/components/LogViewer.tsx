// amrit02102004/hog-riders/hog-riders-9546d1376f33c069d3f6a19824aa83d0f6cd9331/Frontend/src/components/LogViewer.tsx
import React from 'react';

interface Download {
    fileName: string;
    progress: number;
    logs: string[];
}

interface LogViewerProps {
    downloads: Download[];
}

const LogViewer: React.FC<LogViewerProps> = ({ downloads }) => {
    const allLogs = downloads.flatMap(d => d.logs.map(log => `[${d.fileName}] ${log}`)).slice(-5);

    if (allLogs.length === 0) {
        return null;
    }

    return (
        <div className="card">
            <h2>Live Logs</h2>
            <div className="log-viewer">
                {allLogs.map((log, index) => (
                    <div key={index} className="log-line">{log}</div>
                ))}
            </div>
        </div>
    );
};

export default LogViewer;
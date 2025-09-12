// amrit02102004/hog-riders/hog-riders-9546d1376f33c069d3f6a19824aa83d0f6cd9331/Frontend/src/App.tsx
import React, { useState, useCallback, useEffect } from 'react';
import Seed from './components/Seed';
import FileList from './components/FileList';
import DownloadsList from './components/DownloadsList'; // Assuming you created this from the previous step
import LogViewer from './components/LogViewer';
import './App.css';

const API_URL = 'http://localhost:3001';

interface FileInfo {
    hash: string;
    name: string;
    size: number;
    chunkCount: number;
}

interface Download {
    fileName: string;
    progress: number;
    logs: string[];
}

const App: React.FC = () => {
    const [files, setFiles] = useState<FileInfo[]>([]);
    const [downloads, setDownloads] = useState<Download[]>([]);
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 5000);
    };

    const fetchFiles = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_URL}/files`);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            setFiles(data.files || []);
        } catch (error: any) {
            showMessage(`Error fetching files: ${error.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFiles();

        const pollProgress = async () => {
            try {
                const response = await fetch(`${API_URL}/download-status`);
                if (!response.ok) return;
                const progressData = await response.json();
                const updatedDownloads = Object.entries(progressData).map(([fileName, data]) => ({
                    fileName,
                    progress: (data as any).progress as number,
                    logs: (data as any).logs as string[],
                }));
                setDownloads(updatedDownloads);
            } catch (error) {
                // Silently fail polling
            }
        };

        const intervalId = setInterval(pollProgress, 1000);
        return () => clearInterval(intervalId);
    }, [fetchFiles]);

    const handleSeed = async (filePath: string) => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_URL}/seed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to seed file.');

            showMessage(data.message);
            fetchFiles();
        } catch (error: any) {
            showMessage(`Error: ${error.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownload = async (fileName: string) => {
        const downloadPath = prompt(
            "Enter the absolute path where the file should be saved on the server:",
            "/app/Downloads"
        );
        if (downloadPath === null) return;

        try {
            const response = await fetch(`${API_URL}/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName, downloadPath: downloadPath || undefined }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to start download.');

            showMessage(data.message);
        } catch (error: any) {
            showMessage(`Error: ${error.message}`, 'error');
        }
    };

    return (
        <div className="App">
            <header>
                <h1>Hog Riders P2P</h1>
                <p>A peer-to-peer file-sharing network</p>
            </header>
            <main>
                {message && <div className={`message-bar ${message.type}`}>{message.text}</div>}
                <div className="container">
                    <div className="column">
                        <Seed handleSeed={handleSeed} isLoading={isLoading} />
                        <DownloadsList downloads={downloads} />
                        <LogViewer downloads={downloads} />
                    </div>
                    <div className="column">
                        {/* Ensure fetchFiles is passed as a prop here */}
                        <FileList
                            files={files}
                            handleDownload={handleDownload}
                            isLoading={isLoading}
                            fetchFiles={fetchFiles}
                        />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;
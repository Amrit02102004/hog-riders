import React, { useState } from 'react';
import Seed from './components/Seed';
import FileList from './components/FileList';
import './App.css';

const API_URL = 'http://localhost:3001';

interface FileInfo {
    hash: string;
    name: string;
    size: number;
    chunkCount: number;
}

const App: React.FC = () => {
    const [files, setFiles] = useState<FileInfo[]>([]);
    const [message, setMessage] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const showMessage = (msg: string) => {
        setMessage(msg);
        setTimeout(() => setMessage(''), 5000); // Message disappears after 5 seconds
    };

    const fetchFiles = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_URL}/files`);
            const data = await response.json();
            if (response.ok) {
                setFiles(data.files || []);
                showMessage(`Found ${data.files.length} files on the network.`);
            } else {
                throw new Error(data.error || 'Failed to fetch files.');
            }
        } catch (error: any) {
            showMessage(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSeed = async (filePath: string) => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_URL}/seed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ filePath }),
            });
            const data = await response.json();
            if (response.ok) {
                showMessage(data.message);
                fetchFiles(); // Refresh file list after seeding
            } else {
                throw new Error(data.error || 'Failed to seed file.');
            }
        } catch (error: any) {
            showMessage(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownload = async (fileName: string) => {
        setIsLoading(true);
        const downloadPath = prompt("Enter optional absolute download path on the server:", "/app/Downloads");

        try {
            const response = await fetch(`${API_URL}/download`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ fileName, downloadPath: downloadPath || undefined }),
            });
            const data = await response.json();
            if (response.ok) {
                showMessage(data.message + " Location: " + data.location);
            } else {
                throw new Error(data.error || 'Failed to download file.');
            }
        } catch (error: any) {
            showMessage(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="App">
            <header>
                <h1>Hog Riders P2P Web Interface</h1>
            </header>
            <main>
                {message && <div className="message-bar">{message}</div>}
                <div className="controls">
                    <Seed handleSeed={handleSeed} isLoading={isLoading} />
                    <button onClick={fetchFiles} disabled={isLoading} className="refresh-btn">
                        {isLoading ? 'Loading...' : 'Refresh File List'}
                    </button>
                </div>
                <FileList files={files} handleDownload={handleDownload} isLoading={isLoading}/>
            </main>
        </div>
    );
};

export default App;
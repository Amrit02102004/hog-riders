import React from 'react';

interface FileInfo {
    hash: string;
    name: string;
    size: number;
    chunkCount: number;
}

// Add fetchFiles to the props interface
interface FileListProps {
    files: FileInfo[];
    handleDownload: (fileName: string) => void;
    isLoading: boolean;
    fetchFiles: () => void;
}

const FileList: React.FC<FileListProps> = ({ files, handleDownload, isLoading, fetchFiles }) => {
    return (
        <div className="card">
            <div className="card-header">
                <h2>Files on the Network</h2>
                {/* Use the new fetchFiles prop on this button */}
                <button onClick={fetchFiles} disabled={isLoading} className="refresh-btn">
                    {isLoading ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>
            {files.length === 0 ? (
                <p>No files found. Click "Refresh" to check again.</p>
            ) : (
                <table>
                    <thead>
                    <tr>
                        <th>Name</th>
                        <th>Size (bytes)</th>
                        <th>Action</th>
                    </tr>
                    </thead>
                    <tbody>
                    {files.map((file) => (
                        <tr key={file.hash}>
                            <td>{file.name}</td>
                            <td>{file.size}</td>
                            <td>
                                <button onClick={() => handleDownload(file.name)} disabled={isLoading}>
                                    Download
                                </button>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default FileList;
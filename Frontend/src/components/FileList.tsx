import React from 'react';

interface FileInfo {
    hash: string;
    name: string;
    size: number;
    chunkCount: number;
}

interface FileListProps {
    files: FileInfo[];
    handleDownload: (fileName: string) => void;
    isLoading: boolean;
}

const FileList: React.FC<FileListProps> = ({ files, handleDownload, isLoading }) => {
    return (
        <div className="card">
            <h2>Files on the Network</h2>
            {files.length === 0 ? (
                <p>No files found. Click "Refresh List" to check again.</p>
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
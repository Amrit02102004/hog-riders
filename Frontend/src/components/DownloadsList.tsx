import React from 'react';
import DownloadItem from './DownloadItem';

interface Download {
    fileName: string;
    progress: number;
}

interface DownloadsListProps {
    downloads: Download[];
}

const DownloadsList: React.FC<DownloadsListProps> = ({ downloads }) => {
    if (downloads.length === 0) {
        return null; // Don't render the card if there are no downloads
    }

    return (
        <div className="card">
            <h2>Current Downloads</h2>
            <div className="downloads-list">
                {downloads.map((download) => (
                    <DownloadItem key={download.fileName} {...download} />
                ))}
            </div>
        </div>
    );
};

export default DownloadsList;
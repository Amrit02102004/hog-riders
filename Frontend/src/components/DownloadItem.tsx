import React from 'react';

interface DownloadItemProps {
    fileName: string;
    progress: number;
}

const DownloadItem: React.FC<DownloadItemProps> = ({ fileName, progress }) => {
    const isComplete = progress === 100;
    const isError = progress < 0;

    return (
        <div className="download-item">
            <div className="download-info">
                <span className="file-name">{fileName}</span>
                <span className={`progress-percentage ${isComplete ? 'complete' : ''}`}>
                    {isError ? 'Error' : `${progress}%`}
                </span>
            </div>
            <div className="progress-bar-container">
                <div
                    className={`progress-bar ${isComplete ? 'complete' : ''} ${isError ? 'error' : ''}`}
                    style={{ width: isError ? '100%' : `${progress}%` }}
                ></div>
            </div>
        </div>
    );
};

export default DownloadItem;
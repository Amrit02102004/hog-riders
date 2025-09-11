import React, { useState } from 'react';

interface SeedProps {
    handleSeed: (filePath: string) => void;
    isLoading: boolean;
}

const Seed: React.FC<SeedProps> = ({ handleSeed, isLoading }) => {
    const [filePath, setFilePath] = useState('');

    const onSeed = () => {
        if (filePath) {
            handleSeed(filePath);
            setFilePath('');
        } else {
            alert('Please provide the absolute path of the file on the server.');
        }
    };

    return (
        <div className="card">
            <h2>Seed a File (from Server)</h2>
            <input
                type="text"
                placeholder="Absolute path on the server (e.g., /path/to/file.txt)"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
            />
            <button onClick={onSeed} disabled={!filePath || isLoading}>
                {isLoading ? 'Seeding...' : 'Seed File'}
            </button>
        </div>
    );
};

export default Seed;
#!/bin/bash
set -e  # exit if any command fails

# Navigate to Web_Server
echo "Building and starting Web_Server..."
cd Web_Server
npm run build
npm run start &   # run in background so frontend can also run
cd ..

# Navigate to Frontend
echo "Starting Frontend..."
cd Frontend
npm run dev

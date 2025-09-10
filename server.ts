            socket.on('requestFilesList', async () => {
                try {
                    const redisClient = this.redisService.getClient();
                    const fileKeys: string[] = [];

                    // Use SCAN command instead of scanIterator
                    let cursor = '0';
                    do {
                        const [nextCursor, keys] = await redisClient.scan(
                            cursor, 
                            'MATCH', 
                            'fileinfo:*', 
                            'COUNT', 
                            '100'
                        );
                        cursor = nextCursor;
                        fileKeys.push(...keys);
                    } while (cursor !== '0');

                    if (fileKeys.length === 0) {
                        return socket.emit('filesList', []); // Send empty list if no files
                    }

                    const filesData = await redisClient.mget(fileKeys);
                    const files: IFileInfo[] = filesData
                        .filter((data: unknown): data is string => data !== null) // Filter out potential nulls
                        .map((data: string) => JSON.parse(data));

                    socket.emit('filesList', files);
                    logger.info(`✅ Sent file list (${files.length} files) to peer ${socket.id}`);
                } catch (error) {
                    logger.error(`Error fetching file list for peer ${socket.id}:`, error);
                    socket.emit('error', { message: 'Failed to retrieve file list' });
                }
            });

import Redis from 'ioredis';
import { logger } from '../utils/logger';

export class RedisManager {
    private static instance: Redis;

    private constructor() {}

    /**
     * Gets the singleton Redis client instance.
     */
    public static getInstance(): Redis {
        if (!RedisManager.instance) {
            try {
                RedisManager.instance = new Redis({
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT || '6379'),
                    maxRetriesPerRequest: null, // Continuously try to reconnect
                });

                RedisManager.instance.on('connect', () => {
                    logger.info('✅ Connected to Redis successfully!');
                });

                RedisManager.instance.on('error', (err) => {
                    logger.error('❌ Redis connection error:', err);
                });

            } catch (error) {
                logger.error('❌ Failed to create Redis instance:', error);
                process.exit(1);
            }
        }
        return RedisManager.instance;
    }

    /**
     * Disconnects the Redis client.
     */
    public static async disconnect(): Promise<void> {
        if (RedisManager.instance) {
            await RedisManager.instance.quit();
            logger.info('🔌 Disconnected from Redis.');
        }
    }
}
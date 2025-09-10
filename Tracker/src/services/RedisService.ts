import IORedis, { Redis } from 'ioredis';
import * as dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

export class RedisService {
  private client: Redis;

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      console.error('🔴 REDIS_URL is not defined in the environment variables.');
      process.exit(1);
    }

    this.client = new IORedis(redisUrl, {
      // Prevents ioredis from exiting the process on connection error
      lazyConnect: true, 
    });

    this.client.on('connect', () => console.log('🟢 Redis client connected'));
    this.client.on('error', (err) => console.error('🔴 Redis client error', err));
  }

  public async connect(): Promise<void> {
    await this.client.connect();
  }

  public async disconnect(): Promise<void> {
    await this.client.quit();
  }

  public getClient(): Redis {
    return this.client;
  }

  public async ping(): Promise<string> {
    return this.client.ping();
  }
}
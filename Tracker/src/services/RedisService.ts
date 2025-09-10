import { Redis } from 'ioredis';
import { logger } from '../utils/logger';

export class RedisService {
  private client: Redis;
  private isConnected: boolean = false;

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Redis connecting...');
    });

    this.client.on('ready', () => {
      logger.info('Redis connected and ready');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      logger.error('Redis error:', error);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      logger.warn('Redis connection closed');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });
  }

  public async connect(): Promise<void> {
    try {
      await this.client.connect();
      logger.info('Redis connection established');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
      this.isConnected = false;
      logger.info('Redis disconnected');
    } catch (error) {
      logger.error('Error disconnecting Redis:', error);
      throw error;
    }
  }

  public async ping(): Promise<string> {
    return await this.client.ping();
  }

  public getClient(): Redis {
    if (!this.isConnected) {
      throw new Error('Redis client not connected');
    }
    return this.client;
  }

  public isClientConnected(): boolean {
    return this.isConnected;
  }

  // Hash operations
  public async hset(key: string, field: string, value: string): Promise<number> {
    return await this.client.hset(key, field, value);
  }

  public async hget(key: string, field: string): Promise<string | null> {
    return await this.client.hget(key, field);
  }

  public async hgetall(key: string): Promise<Record<string, string>> {
    return await this.client.hgetall(key);
  }

  public async hdel(key: string, ...fields: string[]): Promise<number> {
    return await this.client.hdel(key, ...fields);
  }

  public async hkeys(key: string): Promise<string[]> {
    return await this.client.hkeys(key);
  }

  public async hlen(key: string): Promise<number> {
    return await this.client.hlen(key);
  }

  // Set operations
  public async sadd(key: string, ...members: string[]): Promise<number> {
    return await this.client.sadd(key, ...members);
  }

  public async srem(key: string, ...members: string[]): Promise<number> {
    return await this.client.srem(key, ...members);
  }

  public async smembers(key: string): Promise<string[]> {
    return await this.client.smembers(key);
  }

  public async scard(key: string): Promise<number> {
    return await this.client.scard(key);
  }

  public async sismember(key: string, member: string): Promise<number> {
    return await this.client.sismember(key, member);
  }

  // Key operations
  public async del(...keys: string[]): Promise<number> {
    return await this.client.del(...keys);
  }

  public async exists(...keys: string[]): Promise<number> {
    return await this.client.exists(...keys);
  }

  public async expire(key: string, seconds: number): Promise<number> {
    return await this.client.expire(key, seconds);
  }

  public async ttl(key: string): Promise<number> {
    return await this.client.ttl(key);
  }

  public async keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }

  // String operations
  public async set(key: string, value: string, expiryMode?: string, time?: number): Promise<string | null> {
    if (expiryMode && time) {
      return await this.client.set(key, value, expiryMode, time);
    }
    return await this.client.set(key, value);
  }

  public async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  public async incr(key: string): Promise<number> {
    return await this.client.incr(key);
  }

  public async decr(key: string): Promise<number> {
    return await this.client.decr(key);
  }

  // Transaction operations
  public multi(): any {
    return this.client.multi();
  }

  // Scan operations for large datasets
  public async scan(cursor: number, pattern?: string, count?: number): Promise<[string, string[]]> {
    const args: any[] = [cursor];
    if (pattern) {
      args.push('MATCH', pattern);
    }
    if (count) {
      args.push('COUNT', count);
    }
    return await this.client.scan(...args);
  }

  public async hscan(key: string, cursor: number, pattern?: string, count?: number): Promise<[string, string[]]> {
    const args: any[] = [key, cursor];
    if (pattern) {
      args.push('MATCH', pattern);
    }
    if (count) {
      args.push('COUNT', count);
    }
    return await this.client.hscan(...args);
  }

  public async sscan(key: string, cursor: number, pattern?: string, count?: number): Promise<[string, string[]]> {
    const args: any[] = [key, cursor];
    if (pattern) {
      args.push('MATCH', pattern);
    }
    if (count) {
      args.push('COUNT', count);
    }
    return await this.client.sscan(...args);
  }

  // Pipeline operations for better performance
  public pipeline(): any {
    return this.client.pipeline();
  }

  // Pub/Sub operations (if needed for future features)
  public async publish(channel: string, message: string): Promise<number> {
    return await this.client.publish(channel, message);
  }

  public async subscribe(...channels: string[]): Promise<void> {
    await this.client.subscribe(...channels);
  }

  public async unsubscribe(...channels: string[]): Promise<void> {
    await this.client.unsubscribe(...channels);
  }

  // Utility methods
  public async flushdb(): Promise<string> {
    return await this.client.flushdb();
  }

  public async info(section?: string): Promise<string> {
    return section ? await this.client.info(section) : await this.client.info();
  }
}
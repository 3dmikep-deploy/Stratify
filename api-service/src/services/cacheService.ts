// api-service/src/services/cacheService.ts
import Redis from 'ioredis';
import { AnalysisResult } from '../types/shared';

export class CacheService {
  private redis: Redis;
  private defaultTTL = 3600; // 1 hour

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const url = new URL(redisUrl);
    const port = Number(url.port || '6379');
    const host = url.hostname || 'localhost';
    
    this.redis = new Redis(port, host, {
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.redis.on('connect', () => {
      console.log('Connected to Redis');
    });

    this.redis.on('error', (error) => {
      console.error('Redis connection error:', error);
    });

    console.log('CacheService initialized');
  }

  /**
   * Set a value in cache with optional TTL
   */
  async set(key: string, value: any, ttl: number = this.defaultTTL): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await this.redis.setex(key, ttl, serialized);
    } catch (error) {
      console.error('Cache set error:', error);
      // Don't throw - cache failures shouldn't break the application
    }
  }

  /**
   * Get a value from cache
   */
  async get(key: string): Promise<any | null> {
    try {
      const value = await this.redis.get(key);
      if (value === null) {
        return null;
      }
      return JSON.parse(value);
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Delete a key from cache
   */
  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  /**
   * Check if a key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  /**
   * Set expiration time for a key
   */
  async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.redis.expire(key, seconds);
    } catch (error) {
      console.error('Cache expire error:', error);
    }
  }

  /**
   * Increment a counter in cache
   */
  async increment(key: string, by: number = 1): Promise<number> {
    try {
      return await this.redis.incrby(key, by);
    } catch (error) {
      console.error('Cache increment error:', error);
      return 0;
    }
  }

  /**
   * Cache analysis result
   */
  async cacheAnalysis(analysisId: string, result: AnalysisResult, ttl?: number): Promise<void> {
    const key = `analysis:${analysisId}`;
    await this.set(key, result, ttl);
  }

  /**
   * Get cached analysis result
   */
  async getCachedAnalysis(analysisId: string): Promise<AnalysisResult | null> {
    const key = `analysis:${analysisId}`;
    return await this.get(key);
  }

  /**
   * Cache analysis progress
   */
  async cacheProgress(analysisId: string, progress: { stage: string; progress: number }): Promise<void> {
    const key = `progress:${analysisId}`;
    await this.set(key, progress, 300); // 5 minutes TTL for progress
  }

  /**
   * Get cached progress
   */
  async getCachedProgress(analysisId: string): Promise<{ stage: string; progress: number } | null> {
    const key = `progress:${analysisId}`;
    return await this.get(key);
  }

  /**
   * Cache batch job status
   */
  async cacheBatchStatus(batchId: string, status: any): Promise<void> {
    const key = `batch:${batchId}`;
    await this.set(key, status, 1800); // 30 minutes TTL
  }

  /**
   * Get cached batch status
   */
  async getCachedBatchStatus(batchId: string): Promise<any | null> {
    const key = `batch:${batchId}`;
    return await this.get(key);
  }

  /**
   * Cache file metadata
   */
  async cacheFileMetadata(filepath: string, metadata: any): Promise<void> {
    const key = `file:${Buffer.from(filepath).toString('base64')}`;
    await this.set(key, metadata, 7200); // 2 hours TTL
  }

  /**
   * Get cached file metadata
   */
  async getCachedFileMetadata(filepath: string): Promise<any | null> {
    const key = `file:${Buffer.from(filepath).toString('base64')}`;
    return await this.get(key);
  }

  /**
   * Cache API rate limiting data
   */
  async incrementRateLimit(identifier: string, windowSeconds: number = 3600): Promise<number> {
    const key = `ratelimit:${identifier}`;
    const count = await this.increment(key);
    
    // Set expiration on first increment
    if (count === 1) {
      await this.expire(key, windowSeconds);
    }
    
    return count;
  }

  /**
   * Get rate limit count
   */
  async getRateLimit(identifier: string): Promise<number> {
    const key = `ratelimit:${identifier}`;
    const value = await this.get(key);
    return value || 0;
  }

  /**
   * Cache popular analyses (for recommendations)
   */
  async cachePopularAnalyses(analyses: any[]): Promise<void> {
    const key = 'popular:analyses';
    await this.set(key, analyses, 3600); // 1 hour TTL
  }

  /**
   * Get popular analyses
   */
  async getPopularAnalyses(): Promise<any[] | null> {
    const key = 'popular:analyses';
    return await this.get(key);
  }

  /**
   * Store session data
   */
  async setSession(sessionId: string, sessionData: any, ttl: number = 86400): Promise<void> {
    const key = `session:${sessionId}`;
    await this.set(key, sessionData, ttl);
  }

  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<any | null> {
    const key = `session:${sessionId}`;
    return await this.get(key);
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const key = `session:${sessionId}`;
    await this.del(key);
  }

  /**
   * Cache computation results (e.g., optimization suggestions)
   */
  async cacheComputation(computationKey: string, result: any, ttl: number = 1800): Promise<void> {
    const key = `computation:${computationKey}`;
    await this.set(key, result, ttl);
  }

  /**
   * Get cached computation
   */
  async getCachedComputation(computationKey: string): Promise<any | null> {
    const key = `computation:${computationKey}`;
    return await this.get(key);
  }

  /**
   * Clear all cache (use with caution)
   */
  async clearAll(): Promise<void> {
    try {
      await this.redis.flushall();
      console.log('Cache cleared successfully');
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    connectedClients: number;
    usedMemory: string;
    totalKeys: number;
    hitRate?: number;
  }> {
    try {
      const info = await this.redis.info();
      const stats = this.parseRedisInfo(info);
      
      const keyCount = await this.redis.dbsize();
      
      return {
        connectedClients: parseInt(stats.connected_clients || '0'),
        usedMemory: stats.used_memory_human || '0B',
        totalKeys: keyCount,
        hitRate: this.calculateHitRate(stats)
      };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return {
        connectedClients: 0,
        usedMemory: '0B',
        totalKeys: 0
      };
    }
  }

  /**
   * Parse Redis INFO output
   */
  private parseRedisInfo(info: string): Record<string, string> {
    const stats: Record<string, string> = {};
    const lines = info.split('\r\n');
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        stats[key] = value;
      }
    }
    
    return stats;
  }

  /**
   * Calculate cache hit rate
   */
  private calculateHitRate(stats: Record<string, string>): number | undefined {
    const hits = parseInt(stats.keyspace_hits || '0');
    const misses = parseInt(stats.keyspace_misses || '0');
    const total = hits + misses;
    
    if (total === 0) {
      return undefined;
    }
    
    return (hits / total) * 100;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

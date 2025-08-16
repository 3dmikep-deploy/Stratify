// api-service/src/services/databaseService.ts
import { Pool, PoolClient } from 'pg';
import { AnalysisResult, BatchAnalysisJob } from '../types/shared';

export class DatabaseService {
  private pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL || 
      'postgresql://analyzer_user:secure_password@localhost:5432/gcode_analyzer';
    
    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    console.log('DatabaseService initialized');
    this.initializeSchema();
  }

  /**
   * Initialize database schema
   */
  private async initializeSchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Create analyses table
      await client.query(`
        CREATE TABLE IF NOT EXISTS analyses (
          id VARCHAR(255) PRIMARY KEY,
          filepath VARCHAR(500) NOT NULL,
          filename VARCHAR(255),
          filesize BIGINT,
          timestamp BIGINT NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'processing',
          metadata JSONB,
          profile JSONB,
          geometry JSONB,
          layers JSONB,
          suggestions JSONB,
          error_message TEXT,
          processing_time INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create batch_jobs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS batch_jobs (
          id VARCHAR(255) PRIMARY KEY,
          files JSONB NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'queued',
          progress INTEGER DEFAULT 0,
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create users table (for future user management)
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) UNIQUE,
          email VARCHAR(255) UNIQUE,
          password_hash VARCHAR(255),
          preferences JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for better performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_analyses_timestamp ON analyses(timestamp DESC)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_jobs(status)
      `);

      console.log('Database schema initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database schema:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Save analysis result to database
   */
  async saveAnalysis(analysisId: string, result: AnalysisResult): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO analyses (
          id, filepath, filename, filesize, timestamp, status, 
          metadata, profile, geometry, layers, suggestions, processing_time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          metadata = EXCLUDED.metadata,
          profile = EXCLUDED.profile,
          geometry = EXCLUDED.geometry,
          layers = EXCLUDED.layers,
          suggestions = EXCLUDED.suggestions,
          processing_time = EXCLUDED.processing_time,
          updated_at = CURRENT_TIMESTAMP`,
        [
          analysisId,
          result.filepath,
          result.filepath.split('/').pop(),
          0, // filesize - would need to get from file
          result.timestamp,
          result.status,
          JSON.stringify(result.metadata),
          JSON.stringify(result.profile),
          JSON.stringify(result.geometry),
          JSON.stringify(result.layers),
          JSON.stringify(result.suggestions),
          0 // processing_time - would calculate from start/end
        ]
      );
    } catch (error) {
      console.error('Failed to save analysis:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get analysis result by ID
   */
  async getAnalysis(analysisId: string): Promise<AnalysisResult | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM analyses WHERE id = $1',
        [analysisId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        filepath: row.filepath,
        timestamp: row.timestamp,
        metadata: row.metadata,
        profile: row.profile,
        geometry: row.geometry,
        layers: row.layers,
        suggestions: row.suggestions,
        status: row.status,
        error: row.error_message
      };
    } catch (error) {
      console.error('Failed to get analysis:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get analysis history with pagination
   */
  async getHistory(options: {
    limit: number;
    offset: number;
    filter?: string;
  }): Promise<{
    analyses: AnalysisResult[];
    total: number;
  }> {
    const client = await this.pool.connect();
    try {
      let whereClause = '';
      let params: any[] = [options.limit, options.offset];

      if (options.filter) {
        whereClause = 'WHERE filename ILIKE $3 OR filepath ILIKE $3';
        params.push(`%${options.filter}%`);
      }

      // Get total count
      const countResult = await client.query(
        `SELECT COUNT(*) FROM analyses ${whereClause}`,
        options.filter ? [options.filter] : []
      );
      const total = parseInt(countResult.rows[0].count);

      // Get analyses
      const result = await client.query(
        `SELECT id, filepath, filename, timestamp, status, metadata, processing_time, created_at
         FROM analyses ${whereClause}
         ORDER BY timestamp DESC
         LIMIT $1 OFFSET $2`,
        params
      );

      const analyses = result.rows.map(row => ({
        id: row.id,
        filepath: row.filepath,
        timestamp: row.timestamp,
        metadata: row.metadata,
        status: row.status,
        profile: null, // Don't load full data for history
        geometry: null,
        layers: [],
        suggestions: []
      }));

      return { analyses, total };
    } catch (error) {
      console.error('Failed to get history:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Save batch job
   */
  async saveBatchJob(batchJob: BatchAnalysisJob): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO batch_jobs (id, files, status, progress, started_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           files = EXCLUDED.files,
           status = EXCLUDED.status,
           progress = EXCLUDED.progress,
           started_at = EXCLUDED.started_at,
           completed_at = EXCLUDED.completed_at,
           updated_at = CURRENT_TIMESTAMP`,
        [
          batchJob.id,
          JSON.stringify(batchJob.files),
          batchJob.status,
          batchJob.progress,
          batchJob.started_at ? new Date(batchJob.started_at) : null,
          batchJob.completed_at ? new Date(batchJob.completed_at) : null
        ]
      );
    } catch (error) {
      console.error('Failed to save batch job:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get batch job by ID
   */
  async getBatchJob(batchId: string): Promise<BatchAnalysisJob | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM batch_jobs WHERE id = $1',
        [batchId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        files: row.files,
        status: row.status,
        progress: row.progress,
        started_at: row.started_at?.getTime(),
        completed_at: row.completed_at?.getTime()
      };
    } catch (error) {
      console.error('Failed to get batch job:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update analysis status
   */
  async updateAnalysisStatus(
    analysisId: string, 
    status: 'processing' | 'complete' | 'error',
    error?: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE analyses 
         SET status = $2, error_message = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [analysisId, status, error || null]
      );
    } catch (error) {
      console.error('Failed to update analysis status:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalAnalyses: number;
    completedAnalyses: number;
    failedAnalyses: number;
    processingAnalyses: number;
    totalBatchJobs: number;
  }> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          COUNT(*) as total_analyses,
          SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as completed_analyses,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failed_analyses,
          SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_analyses
        FROM analyses
      `);

      const batchResult = await client.query(`
        SELECT COUNT(*) as total_batch_jobs FROM batch_jobs
      `);

      const stats = result.rows[0];
      const batchStats = batchResult.rows[0];

      return {
        totalAnalyses: parseInt(stats.total_analyses),
        completedAnalyses: parseInt(stats.completed_analyses),
        failedAnalyses: parseInt(stats.failed_analyses),
        processingAnalyses: parseInt(stats.processing_analyses),
        totalBatchJobs: parseInt(batchStats.total_batch_jobs)
      };
    } catch (error) {
      console.error('Failed to get database stats:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Clean up old analyses (older than specified days)
   */
  async cleanupOldAnalyses(olderThanDays: number = 30): Promise<number> {
    const client = await this.pool.connect();
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      
      const result = await client.query(
        'DELETE FROM analyses WHERE created_at < $1',
        [cutoffDate]
      );

      return result.rowCount || 0;
    } catch (error) {
      console.error('Failed to cleanup old analyses:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close database connections
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    } finally {
      client.release();
    }
  }
}

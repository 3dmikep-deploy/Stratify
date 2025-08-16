// api-service/src/services/analysisService.ts
import { spawn } from 'child_process';
import * as path from 'path';
import { promises as fs } from 'fs';
import { AnalysisResult, OptimizationSuggestion } from '../types/shared';

export interface AnalysisOptions {
  detailed: boolean;
  inferParameters: boolean;
  generateSuggestions: boolean;
  compareWithBaseline?: string;
}

export class AnalysisService {
  private processingJobs = new Map<string, { progress: number; stage: string }>();

  constructor() {
    console.log('AnalysisService initialized');
  }

  /**
   * Analyze a G-code file using the Python parser
   */
  async analyze(
    filepath: string,
    options: AnalysisOptions,
    progressCallback?: (progress: number, stage: string) => void
  ): Promise<AnalysisResult> {
    return new Promise((resolve, reject) => {
      const analysisId = this.generateAnalysisId();
      
      // Track processing job
      this.processingJobs.set(analysisId, { progress: 0, stage: 'starting' });
      
      // Call Python parser
  const pythonPath: string = process.env.PYTHON_PATH || 'python3';
      const scriptPath = path.join(process.cwd(), 'parser-core/python/gcode_analyzer.py');
      
      const args = [
        '-c',
        `
import sys
sys.path.append('${path.dirname(scriptPath)}')
from gcode_analyzer import GCodeAnalyzer
import json

analyzer = GCodeAnalyzer('${filepath}')
geometry = analyzer.analyze_geometry()
profile = analyzer.infer_parameters()
suggestions = analyzer.generate_optimization_suggestions()

result = {
    'id': '${analysisId}',
    'filepath': '${filepath}',
    'timestamp': ${Date.now()},
    'metadata': analyzer.metadata,
    'profile': profile.__dict__ if profile else None,
    'geometry': geometry,
    'layers': [layer.__dict__ for layer in analyzer.layers],
    'suggestions': suggestions,
    'status': 'complete'
}

print(json.dumps(result, default=str))
        `
      ];

  const child = spawn(pythonPath, args);
      let output = '';
      let error = '';

      // Update progress
      let progress = 10;
      const progressInterval = setInterval(() => {
        progress = Math.min(progress + 10, 90);
        this.processingJobs.set(analysisId, { progress, stage: 'analyzing' });
        if (progressCallback) {
          progressCallback(progress, 'analyzing');
        }
      }, 1000);

      child.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        error += data.toString();
        console.error('Python error:', data.toString());
      });

      child.on('close', (code: number) => {
        clearInterval(progressInterval);
        this.processingJobs.delete(analysisId);

        if (code === 0) {
          try {
            const result = JSON.parse(output);
            if (progressCallback) {
              progressCallback(100, 'complete');
            }
            resolve(result);
          } catch (parseError) {
            reject(new Error(`Failed to parse Python output: ${parseError}`));
          }
        } else {
          reject(new Error(`Python analysis failed with code ${code}: ${error}`));
        }
      });
    });
  }

  /**
   * Process a chunk of G-code for streaming analysis
   */
  async processChunk(content: string, chunkIndex: number): Promise<any> {
    // Simple chunk processing - can be enhanced for streaming
    const lines = content.split('\n');
    const commands: any[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith(';')) {
        const match = line.match(/^([GM])(\d+)/);
        if (match) {
          commands.push({
            type: match[1],
            code: parseInt(match[2]),
            line: i + (chunkIndex * 1000), // Offset by chunk
            raw: line
          });
        }
      }
    }

    return {
      chunkIndex,
      commands: commands.length,
      processed: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check if analysis is currently processing
   */
  async isProcessing(analysisId: string): Promise<{ progress: number; stage: string } | null> {
    return this.processingJobs.get(analysisId) || null;
  }

  /**
   * Generate unique analysis ID
   */
  private generateAnalysisId(): string {
    return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate G-code file
   */
  async validateGCodeFile(filepath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filepath);
      if (!stats.isFile()) {
        return false;
      }

      // Check file extension
      const validExtensions = ['.gcode', '.gco', '.g', '.nc'];
      const ext = path.extname(filepath).toLowerCase();
      if (!validExtensions.includes(ext)) {
        return false;
      }

      // Check file size (max 500MB)
      if (stats.size > 500 * 1024 * 1024) {
        return false;
      }

      // Basic content validation - check for G-code commands
      const content = await fs.readFile(filepath, 'utf-8');
      const lines = content.split('\n').slice(0, 100); // Check first 100 lines
      const hasGCode = lines.some(line => 
        /^[GM]\d+/.test(line.trim())
      );

      return hasGCode;
    } catch (error) {
      console.error('File validation error:', error);
      return false;
    }
  }

  /**
   * Get analysis statistics
   */
  async getAnalysisStats(): Promise<{
    totalAnalyses: number;
    currentlyProcessing: number;
    avgProcessingTime: number;
  }> {
    return {
      totalAnalyses: 0, // Would come from database
      currentlyProcessing: this.processingJobs.size,
      avgProcessingTime: 30 // seconds, would be calculated from historical data
    };
  }
}

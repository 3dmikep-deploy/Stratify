// api-service/src/server.ts
import express, { Express, Request, Response, RequestHandler } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { AnalysisService } from './analysisService';
import { DatabaseService } from './databaseService';
import { CacheService } from './cacheService';
import { ComparisonService } from './comparisonService';
import { OptimizationService } from './optimizationService';

// Type definitions
interface AnalysisRequest {
  filepath?: string;
  content?: string;
  options: {
    detailed: boolean;
    inferParameters: boolean;
    generateSuggestions: boolean;
    compareWithBaseline?: string;
  };
}

interface ComparisonRequest {
  files: string[];
  metrics: string[];
  outputFormat: 'json' | 'html' | 'pdf';
}

interface OptimizationProfile {
  priority: 'speed' | 'quality' | 'material';
  constraints: {
    maxPrintTime?: number;
    minQuality?: number;
    maxMaterial?: number;
  };
}

class GCodeAnalyzerAPI {
  private app: Express;
  private httpServer: any;
  private io: SocketIOServer;
  private analysisService: AnalysisService;
  private databaseService: DatabaseService;
  private cacheService: CacheService;
  private comparisonService: ComparisonService;
  private optimizationService: OptimizationService;
  
  // File upload configuration
  private upload = multer({
    dest: 'uploads/',
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB max
    },
    fileFilter: (req, file, cb) => {
      const allowedExtensions = ['.gcode', '.gco', '.g', '.nc'];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowedExtensions.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only G-code files are allowed.'));
      }
    }
  });
  
  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST']
      }
    });
    
    // Initialize services
    this.analysisService = new AnalysisService();
    this.databaseService = new DatabaseService();
    this.cacheService = new CacheService();
    this.comparisonService = new ComparisonService();
    this.optimizationService = new OptimizationService();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }
  
  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
    
    // Error handling
    this.app.use((err: any, req: Request, res: Response, next: any) => {
      console.error('Error:', err);
      res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        timestamp: new Date().toISOString()
      });
    });
  }
  
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });
    
    // File upload and analysis
    // Multer/Express type mismatch workaround: cast to RequestHandler
    const uploadSingle: RequestHandler = this.upload.single('gcode') as unknown as RequestHandler;
    this.app.post('/api/analyze/upload', 
      uploadSingle,
      async (req: Request, res: Response) => {
        try {
          if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
          }
          
          const analysisId = this.generateAnalysisId();
          const filepath = req.file.path;
          
          // Start async analysis
          this.startAsyncAnalysis(analysisId, filepath, req.body.options);
          
          res.json({
            analysisId,
            status: 'processing',
            message: 'Analysis started. Connect via WebSocket for real-time updates.',
            websocketUrl: `/ws/analysis/${analysisId}`
          });
        } catch (error: any) {
          res.status(500).json({ error: error.message });
        }
      }
    );
    
    // Direct G-code analysis (text input)
    this.app.post('/api/analyze/text', async (req: Request, res: Response) => {
      try {
        const { content, options } = req.body as AnalysisRequest;
        
        if (!content) {
          return res.status(400).json({ error: 'No G-code content provided' });
        }
        
        const analysisId = this.generateAnalysisId();
        
        // Save content to temp file
        const tempPath = path.join('uploads', `temp_${analysisId}.gcode`);
        await fs.writeFile(tempPath, content);
        
        // Start analysis
        this.startAsyncAnalysis(analysisId, tempPath, options);
        
        res.json({
          analysisId,
          status: 'processing',
          websocketUrl: `/ws/analysis/${analysisId}`
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Get analysis results
    this.app.get('/api/analysis/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        
        // Check cache first
        const cached = await this.cacheService.get(id);
        if (cached) {
          return res.json(cached);
        }
        
        // Get from database
        const result = await this.databaseService.getAnalysis(id);
        if (!result) {
          return res.status(404).json({ error: 'Analysis not found' });
        }
        
        // Cache for future requests
        await this.cacheService.set(id, result, 3600); // 1 hour TTL
        
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Compare multiple G-code files
    this.app.post('/api/compare', async (req: Request, res: Response) => {
      try {
        const { files, metrics, outputFormat } = req.body as ComparisonRequest;
        
        if (!files || files.length < 2) {
          return res.status(400).json({ 
            error: 'At least 2 files required for comparison' 
          });
        }
        
        const comparison = await this.comparisonService.compare(
          files, 
          metrics,
          outputFormat
        );
        
        res.json(comparison);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Generate optimization suggestions
    this.app.post('/api/optimize', async (req: Request, res: Response) => {
      try {
        const { analysisId, profile } = req.body as {
          analysisId: string;
          profile: OptimizationProfile;
        };
        
        const analysis = await this.databaseService.getAnalysis(analysisId);
        if (!analysis) {
          return res.status(404).json({ error: 'Analysis not found' });
        }
        
        const optimizations = await this.optimizationService.generateOptimizations(
          analysis,
          profile
        );
        
        res.json(optimizations);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Batch analysis
    const uploadArray: RequestHandler = this.upload.array('files', 20) as unknown as RequestHandler;
    this.app.post('/api/batch', 
      uploadArray,
      async (req: Request, res: Response) => {
        try {
          const files = req.files as Express.Multer.File[];
          if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
          }
          
          const batchId = this.generateBatchId();
          const analyses = [];
          
          for (const file of files) {
            const analysisId = this.generateAnalysisId();
            analyses.push({
              id: analysisId,
              filename: file.originalname,
              status: 'queued'
            });
            
            // Queue analysis
            this.startAsyncAnalysis(analysisId, file.path, req.body.options);
          }
          
          res.json({
            batchId,
            analyses,
            websocketUrl: `/ws/batch/${batchId}`
          });
        } catch (error: any) {
          res.status(500).json({ error: error.message });
        }
      }
    );
    
    // Get analysis history
    this.app.get('/api/history', async (req: Request, res: Response) => {
      try {
        const { limit = 50, offset = 0, filter } = req.query;
        
        const history = await this.databaseService.getHistory({
          limit: Number(limit),
          offset: Number(offset),
          filter: filter as string
        });
        
        res.json(history);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Export analysis results
    this.app.get('/api/export/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { format = 'json' } = req.query;
        
        const analysis = await this.databaseService.getAnalysis(id);
        if (!analysis) {
          return res.status(404).json({ error: 'Analysis not found' });
        }
        
        switch (format) {
          case 'json':
            res.json(analysis);
            break;
          case 'csv':
            const csv = await this.exportToCSV(analysis);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="analysis_${id}.csv"`);
            res.send(csv);
            break;
          case 'pdf':
            const pdf = await this.exportToPDF(analysis);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="analysis_${id}.pdf"`);
            res.send(pdf);
            break;
          default:
            res.status(400).json({ error: 'Invalid export format' });
        }
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Static file serving for uploaded G-codes
    this.app.use('/uploads', express.static('uploads'));
  }
  
  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);
      
      // Join analysis room for real-time updates
      socket.on('join-analysis', (analysisId: string) => {
        socket.join(`analysis-${analysisId}`);
        console.log(`Socket ${socket.id} joined analysis-${analysisId}`);
      });
      
      // Join batch room
      socket.on('join-batch', (batchId: string) => {
        socket.join(`batch-${batchId}`);
        console.log(`Socket ${socket.id} joined batch-${batchId}`);
      });
      
      // Request analysis update
      socket.on('request-update', async (analysisId: string) => {
        const status = await this.getAnalysisStatus(analysisId);
        socket.emit('analysis-update', status);
      });
      
      // Live G-code streaming analysis
      socket.on('stream-gcode', async (data: { content: string, chunkIndex: number }) => {
        // Process streaming G-code chunks
        const result = await this.analysisService.processChunk(data.content, data.chunkIndex);
        socket.emit('chunk-processed', result);
      });
      
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  }
  
  private async startAsyncAnalysis(
    analysisId: string, 
    filepath: string, 
    options: any
  ): Promise<void> {
    // Run analysis in background
    setImmediate(async () => {
      try {
        // Send progress updates via WebSocket
        const progressCallback = (progress: number, stage: string) => {
          this.io.to(`analysis-${analysisId}`).emit('progress', {
            analysisId,
            progress,
            stage,
            timestamp: new Date().toISOString()
          });
        };
        
        // Perform analysis
        const result = await this.analysisService.analyze(
          filepath,
          options,
          progressCallback
        );
        
        // Save to database
        await this.databaseService.saveAnalysis(analysisId, result);
        
        // Cache result
        await this.cacheService.set(analysisId, result, 3600);
        
        // Notify completion
        this.io.to(`analysis-${analysisId}`).emit('complete', {
          analysisId,
          result,
          timestamp: new Date().toISOString()
        });
        
        // Cleanup temp file
        await fs.unlink(filepath).catch(() => {});
      } catch (error: any) {
        // Notify error
        this.io.to(`analysis-${analysisId}`).emit('error', {
          analysisId,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  }
  
  private async getAnalysisStatus(analysisId: string): Promise<any> {
    // Check if analysis is complete
    const result = await this.databaseService.getAnalysis(analysisId);
    if (result) {
      return { status: 'complete', result };
    }
    
    // Check if still processing
    const isProcessing = await this.analysisService.isProcessing(analysisId);
    if (isProcessing) {
      return { status: 'processing', progress: isProcessing.progress };
    }
    
    return { status: 'not_found' };
  }
  
  private generateAnalysisId(): string {
    return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private async exportToCSV(analysis: any): Promise<string> {
    // CSV export implementation
    const headers = ['Layer', 'Z Height', 'Commands', 'Extrusion', 'Travel', 'Time'];
    const rows = analysis.layers.map((layer: any) => [
      layer.index,
      layer.z,
      layer.commands,
      layer.extrusionMoves,
      layer.travelMoves,
      layer.printTime
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
  
  private async exportToPDF(analysis: any): Promise<Buffer> {
    // PDF export implementation (would use a library like pdfkit)
    return Buffer.from('PDF content here');
  }
  
  public start(port: number = 3001): void {
    this.httpServer.listen(port, () => {
      console.log(`G-code Analyzer API running on port ${port}`);
      console.log(`WebSocket server ready for connections`);
      console.log(`Health check: http://localhost:${port}/health`);
    });
  }
}

// Start the server
const api = new GCodeAnalyzerAPI();
api.start(Number(process.env.PORT) || 3001);

export default api;
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { createServer } = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:8080"],
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;
const PARSER_SERVICE_URL = process.env.PARSER_SERVICE_URL || 'http://parser-service:5000';

// Configure multer for file uploads
const upload = multer({
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

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'gcode-analyzer-api',
    version: '1.0.0'
  });
});

// Also provide health check at /api/health for consistency
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'gcode-analyzer-api',
    version: '1.0.0'
  });
});

// Basic API endpoints for testing
app.get('/api/files', (req, res) => {
  res.json({ files: [], message: 'File listing endpoint - ready for implementation' });
});

// File upload and analysis endpoint
app.post('/api/analyze/upload', upload.single('gcode'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const filepath = req.file.path;
    
    console.log(`📁 File uploaded: ${req.file.originalname} (${req.file.size} bytes)`);
    console.log(`🔍 Starting analysis: ${analysisId}`);
    
    // Send immediate response with analysisId so client can join WebSocket room
    res.json({
      analysisId,
      filename: req.file.originalname,
      fileSize: req.file.size,
      status: 'started',
      timestamp: new Date().toISOString(),
      message: 'Analysis started, connect to WebSocket for progress updates'
    });
    
    // Give client time to connect WebSocket and join room before starting analysis
    setTimeout(async () => {
      try {
        // Emit initial progress
        emitProgress(analysisId, { progress: 5, stage: 'File uploaded, starting analysis...' });
        
        // Forward file to Python parser service
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filepath), {
          filename: req.file.originalname,
          contentType: req.file.mimetype || 'text/plain'
        });
        
        emitProgress(analysisId, { progress: 15, stage: 'Sending to analysis engine...' });
        
        // Make request to Python parser service
        const parserResponse = await axios.post(`${PARSER_SERVICE_URL}/parse`, formData, {
          headers: {
            ...formData.getHeaders(),
            'Content-Type': `multipart/form-data; boundary=${formData._boundary}`
          },
          timeout: 120000, // 2 minutes timeout for large files
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        });
        
        emitProgress(analysisId, { progress: 50, stage: 'Processing analysis results...' });
        
        const parserData = parserResponse.data;
        
        // Format response for frontend
        const analysisResult = {
          analysisId,
          filename: req.file.originalname,
          fileSize: req.file.size,
          status: 'complete',
          timestamp: new Date().toISOString(),
          analysis: {
            // Core metrics from parser
            totalCommands: parserData.summary?.total_commands || 0,
            layerCount: parserData.summary?.total_layers || 0,
            estimatedPrintTime: parserData.summary?.estimated_print_time || 0,
            totalFilamentUsed: parserData.summary?.total_filament_used || 0,
            estimatedWeight: parserData.summary?.estimated_weight_grams || 0,
            
            // Detailed metadata from parser
            metadata: {
              slicer: parserData.profile?.slicer_name || 'Unknown',
              slicerVersion: parserData.profile?.version || 'Unknown',
              layerHeight: parserData.profile?.layer_height || 0.2,
              nozzleTemperature: parserData.profile?.temperature_nozzle || 200,
              bedTemperature: parserData.profile?.temperature_bed || 60,
              printSpeed: parserData.profile?.print_speed || 50,
              travelSpeed: parserData.profile?.travel_speed || 120,
              infillDensity: parserData.profile?.infill_density || 20,
              infillPattern: parserData.profile?.infill_pattern || 'rectilinear',
              nozzleDiameter: parserData.profile?.nozzle_diameter || 0.4,
              supportEnabled: parserData.profile?.support_enabled || false,
              wallCount: parserData.profile?.wall_count || 2,
              topLayers: parserData.profile?.top_layers || 3,
              bottomLayers: parserData.profile?.bottom_layers || 3
            },
            
            // Geometry analysis
            boundingBox: parserData.summary?.bounding_box || {},
            
            // Layer analysis (first 20 layers for display)
            layers: (parserData.layers || []).slice(0, 20).map((layer, index) => ({
              index: index + 1,
              z: layer.z_height,
              thickness: layer.thickness,
              commands: layer.extrusion_moves + layer.travel_moves,
              extrusionMoves: layer.extrusion_moves,
              travelMoves: layer.travel_moves,
              printTime: layer.print_time,
              extrusionDistance: layer.extrusion_distance,
              travelDistance: layer.travel_distance
            })),
            
            // Optimization suggestions from parser
            suggestions: (parserData.optimization_suggestions || []).map(suggestion => ({
              title: suggestion.title,
              description: suggestion.description,
              category: suggestion.category,
              priority: suggestion.impact?.toLowerCase() || 'medium',
              potentialSavings: {
                time: suggestion.time_saving ? parseFloat(suggestion.time_saving.replace('%', '').replace('~', '')) : 0,
                material: suggestion.material_saving ? parseFloat(suggestion.material_saving.replace('%', '').replace('~', '')) : 0
              }
            }))
          },
          
          // Raw parser data for advanced features
          rawAnalysis: parserData
        };
        
        emitProgress(analysisId, { progress: 85, stage: 'Finalizing results...' });
        
        // Store analysis result in memory (in production, use database)
        global.analysisCache = global.analysisCache || {};
        global.analysisCache[analysisId] = analysisResult;
        
        emitProgress(analysisId, { progress: 100, stage: 'Analysis complete!' });
        
        // Emit completion event
        setTimeout(() => {
          console.log(`✅ Analysis complete for ${analysisId}`);
          io.to(`analysis_${analysisId}`).emit('complete', {
            type: 'complete',
            analysisId,
            result: analysisResult
          });
        }, 200);
        
      } catch (parserError) {
        console.error('❌ Parser service error:', parserError.message);
        console.error('❌ Parser error details:', parserError.response?.data || 'No response data');
        
        // Emit error to WebSocket clients
        io.to(`analysis_${analysisId}`).emit('error', {
          type: 'error',
          analysisId,
          message: `Analysis failed: ${parserError.message}`
        });
      } finally {
        // Clean up uploaded file
        await fsPromises.unlink(filepath).catch(() => {});
      }
    }, 1000); // Wait 1 second for client to connect and subscribe
    
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'File upload or processing failed'
    });
    
    // Clean up uploaded file
    if (req.file && req.file.path) {
      await fsPromises.unlink(req.file.path).catch(() => {});
    }
  }
});

// Text analysis endpoint
app.post('/api/analyze/text', async (req, res) => {
  try {
    const { content, options } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'No G-code content provided' });
    }
    
    const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`📝 Analyzing text content (${content.length} characters)`);
    
    // Emit initial progress
    emitProgress(analysisId, { progress: 10, stage: 'Processing text content...' });
    
    try {
      // Forward to Python parser service
      const parserResponse = await axios.post(`${PARSER_SERVICE_URL}/analyze`, {
        content: content,
        options: options || {}
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000 // 1 minute timeout
      });
      
      emitProgress(analysisId, { progress: 75, stage: 'Finalizing analysis...' });
      
      const parserData = parserResponse.data;
      
      // Format response for frontend
      const analysisResult = {
        analysisId,
        status: 'complete',
        timestamp: new Date().toISOString(),
        score: parserData.score || 85,
        analysis: {
          suggestions: parserData.suggestions || [],
          profile: parserData.profile || {},
          summary: parserData.summary || {},
          totalCommands: parserData.summary?.total_commands || 0,
          layerCount: parserData.summary?.total_layers || 0,
          estimatedPrintTime: parserData.summary?.estimated_print_time || 0,
          totalFilamentUsed: parserData.summary?.total_filament_used || 0
        },
        rawAnalysis: parserData
      };
      
      emitProgress(analysisId, { progress: 100, stage: 'Text analysis complete!' });
      
      // Emit completion
      setTimeout(() => {
        io.to(`analysis_${analysisId}`).emit('complete', {
          type: 'complete',
          analysisId,
          result: analysisResult
        });
      }, 200);
      
      res.json(analysisResult);
      
    } catch (parserError) {
      console.error('❌ Parser service error (text):', parserError.message);
      
      io.to(`analysis_${analysisId}`).emit('error', {
        type: 'error',
        analysisId,
        message: `Text analysis failed: ${parserError.message}`
      });
      
      return res.status(500).json({ 
        error: 'Text analysis service unavailable',
        details: parserError.response?.data?.error || parserError.message,
        analysisId
      });
    }
    
  } catch (error) {
    console.error('❌ Text analysis error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Text analysis failed'
    });
  }
});

app.post('/api/upload', (req, res) => {
  res.json({ message: 'Upload endpoint - ready for implementation' });
});

app.get('/api/analysis/:id', (req, res) => {
  const { id } = req.params;
  
  // Check in-memory cache (in production, use database)
  const analysisResult = global.analysisCache?.[id];
  
  if (analysisResult) {
    res.json(analysisResult);
  } else {
    res.status(404).json({ 
      error: 'Analysis not found',
      id,
      message: 'Analysis may have expired or never existed'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  
  socket.on('subscribe', (data) => {
    if (data.analysisId) {
      socket.join(`analysis_${data.analysisId}`);
      console.log(`📡 Client ${socket.id} subscribed to analysis ${data.analysisId}`);
      
      // Send immediate confirmation that subscription worked
      socket.emit('subscribed', {
        type: 'subscribed',
        analysisId: data.analysisId,
        message: 'Ready to receive updates'
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Helper function to emit progress updates
const emitProgress = (analysisId, progress) => {
  console.log(`📊 Emitting progress for ${analysisId}:`, progress.stage, `${progress.progress}%`);
  io.to(`analysis_${analysisId}`).emit('progress', {
    type: 'progress',
    analysisId,
    ...progress
  });
};

// Start server and keep reference for graceful shutdown
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 G-code Analyzer API Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 WebSocket server running on port ${PORT}`);
  console.log(`🎯 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`${signal} signal received: closing HTTP server`);
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
  // Force shutdown if not closed in time
  setTimeout(() => {
    console.error('Force shutting down server');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

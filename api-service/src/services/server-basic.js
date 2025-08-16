const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3001;

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
    
    // Read file content for basic info
    const content = await fs.readFile(filepath, 'utf8');
    const lines = content.split('\n');
    
    // Mock analysis result
    const mockResult = {
      analysisId,
      filename: req.file.originalname,
      fileSize: req.file.size,
      status: 'complete',
      analysis: {
        totalCommands: lines.length,
        layerCount: lines.filter(line => line.includes('Z')).length,
        estimatedPrintTime: Math.floor(lines.length / 10), // seconds
        totalFilamentUsed: Math.floor(lines.length * 0.01), // grams
        metadata: {
          slicer: 'Unknown',
          layerHeight: '0.2',
          nozzleTemperature: '200',
          bedTemperature: '60',
          printSpeed: '50',
          infillDensity: '20'
        },
        layers: lines.slice(0, 20).map((line, index) => ({
          index: index + 1,
          z: (index * 0.2).toFixed(2),
          commands: 1,
          extrusionMoves: line.includes('E') ? 1 : 0,
          printTime: 1
        })),
        suggestions: [
          {
            title: 'Speed Optimization',
            description: 'Consider increasing print speed for non-critical layers to reduce print time.',
            priority: 'medium',
            potentialSavings: {
              time: Math.floor(lines.length / 20),
              material: 0
            }
          }
        ]
      }
    };
    
    // Clean up uploaded file
    await fs.unlink(filepath).catch(() => {});
    
    res.json(mockResult);
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
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
    
    // Mock analysis for text content
    const lines = content.split('\n');
    const mockResult = {
      analysisId,
      status: 'complete',
      analysis: {
        totalCommands: lines.length,
        layerCount: lines.filter(line => line.includes('Z')).length,
        estimatedPrintTime: Math.floor(lines.length / 10),
        totalFilamentUsed: Math.floor(lines.length * 0.01)
      }
    };
    
    res.json(mockResult);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload', (req, res) => {
  res.json({ message: 'Upload endpoint - ready for implementation' });
});

app.get('/api/analysis/:id', (req, res) => {
  const { id } = req.params;
  res.json({ 
    id,
    status: 'pending',
    message: 'Analysis endpoint - ready for implementation' 
  });
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

// Start server and keep reference for graceful shutdown
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 G-code Analyzer API Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
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

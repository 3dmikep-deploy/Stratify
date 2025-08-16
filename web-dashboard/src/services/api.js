/**
 * API Service for G-Code Analyzer Frontend
 * Handles all communication with the backend API and Socket.IO connections
 */
import { io } from 'socket.io-client';

// Determine API base URL based on how the site is accessed
const API_BASE_URL = window.location.port === '3000' 
  ? 'http://localhost:3001/api'  // Direct access to web dashboard
  : '/api';                       // Proxied access through Nginx

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.socket = null;
  }

  /**
   * Generic request method with error handling
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ 
          error: `HTTP ${response.status}: ${response.statusText}` 
        }));
        throw new Error(error.error || `Request failed: ${response.status}`);
      }

      const contentType = response.headers.get('Content-Type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      return await response.text();
    } catch (error) {
      console.error('API Request failed:', error);
      throw error;
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck() {
    return this.request('/health', { method: 'GET' });
  }

  /**
   * Upload and analyze G-code file
   */
  async uploadFile(file, options = {}) {
    const formData = new FormData();
    formData.append('gcode', file);
    formData.append('options', JSON.stringify({
      detailed: true,
      inferParameters: true,
      generateSuggestions: true,
      ...options
    }));

    return this.request('/analyze/upload', {
      method: 'POST',
      body: formData,
      headers: {} // Don't set Content-Type, let browser set it for FormData
    });
  }

  /**
   * Analyze G-code from text content
   */
  async analyzeText(content, options = {}) {
    return this.request('/analyze/text', {
      method: 'POST',
      body: JSON.stringify({
        content,
        options: {
          detailed: true,
          inferParameters: true,
          generateSuggestions: true,
          ...options
        }
      })
    });
  }

  /**
   * Get analysis results by ID
   */
  async getAnalysis(analysisId) {
    return this.request(`/analysis/${analysisId}`, { method: 'GET' });
  }

  /**
   * Compare multiple G-code files
   */
  async compareFiles(files, metrics = ['printTime', 'material', 'quality']) {
    return this.request('/compare', {
      method: 'POST',
      body: JSON.stringify({
        files,
        metrics,
        outputFormat: 'json'
      })
    });
  }

  /**
   * Get optimization suggestions
   */
  async getOptimizations(analysisId, profile = { priority: 'balanced' }) {
    return this.request('/optimize', {
      method: 'POST',
      body: JSON.stringify({
        analysisId,
        profile
      })
    });
  }

  /**
   * Batch upload multiple files
   */
  async batchUpload(files, options = {}) {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('options', JSON.stringify(options));

    return this.request('/batch', {
      method: 'POST',
      body: formData,
      headers: {} // Don't set Content-Type for FormData
    });
  }

  /**
   * Get analysis history
   */
  async getHistory(limit = 50, offset = 0, filter = '') {
    const params = new URLSearchParams({ limit, offset, filter });
    return this.request(`/history?${params}`, { method: 'GET' });
  }

  /**
   * Export analysis results
   */
  async exportAnalysis(analysisId, format = 'json') {
    const params = new URLSearchParams({ format });
    return this.request(`/export/${analysisId}?${params}`, { method: 'GET' });
  }

  /**
   * Connect to Socket.IO for real-time updates
   */
  connectWebSocket(callbacks = {}) {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    // Determine Socket.IO server URL
    const socketUrl = window.location.port === '3000' 
      ? 'http://localhost:3001'  // Direct access during development
      : window.location.origin;  // Proxied access through Nginx

    console.log('Connecting to Socket.IO:', socketUrl);
    
    try {
      this.socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        timeout: 5000
      });

      this.socket.on('connect', () => {
        console.log('Socket.IO connected');
        if (callbacks.onConnect) callbacks.onConnect();
      });

      this.socket.on('subscribed', (data) => {
        console.log('Subscription confirmed:', data);
        if (callbacks.onSubscribed) callbacks.onSubscribed(data);
      });

      this.socket.on('progress', (data) => {
        console.log('Analysis progress:', data);
        if (callbacks.onProgress) callbacks.onProgress(data);
      });

      this.socket.on('complete', (data) => {
        console.log('Analysis complete:', data);
        if (callbacks.onComplete) callbacks.onComplete(data);
      });

      this.socket.on('error', (error) => {
        console.error('Socket.IO error:', error);
        if (callbacks.onError) callbacks.onError(error);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('Socket.IO disconnected:', reason);
        if (callbacks.onDisconnect) callbacks.onDisconnect(reason);
      });

      this.socket.on('connect_error', (error) => {
        console.error('Socket.IO connection error:', error);
        if (callbacks.onError) callbacks.onError(error);
      });

    } catch (error) {
      console.error('Failed to create Socket.IO connection:', error);
      if (callbacks.onError) callbacks.onError(error);
    }

    return this.socket;
  }

  /**
   * Join analysis room for real-time updates
   */
  joinAnalysis(analysisId) {
    if (this.socket && this.socket.connected) {
      console.log('Joining analysis room:', analysisId);
      this.socket.emit('subscribe', { analysisId });
      return true;
    } else {
      console.warn('Socket not connected, cannot join analysis room');
      return false;
    }
  }

  /**
   * Join batch room for updates
   */
  joinBatch(batchId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('subscribe', { batchId });
    }
  }

  /**
   * Request analysis status update
   */
  requestUpdate(analysisId) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'request-update',
        analysisId
      }));
    }
  }

  /**
   * Stream G-code content for real-time analysis
   */
  streamGCode(content, chunkIndex = 0) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'stream-gcode',
        content,
        chunkIndex
      }));
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  /**
   * Utility method to format file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Utility method to format duration
   */
  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${Math.floor(secs)}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${Math.floor(secs)}s`;
    } else {
      return `${Math.floor(secs)}s`;
    }
  }
}

// Create singleton instance
const apiService = new ApiService();

export default apiService;

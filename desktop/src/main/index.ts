// desktop/src/main/index.ts
import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn, ChildProcess } from 'child_process';
import { DatabaseManager } from './services/database';
import { FileWatcher } from './services/fileWatcher';
import { AnalysisQueue } from './services/analysisQueue';

interface ParseResult {
  metadata: Record<string, any>;
  geometry: GeometryAnalysis;
  profile: SlicerProfile;
  layers: LayerData[];
  suggestions: OptimizationSuggestion[];
}

interface GeometryAnalysis {
  boundingBox: BoundingBox;
  layerCount: number;
  totalVolume: number;
  printTime: number;
  filamentUsed: number;
}

interface SlicerProfile {
  slicerName: string;
  version: string;
  layerHeight: number;
  nozzleDiameter: number;
  printSpeed: number;
  infillDensity: number;
  supportEnabled: boolean;
}

interface LayerData {
  index: number;
  z: number;
  thickness: number;
  extrusionMoves: number;
  travelMoves: number;
  printTime: number;
}

interface OptimizationSuggestion {
  category: string;
  title: string;
  description: string;
  impact: 'High' | 'Medium' | 'Low';
  savings?: {
    time?: string;
    material?: string;
  };
}

class GCodeAnalyzerApp {
  private mainWindow: BrowserWindow | null = null;
  private pythonProcess: ChildProcess | null = null;
  private database: DatabaseManager;
  private fileWatcher: FileWatcher;
  private analysisQueue: AnalysisQueue;
  private recentFiles: string[] = [];
  
  constructor() {
    this.database = new DatabaseManager();
    this.fileWatcher = new FileWatcher();
    this.analysisQueue = new AnalysisQueue();
    
    this.setupIPCHandlers();
    this.setupAppEvents();
  }
  
  async createWindow(): Promise<void> {
    this.mainWindow = new BrowserWindow({
      width: 1600,
      height: 900,
      minWidth: 1200,
      minHeight: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload/index.js')
      },
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#1e1e1e',
      icon: path.join(__dirname, '../../assets/icon.png')
    });
    
    // Create application menu
    this.createApplicationMenu();
    
    // Load the renderer
    if (process.env.NODE_ENV === 'development') {
      await this.mainWindow.loadURL('http://localhost:3000');
      this.mainWindow.webContents.openDevTools();
    } else {
      await this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }
    
    // Initialize services
    await this.initializeServices();
  }
  
  private async initializeServices(): Promise<void> {
    // Start Python parser service
    await this.startPythonParser();
    
    // Initialize database
    await this.database.initialize();
    
    // Load recent files
    this.recentFiles = await this.database.getRecentFiles(10);
    
    // Start file watcher for auto-reload
    this.fileWatcher.on('change', (filepath) => {
      this.mainWindow?.webContents.send('file-changed', filepath);
    });
  }
  
  private async startPythonParser(): Promise<void> {
    const pythonPath = process.env.PYTHON_PATH || 'python3';
    const scriptPath = path.join(__dirname, '../../../parser-core/python/parser_service.py');
    
    this.pythonProcess = spawn(pythonPath, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    this.pythonProcess.stdout?.on('data', (data) => {
      console.log(`Parser: ${data}`);
    });
    
    this.pythonProcess.stderr?.on('data', (data) => {
      console.error(`Parser error: ${data}`);
    });
    
    // Wait for parser to be ready
    return new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  }
  
  private setupIPCHandlers(): void {
    // File operations
    ipcMain.handle('open-file', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'G-code Files', extensions: ['gcode', 'gco', 'g'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (!result.canceled && result.filePaths[0]) {
        const filepath = result.filePaths[0];
        await this.analyzeFile(filepath);
        return filepath;
      }
      return null;
    });
    
    ipcMain.handle('analyze-file', async (event, filepath: string) => {
      return await this.analyzeFile(filepath);
    });
    
    ipcMain.handle('get-recent-files', async () => {
      return this.recentFiles;
    });
    
    ipcMain.handle('save-analysis', async (event, analysis: ParseResult) => {
      return await this.database.saveAnalysis(analysis);
    });
    
    ipcMain.handle('get-analysis-history', async () => {
      return await this.database.getAnalysisHistory();
    });
    
    // Real-time analysis updates
    ipcMain.on('watch-file', (event, filepath: string) => {
      this.fileWatcher.watch(filepath);
    });
    
    ipcMain.on('unwatch-file', (event, filepath: string) => {
      this.fileWatcher.unwatch(filepath);
    });
    
    // Export operations
    ipcMain.handle('export-analysis', async (event, format: string, data: any) => {
      const result = await dialog.showSaveDialog({
        filters: this.getExportFilters(format)
      });
      
      if (!result.canceled && result.filePath) {
        await this.exportAnalysis(result.filePath, format, data);
        return result.filePath;
      }
      return null;
    });
    
    // Batch processing
    ipcMain.handle('batch-analyze', async (event, filepaths: string[]) => {
      const results = [];
      for (const filepath of filepaths) {
        this.analysisQueue.add(filepath);
      }
      
      return await this.analysisQueue.processAll();
    });
  }
  
  private async analyzeFile(filepath: string): Promise<ParseResult> {
    // Update recent files
    this.addToRecentFiles(filepath);
    
    // Send to Python parser
    const analysisResult = await this.callPythonParser(filepath);
    
    // Save to database
    await this.database.saveAnalysis({
      ...analysisResult,
      filepath,
      timestamp: Date.now()
    });
    
    // Send real-time updates to renderer
    this.mainWindow?.webContents.send('analysis-progress', {
      stage: 'complete',
      progress: 100,
      data: analysisResult
    });
    
    return analysisResult;
  }
  
  private async callPythonParser(filepath: string): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
      const pythonPath = process.env.PYTHON_PATH || 'python3';
      const scriptPath = path.join(__dirname, '../../../parser-core/python/analyze_gcode.py');
      
      const process = spawn(pythonPath, [scriptPath, filepath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let output = '';
      let error = '';
      
      process.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        error += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(output);
            resolve(result);
          } catch (e) {
            reject(new Error(`Failed to parse output: ${e}`));
          }
        } else {
          reject(new Error(`Parser failed: ${error}`));
        }
      });
    });
  }
  
  private addToRecentFiles(filepath: string): void {
    // Remove if already exists
    this.recentFiles = this.recentFiles.filter(f => f !== filepath);
    
    // Add to beginning
    this.recentFiles.unshift(filepath);
    
    // Keep only last 10
    this.recentFiles = this.recentFiles.slice(0, 10);
    
    // Update database
    this.database.updateRecentFiles(this.recentFiles);
  }
  
  private createApplicationMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'File',
        submenu: [
          {
            label: 'Open G-code...',
            accelerator: 'CmdOrCtrl+O',
            click: () => {
              this.mainWindow?.webContents.send('menu-action', 'open-file');
            }
          },
          {
            label: 'Open Recent',
            submenu: this.recentFiles.map(filepath => ({
              label: path.basename(filepath),
              click: () => {
                this.analyzeFile(filepath);
              }
            }))
          },
          { type: 'separator' },
          {
            label: 'Export Analysis...',
            accelerator: 'CmdOrCtrl+E',
            click: () => {
              this.mainWindow?.webContents.send('menu-action', 'export');
            }
          },
          { type: 'separator' },
          {
            label: 'Preferences...',
            accelerator: 'CmdOrCtrl+,',
            click: () => {
              this.mainWindow?.webContents.send('menu-action', 'preferences');
            }
          }
        ]
      },
      {
        label: 'Analysis',
        submenu: [
          {
            label: 'Re-analyze Current',
            accelerator: 'CmdOrCtrl+R',
            click: () => {
              this.mainWindow?.webContents.send('menu-action', 'reanalyze');
            }
          },
          {
            label: 'Batch Analysis...',
            click: () => {
              this.mainWindow?.webContents.send('menu-action', 'batch-analyze');
            }
          },
          { type: 'separator' },
          {
            label: 'Compare Files...',
            click: () => {
              this.mainWindow?.webContents.send('menu-action', 'compare');
            }
          }
        ]
      },
      {
        label: 'View',
        submenu: [
          {
            label: '3D Visualization',
            accelerator: 'CmdOrCtrl+3',
            type: 'checkbox',
            checked: true,
            click: () => {
              this.mainWindow?.webContents.send('menu-action', 'toggle-3d');
            }
          },
          {
            label: 'Layer View',
            accelerator: 'CmdOrCtrl+L',
            type: 'checkbox',
            checked: true,
            click: () => {
              this.mainWindow?.webContents.send('menu-action', 'toggle-layers');
            }
          },
          { type: 'separator' },
          {
            label: 'Toggle Developer Tools',
            accelerator: 'CmdOrCtrl+Shift+I',
            click: () => {
              this.mainWindow?.webContents.toggleDevTools();
            }
          }
        ]
      }
    ];
    
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }
  
  private getExportFilters(format: string): Electron.FileFilter[] {
    switch (format) {
      case 'json':
        return [{ name: 'JSON Files', extensions: ['json'] }];
      case 'csv':
        return [{ name: 'CSV Files', extensions: ['csv'] }];
      case 'pdf':
        return [{ name: 'PDF Files', extensions: ['pdf'] }];
      case 'html':
        return [{ name: 'HTML Files', extensions: ['html'] }];
      default:
        return [{ name: 'All Files', extensions: ['*'] }];
    }
  }
  
  private async exportAnalysis(filepath: string, format: string, data: any): Promise<void> {
    switch (format) {
      case 'json':
        await fs.writeFile(filepath, JSON.stringify(data, null, 2));
        break;
      case 'csv':
        // Convert to CSV format
        const csv = this.convertToCSV(data);
        await fs.writeFile(filepath, csv);
        break;
      case 'html':
        // Generate HTML report
        const html = this.generateHTMLReport(data);
        await fs.writeFile(filepath, html);
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }
  
  private convertToCSV(data: any): string {
    // CSV conversion logic
    return '';
  }
  
  private generateHTMLReport(data: any): string {
    // HTML report generation
    return '';
  }
  
  private setupAppEvents(): void {
    app.on('ready', () => this.createWindow());
    
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
    
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      }
    });
    
    app.on('before-quit', () => {
      if (this.pythonProcess) {
        this.pythonProcess.kill();
      }
    });
  }
}

// Initialize application
const analyzerApp = new GCodeAnalyzerApp();
export default analyzerApp;
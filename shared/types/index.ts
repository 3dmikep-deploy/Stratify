// shared/types/index.ts

export interface GCodeCommand {
  type: string;
  code: number;
  params: Record<string, number>;
  comment?: string;
  lineNumber: number;
  layer?: number;
}

export interface LayerAnalysis {
  z_height: number;
  thickness: number;
  extrusion_moves: number;
  travel_moves: number;
  extrusion_distance: number;
  travel_distance: number;
  extrusion_volume: number;
  print_time: number;
  speed_profile: {
    avg: number;
    min: number;
    max: number;
  };
}

export interface SlicerProfile {
  slicer_name: string;
  version?: string;
  layer_height: number;
  first_layer_height?: number;
  nozzle_diameter: number;
  extrusion_width: number;
  print_speed: number;
  travel_speed: number;
  retraction_distance?: number;
  retraction_speed?: number;
  temperature_nozzle: number;
  temperature_bed: number;
  infill_density: number;
  infill_pattern: string;
  support_enabled: boolean;
  wall_count: number;
  top_layers: number;
  bottom_layers: number;
}

export interface GeometryAnalysis {
  bounding_box: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
    dimensions: { x: number; y: number; z: number };
  };
  layer_analysis: LayerAnalysis[];
  movement_stats: {
    total_commands: number;
    movement_commands: number;
    extrusion_commands: number;
  };
  extrusion_stats: {
    total_filament: number;
    estimated_weight: number;
  };
  time_estimate: number;
  pattern_detection: {
    infill_type: string;
    perimeter_count: number;
    support_detected: boolean;
    bridging_detected: boolean;
  };
}

export interface OptimizationSuggestion {
  category: 'Speed' | 'Material' | 'Quality' | 'Safety';
  title: string;
  description: string;
  impact: 'High' | 'Medium' | 'Low';
  time_saving?: string;
  material_saving?: string;
  implementation?: string;
  potential_issues?: string[];
}

export interface AnalysisResult {
  id: string;
  filepath: string;
  timestamp: number;
  metadata: Record<string, any>;
  profile?: SlicerProfile;
  geometry: GeometryAnalysis;
  layers: LayerAnalysis[];
  suggestions: OptimizationSuggestion[];
  status: 'processing' | 'complete' | 'error';
  progress?: number;
  error?: string;
}

export interface ComparisonResult {
  files: string[];
  metrics: {
    print_time?: {
      values: number[];
      winner: number;
      difference: number;
    };
    material_usage?: {
      values: number[];
      winner: number;
      difference: number;
    };
    layer_count?: {
      values: number[];
      comparison: string;
    };
    quality_score?: {
      values: number[];
      winner: number;
      difference: number;
    };
    [key: string]: any;
  };
  recommendations: string[];
  summary: string;
}

export interface BatchAnalysisJob {
  id: string;
  files: {
    path: string;
    name: string;
    size: number;
    status: 'queued' | 'processing' | 'complete' | 'error';
    analysisId?: string;
    progress?: number;
    error?: string;
  }[];
  status: 'queued' | 'processing' | 'complete' | 'error';
  progress: number;
  started_at?: number;
  completed_at?: number;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  defaultColorMode: 'layer' | 'speed' | 'type' | 'temperature';
  showTravel: boolean;
  showExtrusion: boolean;
  autoAnalyze: boolean;
  units: 'metric' | 'imperial';
  maxFileSize: number;
  recentFilesLimit: number;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

export interface WebSocketMessage {
  type: 'progress' | 'complete' | 'error' | 'status';
  analysisId?: string;
  batchId?: string;
  data: any;
  timestamp: string;
}

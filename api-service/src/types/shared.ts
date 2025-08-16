// Minimal local copies of shared types to keep API service self-contained in Docker builds

export interface LayerAnalysis {
  z_height: number;
  thickness: number;
  extrusion_moves: number;
  travel_moves: number;
  extrusion_distance: number;
  travel_distance: number;
  extrusion_volume: number;
  print_time: number;
  speed_profile?: { avg: number; min: number; max: number };
  index?: number;
  z?: number;
  commands?: number;
  extrusionMoves?: number;
  travelMoves?: number;
  printTime?: number;
}

export interface SlicerProfile {
  slicer_name?: string;
  version?: string;
  layer_height?: number;
  first_layer_height?: number;
  nozzle_diameter?: number;
  extrusion_width?: number;
  print_speed?: number;
  travel_speed?: number;
  retraction_distance?: number;
  retraction_speed?: number;
  temperature_nozzle?: number;
  temperature_bed?: number;
  infill_density?: number;
  infill_pattern?: string;
  support_enabled?: boolean;
  wall_count?: number;
  top_layers?: number;
  bottom_layers?: number;
}

export interface GeometryAnalysis {
  time_estimate?: number;
  extrusion_stats?: { total_filament?: number; estimated_weight?: number };
  pattern_detection?: { support_detected?: boolean; bridging_detected?: boolean };
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
  profile?: SlicerProfile | null;
  geometry?: GeometryAnalysis | null;
  layers: LayerAnalysis[];
  suggestions: OptimizationSuggestion[];
  status: 'processing' | 'complete' | 'error';
  error?: string;
}

export interface ComparisonResult {
  files: string[];
  metrics: Record<string, any> & {
    print_time?: { values: number[]; winner: number; difference: number };
    material_usage?: { values: number[]; winner: number; difference: number };
    layer_count?: { values: number[]; comparison: string };
    quality_score?: { values: number[]; winner: number; difference: number };
  };
  recommendations: string[];
  summary: string;
}

export interface BatchAnalysisJob {
  id: string;
  files: Array<{ path: string; name: string; size: number; status: 'queued' | 'processing' | 'complete' | 'error'; analysisId?: string; progress?: number; error?: string }>;
  status: 'queued' | 'processing' | 'complete' | 'error';
  progress: number;
  started_at?: number;
  completed_at?: number;
}

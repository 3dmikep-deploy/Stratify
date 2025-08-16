// shared/utils/index.ts

import { LayerAnalysis, GCodeCommand } from '../types';

/**
 * Utility functions for G-code analysis and processing
 */

/**
 * Convert bytes to human readable format
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format time duration to human readable format
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Calculate percentage change between two values
 */
export function calculatePercentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return newValue > 0 ? 100 : 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Generate a unique ID
 */
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * Validate G-code file extension
 */
export function isValidGCodeFile(filename: string): boolean {
  const validExtensions = ['.gcode', '.gco', '.g', '.nc'];
  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return validExtensions.includes(extension);
}

/**
 * Parse G-code command from string
 */
export function parseGCodeCommand(line: string, lineNumber: number): GCodeCommand | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(';')) return null;

  // Remove inline comments
  let command = trimmed;
  let comment = '';
  const commentIndex = trimmed.indexOf(';');
  if (commentIndex > 0) {
    command = trimmed.substring(0, commentIndex).trim();
    comment = trimmed.substring(commentIndex + 1).trim();
  }

  // Parse command type and code
  const match = command.match(/^([GMTF])(\d+(?:\.\d+)?)(.*)/);
  if (!match) return null;

  const type = match[1];
  const code = parseFloat(match[2]);
  const paramsStr = match[3];

  // Parse parameters
  const params: Record<string, number> = {};
  const paramMatches = paramsStr.matchAll(/([A-Z])([-\d.]+)/g);
  for (const paramMatch of paramMatches) {
    params[paramMatch[1]] = parseFloat(paramMatch[2]);
  }

  return {
    type,
    code,
    params,
    comment: comment || undefined,
    lineNumber
  };
}

/**
 * Calculate distance between two 3D points
 */
export function calculateDistance3D(
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number }
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate volume of extruded filament
 */
export function calculateFilamentVolume(
  extrusionLength: number,
  filamentDiameter: number = 1.75
): number {
  const radius = filamentDiameter / 2;
  return Math.PI * radius * radius * extrusionLength;
}

/**
 * Estimate material weight based on volume and density
 */
export function estimateMaterialWeight(
  volume: number,
  density: number = 1.24 // PLA density g/cm³
): number {
  return volume * density;
}

/**
 * Color interpolation for visualization
 */
export function interpolateColor(
  color1: [number, number, number],
  color2: [number, number, number],
  factor: number
): [number, number, number] {
  factor = Math.max(0, Math.min(1, factor));
  return [
    color1[0] + (color2[0] - color1[0]) * factor,
    color1[1] + (color2[1] - color1[1]) * factor,
    color1[2] + (color2[2] - color1[2]) * factor
  ];
}

/**
 * Generate color for layer visualization
 */
export function getLayerColor(layerIndex: number, totalLayers: number): [number, number, number] {
  const hue = (layerIndex / totalLayers) * 240; // 0 to 240 degrees (red to blue)
  return hslToRgb(hue / 360, 1, 0.5);
}

/**
 * Convert HSL to RGB
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Debounce function for performance optimization
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(null, args), wait);
  };
}

/**
 * Throttle function for performance optimization
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func.apply(null, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as any;
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as any;
  if (typeof obj === 'object') {
    const clonedObj = {} as any;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
  return obj;
}

/**
 * Calculate print statistics from layer data
 */
export function calculatePrintStatistics(layers: LayerAnalysis[]) {
  const stats = {
    totalLayers: layers.length,
    totalTime: 0,
    totalVolume: 0,
    totalDistance: 0,
    avgLayerTime: 0,
    avgSpeed: 0,
    maxSpeed: 0,
    minSpeed: Infinity
  };

  layers.forEach(layer => {
    stats.totalTime += layer.print_time;
    stats.totalVolume += layer.extrusion_volume;
    stats.totalDistance += layer.extrusion_distance + layer.travel_distance;
    stats.maxSpeed = Math.max(stats.maxSpeed, layer.speed_profile.max);
    stats.minSpeed = Math.min(stats.minSpeed, layer.speed_profile.min);
  });

  stats.avgLayerTime = stats.totalTime / layers.length;
  stats.avgSpeed = stats.totalDistance / stats.totalTime;
  
  if (stats.minSpeed === Infinity) stats.minSpeed = 0;

  return stats;
}

/**
 * Validate API response format
 */
export function isValidAPIResponse(response: any): boolean {
  return (
    response &&
    typeof response === 'object' &&
    typeof response.success === 'boolean' &&
    typeof response.timestamp === 'string'
  );
}

/**
 * Format number with units
 */
export function formatWithUnits(value: number, unit: string, decimals: number = 2): string {
  return `${value.toFixed(decimals)} ${unit}`;
}

/**
 * Convert temperature units
 */
export function convertTemperature(value: number, from: 'C' | 'F', to: 'C' | 'F'): number {
  if (from === to) return value;
  if (from === 'C' && to === 'F') {
    return (value * 9/5) + 32;
  } else {
    return (value - 32) * 5/9;
  }
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generate download filename with timestamp
 */
export function generateDownloadFilename(prefix: string, extension: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -1);
  return `${prefix}_${timestamp}.${extension}`;
}

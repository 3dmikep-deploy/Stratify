// api-service/src/services/optimizationService.ts
import { AnalysisResult, OptimizationSuggestion } from '../types/shared';

export interface OptimizationProfile {
  priority: 'speed' | 'quality' | 'material';
  constraints: {
    maxPrintTime?: number;
    minQuality?: number;
    maxMaterial?: number;
  };
}

export class OptimizationService {
  constructor() {
    console.log('OptimizationService initialized');
  }

  /**
   * Generate optimization suggestions based on analysis and profile
   */
  async generateOptimizations(
    analysis: AnalysisResult,
    profile: OptimizationProfile
  ): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];

    // Speed optimizations
    if (profile.priority === 'speed' || !profile.constraints?.maxPrintTime) {
      suggestions.push(...this.generateSpeedOptimizations(analysis));
    }

    // Quality optimizations
    if (profile.priority === 'quality' || profile.constraints?.minQuality) {
      suggestions.push(...this.generateQualityOptimizations(analysis));
    }

    // Material optimizations
    if (profile.priority === 'material' || profile.constraints?.maxMaterial) {
      suggestions.push(...this.generateMaterialOptimizations(analysis));
    }

    // Safety optimizations (always include)
    suggestions.push(...this.generateSafetyOptimizations(analysis));

    // Filter and rank suggestions
    return this.rankSuggestions(suggestions, profile);
  }

  /**
   * Generate speed-focused optimizations
   */
  private generateSpeedOptimizations(analysis: AnalysisResult): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // Layer height optimization
    if (analysis.profile?.layer_height && analysis.profile.layer_height < 0.2) {
      const currentTime = analysis.geometry?.time_estimate || 0;
      const potentialSaving = this.calculateLayerHeightTimeSaving(
        analysis.profile.layer_height, 
        0.25, 
        currentTime
      );

      suggestions.push({
        category: 'Speed',
        title: 'Increase Layer Height',
        description: `Current layer height is ${analysis.profile.layer_height}mm. Increasing to 0.25mm would reduce print time significantly.`,
        impact: 'High',
        time_saving: `~${potentialSaving.toFixed(0)} minutes`,
        implementation: 'Change layer height to 0.25mm in slicer settings',
        potential_issues: ['Slightly reduced surface quality', 'Less detail on vertical surfaces']
      });
    }

    // Infill optimization for speed
    if (analysis.profile?.infill_density && analysis.profile.infill_density > 25) {
      suggestions.push({
        category: 'Speed',
        title: 'Reduce Infill Density',
        description: `Current infill is ${analysis.profile.infill_density}%. Reducing to 20% maintains strength while reducing print time.`,
        impact: 'Medium',
        time_saving: '~15-25%',
        implementation: 'Set infill density to 20% in slicer',
        potential_issues: ['Slightly reduced strength', 'May affect top surface quality']
      });
    }

    // Print speed optimization
    if (analysis.profile?.print_speed && analysis.profile.print_speed < 50) {
      suggestions.push({
        category: 'Speed',
        title: 'Increase Print Speed',
        description: `Current print speed is ${analysis.profile.print_speed}mm/s. Can safely increase to 60mm/s for most materials.`,
        impact: 'Medium',
        time_saving: '~20%',
        implementation: 'Increase print speed in slicer settings',
        potential_issues: ['May reduce quality if printer cannot handle higher speeds', 'Check printer capabilities']
      });
    }

    // Support optimization
    if (analysis.geometry?.pattern_detection?.support_detected) {
      suggestions.push({
        category: 'Speed',
        title: 'Optimize Support Settings',
        description: 'Supports detected. Consider reducing support density or using tree supports for faster printing.',
        impact: 'Medium',
        time_saving: '~10-30%',
        implementation: 'Reduce support density to 15% or switch to tree supports',
        potential_issues: ['May require more careful part orientation', 'Verify support effectiveness']
      });
    }

    return suggestions;
  }

  /**
   * Generate quality-focused optimizations
   */
  private generateQualityOptimizations(analysis: AnalysisResult): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // Layer height for quality
    if (analysis.profile?.layer_height && analysis.profile.layer_height > 0.2) {
      suggestions.push({
        category: 'Quality',
        title: 'Reduce Layer Height',
        description: `Current layer height is ${analysis.profile.layer_height}mm. Reducing to 0.15mm will improve surface quality.`,
        impact: 'High',
        implementation: 'Set layer height to 0.15mm in slicer',
        potential_issues: ['Increased print time (~50%)', 'Higher chance of print failures']
      });
    }

    // Print speed for quality
    if (analysis.profile?.print_speed && analysis.profile.print_speed > 60) {
      suggestions.push({
        category: 'Quality',
        title: 'Reduce Print Speed',
        description: `Current speed is ${analysis.profile.print_speed}mm/s. Reducing to 40mm/s will improve quality.`,
        impact: 'Medium',
        implementation: 'Reduce print speed to 40mm/s',
        potential_issues: ['Increased print time (~30%)', 'May require temperature adjustments']
      });
    }

    // Wall count optimization
    if (analysis.profile?.wall_count && analysis.profile.wall_count < 3) {
      suggestions.push({
        category: 'Quality',
        title: 'Increase Wall Count',
        description: `Current wall count is ${analysis.profile.wall_count}. Increasing to 3 walls improves strength and surface quality.`,
        impact: 'Medium',
        implementation: 'Set wall count to 3 in slicer settings',
        potential_issues: ['Increased material usage', 'Longer print time']
      });
    }

    // Temperature optimization
    if (analysis.profile?.temperature_nozzle) {
      const temp = analysis.profile.temperature_nozzle;
      if (temp > 220) {
        suggestions.push({
          category: 'Quality',
          title: 'Optimize Temperature',
          description: `Nozzle temperature is ${temp}°C. Consider lowering for better surface quality.`,
          impact: 'Medium',
          implementation: 'Reduce nozzle temperature by 5-10°C',
          potential_issues: ['May cause under-extrusion', 'Test on small part first']
        });
      }
    }

    return suggestions;
  }

  /**
   * Generate material-saving optimizations
   */
  private generateMaterialOptimizations(analysis: AnalysisResult): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // Infill optimization
    if (analysis.profile?.infill_density && analysis.profile.infill_density > 20) {
      const currentMaterial = analysis.geometry?.extrusion_stats?.total_filament || 0;
      const savings = ((analysis.profile.infill_density - 15) / analysis.profile.infill_density) * 0.7;
      
      suggestions.push({
        category: 'Material',
        title: 'Reduce Infill Density',
        description: `Current infill is ${analysis.profile.infill_density}%. Reducing to 15% maintains adequate strength for most parts.`,
        impact: 'High',
        material_saving: `~${(currentMaterial * savings).toFixed(1)}m filament`,
        implementation: 'Set infill density to 15% in slicer',
        potential_issues: ['Reduced strength', 'May affect bridging quality']
      });
    }

    // Wall thickness optimization
    if (analysis.profile?.extrusion_width && analysis.profile?.wall_count) {
      const wallThickness = analysis.profile.extrusion_width * analysis.profile.wall_count;
      if (wallThickness > 1.6) {
        suggestions.push({
          category: 'Material',
          title: 'Optimize Wall Thickness',
          description: `Current wall thickness is ${wallThickness.toFixed(2)}mm. Can reduce without affecting strength significantly.`,
          impact: 'Medium',
          material_saving: '~10-15%',
          implementation: 'Reduce wall count by 1 or decrease extrusion width',
          potential_issues: ['Slightly reduced strength', 'May affect surface quality']
        });
      }
    }

    // Support optimization
    if (analysis.geometry?.pattern_detection?.support_detected) {
      suggestions.push({
        category: 'Material',
        title: 'Minimize Support Material',
        description: 'Optimize part orientation to reduce support material usage.',
        impact: 'Medium',
        material_saving: '~20-40%',
        implementation: 'Rotate part to minimize overhangs, use tree supports',
        potential_issues: ['May require design changes', 'Verify structural integrity']
      });
    }

    // Scale optimization
    const volume = analysis.geometry?.extrusion_stats?.total_filament || 0;
    if (volume > 100) { // Large parts
      suggestions.push({
        category: 'Material',
        title: 'Consider Hollow Design',
        description: 'For large parts, consider making hollow with drainage holes to save material.',
        impact: 'High',
        material_saving: '~30-70%',
        implementation: 'Modify design to create hollow interior with wall thickness 2-3mm',
        potential_issues: ['Requires design changes', 'May need internal supports']
      });
    }

    return suggestions;
  }

  /**
   * Generate safety-related optimizations
   */
  private generateSafetyOptimizations(analysis: AnalysisResult): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // Temperature safety
    if (analysis.profile?.temperature_nozzle && analysis.profile.temperature_nozzle > 250) {
      suggestions.push({
        category: 'Safety',
        title: 'High Temperature Warning',
        description: `Nozzle temperature is ${analysis.profile.temperature_nozzle}°C. Ensure proper ventilation and safety precautions.`,
        impact: 'High',
        implementation: 'Verify material requirements, ensure proper ventilation',
        potential_issues: ['Risk of burns', 'Potential toxic fumes', 'Increased wear on hotend']
      });
    }

    // Bed temperature safety
    if (analysis.profile?.temperature_bed && analysis.profile.temperature_bed > 100) {
      suggestions.push({
        category: 'Safety',
        title: 'High Bed Temperature Warning',
        description: `Bed temperature is ${analysis.profile.temperature_bed}°C. High temperatures may warp build surface or cause burns.`,
        impact: 'Medium',
        implementation: 'Verify bed material compatibility, use caution when removing prints',
        potential_issues: ['Risk of burns', 'Potential bed damage', 'Warping']
      });
    }

    // Long print time warning
    const printTime = analysis.geometry?.time_estimate || 0;
    if (printTime > 24 * 3600) { // More than 24 hours
      suggestions.push({
        category: 'Safety',
        title: 'Long Print Duration Warning',
        description: `Estimated print time is ${this.formatTime(printTime)}. Consider monitoring and power backup.`,
        impact: 'Medium',
        implementation: 'Set up monitoring, ensure stable power supply, check first layers carefully',
        potential_issues: ['Risk of print failure', 'Power outage vulnerability', 'Increased wear on printer']
      });
    }

    return suggestions;
  }

  /**
   * Rank suggestions based on profile and impact
   */
  private rankSuggestions(
    suggestions: OptimizationSuggestion[], 
    profile: OptimizationProfile
  ): OptimizationSuggestion[] {
    return suggestions.sort((a, b) => {
      // Priority matching
      const aPriorityMatch = a.category.toLowerCase() === profile.priority;
      const bPriorityMatch = b.category.toLowerCase() === profile.priority;
      
      if (aPriorityMatch && !bPriorityMatch) return -1;
      if (!aPriorityMatch && bPriorityMatch) return 1;
      
      // Impact scoring
      const impactScore = { 'High': 3, 'Medium': 2, 'Low': 1 };
      const aScore = impactScore[a.impact];
      const bScore = impactScore[b.impact];
      
      return bScore - aScore;
    });
  }

  /**
   * Calculate time savings from layer height change
   */
  private calculateLayerHeightTimeSaving(
    currentHeight: number, 
    newHeight: number, 
    currentTime: number
  ): number {
    const ratio = currentHeight / newHeight;
    const newTime = currentTime / ratio;
    return (currentTime - newTime) / 60; // Convert to minutes
  }

  /**
   * Format time in seconds to human readable
   */
  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Analyze print for specific issues
   */
  async analyzeForIssues(analysis: AnalysisResult): Promise<{
    issues: Array<{
      type: 'warning' | 'error' | 'info';
      category: string;
      message: string;
      suggestion?: string;
    }>;
    score: number;
  }> {
    const issues: Array<{
      type: 'warning' | 'error' | 'info';
      category: string;
      message: string;
      suggestion?: string;
    }> = [];
    let score = 100;

    // Check for potential bridging issues
    if (analysis.geometry?.pattern_detection?.bridging_detected) {
      issues.push({
        type: 'warning' as const,
        category: 'Bridging',
        message: 'Bridging detected - may result in poor surface quality',
        suggestion: 'Consider adding supports or modifying part orientation'
      });
      score -= 10;
    }

    // Check for excessive supports
    if (analysis.geometry?.pattern_detection?.support_detected) {
      issues.push({
        type: 'info' as const,
        category: 'Supports',
        message: 'Support material required',
        suggestion: 'Optimize orientation to minimize support usage'
      });
      score -= 5;
    }

    // Check for extreme temperatures
    if (analysis.profile?.temperature_nozzle && analysis.profile.temperature_nozzle > 280) {
      issues.push({
        type: 'error' as const,
        category: 'Temperature',
        message: `Extremely high nozzle temperature: ${analysis.profile.temperature_nozzle}°C`,
        suggestion: 'Verify material requirements and printer capabilities'
      });
      score -= 20;
    }

    // Check for very thin layers
    if (analysis.profile?.layer_height && analysis.profile.layer_height < 0.1) {
      issues.push({
        type: 'warning' as const,
        category: 'Layer Height',
        message: `Very thin layers: ${analysis.profile.layer_height}mm`,
        suggestion: 'Extremely long print times - consider increasing layer height'
      });
      score -= 15;
    }

    return {
      issues,
      score: Math.max(0, score)
    };
  }

  /**
   * Generate custom optimization for specific use case
   */
  async generateCustomOptimization(
    analysis: AnalysisResult,
    useCase: 'prototype' | 'production' | 'miniature' | 'functional' | 'decorative'
  ): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];

    switch (useCase) {
      case 'prototype':
        suggestions.push({
          category: 'Speed',
          title: 'Prototype Optimization',
          description: 'Fast prototype settings: larger layers, reduced infill, higher speeds',
          impact: 'High',
          time_saving: '~40-60%',
          implementation: 'Layer height: 0.3mm, Infill: 10%, Speed: 80mm/s',
          potential_issues: ['Reduced quality', 'Lower strength']
        });
        break;

      case 'production':
        suggestions.push({
          category: 'Quality',
          title: 'Production Quality',
          description: 'Balanced settings for reliable production parts',
          impact: 'Medium',
          implementation: 'Layer height: 0.2mm, Infill: 20%, Speed: 50mm/s, Walls: 3',
          potential_issues: ['Moderate print times', 'Higher material usage']
        });
        break;

      case 'miniature':
        suggestions.push({
          category: 'Quality',
          title: 'Miniature Detail Settings',
          description: 'High detail settings for small parts and miniatures',
          impact: 'High',
          implementation: 'Layer height: 0.1mm, Speed: 30mm/s, Walls: 2',
          potential_issues: ['Very long print times', 'High failure risk']
        });
        break;

      case 'functional':
        suggestions.push({
          category: 'Quality',
          title: 'Functional Part Settings',
          description: 'Optimized for strength and dimensional accuracy',
          impact: 'High',
          implementation: 'Layer height: 0.2mm, Infill: 30%, Walls: 4, Lower speeds',
          potential_issues: ['Increased material usage', 'Longer print times']
        });
        break;

      case 'decorative':
        suggestions.push({
          category: 'Quality',
          title: 'Decorative Surface Quality',
          description: 'Optimized for visual appearance and surface finish',
          impact: 'High',
          implementation: 'Layer height: 0.15mm, Higher infill for weight, Slower speeds',
          potential_issues: ['Longer print times', 'Higher material usage']
        });
        break;
    }

    return suggestions;
  }
}

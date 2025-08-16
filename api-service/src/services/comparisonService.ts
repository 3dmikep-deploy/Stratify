// api-service/src/services/comparisonService.ts
import { AnalysisResult, ComparisonResult } from '../types/shared';
import { AnalysisService } from './analysisService';
import { promises as fs } from 'fs';
import * as path from 'path';

export class ComparisonService {
  private analysisService: AnalysisService;

  constructor() {
    this.analysisService = new AnalysisService();
    console.log('ComparisonService initialized');
  }

  /**
   * Compare multiple G-code files
   */
  async compare(
    filepaths: string[],
    metrics: string[] = ['printTime', 'material', 'layers', 'quality'],
    outputFormat: 'json' | 'html' | 'pdf' = 'json'
  ): Promise<ComparisonResult | Buffer | string> {
    if (filepaths.length < 2) {
      throw new Error('At least 2 files are required for comparison');
    }

    // Analyze all files
    const analyses: AnalysisResult[] = [];
    for (const filepath of filepaths) {
      try {
        const analysis = await this.analysisService.analyze(filepath, {
          detailed: true,
          inferParameters: true,
          generateSuggestions: false
        });
        analyses.push(analysis);
      } catch (error) {
        throw new Error(`Failed to analyze ${filepath}: ${error}`);
      }
    }

    // Generate comparison data
    const comparison = this.generateComparison(analyses, metrics);

    // Return in requested format
    switch (outputFormat) {
      case 'json':
        return comparison;
      case 'html':
        return this.generateHTMLReport(comparison, analyses);
      case 'pdf':
        return await this.generatePDFReport(comparison, analyses);
      default:
        return comparison;
    }
  }

  /**
   * Generate comparison data structure
   */
  private generateComparison(analyses: AnalysisResult[], metrics: string[]): ComparisonResult {
    const comparison: ComparisonResult = {
      files: analyses.map(a => path.basename(a.filepath)),
      metrics: {},
      recommendations: [],
      summary: ''
    };

    // Compare print time
    if (metrics.includes('printTime')) {
      const printTimes = analyses.map(a => a.geometry?.time_estimate || 0);
      const minIndex = printTimes.indexOf(Math.min(...printTimes));
      
      comparison.metrics.print_time = {
        values: printTimes,
        winner: minIndex,
        difference: printTimes.length > 1 ? 
          ((Math.max(...printTimes) - Math.min(...printTimes)) / Math.min(...printTimes)) * 100 : 0
      };
    }

    // Compare material usage
    if (metrics.includes('material')) {
      const materialUsage = analyses.map(a => 
        a.geometry?.extrusion_stats?.total_filament || 0
      );
      const minIndex = materialUsage.indexOf(Math.min(...materialUsage));
      
      comparison.metrics.material_usage = {
        values: materialUsage,
        winner: minIndex,
        difference: materialUsage.length > 1 ?
          ((Math.max(...materialUsage) - Math.min(...materialUsage)) / Math.min(...materialUsage)) * 100 : 0
      };
    }

    // Compare layer count
    if (metrics.includes('layers')) {
      const layerCounts = analyses.map(a => a.layers?.length || 0);
      
      comparison.metrics.layer_count = {
        values: layerCounts,
        comparison: this.compareLayerCounts(layerCounts)
      };
    }

    // Compare quality metrics
    if (metrics.includes('quality')) {
      const qualityScores = analyses.map(a => this.calculateQualityScore(a));
      const maxIndex = qualityScores.indexOf(Math.max(...qualityScores));
      
      comparison.metrics.quality_score = {
        values: qualityScores,
        winner: maxIndex,
        difference: qualityScores.length > 1 ?
          ((Math.max(...qualityScores) - Math.min(...qualityScores)) / Math.max(...qualityScores)) * 100 : 0
      };
    }

    // Generate recommendations
    comparison.recommendations = this.generateRecommendations(analyses, comparison);
    
    // Generate summary
    comparison.summary = this.generateSummary(comparison, analyses);

    return comparison;
  }

  /**
   * Calculate quality score for an analysis
   */
  private calculateQualityScore(analysis: AnalysisResult): number {
    let score = 100;
    
    // Penalize for issues
    if (analysis.profile?.layer_height && analysis.profile.layer_height > 0.3) {
      score -= 10; // Very thick layers
    }
    
    if (analysis.profile?.infill_density && analysis.profile.infill_density < 10) {
      score -= 15; // Very low infill
    }
    
    // Check for potential problems in geometry
    if (analysis.geometry?.pattern_detection?.support_detected) {
      score -= 5; // Supports needed (complexity)
    }
    
    if (analysis.geometry?.pattern_detection?.bridging_detected) {
      score -= 10; // Bridging detected (quality risk)
    }
    
    // Bonus for optimal settings
    if (analysis.profile?.layer_height && 
        analysis.profile.layer_height >= 0.15 && 
        analysis.profile.layer_height <= 0.25) {
      score += 5; // Optimal layer height
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Compare layer counts and provide insight
   */
  private compareLayerCounts(layerCounts: number[]): string {
    const min = Math.min(...layerCounts);
    const max = Math.max(...layerCounts);
    
    if (min === max) {
      return 'All files have the same number of layers';
    }
    
    const difference = max - min;
    const percentDiff = (difference / min) * 100;
    
    if (percentDiff > 50) {
      return `Significant layer count variation (${difference} layers difference)`;
    } else if (percentDiff > 20) {
      return `Moderate layer count variation (${difference} layers difference)`;
    } else {
      return `Minor layer count variation (${difference} layers difference)`;
    }
  }

  /**
   * Generate recommendations based on comparison
   */
  private generateRecommendations(analyses: AnalysisResult[], comparison: ComparisonResult): string[] {
    const recommendations: string[] = [];
    
    // Time-based recommendations
    if (comparison.metrics.print_time) {
      const fastest = comparison.metrics.print_time.winner;
      const fastestFile = comparison.files[fastest];
      const timeSaving = comparison.metrics.print_time.difference;
      
      if (timeSaving > 20) {
        recommendations.push(
          `Consider using settings from "${fastestFile}" for ${timeSaving.toFixed(1)}% faster printing`
        );
      }
    }
    
    // Material-based recommendations
    if (comparison.metrics.material_usage) {
      const mostEfficient = comparison.metrics.material_usage.winner;
      const efficientFile = comparison.files[mostEfficient];
      const materialSaving = comparison.metrics.material_usage.difference;
      
      if (materialSaving > 15) {
        recommendations.push(
          `Settings from "${efficientFile}" use ${materialSaving.toFixed(1)}% less material`
        );
      }
    }
    
    // Quality recommendations
    if (comparison.metrics.quality_score) {
      const highestQuality = comparison.metrics.quality_score.winner;
      const qualityFile = comparison.files[highestQuality];
      
      recommendations.push(
        `"${qualityFile}" has the highest predicted quality score`
      );
    }
    
    // Layer height recommendations
    const layerHeights = analyses.map(a => a.profile?.layer_height).filter(Boolean);
    if (layerHeights.length > 0) {
      const avgLayerHeight = layerHeights.reduce((a, b) => a! + b!, 0)! / layerHeights.length;
      if (avgLayerHeight > 0.25) {
        recommendations.push(
          'Consider reducing layer height for better surface quality'
        );
      } else if (avgLayerHeight < 0.15) {
        recommendations.push(
          'Consider increasing layer height for faster printing'
        );
      }
    }
    
    // Infill recommendations
    const infillDensities = analyses.map(a => a.profile?.infill_density).filter((d): d is number => d !== undefined);
    if (infillDensities.length > 0) {
      const maxInfill = Math.max(...infillDensities);
      const minInfill = Math.min(...infillDensities);
      
      if (maxInfill - minInfill > 30) {
        recommendations.push(
          'Large infill density variation detected - consider standardizing for consistent results'
        );
      }
    }
    
    return recommendations;
  }

  /**
   * Generate summary text
   */
  private generateSummary(comparison: ComparisonResult, analyses: AnalysisResult[]): string {
    const parts: string[] = [];
    
    parts.push(`Compared ${analyses.length} G-code files.`);
    
    if (comparison.metrics.print_time) {
      const winner = comparison.files[comparison.metrics.print_time.winner];
      const difference = comparison.metrics.print_time.difference;
      parts.push(`Fastest: "${winner}" (${difference.toFixed(1)}% faster than slowest).`);
    }
    
    if (comparison.metrics.material_usage) {
      const winner = comparison.files[comparison.metrics.material_usage.winner];
      const difference = comparison.metrics.material_usage.difference;
      parts.push(`Most efficient: "${winner}" (${difference.toFixed(1)}% less material).`);
    }
    
    if (comparison.recommendations.length > 0) {
      parts.push(`${comparison.recommendations.length} optimization suggestions identified.`);
    }
    
    return parts.join(' ');
  }

  /**
   * Generate HTML report
   */
  private generateHTMLReport(comparison: ComparisonResult, analyses: AnalysisResult[]): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>G-Code Comparison Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .header { background: #f4f4f4; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .metric { margin-bottom: 25px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .winner { background-color: #d4edda; font-weight: bold; }
        .recommendations { background: #fff3cd; padding: 15px; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>G-Code Comparison Report</h1>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Files compared:</strong> ${comparison.files.length}</p>
    </div>
    
    <div class="summary">
        <h2>Summary</h2>
        <p>${comparison.summary}</p>
    </div>
    
    ${this.generateMetricHTML(comparison)}
    
    <div class="recommendations">
        <h2>Recommendations</h2>
        <ul>
            ${comparison.recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
    </div>
    
    <div class="details">
        <h2>Detailed Analysis</h2>
        <table>
            <thead>
                <tr>
                    <th>File</th>
                    <th>Layer Height</th>
                    <th>Infill</th>
                    <th>Print Speed</th>
                    <th>Estimated Time</th>
                </tr>
            </thead>
            <tbody>
                ${analyses.map((analysis, index) => `
                    <tr>
                        <td>${comparison.files[index]}</td>
                        <td>${analysis.profile?.layer_height || 'N/A'}</td>
                        <td>${analysis.profile?.infill_density || 'N/A'}%</td>
                        <td>${analysis.profile?.print_speed || 'N/A'}</td>
                        <td>${this.formatTime(analysis.geometry?.time_estimate || 0)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
</body>
</html>
    `;
  }

  /**
   * Generate metrics HTML section
   */
  private generateMetricHTML(comparison: ComparisonResult): string {
    let html = '<div class="metrics"><h2>Metrics Comparison</h2>';
    
    Object.entries(comparison.metrics).forEach(([key, metric]) => {
      html += `<div class="metric">
        <h3>${this.formatMetricName(key)}</h3>`;
      
      if ('winner' in metric) {
        const winnerFile = comparison.files[metric.winner];
        html += `
          <p><span class="winner">Winner: ${winnerFile}</span></p>
          <p>Improvement: ${metric.difference.toFixed(1)}%</p>
          <p>Values: ${metric.values.map((v: number, i: number) => 
            `${comparison.files[i]}: ${v.toFixed(2)}`
          ).join(', ')}</p>
        `;
      } else if ('comparison' in metric) {
        html += `<p>${metric.comparison}</p>`;
      }
      
      html += '</div>';
    });
    
    html += '</div>';
    return html;
  }

  /**
   * Generate PDF report (placeholder - would use a library like puppeteer)
   */
  private async generatePDFReport(comparison: ComparisonResult, analyses: AnalysisResult[]): Promise<Buffer> {
    // This would typically use a library like puppeteer to convert HTML to PDF
    // For now, return a placeholder
    const htmlContent = this.generateHTMLReport(comparison, analyses);
    return Buffer.from(htmlContent, 'utf-8');
  }

  /**
   * Format metric names for display
   */
  private formatMetricName(key: string): string {
    const names: Record<string, string> = {
      'print_time': 'Print Time',
      'material_usage': 'Material Usage',
      'layer_count': 'Layer Count',
      'quality_score': 'Quality Score'
    };
    return names[key] || key;
  }

  /**
   * Format time in seconds to human readable
   */
  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  /**
   * Compare two individual analyses
   */
  async compareTwoFiles(filepath1: string, filepath2: string): Promise<{
    file1: AnalysisResult;
    file2: AnalysisResult;
    comparison: ComparisonResult;
    winner: {
      time: string;
      material: string;
      quality: string;
    };
  }> {
    const analysis1 = await this.analysisService.analyze(filepath1, {
      detailed: true,
      inferParameters: true,
      generateSuggestions: true
    });
    
    const analysis2 = await this.analysisService.analyze(filepath2, {
      detailed: true,
      inferParameters: true,
      generateSuggestions: true
    });
    
    const comparison = this.generateComparison([analysis1, analysis2], 
      ['printTime', 'material', 'quality']);
    
    return {
      file1: analysis1,
      file2: analysis2,
      comparison,
      winner: {
        time: comparison.files[comparison.metrics.print_time?.winner || 0],
        material: comparison.files[comparison.metrics.material_usage?.winner || 0],
        quality: comparison.files[comparison.metrics.quality_score?.winner || 0]
      }
    };
  }
}

#!/usr/bin/env python3
"""
G-code Analyzer Parser Service
Advanced HTTP server for G-code analysis using the full GCodeAnalyzer engine
"""

from flask import Flask, request, jsonify, send_file
import os
import sys
import logging
import tempfile
import json
from datetime import datetime
from pathlib import Path
import traceback

# Import the GCodeAnalyzer
from gcode_analyzer import GCodeAnalyzer

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max file size

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.now().isoformat(),
        'service': 'gcode-analyzer-parser',
        'version': '1.0.0',
        'python_version': sys.version
    })

@app.route('/parse', methods=['POST'])
def parse_gcode():
    """Advanced G-code parsing endpoint using GCodeAnalyzer"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Check file extension
        allowed_extensions = ['.gcode', '.gco', '.g', '.nc']
        file_ext = Path(file.filename).suffix.lower()
        if file_ext not in allowed_extensions:
            return jsonify({'error': f'File must have one of these extensions: {", ".join(allowed_extensions)}'}), 400
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(mode='w+b', suffix=file_ext, delete=False) as temp_file:
            file.save(temp_file.name)
            temp_filepath = temp_file.name
        
        try:
            logger.info(f"🔍 Starting analysis of {file.filename} ({os.path.getsize(temp_filepath)} bytes)")
            
            # Initialize analyzer and load file
            analyzer = GCodeAnalyzer(temp_filepath)
            
            # Perform comprehensive analysis
            geometry = analyzer.analyze_geometry()
            profile = analyzer.infer_parameters()
            
            # Format results for API response
            analysis_result = {
                'filename': file.filename,
                'fileSize': os.path.getsize(temp_filepath),
                'status': 'complete',
                'timestamp': datetime.now().isoformat(),
                'metadata': analyzer.metadata,
                'profile': {
                    'slicer_name': profile.slicer_name,
                    'version': profile.version,
                    'layer_height': profile.layer_height,
                    'nozzle_diameter': profile.nozzle_diameter,
                    'print_speed': profile.print_speed,
                    'travel_speed': profile.travel_speed,
                    'temperature_nozzle': profile.temperature_nozzle,
                    'temperature_bed': profile.temperature_bed,
                    'infill_density': profile.infill_density,
                    'infill_pattern': profile.infill_pattern,
                    'support_enabled': profile.support_enabled,
                    'wall_count': profile.wall_count,
                    'top_layers': profile.top_layers,
                    'bottom_layers': profile.bottom_layers
                },
                'geometry': geometry,
                'layers': [
                    {
                        'index': i + 1,
                        'z_height': layer.z_height,
                        'thickness': layer.thickness,
                        'extrusion_moves': layer.extrusion_moves,
                        'travel_moves': layer.travel_moves,
                        'extrusion_distance': round(layer.extrusion_distance, 2),
                        'travel_distance': round(layer.travel_distance, 2),
                        'extrusion_volume': round(layer.extrusion_volume, 4),
                        'print_time': round(layer.print_time, 2),
                        'speed_profile': layer.speed_profile
                    }
                    for i, layer in enumerate(analyzer.layers[:50])  # First 50 layers for performance
                ],
                'summary': {
                    'total_layers': len(analyzer.layers),
                    'total_commands': len(analyzer.commands),
                    'estimated_print_time': round(geometry.get('time_estimate', 0), 2),
                    'total_filament_used': round(geometry.get('extrusion_stats', {}).get('total_filament', 0), 2),
                    'estimated_weight_grams': round(geometry.get('extrusion_stats', {}).get('estimated_weight', 0), 2),
                    'bounding_box': geometry.get('bounding_box', {})
                },
                'optimization_suggestions': analyzer.generate_optimization_suggestions()
            }
            
            logger.info(f"✅ Analysis complete: {len(analyzer.layers)} layers, {len(analyzer.commands)} commands")
            return jsonify(analysis_result)
            
        finally:
            # Clean up temporary file
            try:
                os.unlink(temp_filepath)
            except:
                pass
                
    except Exception as e:
        logger.error(f"❌ Error parsing G-code: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'error': f'Analysis failed: {str(e)}',
            'details': 'Check server logs for full error details'
        }), 500

@app.route('/analyze', methods=['POST'])
def analyze_gcode_text():
    """Analyze G-code from text content"""
    try:
        data = request.get_json()
        if not data or 'content' not in data:
            return jsonify({'error': 'No G-code content provided'}), 400
        
        content = data['content']
        options = data.get('options', {})
        
        # Save content to temporary file for analysis
        with tempfile.NamedTemporaryFile(mode='w', suffix='.gcode', delete=False) as temp_file:
            temp_file.write(content)
            temp_filepath = temp_file.name
        
        try:
            logger.info(f"🔍 Analyzing G-code text content ({len(content)} characters)")
            
            # Initialize analyzer and load file
            analyzer = GCodeAnalyzer(temp_filepath)
            
            # Perform analysis
            geometry = analyzer.analyze_geometry()
            profile = analyzer.infer_parameters()
            suggestions = analyzer.generate_optimization_suggestions()
            
            # Calculate analysis score (simple heuristic)
            score = 100
            if profile.layer_height < 0.15:
                score -= 10  # Very fine layers
            if profile.infill_density > 30:
                score -= 10  # High infill
            if not profile.support_enabled and geometry.get('pattern_detection', {}).get('bridging_detected'):
                score -= 15  # Missing supports for bridges
            
            result = {
                'score': max(score, 60),  # Minimum score of 60
                'analysis_time': datetime.now().isoformat(),
                'suggestions': suggestions,
                'profile': {
                    'slicer_name': profile.slicer_name,
                    'layer_height': profile.layer_height,
                    'print_speed': profile.print_speed,
                    'infill_density': profile.infill_density,
                    'temperature_nozzle': profile.temperature_nozzle,
                    'temperature_bed': profile.temperature_bed
                },
                'summary': {
                    'total_layers': len(analyzer.layers),
                    'total_commands': len(analyzer.commands),
                    'estimated_print_time': round(geometry.get('time_estimate', 0), 2),
                    'total_filament_used': round(geometry.get('extrusion_stats', {}).get('total_filament', 0), 2)
                }
            }
            
            logger.info(f"✅ Text analysis complete, score: {result['score']}")
            return jsonify(result)
            
        finally:
            # Clean up temporary file
            try:
                os.unlink(temp_filepath)
            except:
                pass
        
    except Exception as e:
        logger.error(f"❌ Error analyzing G-code text: {str(e)}")
        return jsonify({
            'error': f'Analysis failed: {str(e)}',
            'suggestions': [{
                'category': 'Error',
                'title': 'Analysis Failed',
                'description': f'Could not analyze G-code: {str(e)}',
                'impact': 'High'
            }],
            'score': 0,
            'analysis_time': datetime.now().isoformat()
        }), 500

@app.route('/quick-analyze', methods=['POST'])
def quick_analyze():
    """Quick analysis endpoint for small files or previews"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        content = file.read().decode('utf-8', errors='ignore')
        
        # Quick analysis without full parsing
        lines = content.split('\n')
        command_lines = [line for line in lines if line.strip() and not line.strip().startswith(';')]
        
        # Basic stats
        z_changes = len([line for line in command_lines if 'Z' in line and ('G0' in line or 'G1' in line)])
        extrusion_commands = len([line for line in command_lines if 'E' in line])
        
        # Extract temperatures from comments
        temp_nozzle = None
        temp_bed = None
        slicer = 'Unknown'
        
        for line in lines[:100]:  # Check first 100 lines
            if 'temperature' in line.lower() and '=' in line:
                try:
                    temp_nozzle = float(line.split('=')[-1].strip())
                except:
                    pass
            if 'bed_temperature' in line.lower() and '=' in line:
                try:
                    temp_bed = float(line.split('=')[-1].strip())
                except:
                    pass
            if 'PrusaSlicer' in line:
                slicer = 'PrusaSlicer'
            elif 'Cura' in line:
                slicer = 'Cura'
        
        result = {
            'filename': file.filename,
            'quick_stats': {
                'total_lines': len(lines),
                'command_lines': len(command_lines),
                'estimated_layers': max(z_changes, 1),
                'extrusion_commands': extrusion_commands,
                'estimated_print_time_minutes': len(command_lines) // 60,
                'file_size': len(content)
            },
            'detected_settings': {
                'slicer': slicer,
                'nozzle_temperature': temp_nozzle,
                'bed_temperature': temp_bed
            },
            'analysis_type': 'quick',
            'timestamp': datetime.now().isoformat()
        }
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"❌ Quick analysis error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({'error': 'File too large. Maximum size is 500MB.'}), 413

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {str(error)}")
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    
    logger.info(f"🚀 Starting Advanced G-code Analyzer Parser Service on port {port}")
    logger.info(f"🔧 Debug mode: {debug}")
    logger.info(f"📁 Max file size: 500MB")
    logger.info(f"🎯 Endpoints available:")
    logger.info(f"   GET  /health - Health check")
    logger.info(f"   POST /parse - Full G-code analysis")
    logger.info(f"   POST /analyze - Text content analysis")  
    logger.info(f"   POST /quick-analyze - Quick file preview")
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=debug,
        threaded=True
    )

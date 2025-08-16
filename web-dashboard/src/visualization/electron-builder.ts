import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';

// Type definitions
interface GCodeCommand {
  type: string;
  code: number;
  params: Record<string, number>;
  layer?: number;
}

interface LayerData {
  index: number;
  z: number;
  commands: GCodeCommand[];
  color: THREE.Color;
}

interface VisualizerProps {
  gcode?: string;
  commands?: GCodeCommand[];
  currentLayer?: number;
  showTravel?: boolean;
  showExtrusion?: boolean;
  colorMode?: 'layer' | 'speed' | 'type' | 'temperature';
  onLayerChange?: (layer: number) => void;
}

// Color schemes for different visualization modes
const ColorSchemes = {
  layer: (layer: number, totalLayers: number) => {
    const hue = (layer / totalLayers) * 0.7; // 0 to 0.7 (red to blue)
    return new THREE.Color().setHSL(hue, 1, 0.5);
  },
  speed: (speed: number, maxSpeed: number) => {
    const intensity = speed / maxSpeed;
    return new THREE.Color(1 - intensity, intensity, 0); // Red to green
  },
  type: (isExtrusion: boolean) => {
    return isExtrusion ? new THREE.Color(0x00ff00) : new THREE.Color(0xff0000);
  },
  temperature: (temp: number) => {
    const normalized = (temp - 180) / 80; // Normalize 180-260°C
    return new THREE.Color(1, 1 - normalized, 0); // Yellow to red
  }
};

const GCodeVisualizer: React.FC<VisualizerProps> = ({
  gcode,
  commands = [],
  currentLayer = -1,
  showTravel = true,
  showExtrusion = true,
  colorMode = 'layer',
  onLayerChange
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const layersRef = useRef<Map<number, THREE.Group>>(new Map());
  
  const [layers, setLayers] = useState<LayerData[]>([]);
  const [boundingBox, setBoundingBox] = useState({ min: [0, 0, 0], max: [200, 200, 200] });
  const [isAnimating, setIsAnimating] = useState(false);
  const [viewMode, setViewMode] = useState<'perspective' | 'top' | 'front' | 'side'>('perspective');
  const [stats, setStats] = useState({
    totalLayers: 0,
    totalCommands: 0,
    extrusionMoves: 0,
    travelMoves: 0,
    estimatedTime: '0:00'
  });

  // Parse G-code into layers
  const parseGCode = useCallback((gcodeText: string) => {
    const lines = gcodeText.split('\n');
    const parsedLayers: LayerData[] = [];
    let currentZ = 0;
    let currentLayerCommands: GCodeCommand[] = [];
    let layerIndex = 0;
    
    const position = { x: 0, y: 0, z: 0, e: 0 };
    let minPos = { x: Infinity, y: Infinity, z: 0 };
    let maxPos = { x: -Infinity, y: -Infinity, z: 0 };
    
    lines.forEach((line, lineNum) => {
      line = line.trim();
      if (!line || line.startsWith(';')) return;
      
      // Remove comments
      const commentIndex = line.indexOf(';');
      if (commentIndex > 0) {
        line = line.substring(0, commentIndex).trim();
      }
      
      // Parse command
      const match = line.match(/^([GM])(\d+)(.*)/);
      if (!match) return;
      
      const type = match[1];
      const code = parseInt(match[2]);
      const params: Record<string, number> = {};
      
      // Parse parameters
      const paramRegex = /([XYZEF])([-\d.]+)/g;
      let paramMatch;
      while ((paramMatch = paramRegex.exec(match[3])) !== null) {
        params[paramMatch[1]] = parseFloat(paramMatch[2]);
      }
      
      // Track position and layers
      if (type === 'G' && (code === 0 || code === 1)) {
        // Update position
        if (params.X !== undefined) position.x = params.X;
        if (params.Y !== undefined) position.y = params.Y;
        if (params.Z !== undefined) {
          position.z = params.Z;
          
          // New layer detected
          if (position.z !== currentZ && currentLayerCommands.length > 0) {
            parsedLayers.push({
              index: layerIndex++,
              z: currentZ,
              commands: [...currentLayerCommands],
              color: ColorSchemes.layer(layerIndex, 100)
            });
            currentLayerCommands = [];
            currentZ = position.z;
          }
        }
        
        // Track bounding box
        minPos.x = Math.min(minPos.x, position.x);
        minPos.y = Math.min(minPos.y, position.y);
        minPos.z = Math.min(minPos.z, position.z);
        maxPos.x = Math.max(maxPos.x, position.x);
        maxPos.y = Math.max(maxPos.y, position.y);
        maxPos.z = Math.max(maxPos.z, position.z);
        
        currentLayerCommands.push({
          type,
          code,
          params: { ...params },
          layer: layerIndex
        });
      }
    });
    
    // Add last layer
    if (currentLayerCommands.length > 0) {
      parsedLayers.push({
        index: layerIndex,
        z: currentZ,
        commands: currentLayerCommands,
        color: ColorSchemes.layer(layerIndex, parsedLayers.length + 1)
      });
    }
    
    setLayers(parsedLayers);
    setBoundingBox({
      min: [minPos.x, minPos.y, minPos.z],
      max: [maxPos.x, maxPos.y, maxPos.z]
    });
    
    // Update stats
    const extrusionCount = parsedLayers.reduce((acc, layer) => 
      acc + layer.commands.filter(cmd => cmd.params.E !== undefined).length, 0
    );
    const travelCount = parsedLayers.reduce((acc, layer) => 
      acc + layer.commands.filter(cmd => cmd.params.E === undefined).length, 0
    );
    
    setStats({
      totalLayers: parsedLayers.length,
      totalCommands: lines.length,
      extrusionMoves: extrusionCount,
      travelMoves: travelCount,
      estimatedTime: estimatePrintTime(parsedLayers)
    });
    
    return parsedLayers;
  }, []);

  // Initialize Three.js scene
  useEffect(() => {
    if (!mountRef.current) return;
    
    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    scene.fog = new THREE.Fog(0x1a1a1a, 100, 1000);
    sceneRef.current = scene;
    
    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      50,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      2000
    );
    camera.position.set(150, 150, 150);
    cameraRef.current = camera;
    
    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true 
    });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(100, 0, 100);
    controlsRef.current = controls;
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(100, 200, 100);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -200;
    directionalLight.shadow.camera.right = 200;
    directionalLight.shadow.camera.top = 200;
    directionalLight.shadow.camera.bottom = -200;
    scene.add(directionalLight);
    
    // Build plate
    const plateGeometry = new THREE.BoxGeometry(220, 2, 220);
    const plateMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x2a2a2a,
      specular: 0x111111,
      shininess: 10
    });
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.set(110, -1, 110);
    plate.receiveShadow = true;
    scene.add(plate);
    
    // Grid helper
    const gridHelper = new THREE.GridHelper(220, 22, 0x444444, 0x222222);
    gridHelper.position.set(110, 0, 110);
    scene.add(gridHelper);
    
    // Axes helper
    const axesHelper = new THREE.AxesHelper(50);
    axesHelper.position.set(0, 0, 0);
    scene.add(axesHelper);
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    
    // Handle resize
    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Render G-code paths
  useEffect(() => {
    if (!sceneRef.current || layers.length === 0) return;
    
    // Clear existing layers
    layersRef.current.forEach(group => {
      sceneRef.current?.remove(group);
    });
    layersRef.current.clear();
    
    // Create layer groups
    layers.forEach((layer, layerIndex) => {
      const layerGroup = new THREE.Group();
      layerGroup.name = `Layer_${layer.index}`;
      
      const positions: number[] = [];
      const colors: number[] = [];
      let prevPos = { x: 0, y: 0, z: layer.z };
      
      layer.commands.forEach(cmd => {
        if (cmd.type === 'G' && (cmd.code === 0 || cmd.code === 1)) {
          const newPos = {
            x: cmd.params.X ?? prevPos.x,
            y: cmd.params.Y ?? prevPos.y,
            z: cmd.params.Z ?? prevPos.z
          };
          
          const isExtrusion = cmd.params.E !== undefined;
          
          // Filter based on view settings
          if ((isExtrusion && !showExtrusion) || (!isExtrusion && !showTravel)) {
            prevPos = newPos;
            return;
          }
          
          // Add line segment
          positions.push(prevPos.x, prevPos.z, prevPos.y);
          positions.push(newPos.x, newPos.z, newPos.y);
          
          // Color based on mode
          let color: THREE.Color;
          switch (colorMode) {
            case 'speed':
              color = ColorSchemes.speed(cmd.params.F || 3000, 6000);
              break;
            case 'type':
              color = ColorSchemes.type(isExtrusion);
              break;
            case 'layer':
            default:
              color = layer.color;
          }
          
          colors.push(color.r, color.g, color.b);
          colors.push(color.r, color.g, color.b);
          
          prevPos = newPos;
        }
      });
      
      if (positions.length > 0) {
        // Create line geometry
        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        geometry.setColors(colors);
        
        const material = new LineMaterial({
          color: 0xffffff,
          linewidth: 0.003,
          vertexColors: true,
          dashed: false,
          alphaToCoverage: true,
          worldUnits: false
        });
        
        const line = new Line2(geometry, material);
        line.computeLineDistances();
        layerGroup.add(line);
      }
      
      // Control visibility based on current layer
      layerGroup.visible = currentLayer === -1 || layerIndex <= currentLayer;
      
      sceneRef.current.add(layerGroup);
      layersRef.current.set(layer.index, layerGroup);
    });
    
    // Center camera on model
    if (controlsRef.current && cameraRef.current) {
      const center = [
        (boundingBox.min[0] + boundingBox.max[0]) / 2,
        (boundingBox.min[2] + boundingBox.max[2]) / 2,
        (boundingBox.min[1] + boundingBox.max[1]) / 2
      ];
      controlsRef.current.target.set(center[0], center[1], center[2]);
      
      const size = Math.max(
        boundingBox.max[0] - boundingBox.min[0],
        boundingBox.max[1] - boundingBox.min[1],
        boundingBox.max[2] - boundingBox.min[2]
      );
      cameraRef.current.position.set(
        center[0] + size,
        center[1] + size,
        center[2] + size
      );
    }
  }, [layers, currentLayer, showTravel, showExtrusion, colorMode, boundingBox]);

  // Parse G-code when provided
  useEffect(() => {
    if (gcode) {
      parseGCode(gcode);
    }
  }, [gcode, parseGCode]);

  // Helper functions
  const estimatePrintTime = (layers: LayerData[]): string => {
    // Simplified time estimation
    const totalMoves = layers.reduce((acc, layer) => acc + layer.commands.length, 0);
    const minutes = Math.round(totalMoves * 0.02); // Rough estimate
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}:${mins.toString().padStart(2, '0')}`;
  };

  const handleViewChange = (view: typeof viewMode) => {
    if (!cameraRef.current || !controlsRef.current) return;
    
    const center = controlsRef.current.target;
    const distance = 300;
    
    switch (view) {
      case 'top':
        cameraRef.current.position.set(center.x, center.y + distance, center.z);
        cameraRef.current.lookAt(center);
        break;
      case 'front':
        cameraRef.current.position.set(center.x, center.y, center.z + distance);
        cameraRef.current.lookAt(center);
        break;
      case 'side':
        cameraRef.current.position.set(center.x + distance, center.y, center.z);
        cameraRef.current.lookAt(center);
        break;
      case 'perspective':
      default:
        cameraRef.current.position.set(
          center.x + distance * 0.7,
          center.y + distance * 0.7,
          center.z + distance * 0.7
        );
        cameraRef.current.lookAt(center);
    }
    
    setViewMode(view);
  };

  return (
    <div className="w-full h-full relative bg-gray-900">
      {/* 3D Viewport */}
      <div ref={mountRef} className="w-full h-full" />
      
      {/* Controls Panel */}
      <div className="absolute top-4 left-4 bg-gray-800 bg-opacity-90 rounded-lg p-4 text-white shadow-xl">
        <h3 className="text-lg font-semibold mb-3">Visualization Controls</h3>
        
        {/* View Mode */}
        <div className="mb-4">
          <label className="text-sm text-gray-300 mb-1 block">View</label>
          <div className="grid grid-cols-2 gap-1">
            {(['perspective', 'top', 'front', 'side'] as const).map(view => (
              <button
                key={view}
                onClick={() => handleViewChange(view)}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  viewMode === view 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {view.charAt(0).toUpperCase() + view.slice(1)}
              </button>
            ))}
          </div>
        </div>
        
        {/* Display Options */}
        <div className="mb-4 space-y-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={showExtrusion}
              onChange={(e) => e.target.checked}
              className="rounded"
            />
            <span className="text-sm">Show Extrusion</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={showTravel}
              onChange={(e) => e.target.checked}
              className="rounded"
            />
            <span className="text-sm">Show Travel</span>
          </label>
        </div>
        
        {/* Color Mode */}
        <div className="mb-4">
          <label className="text-sm text-gray-300 mb-1 block">Color Mode</label>
          <select 
            value={colorMode}
            className="w-full px-2 py-1 text-sm bg-gray-700 rounded"
          >
            <option value="layer">By Layer</option>
            <option value="speed">By Speed</option>
            <option value="type">By Type</option>
            <option value="temperature">By Temperature</option>
          </select>
        </div>
        
        {/* Layer Slider */}
        <div className="mb-4">
          <label className="text-sm text-gray-300 mb-1 block">
            Layer: {currentLayer === -1 ? 'All' : `${currentLayer + 1} / ${layers.length}`}
          </label>
          <input
            type="range"
            min="-1"
            max={layers.length - 1}
            value={currentLayer}
            onChange={(e) => onLayerChange?.(parseInt(e.target.value))}
            className="w-full"
          />
        </div>
      </div>
      
      {/* Statistics Panel */}
      <div className="absolute top-4 right-4 bg-gray-800 bg-opacity-90 rounded-lg p-4 text-white shadow-xl">
        <h3 className="text-lg font-semibold mb-3">Print Statistics</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Layers:</span>
            <span>{stats.totalLayers}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Commands:</span>
            <span>{stats.totalCommands}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Extrusion:</span>
            <span>{stats.extrusionMoves}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Travel:</span>
            <span>{stats.travelMoves}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Est. Time:</span>
            <span>{stats.estimatedTime}</span>
          </div>
        </div>
      </div>
      
      {/* Animation Controls */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-800 bg-opacity-90 rounded-lg px-4 py-2 flex items-center space-x-4">
        <button
          onClick={() => onLayerChange?.(0)}
          className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6.5 5.5l7 4.5-7 4.5v-9z" />
            <rect x="4" y="5.5" width="2" height="9" />
          </svg>
        </button>
        <button
          onClick={() => setIsAnimating(!isAnimating)}
          className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
        >
          {isAnimating ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <rect x="5" y="6" width="3" height="8" />
              <rect x="12" y="6" width="3" height="8" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.5 5.5l7 4.5-7 4.5v-9z" />
            </svg>
          )}
        </button>
        <button
          onClick={() => onLayerChange?.(layers.length - 1)}
          className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M13.5 5.5l-7 4.5 7 4.5v-9z" />
            <rect x="14" y="5.5" width="2" height="9" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default GCodeVisualizer;
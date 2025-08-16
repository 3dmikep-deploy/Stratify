import React, { useState } from 'react';
import './AnalysisResults.css';

const AnalysisResults = ({ results, onExport }) => {
  const [activeTab, setActiveTab] = useState('overview');

  if (!results || !results.analysis) {
    return (
      <div className="results-container">
        <div className="no-results">
          <p>No analysis results available</p>
        </div>
      </div>
    );
  }

  const { analysis } = results;
  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return hours > 0 ? `${hours}h ${minutes}m ${secs}s` : `${minutes}m ${secs}s`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const renderOverview = () => (
    <div className="overview-tab">
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Print Time</h3>
          <div className="stat-value">{formatDuration(analysis.estimatedPrintTime || 0)}</div>
        </div>
        <div className="stat-card">
          <h3>Material Used</h3>
          <div className="stat-value">{(analysis.totalFilamentUsed || 0).toFixed(2)}g</div>
        </div>
        <div className="stat-card">
          <h3>Layers</h3>
          <div className="stat-value">{analysis.layerCount || 0}</div>
        </div>
        <div className="stat-card">
          <h3>Commands</h3>
          <div className="stat-value">{analysis.totalCommands || 0}</div>
        </div>
      </div>

      {analysis.metadata && (
        <div className="metadata-section">
          <h3>File Information</h3>
          <div className="metadata-grid">
            <div className="metadata-item">
              <strong>Slicer:</strong> {analysis.metadata.slicer || 'Unknown'}
            </div>
            <div className="metadata-item">
              <strong>Layer Height:</strong> {analysis.metadata.layerHeight || 'N/A'}mm
            </div>
            <div className="metadata-item">
              <strong>Nozzle Temp:</strong> {analysis.metadata.nozzleTemperature || 'N/A'}°C
            </div>
            <div className="metadata-item">
              <strong>Bed Temp:</strong> {analysis.metadata.bedTemperature || 'N/A'}°C
            </div>
            <div className="metadata-item">
              <strong>Print Speed:</strong> {analysis.metadata.printSpeed || 'N/A'}mm/s
            </div>
            <div className="metadata-item">
              <strong>Infill:</strong> {analysis.metadata.infillDensity || 'N/A'}%
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderLayers = () => (
    <div className="layers-tab">
      <h3>Layer Analysis</h3>
      {analysis.layers && analysis.layers.length > 0 ? (
        <div className="layers-table-container">
          <table className="layers-table">
            <thead>
              <tr>
                <th>Layer</th>
                <th>Z Height</th>
                <th>Commands</th>
                <th>Extrusion</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {analysis.layers.slice(0, 20).map((layer, index) => (
                <tr key={index}>
                  <td>{layer.index || index + 1}</td>
                  <td>{layer.z?.toFixed(2) || 'N/A'}mm</td>
                  <td>{layer.commands || 0}</td>
                  <td>{layer.extrusionMoves || 0}</td>
                  <td>{formatDuration(layer.printTime || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {analysis.layers.length > 20 && (
            <p className="table-note">
              Showing first 20 layers of {analysis.layers.length} total
            </p>
          )}
        </div>
      ) : (
        <p>No layer data available</p>
      )}
    </div>
  );

  const renderOptimizations = () => (
    <div className="optimizations-tab">
      <h3>Optimization Suggestions</h3>
      {analysis.suggestions && analysis.suggestions.length > 0 ? (
        <div className="suggestions-list">
          {analysis.suggestions.map((suggestion, index) => (
            <div key={index} className={`suggestion-card ${suggestion.priority || 'low'}`}>
              <div className="suggestion-header">
                <h4>{suggestion.title || 'Optimization Suggestion'}</h4>
                <span className={`priority-badge ${suggestion.priority || 'low'}`}>
                  {(suggestion.priority || 'low').toUpperCase()}
                </span>
              </div>
              <p className="suggestion-description">
                {suggestion.description || 'No description available'}
              </p>
              {suggestion.potentialSavings && (
                <div className="potential-savings">
                  <strong>Potential Savings:</strong>
                  <ul>
                    {suggestion.potentialSavings.time && (
                      <li>Time: {formatDuration(suggestion.potentialSavings.time)}</li>
                    )}
                    {suggestion.potentialSavings.material && (
                      <li>Material: {suggestion.potentialSavings.material}g</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="no-suggestions">
          <p>No optimization suggestions available for this file.</p>
          <p>This usually means your G-code is already well optimized!</p>
        </div>
      )}
    </div>
  );

  const renderStatistics = () => (
    <div className="statistics-tab">
      <h3>Detailed Statistics</h3>
      <div className="statistics-grid">
        <div className="stat-group">
          <h4>Movement Analysis</h4>
          <div className="stat-item">
            <span>Total Moves:</span>
            <span>{analysis.totalMoves || 0}</span>
          </div>
          <div className="stat-item">
            <span>Extrusion Moves:</span>
            <span>{analysis.extrusionMoves || 0}</span>
          </div>
          <div className="stat-item">
            <span>Travel Moves:</span>
            <span>{analysis.travelMoves || 0}</span>
          </div>
          <div className="stat-item">
            <span>Total Distance:</span>
            <span>{(analysis.totalDistance || 0).toFixed(2)}mm</span>
          </div>
        </div>

        <div className="stat-group">
          <h4>Temperature Analysis</h4>
          <div className="stat-item">
            <span>Max Hotend Temp:</span>
            <span>{analysis.maxHotendTemp || 0}°C</span>
          </div>
          <div className="stat-item">
            <span>Max Bed Temp:</span>
            <span>{analysis.maxBedTemp || 0}°C</span>
          </div>
          <div className="stat-item">
            <span>Temp Changes:</span>
            <span>{analysis.temperatureChanges || 0}</span>
          </div>
        </div>

        <div className="stat-group">
          <h4>Quality Metrics</h4>
          <div className="stat-item">
            <span>Retraction Count:</span>
            <span>{analysis.retractionCount || 0}</span>
          </div>
          <div className="stat-item">
            <span>Speed Changes:</span>
            <span>{analysis.speedChanges || 0}</span>
          </div>
          <div className="stat-item">
            <span>Z-hops:</span>
            <span>{analysis.zHops || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );

  const tabs = [
    { id: 'overview', label: 'Overview', content: renderOverview },
    { id: 'layers', label: 'Layers', content: renderLayers },
    { id: 'optimizations', label: 'Suggestions', content: renderOptimizations },
    { id: 'statistics', label: 'Statistics', content: renderStatistics },
  ];

  return (
    <div className="results-container">
      <div className="results-header">
        <h2>Analysis Results</h2>
        <div className="export-buttons">
          <button onClick={() => onExport && onExport('json')} className="export-btn">
            Export JSON
          </button>
          <button onClick={() => onExport && onExport('csv')} className="export-btn">
            Export CSV
          </button>
          <button onClick={() => onExport && onExport('pdf')} className="export-btn">
            Export PDF
          </button>
        </div>
      </div>

      <div className="tabs-container">
        <div className="tabs-header">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="tab-content">
          {tabs.find(tab => tab.id === activeTab)?.content()}
        </div>
      </div>
    </div>
  );
};

export default AnalysisResults;

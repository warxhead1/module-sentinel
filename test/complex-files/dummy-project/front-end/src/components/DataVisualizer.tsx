import React, { useState } from 'react';
import { ProcessingResult } from '../App';

export interface DataVisualizerProps {
  onGenerate: (dataSet: string) => Promise<void>;
  isProcessing: boolean;
  results: ProcessingResult[];
}

export const DataVisualizer: React.FC<DataVisualizerProps> = ({
  onGenerate,
  isProcessing,
  results
}) => {
  const [selectedDataSet, setSelectedDataSet] = useState('terrain_visualization');

  const dataSetOptions = [
    { value: 'terrain_visualization', label: 'Terrain Visualization' },
    { value: 'heightmap_display', label: 'Height Map Display' },
    { value: 'biome_distribution', label: 'Biome Distribution' },
    { value: 'chart_analysis', label: 'Chart Analysis' },
    { value: 'graph_network', label: 'Network Graph' }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onGenerate(selectedDataSet);
  };

  return (
    <div className="data-visualizer">
      <h2>Data Visualization</h2>
      <p>Generate visual representations using our Python visualization pipeline</p>
      
      <form onSubmit={handleSubmit} className="visualization-form">
        <div className="input-group">
          <label htmlFor="dataset-select">Data Set:</label>
          <select
            id="dataset-select"
            value={selectedDataSet}
            onChange={(e) => setSelectedDataSet(e.target.value)}
            disabled={isProcessing}
          >
            {dataSetOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        
        <button type="submit" disabled={isProcessing} className="generate-button">
          {isProcessing ? 'Generating...' : 'Generate Visualization'}
        </button>
      </form>
      
      <div className="results-section">
        <h3>Visualization Results ({results.length})</h3>
        {results.length === 0 ? (
          <p>No visualizations yet. Generate some data to see results here.</p>
        ) : (
          <div className="results-grid">
            {results.map(result => (
              <div key={result.id} className="visualization-item">
                <div className="visualization-header">
                  <span className="result-type">{result.type}</span>
                  <span className="result-timestamp">
                    {result.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <div className="visualization-content">
                  <div className="image-placeholder">
                    <p>Image: {result.data.imageUrl}</p>
                    <p>Size: {result.data.metadata?.width}x{result.data.metadata?.height}</p>
                    <p>Format: {result.data.metadata?.format}</p>
                    <p>Processing Time: {result.data.metadata?.processingTime}ms</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
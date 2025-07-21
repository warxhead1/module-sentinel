import React, { useState } from 'react';
import { ProcessingResult } from '../App';

export interface TerrainProcessorProps {
  onProcess: (coordinates: { x: number; y: number; z: number }) => Promise<void>;
  isProcessing: boolean;
  results: ProcessingResult[];
}

export const TerrainProcessor: React.FC<TerrainProcessorProps> = ({
  onProcess,
  isProcessing,
  results
}) => {
  const [coordinates, setCoordinates] = useState({ x: 0, y: 0, z: 0 });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onProcess(coordinates);
  };

  const handleInputChange = (axis: 'x' | 'y' | 'z') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0;
    setCoordinates(prev => ({ ...prev, [axis]: value }));
  };

  return (
    <div className="terrain-processor">
      <h2>Terrain Processing</h2>
      <p>Generate terrain data using our multi-language processing pipeline</p>
      
      <form onSubmit={handleSubmit} className="coordinate-form">
        <div className="input-group">
          <label htmlFor="x-coord">X Coordinate:</label>
          <input
            id="x-coord"
            type="number"
            value={coordinates.x}
            onChange={handleInputChange('x')}
            disabled={isProcessing}
          />
        </div>
        
        <div className="input-group">
          <label htmlFor="y-coord">Y Coordinate:</label>
          <input
            id="y-coord"
            type="number"
            value={coordinates.y}
            onChange={handleInputChange('y')}
            disabled={isProcessing}
          />
        </div>
        
        <div className="input-group">
          <label htmlFor="z-coord">Z Coordinate:</label>
          <input
            id="z-coord"
            type="number"
            value={coordinates.z}
            onChange={handleInputChange('z')}
            disabled={isProcessing}
          />
        </div>
        
        <button type="submit" disabled={isProcessing} className="process-button">
          {isProcessing ? 'Processing...' : 'Process Terrain'}
        </button>
      </form>
      
      <div className="results-section">
        <h3>Processing Results ({results.length})</h3>
        {results.length === 0 ? (
          <p>No results yet. Process some terrain data to see results here.</p>
        ) : (
          <div className="results-list">
            {results.map(result => (
              <div key={result.id} className="result-item">
                <div className="result-header">
                  <span className="result-type">{result.type}</span>
                  <span className="result-timestamp">
                    {result.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <div className="result-data">
                  <p>Coordinates: ({result.data.coordinates?.x}, {result.data.coordinates?.y}, {result.data.coordinates?.z})</p>
                  <p>Height Map Size: {result.data.heightMap?.length || 0} x {result.data.heightMap?.[0]?.length || 0}</p>
                  <p>Biomes Found: {result.data.biomeData?.length || 0}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { TerrainProcessor } from './components/TerrainProcessor';
import { DataVisualizer } from './components/DataVisualizer';
import { ApiService } from './services/ApiService';

export interface AppState {
  isProcessing: boolean;
  results: ProcessingResult[];
}

export interface ProcessingResult {
  id: string;
  type: 'terrain' | 'visualization';
  data: any;
  timestamp: Date;
}

export class App extends React.Component<{}, AppState> {
  private apiService: ApiService;

  constructor(props: {}) {
    super(props);
    this.state = {
      isProcessing: false,
      results: []
    };
    this.apiService = new ApiService();
  }

  async processTerrainData(coordinates: { x: number; y: number; z: number }): Promise<void> {
    this.setState({ isProcessing: true });
    
    try {
      // Call backend API which will process through Python
      const result = await this.apiService.processTerrain(coordinates);
      
      this.setState(prevState => ({
        isProcessing: false,
        results: [...prevState.results, {
          id: Date.now().toString(),
          type: 'terrain',
          data: result,
          timestamp: new Date()
        }]
      }));
    } catch (error) {
      console.error('Terrain processing failed:', error);
      this.setState({ isProcessing: false });
    }
  }

  async generateVisualization(dataSet: string): Promise<void> {
    this.setState({ isProcessing: true });
    
    try {
      const result = await this.apiService.generateVisualization(dataSet);
      
      this.setState(prevState => ({
        isProcessing: false,
        results: [...prevState.results, {
          id: Date.now().toString(),
          type: 'visualization',
          data: result,
          timestamp: new Date()
        }]
      }));
    } catch (error) {
      console.error('Visualization generation failed:', error);
      this.setState({ isProcessing: false });
    }
  }

  render(): React.ReactElement {
    return (
      <Router>
        <div className="app">
          <nav className="navigation">
            <Link to="/">Home</Link>
            <Link to="/terrain">Terrain Processing</Link>
            <Link to="/visualization">Data Visualization</Link>
          </nav>
          
          <main className="main-content">
            <Routes>
              <Route 
                path="/" 
                element={
                  <div>
                    <h1>Planet Generation Demo</h1>
                    <p>Multi-language processing pipeline demonstration</p>
                  </div>
                } 
              />
              <Route 
                path="/terrain" 
                element={
                  <TerrainProcessor 
                    onProcess={(coords) => this.processTerrainData(coords)}
                    isProcessing={this.state.isProcessing}
                    results={this.state.results.filter(r => r.type === 'terrain')}
                  />
                } 
              />
              <Route 
                path="/visualization" 
                element={
                  <DataVisualizer 
                    onGenerate={(dataSet) => this.generateVisualization(dataSet)}
                    isProcessing={this.state.isProcessing}
                    results={this.state.results.filter(r => r.type === 'visualization')}
                  />
                } 
              />
            </Routes>
          </main>
        </div>
      </Router>
    );
  }
}
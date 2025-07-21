import axios, { AxiosResponse } from 'axios';

export interface TerrainData {
  coordinates: { x: number; y: number; z: number };
  heightMap: number[][];
  biomeData: BiomeInfo[];
}

export interface BiomeInfo {
  type: 'forest' | 'desert' | 'mountain' | 'ocean';
  coverage: number;
  characteristics: Record<string, any>;
}

export interface VisualizationData {
  imageUrl: string;
  metadata: {
    width: number;
    height: number;
    format: string;
    processingTime: number;
  };
}

export class ApiService {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string = 'http://localhost:3001/api', timeout: number = 30000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
    
    // Configure axios defaults
    axios.defaults.timeout = this.timeout;
    axios.defaults.headers.common['Content-Type'] = 'application/json';
  }

  /**
   * Process terrain data through the backend Python pipeline
   */
  async processTerrain(coordinates: { x: number; y: number; z: number }): Promise<TerrainData> {
    try {
      const response: AxiosResponse<TerrainData> = await axios.post(
        `${this.baseUrl}/terrain/process`,
        { coordinates }
      );
      
      return this.validateTerrainData(response.data);
    } catch (error) {
      throw this.handleApiError('Terrain processing', error);
    }
  }

  /**
   * Generate visualization through the backend
   */
  async generateVisualization(dataSet: string): Promise<VisualizationData> {
    try {
      const response: AxiosResponse<VisualizationData> = await axios.post(
        `${this.baseUrl}/visualization/generate`,
        { dataSet, format: 'png' }
      );
      
      return this.validateVisualizationData(response.data);
    } catch (error) {
      throw this.handleApiError('Visualization generation', error);
    }
  }

  /**
   * Get processing status
   */
  async getProcessingStatus(jobId: string): Promise<{ status: string; progress: number }> {
    try {
      const response = await axios.get(`${this.baseUrl}/status/${jobId}`);
      return response.data;
    } catch (error) {
      throw this.handleApiError('Status check', error);
    }
  }

  private validateTerrainData(data: any): TerrainData {
    if (!data.coordinates || !data.heightMap) {
      throw new Error('Invalid terrain data received from server');
    }
    
    return {
      coordinates: data.coordinates,
      heightMap: data.heightMap,
      biomeData: data.biomeData || []
    };
  }

  private validateVisualizationData(data: any): VisualizationData {
    if (!data.imageUrl || !data.metadata) {
      throw new Error('Invalid visualization data received from server');
    }
    
    return {
      imageUrl: data.imageUrl,
      metadata: {
        width: data.metadata.width || 0,
        height: data.metadata.height || 0,
        format: data.metadata.format || 'unknown',
        processingTime: data.metadata.processingTime || 0
      }
    };
  }

  private handleApiError(operation: string, error: any): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      
      return new Error(`${operation} failed (${status}): ${message}`);
    }
    
    return new Error(`${operation} failed: ${error.message || 'Unknown error'}`);
  }
}
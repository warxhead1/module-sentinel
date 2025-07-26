export interface TerrainData {
  coordinates: { x: number; y: number; z: number };
  heightMap: number[][];
  biomeData: any[];
}

export class ApiService {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3001/api') {
    this.baseUrl = baseUrl;
  }

  async processTerrain(coordinates: { x: number; y: number; z: number }): Promise<TerrainData> {
    // Mock API call that would trigger the backend
    const response = await fetch(`${this.baseUrl}/terrain/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates })
    });
    
    return response.json();
  }
}
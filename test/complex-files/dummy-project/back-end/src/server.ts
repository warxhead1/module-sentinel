import { spawn } from 'child_process';
import * as path from 'path';

export interface TerrainProcessingRequest {
  coordinates: { x: number; y: number; z: number };
}

export interface TerrainProcessingResponse {
  coordinates: { x: number; y: number; z: number };
  heightMap: number[][];
  biomeData: any[];
}

export class BackendServer {
  private pythonScriptsPath: string;

  constructor() {
    this.pythonScriptsPath = path.join(process.cwd(), '..', 'systems');
  }

  async handleTerrainProcessing(request: TerrainProcessingRequest): Promise<TerrainProcessingResponse> {
    const { coordinates } = request;
    const pythonResult = await this.callPythonScript('terrain_generator.py', {
      coordinates,
      algorithm: 'perlin',
      seed: Math.floor(Math.random() * 10000)
    });
    
    return this.processPythonTerrainResult(pythonResult, coordinates);
  }

  private async callPythonScript(scriptName: string, args: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(this.pythonScriptsPath, scriptName);
      const pythonProcess = spawn('python3', [scriptPath, JSON.stringify(args)]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim());
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse Python script output`));
          }
        } else {
          reject(new Error(`Python script failed with code ${code}: ${stderr}`));
        }
      });
    });
  }

  private processPythonTerrainResult(pythonResult: any, coordinates: any): TerrainProcessingResponse {
    return {
      coordinates,
      heightMap: pythonResult.heightMap || [],
      biomeData: pythonResult.biomes || []
    };
  }
}
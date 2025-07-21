import Hapi from '@hapi/hapi';
import Boom from '@hapi/boom';
import Joi from 'joi';
import { spawn } from 'child_process';
import * as path from 'path';

export interface TerrainProcessingRequest {
  coordinates: {
    x: number;
    y: number;
    z: number;
  };
}

export interface TerrainProcessingResponse {
  coordinates: { x: number; y: number; z: number };
  heightMap: number[][];
  biomeData: BiomeInfo[];
}

export interface BiomeInfo {
  type: 'forest' | 'desert' | 'mountain' | 'ocean';
  coverage: number;
  characteristics: Record<string, any>;
}

export interface VisualizationRequest {
  dataSet: string;
  format: string;
}

export interface VisualizationResponse {
  imageUrl: string;
  metadata: {
    width: number;
    height: number;
    format: string;
    processingTime: number;
  };
}

export class BackendServer {
  private server: Hapi.Server;
  private pythonScriptsPath: string;

  constructor() {
    this.server = Hapi.server({
      port: 3001,
      host: 'localhost',
      routes: {
        cors: {
          origin: ['http://localhost:3000'], // React dev server
          headers: ['Accept', 'Content-Type'],
          additionalHeaders: ['X-Requested-With']
        }
      }
    });

    this.pythonScriptsPath = path.join(process.cwd(), '..', 'systems');
  }

  async init(): Promise<void> {
    await this.registerRoutes();
    await this.server.start();
    console.log(`🚀 Backend server running on ${this.server.info.uri}`);
  }

  private async registerRoutes(): Promise<void> {
    // Terrain processing endpoint
    this.server.route({
      method: 'POST',
      path: '/api/terrain/process',
      handler: this.handleTerrainProcessing.bind(this),
      options: {
        validate: {
          payload: Joi.object({
            coordinates: Joi.object({
              x: Joi.number().required(),
              y: Joi.number().required(),
              z: Joi.number().required()
            }).required()
          }).required()
        }
      }
    });

    // Visualization generation endpoint
    this.server.route({
      method: 'POST',
      path: '/api/visualization/generate',
      handler: this.handleVisualizationGeneration.bind(this),
      options: {
        validate: {
          payload: Joi.object({
            dataSet: Joi.string().required(),
            format: Joi.string().default('png')
          }).required()
        }
      }
    });

    // Status check endpoint
    this.server.route({
      method: 'GET',
      path: '/api/status/{jobId}',
      handler: this.handleStatusCheck.bind(this),
      options: {
        validate: {
          params: Joi.object({
            jobId: Joi.string().required()
          })
        }
      }
    });

    // Health check endpoint
    this.server.route({
      method: 'GET',
      path: '/api/health',
      handler: async (request, h) => {
        return { status: 'ok', timestamp: new Date().toISOString() };
      }
    });
  }

  private async handleTerrainProcessing(request: Hapi.Request, h: Hapi.ResponseToolkit): Promise<TerrainProcessingResponse> {
    try {
      const { coordinates } = request.payload as TerrainProcessingRequest;
      
      console.log(`Processing terrain at coordinates: (${coordinates.x}, ${coordinates.y}, ${coordinates.z})`);

      // Call Python terrain generation script
      const pythonResult = await this.callPythonScript('terrain_generator.py', {
        coordinates,
        algorithm: 'perlin_noise',
        seed: Math.floor(Math.random() * 10000)
      });

      // Process the Python result
      const terrainData = this.processPythonTerrainResult(pythonResult, coordinates);

      console.log(`✅ Terrain processing completed: ${terrainData.heightMap.length}x${terrainData.heightMap[0]?.length} heightmap`);

      return terrainData;
    } catch (error) {
      console.error('Terrain processing error:', error);
      throw Boom.internal('Terrain processing failed', error);
    }
  }

  private async handleVisualizationGeneration(request: Hapi.Request, h: Hapi.ResponseToolkit): Promise<VisualizationResponse> {
    try {
      const { dataSet, format } = request.payload as VisualizationRequest;
      
      console.log(`Generating visualization for dataset: ${dataSet}, format: ${format}`);

      // Call Python visualization script
      const pythonResult = await this.callPythonScript('visualizer.py', {
        dataSet,
        format,
        outputDir: '/tmp/visualizations'
      });

      // Process the Python result
      const visualizationData = this.processPythonVisualizationResult(pythonResult);

      console.log(`✅ Visualization completed: ${visualizationData.imageUrl}`);

      return visualizationData;
    } catch (error) {
      console.error('Visualization generation error:', error);
      throw Boom.internal('Visualization generation failed', error);
    }
  }

  private async handleStatusCheck(request: Hapi.Request, h: Hapi.ResponseToolkit): Promise<{ status: string; progress: number }> {
    const { jobId } = request.params;
    
    // Mock status check - in real implementation, this would check job queue
    return {
      status: 'completed',
      progress: 100
    };
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
            reject(new Error(`Failed to parse Python script output: ${error.message}`));
          }
        } else {
          reject(new Error(`Python script failed with code ${code}: ${stderr}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to spawn Python process: ${error.message}`));
      });
    });
  }

  private processPythonTerrainResult(pythonResult: any, coordinates: { x: number; y: number; z: number }): TerrainProcessingResponse {
    // Process the result from Python terrain generator
    const heightMap = pythonResult.heightMap || this.generateMockHeightMap();
    const biomeData = pythonResult.biomes || this.generateMockBiomes();

    return {
      coordinates,
      heightMap,
      biomeData
    };
  }

  private processPythonVisualizationResult(pythonResult: any): VisualizationResponse {
    return {
      imageUrl: pythonResult.imageUrl || '/tmp/mock-visualization.png',
      metadata: {
        width: pythonResult.width || 512,
        height: pythonResult.height || 512,
        format: pythonResult.format || 'png',
        processingTime: pythonResult.processingTime || 150
      }
    };
  }

  private generateMockHeightMap(): number[][] {
    // Generate a simple 32x32 heightmap for testing
    const size = 32;
    const heightMap: number[][] = [];
    
    for (let y = 0; y < size; y++) {
      const row: number[] = [];
      for (let x = 0; x < size; x++) {
        // Simple noise-like pattern
        const height = Math.sin(x * 0.1) * Math.cos(y * 0.1) * 100 + 
                      Math.random() * 50;
        row.push(Math.max(0, height));
      }
      heightMap.push(row);
    }
    
    return heightMap;
  }

  private generateMockBiomes(): BiomeInfo[] {
    return [
      {
        type: 'forest',
        coverage: 0.4,
        characteristics: {
          treeTypes: ['oak', 'pine', 'birch'],
          density: 0.8
        }
      },
      {
        type: 'mountain',
        coverage: 0.3,
        characteristics: {
          elevation: 2500,
          rockType: 'granite'
        }
      },
      {
        type: 'ocean',
        coverage: 0.2,
        characteristics: {
          depth: 50,
          salinity: 0.035
        }
      },
      {
        type: 'desert',
        coverage: 0.1,
        characteristics: {
          temperature: 45,
          sandType: 'quartz'
        }
      }
    ];
  }

  async stop(): Promise<void> {
    await this.server.stop();
    console.log('Backend server stopped');
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new BackendServer();
  
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
    process.exit(1);
  });

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await server.stop();
    process.exit(0);
  });

  server.init().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
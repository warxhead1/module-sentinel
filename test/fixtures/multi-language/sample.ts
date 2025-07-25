/**
 * Sample TypeScript module for testing multi-language parsing.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';

// Type definitions
export interface TerrainPoint {
  x: number;
  y: number;
  elevation: number;
  biome: BiomeType;
}

export type BiomeType = 'ocean' | 'plains' | 'hills' | 'mountains';

export enum TerrainQuality {
  Low = 'LOW',
  Medium = 'MEDIUM',
  High = 'HIGH',
  Ultra = 'ULTRA'
}

// Generic type for terrain data
export type TerrainData<T extends TerrainPoint = TerrainPoint> = {
  points: T[];
  metadata: {
    generatedAt: Date;
    quality: TerrainQuality;
  };
};

// Abstract base class
export abstract class TerrainGenerator extends EventEmitter {
  protected readonly seed: number;
  private _cache: Map<string, TerrainPoint>;

  constructor(seed: number = 42) {
    super();
    this.seed = seed;
    this._cache = new Map();
  }

  abstract generate(x: number, y: number): TerrainPoint;

  get cacheSize(): number {
    return this._cache.size;
  }

  protected getCacheKey(x: number, y: number): string {
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }
}

// Decorator for performance logging
function LogPerformance(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;

  descriptor.value = function (...args: any[]) {
    const start = performance.now();
    const result = originalMethod.apply(this, args);
    const end = performance.now();
    console.log(`${propertyKey} took ${end - start}ms`);
    return result;
  };

  return descriptor;
}

// Interface implementation
interface ITerrainPersistence {
  save(data: TerrainData): Promise<void>;
  load(path: string): Promise<TerrainData>;
}

// Concrete implementation
export class NoiseTerrainGenerator extends TerrainGenerator implements ITerrainPersistence {
  private octaves: number;
  private frequency: number;

  constructor(seed: number = 42, octaves: number = 6) {
    super(seed);
    this.octaves = octaves;
    this.frequency = 0.1;
  }

  @LogPerformance
  generate(x: number, y: number): TerrainPoint {
    const cacheKey = this.getCacheKey(x, y);
    const cached = this._cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const elevation = this.calculateNoise(x, y);
    const biome = this.determineBiome(elevation);
    
    const point: TerrainPoint = { x, y, elevation, biome };
    this._cache.set(cacheKey, point);
    
    this.emit('pointGenerated', point);
    return point;
  }

  private calculateNoise(x: number, y: number): number {
    // Simplified noise calculation
    return (x + y) * this.frequency * this.octaves;
  }

  private determineBiome(elevation: number): BiomeType {
    if (elevation < 0.3) return 'ocean';
    if (elevation < 0.6) return 'plains';
    if (elevation < 0.8) return 'hills';
    return 'mountains';
  }

  async save(data: TerrainData): Promise<void> {
    const json = JSON.stringify(data, null, 2);
    await fs.writeFile('terrain.json', json);
  }

  async load(path: string): Promise<TerrainData> {
    const json = await fs.readFile(path, 'utf-8');
    return JSON.parse(json);
  }
}

// React component example
export const TerrainViewer: React.FC<{ generator: TerrainGenerator }> = ({ generator }) => {
  const [points, setPoints] = React.useState<TerrainPoint[]>([]);

  React.useEffect(() => {
    const handlePointGenerated = (point: TerrainPoint) => {
      setPoints(prev => [...prev, point]);
    };

    generator.on('pointGenerated', handlePointGenerated);
    return () => {
      generator.off('pointGenerated', handlePointGenerated);
    };
  }, [generator]);

  return (
    <div className="terrain-viewer">
      {points.map((point, index) => (
        <div key={index} className="terrain-point">
          {point.x}, {point.y}: {point.biome}
        </div>
      ))}
    </div>
  );
};

// Custom React hook
export function useTerrainGenerator(seed?: number): NoiseTerrainGenerator {
  const generator = React.useMemo(() => new NoiseTerrainGenerator(seed), [seed]);
  
  React.useEffect(() => {
    return () => {
      generator.removeAllListeners();
    };
  }, [generator]);

  return generator;
}

// Type guard
export function isTerrainPoint(obj: any): obj is TerrainPoint {
  return (
    typeof obj === 'object' &&
    'x' in obj &&
    'y' in obj &&
    'elevation' in obj &&
    'biome' in obj
  );
}

// Namespace
export namespace TerrainUtils {
  export function normalizeCoordinates(x: number, y: number): [number, number] {
    return [x % 1.0, y % 1.0];
  }

  export const MAX_ELEVATION = 1.0;
  export const MIN_ELEVATION = 0.0;
}
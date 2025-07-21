#!/usr/bin/env python3
"""
Terrain Generator - Python backend processing script
Generates terrain data using various algorithms for the multi-language demo
"""

import json
import sys
import numpy as np
import math
import random
from typing import Dict, List, Any, Tuple
from dataclasses import dataclass, asdict


@dataclass
class Coordinates:
    x: float
    y: float
    z: float


@dataclass
class BiomeInfo:
    type: str
    coverage: float
    characteristics: Dict[str, Any]


@dataclass
class TerrainResult:
    heightMap: List[List[float]]
    biomes: List[Dict[str, Any]]
    processingTime: float
    algorithm: str
    seed: int


class NoiseGenerator:
    """Perlin noise implementation for terrain generation"""
    
    def __init__(self, seed: int = None):
        self.seed = seed or random.randint(0, 10000)
        random.seed(self.seed)
        np.random.seed(self.seed)
        
        # Generate permutation table for Perlin noise
        self.perm = list(range(256))
        random.shuffle(self.perm)
        self.perm *= 2
    
    def fade(self, t: float) -> float:
        """Fade function for smooth interpolation"""
        return t * t * t * (t * (t * 6 - 15) + 10)
    
    def lerp(self, t: float, a: float, b: float) -> float:
        """Linear interpolation"""
        return a + t * (b - a)
    
    def grad(self, hash_val: int, x: float, y: float) -> float:
        """Gradient function"""
        h = hash_val & 15
        u = x if h < 8 else y
        v = y if h < 4 else (x if h == 12 or h == 14 else 0)
        return (u if (h & 1) == 0 else -u) + (v if (h & 2) == 0 else -v)
    
    def noise(self, x: float, y: float) -> float:
        """Generate Perlin noise value at (x, y)"""
        # Find unit grid cell containing point
        xi = int(x) & 255
        yi = int(y) & 255
        
        # Find relative x, y of point in grid cell
        x -= int(x)
        y -= int(y)
        
        # Compute fade curves for x, y
        u = self.fade(x)
        v = self.fade(y)
        
        # Hash coordinates of 4 grid corners
        a = self.perm[xi] + yi
        aa = self.perm[a]
        ab = self.perm[a + 1]
        b = self.perm[xi + 1] + yi
        ba = self.perm[b]
        bb = self.perm[b + 1]
        
        # Blend the results from the 4 corners
        res = self.lerp(v,
                       self.lerp(u, self.grad(self.perm[aa], x, y),
                                   self.grad(self.perm[ba], x - 1, y)),
                       self.lerp(u, self.grad(self.perm[ab], x, y - 1),
                                   self.grad(self.perm[bb], x - 1, y - 1)))
        return res


class TerrainGenerator:
    """Main terrain generation class"""
    
    def __init__(self):
        self.algorithms = {
            'perlin_noise': self._generate_perlin_terrain,
            'diamond_square': self._generate_diamond_square_terrain,
            'simplex_noise': self._generate_simplex_terrain
        }
    
    def generate_terrain(self, coordinates: Coordinates, algorithm: str = 'perlin_noise', 
                        seed: int = None, size: int = 64) -> TerrainResult:
        """Generate terrain data using specified algorithm"""
        import time
        start_time = time.time()
        
        if algorithm not in self.algorithms:
            raise ValueError(f"Unknown algorithm: {algorithm}")
        
        # Generate height map
        height_map = self.algorithms[algorithm](coordinates, seed, size)
        
        # Analyze terrain for biome generation
        biomes = self._analyze_biomes(height_map, coordinates)
        
        processing_time = (time.time() - start_time) * 1000  # Convert to ms
        
        return TerrainResult(
            heightMap=height_map,
            biomes=[asdict(biome) for biome in biomes],
            processingTime=processing_time,
            algorithm=algorithm,
            seed=seed or 0
        )
    
    def _generate_perlin_terrain(self, coordinates: Coordinates, seed: int, size: int) -> List[List[float]]:
        """Generate terrain using Perlin noise"""
        noise_gen = NoiseGenerator(seed)
        height_map = []
        
        # Scale factors for noise
        scale = 0.1
        amplitude = 100.0
        frequency = 1.0
        
        # Offset based on world coordinates
        offset_x = coordinates.x * 0.01
        offset_y = coordinates.y * 0.01
        
        for y in range(size):
            row = []
            for x in range(size):
                # Generate multiple octaves of noise
                height = 0.0
                current_amplitude = amplitude
                current_frequency = frequency
                
                for octave in range(4):
                    noise_x = (x + offset_x) * scale * current_frequency
                    noise_y = (y + offset_y) * scale * current_frequency
                    
                    height += noise_gen.noise(noise_x, noise_y) * current_amplitude
                    
                    current_amplitude *= 0.5
                    current_frequency *= 2.0
                
                # Add elevation influence from z-coordinate
                height += coordinates.z * 0.1
                
                # Ensure non-negative heights
                height = max(0, height)
                row.append(round(height, 2))
            
            height_map.append(row)
        
        return height_map
    
    def _generate_diamond_square_terrain(self, coordinates: Coordinates, seed: int, size: int) -> List[List[float]]:
        """Generate terrain using Diamond Square algorithm"""
        # For simplicity, fall back to Perlin for now
        # In a real implementation, this would use the actual Diamond Square algorithm
        return self._generate_perlin_terrain(coordinates, seed, size)
    
    def _generate_simplex_terrain(self, coordinates: Coordinates, seed: int, size: int) -> List[List[float]]:
        """Generate terrain using Simplex noise"""
        # For simplicity, fall back to Perlin for now
        # In a real implementation, this would use Simplex noise
        return self._generate_perlin_terrain(coordinates, seed, size)
    
    def _analyze_biomes(self, height_map: List[List[float]], coordinates: Coordinates) -> List[BiomeInfo]:
        """Analyze height map to determine biome distribution"""
        size = len(height_map)
        total_cells = size * size
        
        # Calculate height statistics
        all_heights = [height for row in height_map for height in row]
        min_height = min(all_heights)
        max_height = max(all_heights)
        avg_height = sum(all_heights) / len(all_heights)
        
        # Count cells in different height ranges
        water_level = min_height + (max_height - min_height) * 0.2
        mountain_level = min_height + (max_height - min_height) * 0.7
        
        water_cells = sum(1 for h in all_heights if h <= water_level)
        mountain_cells = sum(1 for h in all_heights if h >= mountain_level)
        land_cells = total_cells - water_cells - mountain_cells
        
        # Determine biomes based on elevation and coordinates
        biomes = []
        
        if water_cells > 0:
            biomes.append(BiomeInfo(
                type='ocean',
                coverage=water_cells / total_cells,
                characteristics={
                    'depth': round(avg_height * 0.5, 2),
                    'salinity': 0.035,
                    'temperature': max(10, 25 - coordinates.z * 0.01)
                }
            ))
        
        if mountain_cells > 0:
            biomes.append(BiomeInfo(
                type='mountain',
                coverage=mountain_cells / total_cells,
                characteristics={
                    'elevation': round(max_height, 2),
                    'rockType': 'granite' if coordinates.x % 2 == 0 else 'limestone',
                    'snowLine': round(max_height * 0.8, 2)
                }
            ))
        
        if land_cells > 0:
            # Determine land biome based on temperature and humidity
            temperature = max(5, 20 - coordinates.z * 0.02)
            humidity = 0.5 + (coordinates.y % 100) * 0.005
            
            if temperature > 25 and humidity < 0.3:
                land_type = 'desert'
                characteristics = {
                    'temperature': round(temperature, 1),
                    'sandType': 'quartz',
                    'rainfall': round(humidity * 100, 1)
                }
            else:
                land_type = 'forest'
                characteristics = {
                    'treeTypes': ['oak', 'pine', 'birch'],
                    'density': round(min(1.0, humidity + 0.2), 2),
                    'temperature': round(temperature, 1)
                }
            
            biomes.append(BiomeInfo(
                type=land_type,
                coverage=land_cells / total_cells,
                characteristics=characteristics
            ))
        
        return biomes


def main():
    """Main entry point for the terrain generator script"""
    if len(sys.argv) != 2:
        print("Usage: python3 terrain_generator.py '<json_args>'", file=sys.stderr)
        sys.exit(1)
    
    try:
        # Parse arguments from command line
        args = json.loads(sys.argv[1])
        
        coordinates = Coordinates(
            x=args['coordinates']['x'],
            y=args['coordinates']['y'],
            z=args['coordinates']['z']
        )
        
        algorithm = args.get('algorithm', 'perlin_noise')
        seed = args.get('seed', None)
        size = args.get('size', 64)
        
        # Generate terrain
        generator = TerrainGenerator()
        result = generator.generate_terrain(coordinates, algorithm, seed, size)
        
        # Output result as JSON
        output = asdict(result)
        print(json.dumps(output, indent=2))
        
    except Exception as e:
        error_result = {
            'error': str(e),
            'type': 'TerrainGenerationError'
        }
        print(json.dumps(error_result), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
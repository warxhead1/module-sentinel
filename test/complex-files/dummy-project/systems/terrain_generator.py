#!/usr/bin/env python3
"""Simple terrain generator for testing cross-language flow"""

import json
import sys
from dataclasses import dataclass, asdict

@dataclass
class TerrainResult:
    heightMap: list
    biomes: list
    processingTime: float
    algorithm: str
    seed: int

class TerrainGenerator:
    def generate_terrain(self, coordinates, algorithm='perlin', seed=None, size=32):
        # Simple mock implementation
        height_map = [[0.0] * size for _ in range(size)]
        biomes = [{'type': 'forest', 'coverage': 0.5}]
        
        return TerrainResult(
            heightMap=height_map,
            biomes=biomes,
            processingTime=100.0,
            algorithm=algorithm,
            seed=seed or 42
        )

def main():
    if len(sys.argv) != 2:
        sys.exit(1)
    
    args = json.loads(sys.argv[1])
    generator = TerrainGenerator()
    result = generator.generate_terrain(args.get('coordinates', {}))
    print(json.dumps(asdict(result)))

if __name__ == '__main__':
    main()
"""
Sample Python module for testing multi-language parsing.
"""

from typing import List, Optional, Dict
import asyncio
from dataclasses import dataclass
from abc import ABC, abstractmethod


@dataclass
class TerrainPoint:
    """Represents a point in the terrain."""
    x: float
    y: float
    elevation: float
    biome: str = "plains"


class TerrainGenerator(ABC):
    """Abstract base class for terrain generation."""
    
    def __init__(self, seed: int = 42):
        self.seed = seed
        self._cache: Dict[str, TerrainPoint] = {}
    
    @abstractmethod
    def generate(self, x: float, y: float) -> TerrainPoint:
        """Generate terrain at the given coordinates."""
        pass
    
    @property
    def cache_size(self) -> int:
        """Get the current cache size."""
        return len(self._cache)
    
    @staticmethod
    def normalize_coordinates(x: float, y: float) -> tuple[float, float]:
        """Normalize coordinates to unit square."""
        return x % 1.0, y % 1.0


class NoiseTerrainGenerator(TerrainGenerator):
    """Terrain generator using Perlin noise."""
    
    def __init__(self, seed: int = 42, octaves: int = 6):
        super().__init__(seed)
        self.octaves = octaves
        self._frequency = 0.1
    
    def generate(self, x: float, y: float) -> TerrainPoint:
        """Generate terrain using Perlin noise."""
        cache_key = f"{x:.2f},{y:.2f}"
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        # Simplified noise calculation
        elevation = self._calculate_noise(x, y)
        biome = self._determine_biome(elevation)
        
        point = TerrainPoint(x, y, elevation, biome)
        self._cache[cache_key] = point
        return point
    
    def _calculate_noise(self, x: float, y: float) -> float:
        """Calculate Perlin noise value."""
        # Placeholder implementation
        return (x + y) * self._frequency * self.octaves
    
    def _determine_biome(self, elevation: float) -> str:
        """Determine biome based on elevation."""
        if elevation < 0.3:
            return "ocean"
        elif elevation < 0.6:
            return "plains"
        elif elevation < 0.8:
            return "hills"
        else:
            return "mountains"


async def generate_terrain_async(
    generator: TerrainGenerator, 
    points: List[tuple[float, float]]
) -> List[TerrainPoint]:
    """Asynchronously generate terrain for multiple points."""
    tasks = []
    for x, y in points:
        # In real implementation, this would be truly async
        task = asyncio.create_task(
            asyncio.to_thread(generator.generate, x, y)
        )
        tasks.append(task)
    
    return await asyncio.gather(*tasks)


def create_generator(generator_type: str = "noise", **kwargs) -> TerrainGenerator:
    """Factory function to create terrain generators."""
    generators = {
        "noise": NoiseTerrainGenerator,
    }
    
    if generator_type not in generators:
        raise ValueError(f"Unknown generator type: {generator_type}")
    
    return generators[generator_type](**kwargs)


# Module-level exports
__all__ = ["TerrainGenerator", "NoiseTerrainGenerator", "TerrainPoint", 
           "generate_terrain_async", "create_generator"]
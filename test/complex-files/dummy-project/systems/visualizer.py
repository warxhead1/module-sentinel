#!/usr/bin/env python3
"""
Visualizer - Python backend visualization script
Generates visual representations of data for the multi-language demo
"""

import json
import sys
import time
import os
import base64
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from io import BytesIO


# Mock PIL for demonstration - in real implementation would use Pillow
class MockImage:
    """Mock image class for demonstration purposes"""
    
    def __init__(self, mode: str, size: Tuple[int, int], color: Any = None):
        self.mode = mode
        self.size = size
        self.color = color
    
    def save(self, fp: str, format: str = None):
        """Mock save method"""
        # Create a simple text file instead of actual image
        with open(fp, 'w') as f:
            f.write(f"Mock {format or 'PNG'} image: {self.size[0]}x{self.size[1]} {self.mode}\n")
            f.write(f"Generated at: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")


class MockImageDraw:
    """Mock image drawing class"""
    
    def __init__(self, image: MockImage):
        self.image = image
    
    def rectangle(self, xy: Tuple[int, int, int, int], fill: Any = None, outline: Any = None):
        """Mock rectangle drawing"""
        pass
    
    def text(self, xy: Tuple[int, int], text: str, fill: Any = None):
        """Mock text drawing"""
        pass


@dataclass
class VisualizationConfig:
    width: int = 512
    height: int = 512
    format: str = 'png'
    quality: int = 95
    background_color: str = '#ffffff'


@dataclass
class VisualizationResult:
    imageUrl: str
    width: int
    height: int
    format: str
    processingTime: float
    dataPoints: int
    algorithm: str


class DataVisualizer:
    """Main visualization class for generating charts and images"""
    
    def __init__(self):
        self.supported_formats = ['png', 'jpeg', 'svg', 'pdf']
        self.visualization_types = {
            'terrain': self._visualize_terrain,
            'heightmap': self._visualize_heightmap,
            'biome': self._visualize_biomes,
            'chart': self._visualize_chart,
            'graph': self._visualize_graph
        }
    
    def generate_visualization(self, data_set: str, output_dir: str = '/tmp/visualizations', 
                             config: VisualizationConfig = None) -> VisualizationResult:
        """Generate visualization based on dataset type"""
        start_time = time.time()
        
        if config is None:
            config = VisualizationConfig()
        
        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)
        
        # Determine visualization type from dataset name
        viz_type = self._determine_visualization_type(data_set)
        
        if viz_type not in self.visualization_types:
            raise ValueError(f"Unsupported visualization type: {viz_type}")
        
        # Generate the visualization
        image_path, data_points = self.visualization_types[viz_type](data_set, output_dir, config)
        
        processing_time = (time.time() - start_time) * 1000  # Convert to ms
        
        return VisualizationResult(
            imageUrl=image_path,
            width=config.width,
            height=config.height,
            format=config.format,
            processingTime=processing_time,
            dataPoints=data_points,
            algorithm=viz_type
        )
    
    def _determine_visualization_type(self, data_set: str) -> str:
        """Determine visualization type from dataset name"""
        data_set_lower = data_set.lower()
        
        if 'terrain' in data_set_lower:
            return 'terrain'
        elif 'height' in data_set_lower:
            return 'heightmap'
        elif 'biome' in data_set_lower:
            return 'biome'
        elif 'chart' in data_set_lower:
            return 'chart'
        elif 'graph' in data_set_lower:
            return 'graph'
        else:
            return 'chart'  # Default fallback
    
    def _visualize_terrain(self, data_set: str, output_dir: str, config: VisualizationConfig) -> Tuple[str, int]:
        """Generate terrain visualization"""
        image_path = os.path.join(output_dir, f'terrain_{int(time.time())}.{config.format}')
        
        # Create mock terrain visualization
        image = MockImage('RGB', (config.width, config.height), (100, 150, 100))
        
        # Mock drawing terrain features
        draw = MockImageDraw(image)
        
        # Simulate drawing terrain elements
        data_points = 0
        for y in range(0, config.height, 20):
            for x in range(0, config.width, 20):
                # Mock height-based coloring
                height = abs(hash(f"{x},{y}") % 256)
                color = self._height_to_color(height)
                draw.rectangle((x, y, x+20, y+20), fill=color)
                data_points += 1
        
        image.save(image_path, config.format.upper())
        
        return image_path, data_points
    
    def _visualize_heightmap(self, data_set: str, output_dir: str, config: VisualizationConfig) -> Tuple[str, int]:
        """Generate heightmap visualization"""
        image_path = os.path.join(output_dir, f'heightmap_{int(time.time())}.{config.format}')
        
        # Create mock heightmap
        image = MockImage('L', (config.width, config.height), 128)  # Grayscale
        
        # Mock drawing heightmap
        draw = MockImageDraw(image)
        
        data_points = config.width * config.height
        
        # Simulate heightmap generation
        for y in range(config.height):
            for x in range(config.width):
                # Generate mock height value
                height = abs(hash(f"{x},{y}") % 256)
                # In real implementation, would set pixel color based on height
        
        image.save(image_path, config.format.upper())
        
        return image_path, data_points
    
    def _visualize_biomes(self, data_set: str, output_dir: str, config: VisualizationConfig) -> Tuple[str, int]:
        """Generate biome distribution visualization"""
        image_path = os.path.join(output_dir, f'biomes_{int(time.time())}.{config.format}')
        
        # Create mock biome map
        image = MockImage('RGB', (config.width, config.height), (255, 255, 255))
        draw = MockImageDraw(image)
        
        # Define biome colors
        biome_colors = {
            'forest': (34, 139, 34),    # Forest green
            'desert': (238, 203, 173),   # Sandy brown
            'mountain': (139, 137, 137), # Dark gray
            'ocean': (65, 105, 225),     # Royal blue
            'grassland': (124, 252, 0)   # Lawn green
        }
        
        data_points = 0
        
        # Mock biome regions
        for biome, color in biome_colors.items():
            # Create random regions for each biome
            for _ in range(3):  # 3 regions per biome
                x = hash(f"{biome}_x") % (config.width - 100)
                y = hash(f"{biome}_y") % (config.height - 100)
                w = 50 + (hash(f"{biome}_w") % 100)
                h = 50 + (hash(f"{biome}_h") % 100)
                
                draw.rectangle((x, y, x+w, y+h), fill=color)
                data_points += 1
        
        image.save(image_path, config.format.upper())
        
        return image_path, data_points
    
    def _visualize_chart(self, data_set: str, output_dir: str, config: VisualizationConfig) -> Tuple[str, int]:
        """Generate chart visualization"""
        image_path = os.path.join(output_dir, f'chart_{int(time.time())}.{config.format}')
        
        # Create mock chart
        image = MockImage('RGB', (config.width, config.height), (255, 255, 255))
        draw = MockImageDraw(image)
        
        # Mock chart elements
        data_points = 10
        
        # Draw mock axes
        draw.rectangle((50, 50, 50, config.height-50), fill=(0, 0, 0))  # Y-axis
        draw.rectangle((50, config.height-50, config.width-50, config.height-50), fill=(0, 0, 0))  # X-axis
        
        # Draw mock data points
        for i in range(data_points):
            x = 60 + i * (config.width - 120) // data_points
            y = 60 + (hash(f"data_{i}") % (config.height - 120))
            draw.rectangle((x-2, y-2, x+2, y+2), fill=(255, 0, 0))
        
        image.save(image_path, config.format.upper())
        
        return image_path, data_points
    
    def _visualize_graph(self, data_set: str, output_dir: str, config: VisualizationConfig) -> Tuple[str, int]:
        """Generate graph visualization"""
        image_path = os.path.join(output_dir, f'graph_{int(time.time())}.{config.format}')
        
        # Create mock graph
        image = MockImage('RGB', (config.width, config.height), (255, 255, 255))
        draw = MockImageDraw(image)
        
        # Mock network graph
        nodes = 8
        data_points = nodes
        
        # Draw mock nodes
        for i in range(nodes):
            angle = (2 * 3.14159 * i) / nodes
            x = int(config.width // 2 + 150 * __import__('math').cos(angle))
            y = int(config.height // 2 + 150 * __import__('math').sin(angle))
            
            # Draw node
            draw.rectangle((x-10, y-10, x+10, y+10), fill=(0, 100, 200))
            
            # Draw connections to next node
            next_i = (i + 1) % nodes
            next_angle = (2 * 3.14159 * next_i) / nodes
            next_x = int(config.width // 2 + 150 * __import__('math').cos(next_angle))
            next_y = int(config.height // 2 + 150 * __import__('math').sin(next_angle))
            
            # Mock line drawing
            # In real implementation would draw actual lines
        
        image.save(image_path, config.format.upper())
        
        return image_path, data_points
    
    def _height_to_color(self, height: int) -> Tuple[int, int, int]:
        """Convert height value to RGB color"""
        if height < 64:
            return (0, 0, 255)      # Water - blue
        elif height < 128:
            return (0, 255, 0)      # Plains - green
        elif height < 192:
            return (139, 69, 19)    # Hills - brown
        else:
            return (255, 255, 255)  # Mountains - white


def main():
    """Main entry point for the visualizer script"""
    if len(sys.argv) != 2:
        print("Usage: python3 visualizer.py '<json_args>'", file=sys.stderr)
        sys.exit(1)
    
    try:
        # Parse arguments from command line
        args = json.loads(sys.argv[1])
        
        data_set = args['dataSet']
        output_dir = args.get('outputDir', '/tmp/visualizations')
        
        # Create configuration
        config = VisualizationConfig(
            width=args.get('width', 512),
            height=args.get('height', 512),
            format=args.get('format', 'png').lower(),
            quality=args.get('quality', 95)
        )
        
        # Validate format
        visualizer = DataVisualizer()
        if config.format not in visualizer.supported_formats:
            raise ValueError(f"Unsupported format: {config.format}")
        
        # Generate visualization
        result = visualizer.generate_visualization(data_set, output_dir, config)
        
        # Output result as JSON
        output = asdict(result)
        print(json.dumps(output, indent=2))
        
    except Exception as e:
        error_result = {
            'error': str(e),
            'type': 'VisualizationError'
        }
        print(json.dumps(error_result), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
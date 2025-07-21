# Dummy Multi-Language Project

This is a demonstration project showcasing cross-language integration for the Module Sentinel architecture enhancement. It demonstrates how React (TypeScript) frontend communicates with a Node.js/Hapi backend, which in turn calls Python processing scripts.

## Architecture

```
React Frontend (TypeScript)
    ↓ HTTP API calls
Node.js Backend (Hapi.js)  
    ↓ subprocess calls
Python Scripts (Data Processing)
```

## Project Structure

```
dummy-project/
├── front-end/          # React TypeScript frontend
│   ├── src/
│   │   ├── App.tsx     # Main app with routing
│   │   ├── components/
│   │   │   ├── TerrainProcessor.tsx
│   │   │   └── DataVisualizer.tsx
│   │   └── services/
│   │       └── ApiService.ts
│   └── package.json
├── back-end/           # Node.js Hapi backend
│   ├── src/
│   │   └── server.ts   # Main server with API routes
│   └── package.json
├── systems/            # Python processing scripts
│   ├── terrain_generator.py
│   ├── visualizer.py
│   └── requirements.txt
└── README.md
```

## Cross-Language Flow

1. **Frontend (React/TypeScript)**:
   - User inputs coordinates in `TerrainProcessor`
   - `ApiService` makes HTTP POST to backend `/api/terrain/process`

2. **Backend (Node.js/Hapi)**:
   - Receives API request, validates with Joi
   - Spawns Python subprocess: `python3 terrain_generator.py`
   - Processes Python JSON output and returns to frontend

3. **Python Scripts**:
   - `terrain_generator.py`: Generates terrain using Perlin noise
   - `visualizer.py`: Creates visualizations from data
   - Both scripts accept JSON args and output JSON results

## Example Data Flow

```typescript
// Frontend API call
const result = await apiService.processTerrain({x: 100, y: 200, z: 50});

// Backend processing
const pythonResult = await callPythonScript('terrain_generator.py', {
  coordinates: {x: 100, y: 200, z: 50},
  algorithm: 'perlin_noise',
  seed: 12345
});

// Python output
{
  "heightMap": [[10.5, 12.3, ...], ...],
  "biomes": [
    {"type": "forest", "coverage": 0.4, ...},
    {"type": "mountain", "coverage": 0.3, ...}
  ],
  "processingTime": 156.7,
  "algorithm": "perlin_noise"
}
```

## Purpose for Module Sentinel

This project serves as a test case for the enhanced Module Sentinel universal parsing system:

1. **Multi-Language Symbols**: TypeScript interfaces, Node.js classes, Python classes
2. **Cross-Language Relationships**: API endpoints, data contracts, subprocess calls  
3. **Bridge Detection**: HTTP API, JSON serialization, subprocess communication
4. **Pattern Recognition**: Factory patterns, service layers, data processing pipelines

## Running the Project

### Frontend
```bash
cd front-end
npm install
npm start  # Runs on http://localhost:3000
```

### Backend  
```bash
cd back-end
npm install
npm start  # Runs on http://localhost:3001
```

### Python Scripts
```bash
cd systems
pip install -r requirements.txt

# Test terrain generation
python3 terrain_generator.py '{"coordinates":{"x":100,"y":200,"z":50},"algorithm":"perlin_noise","seed":12345}'

# Test visualization
python3 visualizer.py '{"dataSet":"terrain_visualization","outputDir":"/tmp/test"}'
```

## API Endpoints

- `POST /api/terrain/process` - Generate terrain data
- `POST /api/visualization/generate` - Create visualizations
- `GET /api/status/{jobId}` - Check processing status
- `GET /api/health` - Health check

## Testing Cross-Language Analysis

This project enables testing of Module Sentinel's enhanced capabilities:

1. **Symbol Extraction**: Classes, interfaces, functions across all three languages
2. **Relationship Detection**: Import/export, API calls, data flow
3. **Pattern Recognition**: MVC pattern, service layer, data processing pipeline
4. **Bridge Analysis**: REST API, JSON contracts, subprocess communication

The universal parser should detect relationships like:
- `ApiService.processTerrain()` calls → `BackendServer.handleTerrainProcessing()`
- `BackendServer.callPythonScript()` invokes → `terrain_generator.py:main()`
- TypeScript `TerrainData` interface matches Python `TerrainResult` dataclass
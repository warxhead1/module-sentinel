# Module Sentinel - Intelligent C++ Module Analysis for Planet ProcGen

An MCP server that provides advanced C++ module analysis, dependency tracking, and architectural insights for large-scale C++ codebases using C++23 modules.

## 🎯 Current Capabilities

### Core Analysis Tools
- **Cross-File Dependencies**: Find symbol usage across 29 files with detailed context (`analyze_cross_file_dependencies`)
- **Implementation Finding**: Locate interface implementations and similar code patterns (`find_implementations`, `find_similar_code`)
- **API Surface Analysis**: Examine public interfaces and module boundaries (`get_api_surface`)
- **Impact Analysis**: Understand downstream effects of code changes (`analyze_impact`)
- **Semantic Search**: Natural language queries to find code patterns (`semantic_search`)

### Advanced Features  
- **C++23 Module Support**: Enhanced parsing of `.ixx` files with export blocks and using declarations
- **Pattern Recognition**: 87.2% semantic tag coverage with factory, GPU/CPU, and anti-pattern detection
- **Real-time Monitoring**: File watcher automatically updates index when files change
- **Architectural Decisions**: Encrypted storage of design decisions with reasoning chains
- **Pipeline Awareness**: Understands project stages (noise_generation → physics_processing → rendering)

### Current Database Scale
- **18,997 symbols** indexed across **507 files**
- **Pipeline stages mapped**: orchestration, physics_processing, rendering, unknown
- **Anti-pattern detection**: 5,000+ violations identified for code quality improvement
- **Relationship tracking**: Cross-file dependencies, usage patterns, semantic connections

## 🔧 Quick Start

### Installation
```bash
cd module-sentinel
npm install
npm run build  # Automatically updates global MCP package
```

### MCP Integration
The server auto-starts with file watching enabled. Add to Claude configuration:

```json
{
  "mcpServers": {
    "module-sentinel": {
      "command": "/home/user/.nvm/versions/node/v22.17.0/bin/node",
      "args": ["/home/user/.nvm/versions/node/v22.17.0/bin/module-sentinel-mcp"],
      "env": {
        "NODE_ENV": "development",
        "GEMINI_API_KEY": "$GEMINI_API_KEY"
      }
    }
  }
}
```

## 📊 Real-World Example

**Query**: "Find cross-file dependencies for PlanetaryData"

**Result**: 
```
✅ PlanetaryData has 29 cross-file dependencies across 8 files:
  - OrchestratedPlanetManager.ixx (4 usages) - stores/returns generated data
  - TerrainOrchestrator.ixx/cpp (7 usages) - main generation pipeline  
  - PlanetMeshGenerator.ixx/cpp (9 usages) - mesh generation from data
  - PlanetaryGenerator.cpp (3 usages) - planet generation
  - TerrainFeedbackLoop.ixx (3 usages) - fitness evaluation
  - FeedbackOptimizationEngine.cpp (3 usages) - optimization engine
```

This analysis replaces hours of manual code review with instant, accurate dependency mapping.

## 🛠️ Available MCP Tools

### Priority 1 (Core Analysis)
- `analyze_cross_file_dependencies` - Symbol usage across files with pipeline awareness
- `find_implementations` - Interface implementations and similar patterns
- `find_similar_code` - Code similarity analysis with confidence scores

### Priority 2 (Advanced Analysis)  
- `get_api_surface` - Public interface examination
- `analyze_impact` - Change impact assessment
- `validate_boundaries` - Architectural violation detection
- `suggest_module` - Best module placement for new code

### Utility Tools
- `semantic_search` - Natural language code queries
- `find_module_for_symbol` - Symbol location discovery
- `rebuild_index` - Index management
- `generate_visualization` - Interactive dependency visualizations
- `validate_claude_code` - AI code validation (requires GEMINI_API_KEY)

## 🎭 Current Limitations & Future Work

### Parser Limitations
- **C++23 modules**: Detection improved but some export patterns still missed
- **Tree-sitter fallback**: Works when Clang fails, but with reduced precision
- **Large files**: Chunked parsing for files >50KB may miss some context

### Database Coverage
- **11,508 symbols** in production index (subset of full codebase)
- **87.2% semantic tag coverage** - room for improvement
- Some pipeline stages marked as "unknown" - needs better classification

### Performance Targets
| Metric | Current | Target |
|--------|---------|--------|
| Module Analysis | ~400ms | <50ms |
| Cross-file Dependencies | ~200ms | <100ms |
| Database Query Speed | Good | Excellent |
| Memory Usage | ~50MB | <50MB ✅ |
| Cache Hit Rate | ~87% | >95% |

### Active Development Areas
1. **Enhanced C++23 Support**: Better module interface detection
2. **Performance Optimization**: Faster parsing for large files  
3. **Pattern Recognition**: Improve anti-pattern detection accuracy
4. **Pipeline Classification**: Auto-detect more architectural stages
5. **Incremental Indexing**: Smarter file change handling

## 🏗️ Architecture

### Core Systems
- **StreamingCppParser**: C++23 module parsing with export block detection
- **PatternAwareIndexer**: Builds semantic database with relationship tracking
- **FileWatcher**: Real-time file monitoring with batch updates
- **ThoughtSignaturePreserver**: Encrypted architectural decision storage
- **Priority Tools**: Layered analysis capabilities for different use cases

### Database Schema
- `enhanced_symbols`: 18K+ symbols with semantic metadata
- `symbol_relationships`: Cross-file dependencies and usage patterns  
- `semantic_connections`: Pattern-based relationships
- `architectural_decisions`: Encrypted design history

### Pipeline Integration
Understands Planet ProcGen's architecture:
```
noise_generation → terrain_formation → atmospheric_dynamics → 
geological_processes → ecosystem_simulation → weather_systems → final_rendering
```

## 🧪 Testing & Validation

```bash
# Run comprehensive test suite
npx tsx run-tests.ts

# Test specific components
npx tsx test/unit/PatternAwareIndexingTest.ts
npx tsx test-module-sentinel.ts
```

**Test Results Summary**:
- ✅ C++23 module parsing: 79 exports detected in JobSystem.ixx
- ✅ Pattern detection: 1,133 factory patterns found
- ✅ Semantic coverage: 87.2% of symbols tagged
- ⚠️ Parser fallback: Works but needs precision improvement

## 🔒 Security Features

- Encrypted API key storage with secure configuration management
- Thought signature encryption for sensitive architectural decisions
- No secrets logged or committed to repositories

## 📈 Performance Monitoring

The system tracks:
- Parse success rates (Clang vs Tree-sitter fallbacks)
- Semantic tag coverage percentages  
- Cross-file dependency accuracy
- Memory usage and cache efficiency
- File change responsiveness

---

**Status**: Production-ready for C++ dependency analysis with ongoing enhancements for C++23 module support.
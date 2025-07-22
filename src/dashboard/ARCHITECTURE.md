# Dashboard Architecture Overview

## Component Organization

### 📁 `/components` - UI Components

#### Core Infrastructure
- `base-component.ts` - Base class for all dashboard components
- `router.ts` - Client-side routing
- `nav-sidebar.ts` - Navigation sidebar
- `symbol-selector-modal.ts` - Global symbol selection modal

#### Main Views
- `dashboard-overview.ts` - Main dashboard landing page
- `project-manager.ts` - Project management interface
- `modules-page.ts` - Module browser and overview
- `namespace-explorer.ts` - Namespace navigation

#### Analysis Components (Using Modular Engines)
- `relationship-graph.ts` → Uses **GraphVisualizationEngine**
  - Advanced D3.js relationship visualization
  - Hierarchical grouping and semantic zooming
  
- `enhanced-code-flow.ts` → Uses **ControlFlowEngine**
  - Static code analysis and complexity metrics
  - Navigation breadcrumbs and hotspot detection
  
- `code-flow-explorer.ts` → Uses **ExecutionAnalyzer**
  - Runtime behavior and execution paths
  - Branch coverage and dead code detection

- `impact-visualization.ts` → Uses **GraphVisualizationEngine**
  - Seismic/ripple effect visualization
  - Change impact analysis

#### Specialized Analysis
- `multi-language-flow-explorer.ts` - Cross-language relationships
- `pattern-analyzer.ts` - Design pattern detection
- `performance-hotspots.ts` - Performance bottleneck analysis
- `insights-dashboard.ts` - AI-powered insights
- `search-interface.ts` - Advanced search capabilities

#### Hub Component
- `analytics-hub.ts` - Overview dashboard (needs refactoring to navigation)

#### Supporting Components
- `graph-filter-sidebar.ts` - Filtering UI for graphs
- `class-details-panel.ts` - Symbol detail display
- `file-structure-widget.ts` - File tree visualization
- `project-selector.ts` - Project selection dropdown

### 📁 `/utils` - Reusable Helper Modules

#### Graph Visualization Engine (6 modules)
- `graph-viz-engine.ts` - Core D3.js rendering engine
- `graph-data-processor.ts` - Data transformation and filtering
- `graph-theme-manager.ts` - Theming and styling
- `graph-interaction-handler.ts` - User interactions
- `graph-animation-controller.ts` - Animation management
- `graph-plugin-system.ts` - Extensibility framework

#### Control Flow Engine (5 modules)
- `control-flow-engine.ts` - Static analysis orchestrator
- `complexity-analyzer.ts` - Complexity metrics calculation
- `navigation-tree-builder.ts` - Hierarchical navigation
- `hotspot-detector.ts` - Performance bottleneck detection
- `data-flow-tracker.ts` - Variable and parameter tracking

#### Execution Analyzer (6 modules)
- `execution-analyzer.ts` - Runtime analysis orchestrator
- `path-tracer.ts` - Execution path tracing
- `branch-coverage-calculator.ts` - Coverage metrics
- `dead-code-detector.ts` - Unused code identification
- `flow-statistics-generator.ts` - Flow metrics and patterns
- `call-graph-builder.ts` - Function relationship mapping

#### Utilities
- `performance.ts` - Debounce, throttle, timing utilities

### 📁 `/services` - Data Services
- `api.service.ts` - API communication
- `data.service.ts` - Data management
- `router.service.ts` - Routing service
- `state.service.ts` - State management

### 📁 `/_archive` - Old Versions (for reference)
- Contains backup files from refactoring
- Not used in production

## Key Design Principles

1. **Modular Engines** - Reusable analysis engines prevent code duplication
2. **Separation of Concerns** - Each component has a specific purpose
3. **Extensibility** - Plugin systems and configurable options
4. **Performance** - Optimized for large C++ codebases
5. **Multi-Language Support** - Architecture supports cross-language analysis

## Component Relationships

```
Dashboard Overview
    ├── Relationship Graph → GraphVisualizationEngine
    ├── Enhanced Code Flow → ControlFlowEngine
    ├── Code Flow Explorer → ExecutionAnalyzer
    ├── Impact Visualization → GraphVisualizationEngine
    └── Multi-Language Flow → (To be enhanced with MultiLanguageDetector)
```

## Next Steps

1. Extract MultiLanguageDetector from multi-language-flow-explorer
2. Refactor Analytics Hub to be a navigation dashboard
3. Add symbol selector integration to remaining components
4. Implement cross-component navigation
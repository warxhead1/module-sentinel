# Phase 4: MultiLanguageDetector Extraction & Dashboard Consolidation

## Context for New Chat

### Project Background
- **Module Sentinel**: MCP server for C++ module analysis (started for C++ game engine development)
- **Current State**: Grown to support multiple languages (C++, Python, TypeScript, JavaScript)
- **Architecture**: Modular dashboard with reusable analysis engines
- **Goal**: Complete consolidation without losing functionality, enhance all components with multi-language support

### Work Completed (Phases 1-3)
1. **GraphVisualizationEngine** extracted (6 modules) - D3.js visualizations
2. **ControlFlowEngine** extracted (5 modules) - Static code analysis  
3. **ExecutionAnalyzer** extracted (6 modules) - Runtime behavior analysis
4. **Components cleaned up** - Archives created, duplicates removed
5. **Symbol Selector Modal** - Global component for symbol selection

### Current File Structure
```
src/dashboard/
├── components/
│   ├── multi-language-flow-explorer.ts (1,138 lines - SOURCE FOR EXTRACTION)
│   ├── analytics-hub.ts (1,419 lines - NEEDS REFACTORING)
│   ├── enhanced-code-flow.ts (USES ControlFlowEngine)
│   ├── code-flow-explorer.ts (USES ExecutionAnalyzer)
│   ├── relationship-graph.ts (USES GraphVisualizationEngine)
│   └── [20 other components]
└── utils/
    ├── graph-viz-engine.ts (and 5 related modules)
    ├── control-flow-engine.ts (and 4 related modules)
    ├── execution-analyzer.ts (and 5 related modules)
    └── performance.ts
```

## Phase 4 Detailed Tasks

### Task 1: Extract MultiLanguageDetector
**File**: `src/dashboard/components/multi-language-flow-explorer.ts`
**Target**: Create modular language detection system

#### 1.1 Core Module: `multi-language-detector.ts`
```typescript
// Extract from multi-language-flow-explorer.ts:
- Language detection from file paths/extensions
- Cross-language relationship identification  
- Process spawn detection (exec, subprocess, etc.)
- Language-specific icon and color mapping
- Connection type classification
```

#### 1.2 Supporting Module: `cross-language-analyzer.ts`
```typescript
// Extract cross-language specific logic:
- Detect function calls across language boundaries
- Identify shared data structures/protocols
- Track process communication patterns
- Analyze language bridge mechanisms
```

#### 1.3 Supporting Module: `language-clusterer.ts`
```typescript
// Extract clustering logic:
- Group symbols by language
- Create hierarchical language structures
- Calculate language interconnectivity metrics
- Generate language relationship statistics
```

#### 1.4 Supporting Module: `spawn-detector.ts`
```typescript
// Extract process spawning detection:
- Identify exec/spawn/subprocess calls
- Track parent-child process relationships
- Detect language-specific spawning patterns
- Map execution flow across processes
```

### Task 2: Refactor multi-language-flow-explorer.ts
- Use new MultiLanguageDetector engine
- Integrate with GraphVisualizationEngine for rendering
- Add symbol selector modal integration
- Preserve ALL existing functionality:
  - Language filtering
  - Cross-language highlighting
  - Spawn visualization
  - Connection statistics

### Task 3: Enhance ALL Flow Components with Multi-Language
Components to enhance:
1. **enhanced-code-flow.ts**
   - Add language badges to functions
   - Highlight cross-language calls
   - Show language context in breadcrumbs

2. **code-flow-explorer.ts**
   - Add language filters to execution paths
   - Show cross-language execution flows
   - Detect language-specific dead code

3. **relationship-graph.ts**
   - Already has language grouping, enhance with:
   - Better cross-language edge detection
   - Language-specific relationship types

4. **impact-visualization.ts**
   - Show cross-language impact propagation
   - Language-specific severity scoring

### Task 4: Refactor Analytics Hub
**Current**: Tab-based with duplicate/placeholder content
**Target**: Navigation dashboard with overview cards

#### 4.1 Remove Duplicate Tabs
- Remove relationship graph tab (use standalone)
- Remove placeholder tabs (architecture, patterns, hotspots)
- Keep only unique overview content

#### 4.2 Create Overview Cards
```typescript
// Card examples:
- Project Health Score (from all analyzers)
- Language Distribution (from MultiLanguageDetector)
- Complexity Trends (from ControlFlowEngine)
- Coverage Summary (from ExecutionAnalyzer)
- Recent Activity (from state service)
```

#### 4.3 Add Navigation Cards
- Each card links to specialized component
- Show key metrics from each analyzer
- Quick actions (analyze, refresh, configure)

### Task 5: Symbol Selector Integration
Add to remaining components:
- pattern-analyzer.ts
- performance-hotspots.ts
- insights-dashboard.ts
- namespace-explorer.ts

### Task 6: Cross-Component Navigation
Implement navigation flow:
1. User selects symbol in any component
2. Can quickly jump to same symbol in:
   - Control flow view
   - Execution analysis
   - Relationship graph
   - Impact visualization

### Task 7: Update Navigation Structure
Reorganize nav-sidebar.ts:
```
Overview
├── Dashboard (analytics-hub)
└── Projects

Analysis Tools
├── Code Flow (enhanced-code-flow)
├── Execution Analysis (code-flow-explorer)
├── Relationships (relationship-graph)
└── Impact Analysis (impact-visualization)

Specialized Tools
├── Multi-Language (multi-language-flow-explorer)
├── Patterns (pattern-analyzer)
├── Performance (performance-hotspots)
└── Search (search-interface)
```

## Implementation Order

1. **Extract MultiLanguageDetector** (4-5 hours)
   - Create 4 modular helpers
   - Refactor multi-language-flow-explorer

2. **Enhance Flow Components** (3-4 hours)
   - Add language support to 4 components
   - Test cross-language features

3. **Refactor Analytics Hub** (2-3 hours)
   - Convert to overview dashboard
   - Create navigation cards

4. **Integration Tasks** (2-3 hours)
   - Symbol selector integration
   - Cross-component navigation
   - Navigation updates

## Testing Checklist

- [ ] Multi-language detection works in all components
- [ ] No functionality lost from original components
- [ ] Analytics Hub provides clear navigation
- [ ] Symbol selector works everywhere
- [ ] Cross-component navigation is smooth
- [ ] All TypeScript compiles without errors
- [ ] Build succeeds with `npm run build`

## Key Files to Preserve

**DO NOT DELETE:**
- Any component in main folder (not in _archive)
- All utils modules (17 helper modules)
- Services (api, data, router, state)
- Symbol selector modal

**CAN MODIFY:**
- multi-language-flow-explorer.ts (for extraction)
- analytics-hub.ts (for refactoring)
- nav-sidebar.ts (for reorganization)

## Git Commits Pattern

```bash
# After each major task:
git add -A && git commit -m "feat: [description]

- What was done
- Benefits
- Files affected"
```

## Success Criteria

1. **Zero functionality lost** - All original features work
2. **Better architecture** - Clean separation, no duplication
3. **Enhanced capabilities** - Multi-language support everywhere
4. **Improved UX** - Clear navigation, consistent patterns
5. **Maintainable code** - Modular, documented, testable

## Current Branch
`feature/multi-language-support`

## Build Commands
```bash
npm run build          # Full build
npm run build:dashboard # Dashboard only
npm run dashboard      # Start dev server
```

This plan provides everything needed to complete Phase 4 in a new chat session.
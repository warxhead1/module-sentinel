export enum PipelineStage {
  NoiseGeneration = 'noise_generation',
  TerrainFormation = 'terrain_formation', 
  AtmosphericDynamics = 'atmospheric_dynamics',
  GeologicalProcesses = 'geological_processes',
  EcosystemSimulation = 'ecosystem_simulation',
  WeatherSystems = 'weather_systems',
  FinalRendering = 'final_rendering'
}

export interface ModuleInfo {
  path: string;
  exports: string[];
  imports: string[];
  stage: PipelineStage;
  dependencies: string[];
  consciousnessSignature?: ThoughtPattern;
  performanceProfile?: PerformanceMetrics;
  evolutionHistory?: ArchitecturalEvolution[];
}

export interface ThoughtPattern {
  id: string;
  timestamp: number;
  decision: string;
  reasoning: string;
  context: Record<string, any>;
}

export interface PerformanceMetrics {
  parseTime: number;
  memoryUsage: number;
  cacheHitRate: number;
  lastUpdated: number;
}

export interface ArchitecturalEvolution {
  timestamp: number;
  change: string;
  impact: string;
  confidence: number;
}

export interface ImportSuggestion {
  module: string;
  symbol: string;
  confidence: number;
  reasoning: string;
}

export interface DependencyGraph {
  nodes: Map<string, ModuleInfo>;
  edges: Map<string, Set<string>>;
  cycles: string[][];
  layers: Map<PipelineStage, string[]>;
}

export interface ArchitecturalDecision {
  type: 'import' | 'export' | 'refactor' | 'dependency';
  module: string;
  decision: string;
  reasoning: string;
  timestamp: number;
  impact: string[];
}

export interface ModuleChangeEvent {
  path: string;
  type: 'created' | 'modified' | 'deleted';
  timestamp: number;
  changes?: string[];
}

export * from './essential-features';

/**
 * TypeScript type definitions for Enhanced Liquid Flow visualization
 * Matches Rust data structures for NAPI-RS integration
 */

// Language type is available but not used directly in this file
// import { Language } from './rust-bindings';

/**
 * Enhanced symbol data with complexity and performance metrics
 */
export interface EnhancedSymbolData {
  // Basic identification
  id: string;
  name: string;
  kind: SymbolKind;
  filePath: string;
  lineRange: [number, number];

  // Complexity metrics
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  linesOfCode: number;
  nestingDepth: number;

  // Activity metrics (from git integration)
  changeFrequency: number;      // Changes per week
  lastModified: string;          // ISO date string
  authorCount: number;
  bugFrequency: number;          // Bugs per 100 LOC

  // Performance metrics (optional, from profiling)
  avgExecutionTime?: number;     // milliseconds
  memoryUsage?: number;          // bytes
  callFrequency?: number;        // calls per execution

  // Quality metrics
  testCoverage?: number;         // 0-1 percentage
  documentationScore: number;    // 0-1 quality score
  codeSmellCount: number;
  technicalDebtScore: number;    // 0-100 scale
}

/**
 * Symbol types for categorization
 */
export enum SymbolKind {
  Function = 'function',
  Class = 'class',
  Method = 'method',
  Interface = 'interface',
  Type = 'type',
  Variable = 'variable',
  Constant = 'constant',
  Module = 'module',
  Namespace = 'namespace',
  Enum = 'enum',
  EnumMember = 'enumMember',
  Struct = 'struct',
  Trait = 'trait'
}

/**
 * Data flow relationship between symbols
 */
export interface DataFlowRelationship {
  sourceId: string;
  targetId: string;
  flowType: FlowType;

  // Flow characteristics
  dataVolume: number;            // Estimated data transferred (0-100 scale)
  frequency: number;             // Calls per execution
  latency?: number;              // Measured or estimated (ms)
  reliability: number;           // Success rate 0-1

  // Flow path analysis
  isCriticalPath: boolean;
  alternativePaths: string[];    // IDs of alternative paths
  bottleneckScore: number;       // 0-100 scale

  // Data transformation info
  transformsData: boolean;
  dataTypes: string[];
  validationRules: string[];
}

/**
 * Types of data/control flow
 */
export enum FlowType {
  DataFlow = 'dataFlow',
  ControlFlow = 'controlFlow',
  AsyncMessage = 'asyncMessage',
  EventStream = 'eventStream',
  SharedState = 'sharedState',
  NetworkCall = 'networkCall'
}

/**
 * System-wide flow metrics
 */
export interface SystemFlowMetrics {
  // Overall health
  systemPressure: number;        // 0-100 scale
  flowEfficiency: number;        // 0-1 scale
  averageLatency: number;        // milliseconds
  errorRate: number;             // 0-1 percentage

  // Bottleneck analysis
  criticalPaths: CriticalPath[];
  bottlenecks: Bottleneck[];
  underutilizedPaths: string[];  // Symbol IDs

  // Resource usage
  memoryPressure: number;        // 0-100 scale
  cpuUtilization: number;        // 0-1 percentage
  ioWaitTime: number;            // 0-1 percentage

  // Predictive metrics
  failureProbability: number;    // 0-1 probability
  performanceTrend: Trend;
  suggestedOptimizations: Optimization[];
  
  // Metadata
  timestamp?: string;            // ISO date string
}

/**
 * Critical path information
 */
export interface CriticalPath {
  id: string;
  symbolIds: string[];
  totalLatency: number;
  bottleneckPoints: string[];
  importance: number;            // 0-100 scale
}

/**
 * Bottleneck details
 */
export interface Bottleneck {
  symbolId: string;
  severity: number;              // 0-100 scale
  type: BottleneckType;
  impact: string;
  suggestedFix: string;
}

export enum BottleneckType {
  CPU = 'cpu',
  Memory = 'memory',
  IO = 'io',
  Network = 'network',
  Synchronization = 'synchronization'
}

/**
 * Performance trend
 */
export enum Trend {
  Improving = 'improving',
  Stable = 'stable',
  Degrading = 'degrading'
}

/**
 * Optimization suggestion
 */
export interface Optimization {
  type: OptimizationType;
  symbolId: string;
  description: string;
  estimatedImprovement: number;  // percentage
  complexity: 'low' | 'medium' | 'high';
}

export enum OptimizationType {
  Caching = 'caching',
  Parallelization = 'parallelization',
  Algorithm = 'algorithm',
  DataStructure = 'dataStructure',
  DatabaseQuery = 'databaseQuery',
  NetworkBatching = 'networkBatching'
}

/**
 * Flow simulation parameters
 */
export interface FlowSimulationParams {
  particleCount: number;
  viscosity: number;
  pressure: number;
  temperature: number;
  turbulence: number;
  gravity: number;
}

/**
 * Real-time flow update via WebSocket
 */
export interface FlowUpdate {
  timestamp: string;
  type: FlowUpdateType;
  symbolId?: string;
  metrics?: Partial<SystemFlowMetrics>;
  relationships?: DataFlowRelationship[];
  alert?: FlowAlert;
}

export enum FlowUpdateType {
  MetricsUpdate = 'metricsUpdate',
  RelationshipChange = 'relationshipChange',
  BottleneckDetected = 'bottleneckDetected',
  PerformanceAlert = 'performanceAlert'
}

export interface FlowAlert {
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  symbolIds: string[];
  timestamp: string;
}

/**
 * API response wrapper
 */
export interface FlowApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

/**
 * Flow history data point
 */
export interface FlowHistoryPoint {
  timestamp: string;
  metrics: SystemFlowMetrics;
  events: FlowEvent[];
}

export interface FlowEvent {
  type: string;
  symbolId: string;
  description: string;
  impact: number;  // 0-100 scale
}
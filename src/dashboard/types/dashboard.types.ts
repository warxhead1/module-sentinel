/**
 * Dashboard-specific type definitions for enhanced UI components
 */

import { Symbol, GraphNode, Relationship } from '../../shared/types/api.js';

/**
 * Quick action button configuration
 */
export interface QuickAction {
  id: string;
  icon: string;         // Icon name from IconRegistry
  tooltip: string;      // Tooltip text or HTML
  action: () => void | Promise<void>;   // Click handler
  badge?: number;       // Optional notification count
  disabled?: boolean;   // Whether action is disabled
  variant?: 'primary' | 'secondary' | 'danger';
}

/**
 * Metric card data structure
 */
export interface MetricData {
  id: string;
  label: string;
  value: number;
  previousValue?: number;
  unit?: string;
  icon?: string;
  color?: string;
  sparklineData?: number[];
  trend?: 'up' | 'down' | 'stable';
  trendPercentage?: number;
  details?: MetricDetails;
  actions?: QuickAction[];
}

/**
 * Detailed metric information shown on hover/expand
 */
export interface MetricDetails {
  breakdown?: Array<{
    label: string;
    value: number;
    percentage?: number;
    color?: string;
  }>;
  topItems?: Array<{
    name: string;
    value: number;
    link?: string;
  }>;
  timeSeriesData?: Array<{
    timestamp: Date;
    value: number;
  }>;
  description?: string;
}

/**
 * Semantic insight card
 */
export interface InsightCard {
  id: string;
  severity: 'critical' | 'warning' | 'info' | 'success';
  category: string;
  title: string;
  message: string;
  affectedSymbols: Symbol[];
  suggestedAction?: {
    label: string;
    action: () => void | Promise<void>;
  };
  metrics?: {
    impact: number;
    confidence: number;
    occurrences: number;
  };
  timestamp: Date;
}

/**
 * Pattern grid item
 */
export interface PatternItem {
  id: string;
  name: string;
  category: 'design' | 'anti' | 'code-smell' | 'architectural';
  count: number;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  languages: string[];
  examples?: Array<{
    symbolId: number;
    snippet: string;
    filePath: string;
    line: number;
  }>;
  health: 'healthy' | 'warning' | 'problematic';
  trend?: 'improving' | 'stable' | 'degrading';
}

/**
 * Cross-language binding indicator
 */
export interface BindingIndicator {
  id: string;
  sourceLanguage: string;
  targetLanguage: string;
  bindingType: 'REST' | 'gRPC' | 'FFI' | 'WebSocket' | 'Process' | 'Script';
  count: number;
  health: 'healthy' | 'warning' | 'error';
  examples?: Array<{
    source: Symbol;
    target: Symbol;
    mechanism: string;
  }>;
  performance?: {
    avgLatency?: number;
    errorRate?: number;
  };
}

/**
 * Mini graph configuration for dashboard preview
 */
export interface MiniGraphConfig {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerNodeId?: string;
  maxNodes?: number;
  showLabels?: boolean;
  interactive?: boolean;
  colorScheme?: 'language' | 'pattern' | 'complexity' | 'health';
}

/**
 * Dashboard layout preferences
 */
export interface DashboardLayout {
  metrics: {
    visible: boolean;
    order: string[];
    expanded: string[];
  };
  insights: {
    visible: boolean;
    maxItems: number;
    severityFilter: string[];
  };
  graph: {
    visible: boolean;
    size: 'small' | 'medium' | 'large';
  };
  patterns: {
    visible: boolean;
    categoryFilter: string[];
  };
  compactMode: boolean;
  zenMode: boolean;
}

/**
 * Rich tooltip content structure
 */
export interface TooltipContent {
  title?: string;
  subtitle?: string;
  description?: string;
  stats?: Array<{
    label: string;
    value: string | number;
    color?: string;
    icon?: string;
  }>;
  actions?: Array<{
    label: string;
    icon?: string;
    action?: () => void;
  }>;
  chart?: {
    type: 'sparkline' | 'pie' | 'bar';
    data: any;
    options?: any;
  };
  tags?: string[];
  timestamp?: Date;
}

/**
 * Layer visibility state for progressive disclosure
 */
export interface LayerState {
  overview: boolean;
  details: boolean;
  advanced: boolean;
  debug: boolean;
}

/**
 * Performance metrics for dashboard
 */
export interface DashboardPerformance {
  renderTime: number;
  dataLoadTime: number;
  activeComponents: number;
  memoryUsage?: number;
  fps?: number;
  lastUpdate: Date;
}

/**
 * Activity timeline item
 */
export interface ActivityItem {
  id: string;
  type: 'parse' | 'analyze' | 'insight' | 'error' | 'user';
  title: string;
  description?: string;
  timestamp: Date;
  duration?: number;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  metadata?: Record<string, any>;
}

/**
 * Navigation breadcrumb
 */
export interface Breadcrumb {
  id: string;
  label: string;
  icon?: string;
  link?: string;
  dropdown?: Array<{
    id: string;
    label: string;
    icon?: string;
    link: string;
    recent?: boolean;
  }>;
}

/**
 * Dashboard component lifecycle events
 */
export interface DashboardEvents {
  onMetricClick?: (metric: MetricData) => void;
  onInsightAction?: (insight: InsightCard) => void;
  onPatternSelect?: (pattern: PatternItem) => void;
  onNodeSelect?: (node: GraphNode) => void;
  onLayoutChange?: (layout: DashboardLayout) => void;
  onRefresh?: () => void;
}

/**
 * Enhanced metric card configuration
 */
export interface MetricCardConfig {
  id: string;
  title: string;
  query: () => Promise<MetricData>;
  refreshInterval?: number;
  expandable?: boolean;
  actions?: QuickAction[];
  visualization?: {
    type: 'sparkline' | 'pie' | 'bar' | 'trend';
    options?: any;
  };
  thresholds?: {
    warning?: number;
    critical?: number;
  };
}

/**
 * Graph edge type
 */
export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight?: number;
  details?: string;
  isCrossLanguage?: boolean;
  sourceLanguage?: string;
  targetLanguage?: string;
}

/**
 * Impact Analysis Types
 */
export interface ImpactMetrics {
  testCoverage: {
    affected: number;
    covered: number;
    percentage: number;
    uncoveredSymbols: Symbol[];
  };
  performanceImpact: {
    estimatedLatency: number;
    memoryDelta: number;
    cpuDelta: number;
    ioOperations: number;
  };
  buildImpact: {
    affectedFiles: number;
    estimatedBuildTime: number;
    incrementalBuildTime: number;
    dependencies: string[];
  };
  teamImpact: {
    affectedTeams: string[];
    primaryOwners: string[];
    reviewersNeeded: number;
    communicationChannels: string[];
  };
  riskScore: {
    overall: number;
    complexity: number;
    testability: number;
    stability: number;
    historicalSuccess: number;
  };
}

export interface ImpactTimeline {
  immediateImpact: Symbol[];      // < 1 hour
  shortTermImpact: Symbol[];      // < 1 day  
  mediumTermImpact: Symbol[];     // < 1 week
  longTermImpact: Symbol[];       // > 1 week
  estimatedPropagationTime: number;
  criticalPath: Symbol[];
}

export interface ImpactScenario {
  id: string;
  name: string;
  description: string;
  changes: Array<{
    symbolId: number;
    changeType: 'modify' | 'delete' | 'add' | 'rename';
    newValue?: any;
  }>;
  predictedImpact: ImpactMetrics;
  confidence: number;
  alternatives?: ImpactScenario[];
}

export interface ImpactRecommendation {
  id: string;
  type: 'refactor' | 'test' | 'document' | 'defer' | 'split' | 'abstract';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  reasoning: string;
  estimatedEffort: number; // hours
  riskReduction: number;   // percentage
  suggestedApproach: string[];
  affectedSymbols: Symbol[];
  prerequisites?: string[];
}

export interface HistoricalImpact {
  changeId: string;
  timestamp: Date;
  symbolId: number;
  predictedImpact: number;
  actualImpact: number;
  accuracy: number;
  surpriseFactors?: string[];
  rollbackRequired: boolean;
  bugsIntroduced: number;
  performanceRegression?: number;
}

export interface CodeHealthIndicator {
  symbolId: number;
  health: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  testCoverage: number;
  complexity: number;
  stability: number; // based on change frequency
  lastModified: Date;
  modificationFrequency: number;
  bugDensity: number;
  technicalDebt: number;
}

export interface WhatIfAnalysis {
  scenarios: ImpactScenario[];
  comparison: {
    bestCase: ImpactScenario;
    worstCase: ImpactScenario;
    recommended: ImpactScenario;
    riskMatrix: Array<{
      scenario: string;
      risk: number;
      reward: number;
      effort: number;
    }>;
  };
}

export type DashboardMode = 'overview' | 'analysis' | 'debug' | 'zen';
export type MetricPeriod = '1h' | '24h' | '7d' | '30d' | 'all';
export type SortOrder = 'asc' | 'desc';
export type FilterOperator = 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'between';
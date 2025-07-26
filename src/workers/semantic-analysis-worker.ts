import { parentPort } from 'worker_threads';
import { CodeMetricsAnalyzer, MetricsInput } from '../analysis/code-metrics-analyzer.js';
import { PatternRecognitionEngine, PatternAnalysisInput } from '../analysis/pattern-recognition-engine.js';
import { createLogger } from '../utils/logger.js';

interface Symbol {
  name: string;
  kind: string;
  signature?: string;
  returnType?: string;
  relativePath?: string;
  [key: string]: any;
}

// Initialize analyzers
const metricsAnalyzer = new CodeMetricsAnalyzer();
const logger = createLogger('SemanticAnalysisWorker');
const patternEngine = new PatternRecognitionEngine();

// Enhanced semantic analysis using consolidated analyzers
const extractSemanticTags = async (symbol: Symbol, relativePath: string): Promise<string[]> => {
  const tags: string[] = [];
  
  // Add null checks
  if (!symbol.name || typeof symbol.name !== 'string') {
    return tags;
  }
  if (!relativePath || typeof relativePath !== 'string') {
    return tags;
  }
  
  try {
    // Use pattern recognition engine for comprehensive analysis
    const patternInput: PatternAnalysisInput = {
      symbol: {
        name: symbol.name,
        kind: symbol.kind,
        signature: symbol.signature,
        returnType: symbol.returnType
      } as any, // Cast to any since PatternAnalysisInput expects a partial symbol
      sourceCode: '', // Worker doesn't have access to full source code
      relationships: [],
      filePath: relativePath
    };

    const patterns = await patternEngine.analyzePatterns(patternInput);
    
    // Extract tags from pattern analysis
    if (patterns.semanticRole.primary) {
      tags.push(patterns.semanticRole.primary);
    }
    
    // Usage patterns
    patterns.usagePatterns.forEach(pattern => {
      tags.push(pattern.pattern + '-pattern');
    });
    
    // Component type
    if (patterns.componentType.type) {
      tags.push(patterns.componentType.type);
    }
    
    // Architectural layer
    if (patterns.architecturalLayer.layer !== 'unknown') {
      tags.push(patterns.architecturalLayer.layer + '-layer');
    }
    
    // Quality indicators
    patterns.qualityIndicators.forEach(indicator => {
      if (indicator.severity === 'warning' || indicator.severity === 'error') {
        tags.push(indicator.name.toLowerCase().replace(/\s+/g, '-'));
      }
    });

  } catch (error) {
    logger.warn('Pattern engine analysis failed, using fallback', error, { symbolName: symbol.name });
    // Fallback to basic analysis if pattern engine fails
    const nameLower = symbol.name.toLowerCase();
    const pathLower = relativePath.toLowerCase();
    
    // Performance tags
    if (nameLower.includes('gpu') || pathLower.includes('vulkan')) tags.push('gpu-accelerated');
    if (nameLower.includes('parallel') || nameLower.includes('async')) tags.push('concurrent');
    if (nameLower.includes('cache')) tags.push('cached');
    if (nameLower.includes('batch')) tags.push('batch-processing');
    
    // Pattern tags
    if (nameLower.startsWith('create') || nameLower.startsWith('make')) tags.push('factory-pattern');
    if (nameLower.includes('generate')) tags.push('generator-pattern');
    if (nameLower.includes('manager')) tags.push('manager-pattern');
    if (nameLower.includes('singleton')) tags.push('singleton-pattern');
    if (nameLower.includes('observer')) tags.push('observer-pattern');
    if (nameLower.includes('strategy')) tags.push('strategy-pattern');
    
    // Domain tags
    if (pathLower.includes('heightmap') || nameLower.includes('height')) tags.push('terrain-generation');
    if (pathLower.includes('noise') || nameLower.includes('noise')) tags.push('noise-generation');
    if (pathLower.includes('render')) tags.push('rendering');
    if (pathLower.includes('physics')) tags.push('physics-simulation');
    if (pathLower.includes('ecosystem')) tags.push('ecosystem-simulation');
    if (pathLower.includes('weather')) tags.push('weather-systems');
    
    // Architecture tags
    if (pathLower.includes('orchestrat')) tags.push('orchestration');
    if (pathLower.includes('pipeline')) tags.push('pipeline-architecture');
    if (pathLower.includes('compute')) tags.push('compute-shader');
    
    // Quality tags
    if (symbol.signature && symbol.signature.length > 200) tags.push('complex-signature');
    if (nameLower.includes('deprecated')) tags.push('deprecated');
    if (nameLower.includes('legacy')) tags.push('legacy');
    if (nameLower.includes('temp') || nameLower.includes('tmp')) tags.push('temporary');
  }
  
  return [...new Set(tags)]; // Remove duplicates
};

const detectExecutionMode = (symbol: Symbol, relativePath: string): string => {
  if (!symbol.name || typeof symbol.name !== 'string') return 'cpu';
  if (!relativePath || typeof relativePath !== 'string') return 'cpu';
  
  const nameLower = symbol.name.toLowerCase();
  const pathLower = relativePath.toLowerCase();
  
  // Explicit GPU indicators
  if (nameLower.includes('gpu') || pathLower.includes('gpu')) return 'gpu';
  if (pathLower.includes('vulkan') || pathLower.includes('compute')) return 'gpu';
  if (symbol.signature?.includes('VkCommandBuffer') || symbol.signature?.includes('GPUBuffer')) return 'gpu';
  
  // Explicit CPU indicators
  if (nameLower.includes('cpu')) return 'cpu';
  
  // Hybrid/Unified indicators
  if (nameLower.includes('unified') || nameLower.includes('hybrid')) return 'hybrid';
  if (nameLower.includes('fallback')) return 'hybrid';
  
  // Auto mode indicators
  if (symbol.signature?.includes('GPUMode') || symbol.signature?.includes('ExecutionMode')) return 'auto';
  
  // Default based on context
  if (pathLower.includes('rendering') && !pathLower.includes('cpu')) return 'gpu';
  
  return 'cpu'; // default
};

const isFactoryMethod = (symbol: Symbol): boolean => {
  if (!symbol.name || typeof symbol.name !== 'string') return false;
  
  const nameLower = symbol.name.toLowerCase();
  return nameLower.startsWith('create') || 
         nameLower.startsWith('make') || 
         nameLower.includes('factory') ||
         (symbol.kind === 'function' && symbol.returnType?.includes('unique_ptr')) || false;
};

const isGeneratorMethod = (symbol: Symbol): boolean => {
  if (!symbol.name || typeof symbol.name !== 'string') return false;
  
  const nameLower = symbol.name.toLowerCase();
  return nameLower.includes('generate') || 
         nameLower.includes('build') ||
         nameLower.includes('produce');
};

const detectPipelineStage = (relativePath: string): string => {
  if (!relativePath || typeof relativePath !== 'string') return 'unknown';
  
  const path = relativePath.toLowerCase();
  
  if (path.includes('generation/heightmap') || path.includes('generation/noise')) {
    return 'terrain_formation';
  }
  if (path.includes('generation/feature') || path.includes('generation/biome')) {
    return 'feature_placement';
  }
  if (path.includes('rendering')) {
    return 'rendering';
  }
  if (path.includes('physics')) {
    return 'physics_processing';
  }
  if (path.includes('ecosystem')) {
    return 'ecosystem_simulation';
  }
  if (path.includes('weather') || path.includes('atmospheric')) {
    return 'weather_systems';
  }
  if (path.includes('orchestrat')) {
    return 'orchestration';
  }
  if (path.includes('gui')) {
    return 'gui';
  }
  
  return 'unknown';
};

// Main message handler - now async to support consolidated analyzers
parentPort?.on('message', async ({ symbols, relativePath }) => {
  try {
    // Filter out symbols with invalid names
    const validSymbols = symbols.filter((symbol: Symbol) => 
      symbol && symbol.name && typeof symbol.name === 'string' && symbol.name.trim().length > 0
    );
    
    // Process symbols with enhanced analysis
    const analyzed = await Promise.all(validSymbols.map(async (symbol: Symbol) => {
      const semanticTags = await extractSemanticTags(symbol, relativePath);
      
      // Get complexity metrics if signature is available
      let complexityMetrics = null;
      if (symbol.signature) {
        try {
          const metricsInput: MetricsInput = {
            symbol: {
              name: symbol.name,
              kind: symbol.kind,
              signature: symbol.signature,
              returnType: symbol.returnType
            },
            language: 'cpp', // Assume C++ for this worker
            maxLines: 50 // Limit for worker performance
          };
          
          complexityMetrics = metricsAnalyzer.analyzeComplexity(metricsInput);
        } catch (error) {
          logger.debug('Complexity analysis failed in worker', error, { symbolName: symbol.name });
          // Ignore complexity analysis errors in worker
        }
      }
      
      return {
        ...symbol,
        semanticTags: [
          ...(symbol.semanticTags || []), // Preserve existing tags
          ...semanticTags // Add new tags from consolidated analysis
        ],
        executionMode: detectExecutionMode(symbol, relativePath),
        isFactory: isFactoryMethod(symbol),
        isGenerator: isGeneratorMethod(symbol),
        pipelineStage: detectPipelineStage(relativePath),
        
        // Enhanced performance hints from consolidated analysis
        returnsVectorFloat: symbol.returnType === 'std::vector<float>' || 
                           (symbol.name && typeof symbol.name === 'string' && 
                            symbol.name.toLowerCase().includes('heightmap') && 
                            symbol.name.toLowerCase().includes('generate')),
        usesGpuCompute: detectExecutionMode(symbol, relativePath) === 'gpu',
        hasCpuFallback: symbol.signature?.includes('GPUMode') || false,
        
        // Add complexity metrics if available
        ...(complexityMetrics && {
          cyclomaticComplexity: complexityMetrics.cyclomaticComplexity,
          cognitiveComplexity: complexityMetrics.cognitiveComplexity,
          maintainabilityIndex: complexityMetrics.maintainabilityIndex,
          riskLevel: complexityMetrics.riskLevel
        })
      };
    }));
    
    parentPort?.postMessage(analyzed);
  } catch (error) {
    parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
});
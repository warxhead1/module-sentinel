import { parentPort, workerData } from 'worker_threads';
import { GrammarAwareParser } from './grammar-aware-parser.js';
import { EnhancedTreeSitterParser } from './enhanced-tree-sitter-parser.js';
import * as fs from 'fs';
import * as path from 'path';

interface WorkerData {
  filePath: string;
  useGrammarAware: boolean;
  projectPath: string;
}

// Initialize parsers once per worker
const grammarParser = new GrammarAwareParser(false);
const treeParser = new EnhancedTreeSitterParser();
let initialized = false;

async function initializeParsers() {
  if (!initialized) {
    await grammarParser.initialize();
    await treeParser.initialize();
    initialized = true;
  }
}

async function parseFile(data: WorkerData) {
  try {
    await initializeParsers();
    
    const parser = data.useGrammarAware ? grammarParser : treeParser;
    const result = await parser.parseFile(data.filePath);
    
    // CRITICAL FIX: Apply enhanced relationship extraction to worker results
    // The basic parsers don't have relationship extraction, so we need to add it here
    if (result && (!result.relationships || result.relationships.length === 0)) {
      const content = await fs.promises.readFile(data.filePath, 'utf-8');
      result.relationships = extractEnhancedRelationships(result, content);
    }
    
    // Add file size for performance tracking
    const stats = await fs.promises.stat(data.filePath);
    
    // Enhanced semantic analysis for worker pools
    const semanticAnalysis = analyzeWorkerSemantics(result, data.filePath);
    
    parentPort?.postMessage({
      success: true,
      result,
      filePath: data.filePath,
      fileSize: stats.size,
      parserUsed: data.useGrammarAware ? 'grammar-aware' : 'tree-sitter',
      semanticAnalysis // NEW: Include worker-specific semantic analysis
    });
  } catch (error) {
    parentPort?.postMessage({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      filePath: data.filePath
    });
  }
}

/**
 * Worker-specific semantic analysis
 */
function analyzeWorkerSemantics(parseResult: any, filePath: string) {
  const analysis = {
    fileClassification: classifyFileType(filePath),
    semanticDensity: calculateSemanticDensity(parseResult),
    domainTags: extractDomainTags(parseResult, filePath),
    confidenceMetrics: calculateConfidenceMetrics(parseResult),
    workerRecommendations: generateWorkerRecommendations(parseResult, filePath)
  };
  
  return analysis;
}

/**
 * Classify file type for worker specialization
 */
function classifyFileType(filePath: string): string[] {
  const classifications = [];
  const path = filePath.toLowerCase();
  
  if (path.includes('vulkan') || path.includes('pipeline')) classifications.push('vulkan_graphics');
  if (path.includes('terrain') || path.includes('height')) classifications.push('terrain_generation');
  if (path.includes('orchestrator') || path.includes('manager')) classifications.push('orchestration');
  if (path.includes('factory') || path.includes('builder')) classifications.push('factory_pattern');
  if (path.includes('feedback') || path.includes('analytics')) classifications.push('feedback_system');
  if (path.includes('gpu') || path.includes('compute')) classifications.push('gpu_compute');
  
  return classifications;
}

/**
 * Calculate semantic density of parse results
 */
function calculateSemanticDensity(parseResult: any): number {
  const totalSymbols = (parseResult.methods?.length || 0) + 
                      (parseResult.classes?.length || 0) + 
                      (parseResult.functions?.length || 0);
  const semanticSymbols = (parseResult.patterns?.length || 0) + 
                         (parseResult.relationships?.length || 0);
  
  return totalSymbols > 0 ? semanticSymbols / totalSymbols : 0;
}

/**
 * Extract domain-specific tags from parse results
 */
function extractDomainTags(parseResult: any, filePath: string): string[] {
  const tags = [];
  const path = filePath.toLowerCase();
  
  // Domain classification based on file path and symbols
  const domains = {
    terrain: ['terrain', 'height', 'elevation', 'mountain'],
    rendering: ['vulkan', 'gpu', 'render', 'graphics'],
    orchestration: ['orchestrator', 'manager', 'controller'],
    generation: ['generator', 'factory', 'builder'],
    physics: ['physics', 'simulation', 'dynamics'],
    feedback: ['feedback', 'analytics', 'optimization']
  };
  
  for (const [domain, keywords] of Object.entries(domains)) {
    if (keywords.some(keyword => path.includes(keyword))) {
      tags.push(`domain_${domain}`);
    }
  }
  
  return tags;
}

/**
 * Calculate confidence metrics for worker analysis
 */
function calculateConfidenceMetrics(parseResult: any): any {
  const symbolCount = (parseResult.methods?.length || 0) + (parseResult.classes?.length || 0);
  const patternCount = parseResult.patterns?.length || 0;
  const relationshipCount = parseResult.relationships?.length || 0;
  
  return {
    symbolConfidence: Math.min(symbolCount / 10, 1.0), // Normalize to 0-1
    patternConfidence: Math.min(patternCount / 3, 1.0),
    relationshipConfidence: Math.min(relationshipCount / 5, 1.0),
    overallConfidence: (symbolCount + patternCount * 2 + relationshipCount) / 20
  };
}

/**
 * Generate worker specialization recommendations
 */
function generateWorkerRecommendations(parseResult: any, filePath: string): any {
  const fileType = classifyFileType(filePath);
  const complexity = calculateSemanticDensity(parseResult);
  
  return {
    preferredParser: complexity > 0.3 ? 'tree-sitter' : 'grammar-aware',
    specialization: fileType.length > 0 ? fileType[0] : 'general',
    priority: complexity > 0.5 ? 'high' : 'normal',
    requiresDetailedAnalysis: complexity > 0.4 || fileType.includes('orchestration')
  };
}

// Listen for messages from the main thread
if (parentPort) {
  parentPort.on('message', (data: WorkerData) => {
    console.log(`Worker received task for: ${data.filePath}`);
    parseFile(data);
  });
}

/**
 * Enhanced relationship extraction for worker parsers
 * This applies the same logic as the enhanced tree-sitter parser to worker results
 */
function extractEnhancedRelationships(parseResult: any, content: string): any[] {
  const relationships: any[] = [];
  const contentLines = content.split('\n');
  const methods = parseResult.methods || [];
  const classes = parseResult.classes || [];
  
  // Add inheritance relationships from classes
  for (const cls of classes) {
    for (const baseClass of cls.baseClasses || []) {
      relationships.push({
        from: cls.name,
        to: baseClass,
        type: 'inherits',
        confidence: 0.95
      });
    }
  }
  
  // Extract method call relationships by analyzing method bodies
  for (const method of methods) {
    if (!method.location) continue;
    
    // Find the method's body in the source code
    const methodRelationships = extractMethodCallRelationships(
      method, content, contentLines, methods, classes
    );
    relationships.push(...methodRelationships);
  }
  
  return relationships;
}

/**
 * Extract method call relationships from method bodies
 */
function extractMethodCallRelationships(
  sourceMethod: any,
  content: string,
  contentLines: string[],
  allMethods: any[],
  allClasses: any[]
): any[] {
  const relationships: any[] = [];
  
  // Find method body boundaries (crude but effective for C++)
  const startLine = sourceMethod.location.line;
  const methodBodyStart = findMethodBodyStart(contentLines, startLine);
  const methodBodyEnd = findMethodBodyEnd(contentLines, methodBodyStart);
  
  if (methodBodyStart === -1 || methodBodyEnd === -1) return relationships;
  
  // Analyze each line in the method body for function calls
  for (let lineNum = methodBodyStart; lineNum <= methodBodyEnd; lineNum++) {
    const line = contentLines[lineNum] || '';
    const calls = extractCallsFromLine(line, lineNum + 1);
    
    for (const call of calls) {
      // Find matching methods
      const targets = findMatchingMethods(call, allMethods, sourceMethod.className || '');
      
      for (const target of targets) {
        relationships.push({
          from: sourceMethod.name,
          to: target.name,
          type: 'calls',
          confidence: target.confidence
        });
      }
    }
  }
  
  return relationships;
}

/**
 * Find the start line of a method body, handling constructor initialization lists
 */
function findMethodBodyStart(contentLines: string[], methodStartLine: number): number {
  // Handle C++ constructor initialization lists and method bodies accurately
  let foundOpenBrace = false;
  let braceLineIndex = -1;
  
  // Look for opening brace, but be smarter about constructor initialization lists
  for (let i = methodStartLine - 1; i < Math.min(contentLines.length, methodStartLine + 15); i++) {
    const line = contentLines[i] || '';
    
    if (line.includes('{')) {
      braceLineIndex = i;
      foundOpenBrace = true;
      
      // Check if this is just an empty method body: {}
      if (line.trim().endsWith('{}')) {
        // Empty method body - no actual body to analyze
        return -1;
      }
      
      // Check if opening and closing brace are on the same line (single-line method)
      const openBraceIndex = line.indexOf('{');
      const closeBraceIndex = line.indexOf('}', openBraceIndex + 1);
      if (openBraceIndex !== -1 && closeBraceIndex !== -1) {
        // Single-line method body like: { return value; }
        return i; // Include this line as the only body line
      }
      
      // Multi-line method body - return line after opening brace
      return i + 1;
    }
  }
  
  return -1;
}

/**
 * Find the end line of a method body
 */
function findMethodBodyEnd(contentLines: string[], bodyStartLine: number): number {
  if (bodyStartLine === -1) return -1;
  
  const startLine = contentLines[bodyStartLine] || '';
  
  // Check if this is a single-line method (opening and closing brace on same line)
  const openBraceIndex = startLine.indexOf('{');
  const closeBraceIndex = startLine.indexOf('}', openBraceIndex + 1);
  if (openBraceIndex !== -1 && closeBraceIndex !== -1) {
    // Single-line method - start and end are the same line
    return bodyStartLine;
  }
  
  // Multi-line method - find matching closing brace
  let braceCount = 0;
  let foundFirstBrace = false;
  
  for (let i = bodyStartLine; i < contentLines.length; i++) {
    const line = contentLines[i] || '';
    
    for (const char of line) {
      if (char === '{') {
        braceCount++;
        foundFirstBrace = true;
      } else if (char === '}') {
        braceCount--;
        if (foundFirstBrace && braceCount === 0) {
          return i;
        }
      }
    }
  }
  
  return -1;
}

/**
 * Extract function calls from a single line of code
 */
function extractCallsFromLine(line: string, lineNumber: number): Array<{pattern: string, methodName: string, objectName?: string, lineNumber: number}> {
  const calls: Array<{pattern: string, methodName: string, objectName?: string, lineNumber: number}> = [];
  
  // Pattern 1: object.method() or object->method()
  const memberCallRegex = /(\w+)(?:\.|\->)(\w+)\s*\(/g;
  let match;
  while ((match = memberCallRegex.exec(line)) !== null) {
    calls.push({
      pattern: `${match[1]}.${match[2]}()`,
      methodName: match[2],
      objectName: match[1],
      lineNumber: lineNumber
    });
  }
  
  // Pattern 2: Direct method calls: method()
  const directCallRegex = /(?<![.\w])(\w+)\s*\(/g;
  while ((match = directCallRegex.exec(line)) !== null) {
    const methodName = match[1];
    
    // Skip common C++ keywords and operators
    if (['if', 'for', 'while', 'switch', 'return', 'throw', 'catch', 'sizeof', 'typeof', 'static_cast', 'dynamic_cast', 'const_cast', 'reinterpret_cast'].includes(methodName)) {
      continue;
    }
    
    // Skip if it's already captured as a member call
    const alreadyCaptured = calls.some(call => call.methodName === methodName && call.lineNumber === lineNumber);
    if (!alreadyCaptured) {
      calls.push({
        pattern: `${methodName}()`,
        methodName: methodName,
        lineNumber: lineNumber
      });
    }
  }
  
  return calls;
}

/**
 * Find methods that match a function call, with self-reference filtering
 */
function findMatchingMethods(
  call: {pattern: string, methodName: string, objectName?: string, lineNumber: number},
  allMethods: any[],
  sourceClassName: string
): Array<{name: string, className: string | undefined, confidence: number}> {
  const matches: Array<{name: string, className: string | undefined, confidence: number}> = [];
  
  // Find methods with matching names, but exclude duplicates
  const candidateMethods = allMethods.filter(method => method.name === call.methodName);
  
  // Deduplicate candidates by preferring class methods over global duplicates
  const uniqueCandidates = new Map<string, any>();
  for (const method of candidateMethods) {
    const key = `${method.name}::${method.location?.line || 0}::${method.parameters?.length || 0}`;
    
    if (!uniqueCandidates.has(key)) {
      uniqueCandidates.set(key, method);
    } else {
      // Prefer class method over global method for same location
      const existing = uniqueCandidates.get(key)!;
      if (method.className && !existing.className) {
        uniqueCandidates.set(key, method);
      }
    }
  }
  
  for (const method of uniqueCandidates.values()) {
    // CRITICAL: Skip self-references to avoid false positives
    if (method.className === sourceClassName && method.name === call.methodName) {
      // Only allow recursive calls if there's clear evidence (e.g., parameters, conditional context)
      // For now, skip all self-references to avoid false positives
      continue;
    }
    
    let confidence = 0.5; // Base confidence
    
    // Same class methods get highest confidence
    if (method.className === sourceClassName) {
      confidence = 0.9;
    }
    // Methods in other classes get medium confidence
    else if (method.className) {
      confidence = 0.7;
    }
    // Global functions get lowest confidence
    else {
      confidence = 0.4;
    }
    
    // If this is a member call (object.method), try to match object type
    if (call.objectName && method.className) {
      // TODO: Could enhance this by tracking member variable types
      confidence *= 0.8; // Slightly lower confidence for member calls without type info
    }
    
    matches.push({
      name: method.name,
      className: method.className,
      confidence: confidence
    });
  }
  
  return matches;
}

// Handle initial workerData if provided
if (workerData) {
  parseFile(workerData as WorkerData);
}
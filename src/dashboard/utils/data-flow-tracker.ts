/**
 * Data Flow Tracker Module
 * 
 * Tracks variable usage, parameter flow, and data dependencies
 * through control flow paths.
 */

export interface DataFlowAnalysis {
  flows: DataFlow[];
  variables: Map<string, VariableInfo>;
  parameters?: ParameterFlow[];
  dependencies?: DataDependency[];
  taintAnalysis?: TaintAnalysis;
}

export interface DataFlow {
  id: string;
  variable: string;
  type: 'read' | 'write' | 'modify' | 'pass';
  fromNode: string;
  toNode: string;
  line: number;
  value?: any;
  scope?: string;
}

export interface VariableInfo {
  name: string;
  type?: string;
  scope: 'local' | 'parameter' | 'member' | 'global';
  declarationLine?: number;
  usages: VariableUsage[];
  lifespan: {
    start: number;
    end: number;
  };
  isModified: boolean;
  isReturned: boolean;
  isPassed: boolean;
}

export interface VariableUsage {
  nodeId: string;
  line: number;
  type: 'read' | 'write' | 'modify';
  context?: string;
}

export interface ParameterFlow {
  name: string;
  type?: string;
  index: number;
  flows: Array<{
    nodeId: string;
    usage: 'read' | 'modify' | 'pass';
    line: number;
  }>;
  isModified: boolean;
  isReturned: boolean;
  isPassedToOtherFunction: boolean;
}

export interface DataDependency {
  from: string;
  to: string;
  type: 'data' | 'control' | 'call';
  variables: string[];
  strength: 'strong' | 'weak';
}

export interface TaintAnalysis {
  sources: TaintSource[];
  sinks: TaintSink[];
  flows: TaintFlow[];
}

export interface TaintSource {
  nodeId: string;
  type: 'user-input' | 'file' | 'network' | 'environment';
  variable: string;
  line: number;
}

export interface TaintSink {
  nodeId: string;
  type: 'output' | 'file-write' | 'network' | 'system-call';
  variable: string;
  line: number;
}

export interface TaintFlow {
  from: TaintSource;
  to: TaintSink;
  path: string[];
  isSanitized: boolean;
}

export class DataFlowTracker {
  /**
   * Analyze data flow through control flow
   */
  analyze(
    nodes: any[],
    edges: any[],
    symbolData: any
  ): DataFlowAnalysis {
    const variables = this.extractVariables(nodes, symbolData);
    const flows = this.trackDataFlows(nodes, edges, variables);
    const parameters = this.analyzeParameterFlow(symbolData, nodes, flows);
    const dependencies = this.analyzeDependencies(nodes, edges, flows);
    const taintAnalysis = this.performTaintAnalysis(nodes, flows, variables);

    return {
      flows,
      variables,
      parameters,
      dependencies,
      taintAnalysis
    };
  }

  /**
   * Extract variables from nodes and symbol data
   */
  private extractVariables(
    nodes: any[],
    symbolData: any
  ): Map<string, VariableInfo> {
    const variables = new Map<string, VariableInfo>();

    // Extract parameters
    if (symbolData.symbol.signature) {
      const params = this.extractParameters(symbolData.symbol.signature);
      params.forEach((param, index) => {
        variables.set(param.name, {
          name: param.name,
          type: param.type,
          scope: 'parameter',
          declarationLine: symbolData.symbol.line,
          usages: [],
          lifespan: {
            start: symbolData.symbol.line,
            end: this.findFunctionEnd(nodes)
          },
          isModified: false,
          isReturned: false,
          isPassed: false
        });
      });
    }

    // Extract variables from node code (simplified)
    nodes.forEach(node => {
      if (!node.code) return;

      // Look for variable declarations
      const varPatterns = [
        /(?:int|float|double|char|bool|auto|const|string)\s+(\w+)/g,
        /(\w+)\s*=/g,
        /for\s*\(\s*(?:int|auto)?\s*(\w+)/g
      ];

      varPatterns.forEach(pattern => {
        const matches = node.code.matchAll(pattern);
        for (const match of matches) {
          const varName = match[1];
          if (!variables.has(varName) && this.isValidVariableName(varName)) {
            variables.set(varName, {
              name: varName,
              scope: 'local',
              declarationLine: node.line,
              usages: [],
              lifespan: {
                start: node.line,
                end: this.findVariableEnd(node, nodes)
              },
              isModified: false,
              isReturned: false,
              isPassed: false
            });
          }
        }
      });

      // Track variable usages
      this.trackVariableUsages(node, variables);
    });

    return variables;
  }

  /**
   * Extract parameters from function signature
   */
  private extractParameters(signature: string): Array<{name: string, type?: string}> {
    const params: Array<{name: string, type?: string}> = [];
    
    // Extract content between parentheses
    const paramMatch = signature.match(/\((.*?)\)/);
    if (!paramMatch) return params;

    const paramString = paramMatch[1].trim();
    if (!paramString) return params;

    // Split by comma (handling nested templates)
    const paramParts = this.splitParameters(paramString);
    
    paramParts.forEach(part => {
      // Extract type and name
      const trimmed = part.trim();
      const words = trimmed.split(/\s+/);
      
      if (words.length > 0) {
        const name = words[words.length - 1].replace(/[&*]/, '');
        const type = words.slice(0, -1).join(' ');
        
        if (this.isValidVariableName(name)) {
          params.push({ name, type: type || undefined });
        }
      }
    });

    return params;
  }

  /**
   * Split parameters handling nested templates
   */
  private splitParameters(paramString: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;

    for (const char of paramString) {
      if (char === '<' || char === '(') depth++;
      else if (char === '>' || char === ')') depth--;
      else if (char === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    return parts;
  }

  /**
   * Check if string is valid variable name
   */
  private isValidVariableName(name: string): boolean {
    return /^[a-zA-Z_]\w*$/.test(name) &&
           !['if', 'else', 'for', 'while', 'return', 'class', 'struct'].includes(name);
  }

  /**
   * Find end of function
   */
  private findFunctionEnd(nodes: any[]): number {
    const exitNodes = nodes.filter(n => n.type === 'exit');
    if (exitNodes.length > 0) {
      return Math.max(...exitNodes.map(n => n.line));
    }
    return Math.max(...nodes.map(n => n.line));
  }

  /**
   * Find end of variable scope
   */
  private findVariableEnd(declNode: any, nodes: any[]): number {
    // Simplified: assume variable is in scope until end of function
    // In real implementation, would analyze scopes properly
    return this.findFunctionEnd(nodes);
  }

  /**
   * Track variable usages in node
   */
  private trackVariableUsages(
    node: any,
    variables: Map<string, VariableInfo>
  ): void {
    if (!node.code) return;

    variables.forEach((varInfo, varName) => {
      // Skip if variable not yet declared
      if (node.line < varInfo.declarationLine!) return;

      const regex = new RegExp(`\\b${varName}\\b`, 'g');
      if (regex.test(node.code)) {
        const usageType = this.determineUsageType(node.code, varName);
        
        varInfo.usages.push({
          nodeId: node.id,
          line: node.line,
          type: usageType,
          context: node.code
        });

        if (usageType === 'write' || usageType === 'modify') {
          varInfo.isModified = true;
        }

        // Check if variable is returned
        if (node.type === 'return' && node.code.includes(varName)) {
          varInfo.isReturned = true;
        }

        // Check if variable is passed to function
        if (this.isPassedToFunction(node.code, varName)) {
          varInfo.isPassed = true;
        }
      }
    });
  }

  /**
   * Determine how variable is used
   */
  private determineUsageType(
    code: string,
    varName: string
  ): 'read' | 'write' | 'modify' {
    // Check for assignment
    const assignPattern = new RegExp(`${varName}\\s*=(?!=)`, 'g');
    if (assignPattern.test(code)) {
      return 'write';
    }

    // Check for modification
    const modifyPatterns = [
      new RegExp(`${varName}\\s*\\+=`),
      new RegExp(`${varName}\\s*-=`),
      new RegExp(`${varName}\\s*\\*=`),
      new RegExp(`${varName}\\s*/=`),
      new RegExp(`\\+\\+${varName}`),
      new RegExp(`${varName}\\+\\+`),
      new RegExp(`--${varName}`),
      new RegExp(`${varName}--`)
    ];

    if (modifyPatterns.some(pattern => pattern.test(code))) {
      return 'modify';
    }

    return 'read';
  }

  /**
   * Check if variable is passed to a function
   */
  private isPassedToFunction(code: string, varName: string): boolean {
    // Simple heuristic: variable appears inside function call parentheses
    const functionCallPattern = /\w+\s*\([^)]*\)/g;
    const matches = code.match(functionCallPattern) || [];
    
    return matches.some(match => match.includes(varName));
  }

  /**
   * Track data flows between nodes
   */
  private trackDataFlows(
    nodes: any[],
    edges: any[],
    variables: Map<string, VariableInfo>
  ): DataFlow[] {
    const flows: DataFlow[] = [];
    let flowId = 0;

    // Build adjacency for flow tracking
    const adjacency = this.buildAdjacency(edges);

    variables.forEach((varInfo, varName) => {
      // Track flows for each variable
      const writeNodes = varInfo.usages.filter(u => 
        u.type === 'write' || u.type === 'modify'
      );
      const readNodes = varInfo.usages.filter(u => u.type === 'read');

      // Create flows from writes to reads
      writeNodes.forEach(write => {
        readNodes.forEach(read => {
          if (this.canFlowBetween(write.nodeId, read.nodeId, adjacency)) {
            flows.push({
              id: `flow_${flowId++}`,
              variable: varName,
              type: write.type === 'modify' ? 'modify' : 'write',
              fromNode: write.nodeId,
              toNode: read.nodeId,
              line: write.line,
              scope: varInfo.scope
            });
          }
        });
      });
    });

    return flows;
  }

  /**
   * Build adjacency map
   */
  private buildAdjacency(edges: any[]): Map<string, Set<string>> {
    const adjacency = new Map<string, Set<string>>();
    
    edges.forEach(edge => {
      if (!adjacency.has(edge.from)) {
        adjacency.set(edge.from, new Set());
      }
      adjacency.get(edge.from)!.add(edge.to);
    });

    return adjacency;
  }

  /**
   * Check if data can flow between two nodes
   */
  private canFlowBetween(
    fromId: string,
    toId: string,
    adjacency: Map<string, Set<string>>
  ): boolean {
    // BFS to check reachability
    const queue = [fromId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === toId) return true;
      if (visited.has(current)) continue;

      visited.add(current);
      const neighbors = adjacency.get(current);
      if (neighbors) {
        neighbors.forEach(neighbor => queue.push(neighbor));
      }
    }

    return false;
  }

  /**
   * Analyze parameter flow
   */
  private analyzeParameterFlow(
    symbolData: any,
    nodes: any[],
    flows: DataFlow[]
  ): ParameterFlow[] {
    const parameterFlows: ParameterFlow[] = [];

    if (!symbolData.symbol.signature) return parameterFlows;

    const params = this.extractParameters(symbolData.symbol.signature);
    
    params.forEach((param, index) => {
      const paramFlows = flows.filter(f => f.variable === param.name);
      
      const flow: ParameterFlow = {
        name: param.name,
        type: param.type,
        index,
        flows: paramFlows.map(f => ({
          nodeId: f.fromNode,
          usage: f.type === 'read' ? 'read' : 'modify',
          line: f.line
        })),
        isModified: paramFlows.some(f => f.type === 'modify' || f.type === 'write'),
        isReturned: this.isParameterReturned(param.name, nodes),
        isPassedToOtherFunction: this.isParameterPassed(param.name, nodes)
      };

      parameterFlows.push(flow);
    });

    return parameterFlows;
  }

  /**
   * Check if parameter is returned
   */
  private isParameterReturned(paramName: string, nodes: any[]): boolean {
    return nodes.some(node => 
      node.type === 'return' && 
      node.code && 
      node.code.includes(paramName)
    );
  }

  /**
   * Check if parameter is passed to another function
   */
  private isParameterPassed(paramName: string, nodes: any[]): boolean {
    return nodes.some(node => 
      node.code && 
      this.isPassedToFunction(node.code, paramName)
    );
  }

  /**
   * Analyze data dependencies between nodes
   */
  private analyzeDependencies(
    nodes: any[],
    edges: any[],
    flows: DataFlow[]
  ): DataDependency[] {
    const dependencies: DataDependency[] = [];

    // Group flows by variable
    const flowsByVariable = new Map<string, DataFlow[]>();
    flows.forEach(flow => {
      if (!flowsByVariable.has(flow.variable)) {
        flowsByVariable.set(flow.variable, []);
      }
      flowsByVariable.get(flow.variable)!.push(flow);
    });

    // Create dependencies based on data flows
    flowsByVariable.forEach((varFlows, variable) => {
      varFlows.forEach(flow => {
        dependencies.push({
          from: flow.fromNode,
          to: flow.toNode,
          type: 'data',
          variables: [variable],
          strength: 'strong'
        });
      });
    });

    // Add control dependencies
    edges.forEach(edge => {
      if (edge.type === 'true' || edge.type === 'false') {
        dependencies.push({
          from: edge.from,
          to: edge.to,
          type: 'control',
          variables: [],
          strength: 'strong'
        });
      }
    });

    return dependencies;
  }

  /**
   * Perform taint analysis
   */
  private performTaintAnalysis(
    nodes: any[],
    flows: DataFlow[],
    variables: Map<string, VariableInfo>
  ): TaintAnalysis {
    const sources: TaintSource[] = [];
    const sinks: TaintSink[] = [];
    const taintFlows: TaintFlow[] = [];

    // Identify taint sources
    nodes.forEach(node => {
      if (!node.code) return;

      // User input sources
      if (this.isInputSource(node.code)) {
        const taintedVars = this.extractTaintedVariables(node.code, variables);
        taintedVars.forEach(varName => {
          sources.push({
            nodeId: node.id,
            type: 'user-input',
            variable: varName,
            line: node.line
          });
        });
      }

      // File input sources
      if (this.isFileSource(node.code)) {
        const taintedVars = this.extractTaintedVariables(node.code, variables);
        taintedVars.forEach(varName => {
          sources.push({
            nodeId: node.id,
            type: 'file',
            variable: varName,
            line: node.line
          });
        });
      }
    });

    // Identify taint sinks
    nodes.forEach(node => {
      if (!node.code) return;

      // Output sinks
      if (this.isOutputSink(node.code)) {
        const sinkVars = this.extractSinkVariables(node.code, variables);
        sinkVars.forEach(varName => {
          sinks.push({
            nodeId: node.id,
            type: 'output',
            variable: varName,
            line: node.line
          });
        });
      }

      // System call sinks
      if (this.isSystemCallSink(node.code)) {
        const sinkVars = this.extractSinkVariables(node.code, variables);
        sinkVars.forEach(varName => {
          sinks.push({
            nodeId: node.id,
            type: 'system-call',
            variable: varName,
            line: node.line
          });
        });
      }
    });

    // Track taint flows from sources to sinks
    sources.forEach(source => {
      sinks.forEach(sink => {
        if (source.variable === sink.variable) {
          const path = this.findTaintPath(source, sink, flows);
          if (path) {
            taintFlows.push({
              from: source,
              to: sink,
              path,
              isSanitized: this.checkSanitization(path, nodes)
            });
          }
        }
      });
    });

    return { sources, sinks, flows: taintFlows };
  }

  /**
   * Check if code contains input source
   */
  private isInputSource(code: string): boolean {
    const inputPatterns = [
      'cin', 'scanf', 'gets', 'fgets',
      'readline', 'input', 'argv',
      'getenv', 'request', 'query'
    ];
    
    return inputPatterns.some(pattern => 
      code.toLowerCase().includes(pattern)
    );
  }

  /**
   * Check if code contains file source
   */
  private isFileSource(code: string): boolean {
    const filePatterns = [
      'fread', 'read', 'ifstream',
      'getline', 'file.read', 'open'
    ];
    
    return filePatterns.some(pattern => 
      code.toLowerCase().includes(pattern)
    );
  }

  /**
   * Check if code contains output sink
   */
  private isOutputSink(code: string): boolean {
    const outputPatterns = [
      'cout', 'printf', 'puts',
      'write', 'send', 'response'
    ];
    
    return outputPatterns.some(pattern => 
      code.toLowerCase().includes(pattern)
    );
  }

  /**
   * Check if code contains system call sink
   */
  private isSystemCallSink(code: string): boolean {
    const systemPatterns = [
      'system', 'exec', 'popen',
      'fork', 'spawn', 'shell'
    ];
    
    return systemPatterns.some(pattern => 
      code.toLowerCase().includes(pattern)
    );
  }

  /**
   * Extract variables that get tainted
   */
  private extractTaintedVariables(
    code: string,
    variables: Map<string, VariableInfo>
  ): string[] {
    const tainted: string[] = [];
    
    variables.forEach((varInfo, varName) => {
      if (code.includes(varName) && this.determineUsageType(code, varName) === 'write') {
        tainted.push(varName);
      }
    });

    return tainted;
  }

  /**
   * Extract variables used in sinks
   */
  private extractSinkVariables(
    code: string,
    variables: Map<string, VariableInfo>
  ): string[] {
    const sinkVars: string[] = [];
    
    variables.forEach((varInfo, varName) => {
      if (code.includes(varName)) {
        sinkVars.push(varName);
      }
    });

    return sinkVars;
  }

  /**
   * Find taint propagation path
   */
  private findTaintPath(
    source: TaintSource,
    sink: TaintSink,
    flows: DataFlow[]
  ): string[] | null {
    // Simple path finding - in reality would trace through all flows
    const relevantFlows = flows.filter(f => f.variable === source.variable);
    
    if (relevantFlows.some(f => 
      f.fromNode === source.nodeId || f.toNode === sink.nodeId
    )) {
      return [source.nodeId, sink.nodeId];
    }

    return null;
  }

  /**
   * Check if taint path is sanitized
   */
  private checkSanitization(path: string[], nodes: any[]): boolean {
    // Check if any node in path performs sanitization
    return path.some(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node || !node.code) return false;

      const sanitizationPatterns = [
        'validate', 'sanitize', 'escape',
        'filter', 'clean', 'check'
      ];

      return sanitizationPatterns.some(pattern => 
        node.code.toLowerCase().includes(pattern)
      );
    });
  }
}
/**
 * Spawn Detector Module
 * 
 * Detects process spawning patterns across different programming languages,
 * tracks parent-child relationships, and maps execution flow across processes.
 */

import { MultiLanguageNode, CrossLanguageEdge } from './multi-language-detector.js';

export interface SpawnPattern {
  id: string;
  language: string;
  pattern: string;
  function: string;
  isAsync: boolean;
  returnsHandle: boolean;
  commonUse: string;
}

export interface ProcessSpawn {
  id: string;
  parentNode: MultiLanguageNode;
  childCommand: string;
  childLanguage?: string;
  spawnType: 'exec' | 'spawn' | 'fork' | 'system' | 'subprocess';
  isAsync: boolean;
  capturesOutput: boolean;
  arguments?: string[];
  environment?: Map<string, string>;
}

export interface ProcessTree {
  id: string;
  node: MultiLanguageNode;
  children: ProcessTree[];
  spawnInfo?: ProcessSpawn;
  depth: number;
  executionOrder?: number;
}

export interface SpawnChain {
  id: string;
  nodes: MultiLanguageNode[];
  spawns: ProcessSpawn[];
  languages: Set<string>;
  totalDepth: number;
  isRecursive: boolean;
}

export interface SpawnAnalysisResult {
  spawns: ProcessSpawn[];
  processTree: ProcessTree;
  spawnChains: SpawnChain[];
  statistics: SpawnStatistics;
}

export interface SpawnStatistics {
  totalSpawns: number;
  spawnsByLanguage: Map<string, number>;
  spawnTypes: Map<string, number>;
  averageChainLength: number;
  maxChainDepth: number;
  crossLanguageSpawns: number;
  asyncSpawns: number;
}

export class SpawnDetector {
  private static readonly SPAWN_PATTERNS: Map<string, SpawnPattern[]> = new Map([
    ['python', [
      {
        id: 'py_subprocess_run',
        language: 'python',
        pattern: 'subprocess.run',
        function: 'run',
        isAsync: false,
        returnsHandle: false,
        commonUse: 'Execute command and wait for completion'
      },
      {
        id: 'py_subprocess_popen',
        language: 'python',
        pattern: 'subprocess.Popen',
        function: 'Popen',
        isAsync: true,
        returnsHandle: true,
        commonUse: 'Spawn process with pipe control'
      },
      {
        id: 'py_os_system',
        language: 'python',
        pattern: 'os.system',
        function: 'system',
        isAsync: false,
        returnsHandle: false,
        commonUse: 'Simple command execution'
      },
      {
        id: 'py_os_popen',
        language: 'python',
        pattern: 'os.popen',
        function: 'popen',
        isAsync: false,
        returnsHandle: true,
        commonUse: 'Execute and read output'
      },
      {
        id: 'py_asyncio_subprocess',
        language: 'python',
        pattern: 'asyncio.create_subprocess',
        function: 'create_subprocess_exec',
        isAsync: true,
        returnsHandle: true,
        commonUse: 'Async process execution'
      }
    ]],
    ['javascript', [
      {
        id: 'js_child_spawn',
        language: 'javascript',
        pattern: 'child_process.spawn',
        function: 'spawn',
        isAsync: true,
        returnsHandle: true,
        commonUse: 'Spawn new process with streaming'
      },
      {
        id: 'js_child_exec',
        language: 'javascript',
        pattern: 'child_process.exec',
        function: 'exec',
        isAsync: true,
        returnsHandle: false,
        commonUse: 'Execute command in shell'
      },
      {
        id: 'js_child_execFile',
        language: 'javascript',
        pattern: 'child_process.execFile',
        function: 'execFile',
        isAsync: true,
        returnsHandle: false,
        commonUse: 'Execute file directly'
      },
      {
        id: 'js_child_fork',
        language: 'javascript',
        pattern: 'child_process.fork',
        function: 'fork',
        isAsync: true,
        returnsHandle: true,
        commonUse: 'Fork Node.js process'
      },
      {
        id: 'js_child_execSync',
        language: 'javascript',
        pattern: 'child_process.execSync',
        function: 'execSync',
        isAsync: false,
        returnsHandle: false,
        commonUse: 'Synchronous execution'
      }
    ]],
    ['typescript', [
      // TypeScript uses same patterns as JavaScript
      {
        id: 'ts_child_spawn',
        language: 'typescript',
        pattern: 'child_process.spawn',
        function: 'spawn',
        isAsync: true,
        returnsHandle: true,
        commonUse: 'Spawn new process with streaming'
      },
      {
        id: 'ts_child_exec',
        language: 'typescript',
        pattern: 'child_process.exec',
        function: 'exec',
        isAsync: true,
        returnsHandle: false,
        commonUse: 'Execute command in shell'
      }
    ]],
    ['cpp', [
      {
        id: 'cpp_system',
        language: 'cpp',
        pattern: 'std::system',
        function: 'system',
        isAsync: false,
        returnsHandle: false,
        commonUse: 'Execute system command'
      },
      {
        id: 'cpp_popen',
        language: 'cpp',
        pattern: 'popen',
        function: 'popen',
        isAsync: false,
        returnsHandle: true,
        commonUse: 'Open process pipe'
      },
      {
        id: 'cpp_exec_family',
        language: 'cpp',
        pattern: 'exec',
        function: 'execvp',
        isAsync: false,
        returnsHandle: false,
        commonUse: 'Replace current process'
      },
      {
        id: 'cpp_fork',
        language: 'cpp',
        pattern: 'fork',
        function: 'fork',
        isAsync: true,
        returnsHandle: true,
        commonUse: 'Fork process'
      },
      {
        id: 'cpp_CreateProcess',
        language: 'cpp',
        pattern: 'CreateProcess',
        function: 'CreateProcess',
        isAsync: true,
        returnsHandle: true,
        commonUse: 'Windows process creation'
      },
      {
        id: 'cpp_ShellExecute',
        language: 'cpp',
        pattern: 'ShellExecute',
        function: 'ShellExecute',
        isAsync: false,
        returnsHandle: false,
        commonUse: 'Windows shell execution'
      }
    ]],
    ['rust', [
      {
        id: 'rust_command',
        language: 'rust',
        pattern: 'std::process::Command',
        function: 'Command::new',
        isAsync: false,
        returnsHandle: true,
        commonUse: 'Build and execute commands'
      },
      {
        id: 'rust_command_spawn',
        language: 'rust',
        pattern: 'Command::spawn',
        function: 'spawn',
        isAsync: true,
        returnsHandle: true,
        commonUse: 'Spawn child process'
      },
      {
        id: 'rust_command_output',
        language: 'rust',
        pattern: 'Command::output',
        function: 'output',
        isAsync: false,
        returnsHandle: false,
        commonUse: 'Run and collect output'
      },
      {
        id: 'rust_tokio_command',
        language: 'rust',
        pattern: 'tokio::process::Command',
        function: 'Command::new',
        isAsync: true,
        returnsHandle: true,
        commonUse: 'Async process spawning'
      }
    ]],
    ['go', [
      {
        id: 'go_exec_command',
        language: 'go',
        pattern: 'exec.Command',
        function: 'Command',
        isAsync: false,
        returnsHandle: true,
        commonUse: 'Create command'
      },
      {
        id: 'go_cmd_run',
        language: 'go',
        pattern: 'cmd.Run',
        function: 'Run',
        isAsync: false,
        returnsHandle: false,
        commonUse: 'Run command synchronously'
      },
      {
        id: 'go_cmd_start',
        language: 'go',
        pattern: 'cmd.Start',
        function: 'Start',
        isAsync: true,
        returnsHandle: true,
        commonUse: 'Start command asynchronously'
      },
      {
        id: 'go_cmd_output',
        language: 'go',
        pattern: 'cmd.Output',
        function: 'Output',
        isAsync: false,
        returnsHandle: false,
        commonUse: 'Run and get output'
      }
    ]],
    ['java', [
      {
        id: 'java_processbuilder',
        language: 'java',
        pattern: 'ProcessBuilder',
        function: 'ProcessBuilder',
        isAsync: false,
        returnsHandle: true,
        commonUse: 'Build process with config'
      },
      {
        id: 'java_runtime_exec',
        language: 'java',
        pattern: 'Runtime.exec',
        function: 'exec',
        isAsync: false,
        returnsHandle: true,
        commonUse: 'Execute system command'
      },
      {
        id: 'java_process_start',
        language: 'java',
        pattern: 'ProcessBuilder.start',
        function: 'start',
        isAsync: true,
        returnsHandle: true,
        commonUse: 'Start configured process'
      }
    ]]
  ]);

  /**
   * Detect spawn patterns in code
   */
  async detectSpawnPatterns(
    node: MultiLanguageNode,
    codeContent: string
  ): Promise<SpawnPattern[]> {
    const detectedPatterns: SpawnPattern[] = [];
    const patterns = SpawnDetector.SPAWN_PATTERNS.get(node.language) || [];

    patterns.forEach(pattern => {
      if (codeContent.includes(pattern.pattern) || 
          codeContent.includes(pattern.function)) {
        detectedPatterns.push(pattern);
      }
    });

    return detectedPatterns;
  }

  /**
   * Extract spawn information from code
   */
  async extractSpawnInfo(
    node: MultiLanguageNode,
    codeContent: string,
    pattern: SpawnPattern
  ): Promise<ProcessSpawn | null> {
    // Extract command being spawned
    const command = this.extractCommand(codeContent, pattern);
    if (!command) return null;

    // Detect child process language
    const childLanguage = this.detectChildLanguage(command);

    // Extract arguments
    const args = this.extractArguments(codeContent, pattern);

    // Check if output is captured
    const capturesOutput = this.detectOutputCapture(codeContent, pattern);

    return {
      id: `spawn_${node.id}_${Date.now()}`,
      parentNode: node,
      childCommand: command,
      childLanguage,
      spawnType: this.mapPatternToSpawnType(pattern),
      isAsync: pattern.isAsync,
      capturesOutput,
      arguments: args
    };
  }

  /**
   * Extract command from spawn call
   */
  private extractCommand(code: string, pattern: SpawnPattern): string | null {
    // Language-specific command extraction
    const extractors: Record<string, RegExp[]> = {
      python: [
        /subprocess\.run\s*\(\s*['"](.*?)['"]/,
        /subprocess\.run\s*\(\s*\[(.*?)\]/,
        /Popen\s*\(\s*['"](.*?)['"]/,
        /os\.system\s*\(\s*['"](.*?)['"]/
      ],
      javascript: [
        /spawn\s*\(\s*['"](.*?)['"]/,
        /exec\s*\(\s*['"](.*?)['"]/,
        /execFile\s*\(\s*['"](.*?)['"]/,
        /fork\s*\(\s*['"](.*?)['"]/
      ],
      typescript: [
        /spawn\s*\(\s*['"](.*?)['"]/,
        /exec\s*\(\s*['"](.*?)['"]/
      ],
      cpp: [
        /system\s*\(\s*"(.*?)"/,
        /popen\s*\(\s*"(.*?)"/,
        /execvp\s*\(\s*"(.*?)"/,
        /CreateProcess[A-Z]*\s*\([^,]*,\s*"(.*?)"/
      ],
      rust: [
        /Command::new\s*\(\s*"(.*?)"/,
        /Command::new\s*\(\s*&?"(.*?)"/
      ],
      go: [
        /exec\.Command\s*\(\s*"(.*?)"/,
        /Command\s*\(\s*"(.*?)"/
      ],
      java: [
        /ProcessBuilder\s*\(\s*"(.*?)"/,
        /Runtime\.exec\s*\(\s*"(.*?)"/
      ]
    };

    const langExtractors = extractors[pattern.language] || [];
    
    for (const regex of langExtractors) {
      const match = code.match(regex);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Detect the language of spawned process
   */
  private detectChildLanguage(command: string): string | undefined {
    const languageHints: Record<string, string[]> = {
      python: ['python', 'python3', 'py', '.py'],
      javascript: ['node', 'nodejs', '.js'],
      typescript: ['ts-node', 'deno', '.ts'],
      cpp: ['.exe', 'a.out', '.bin'],
      rust: ['cargo', '.rs'],
      go: ['go run', '.go'],
      java: ['java', 'javac', '.jar'],
      shell: ['sh', 'bash', 'zsh', '.sh']
    };

    const cmdLower = command.toLowerCase();
    
    for (const [lang, hints] of Object.entries(languageHints)) {
      if (hints.some(hint => cmdLower.includes(hint))) {
        return lang;
      }
    }

    return undefined;
  }

  /**
   * Extract arguments from spawn call
   */
  private extractArguments(code: string, pattern: SpawnPattern): string[] {
    // Simplified argument extraction
    const args: string[] = [];
    
    // Look for array syntax after command
    const arrayMatch = code.match(/\[(.*?)\]/);
    if (arrayMatch) {
      const argsString = arrayMatch[1];
      // Extract quoted strings
      const quotedArgs = argsString.match(/['"](.*?)['"]/g);
      if (quotedArgs) {
        args.push(...quotedArgs.map(arg => arg.replace(/['"]/g, '')));
      }
    }

    return args;
  }

  /**
   * Detect if spawn captures output
   */
  private detectOutputCapture(code: string, pattern: SpawnPattern): boolean {
    const capturePatterns = [
      /\.stdout/,
      /\.stderr/,
      /\.output/,
      /PIPE/,
      /capture_output\s*=\s*True/,
      /\.read/,
      /\.communicate/
    ];

    return capturePatterns.some(regex => regex.test(code));
  }

  /**
   * Map pattern to spawn type
   */
  private mapPatternToSpawnType(pattern: SpawnPattern): ProcessSpawn['spawnType'] {
    if (pattern.pattern.includes('exec')) return 'exec';
    if (pattern.pattern.includes('spawn')) return 'spawn';
    if (pattern.pattern.includes('fork')) return 'fork';
    if (pattern.pattern.includes('system')) return 'system';
    return 'subprocess';
  }

  /**
   * Build process tree from spawns
   */
  buildProcessTree(
    nodes: MultiLanguageNode[],
    spawns: ProcessSpawn[]
  ): ProcessTree {
    // Create node map
    const nodeMap = new Map<string | number, MultiLanguageNode>();
    nodes.forEach(node => nodeMap.set(node.id, node));

    // Find root processes (not spawned by others)
    const spawnedIds = new Set(spawns.map(s => s.childCommand));
    const roots = nodes.filter(node => 
      !spawnedIds.has(node.name) && 
      spawns.some(s => s.parentNode.id === node.id)
    );

    // Build tree from first root or first node
    const rootNode = roots[0] || nodes[0];
    const tree: ProcessTree = {
      id: `tree_${rootNode.id}`,
      node: rootNode,
      children: [],
      depth: 0
    };

    // Build children recursively
    this.buildTreeChildren(tree, spawns, nodeMap, new Set());

    return tree;
  }

  /**
   * Build tree children recursively
   */
  private buildTreeChildren(
    parent: ProcessTree,
    spawns: ProcessSpawn[],
    nodeMap: Map<string | number, MultiLanguageNode>,
    visited: Set<string | number>
  ): void {
    if (visited.has(parent.node.id)) return;
    visited.add(parent.node.id);

    // Find spawns from this parent
    const childSpawns = spawns.filter(s => s.parentNode.id === parent.node.id);

    childSpawns.forEach((spawn, index) => {
      // Try to find child node
      let childNode: MultiLanguageNode | undefined;
      
      // Look for node matching the spawn command
      nodeMap.forEach(node => {
        if (node.name === spawn.childCommand || 
            node.file_path?.includes(spawn.childCommand)) {
          childNode = node;
        }
      });

      // Create synthetic node if not found
      if (!childNode) {
        childNode = {
          id: `synthetic_${spawn.id}`,
          name: spawn.childCommand,
          kind: 'process',
          language: spawn.childLanguage || 'unknown',
          qualified_name: spawn.childCommand
        };
      }

      const childTree: ProcessTree = {
        id: `tree_${childNode.id}`,
        node: childNode,
        children: [],
        spawnInfo: spawn,
        depth: parent.depth + 1,
        executionOrder: parent.executionOrder ? parent.executionOrder + index + 1 : index
      };

      parent.children.push(childTree);

      // Recurse
      this.buildTreeChildren(childTree, spawns, nodeMap, visited);
    });
  }

  /**
   * Detect spawn chains
   */
  detectSpawnChains(
    nodes: MultiLanguageNode[],
    spawns: ProcessSpawn[]
  ): SpawnChain[] {
    const chains: SpawnChain[] = [];
    const visited = new Set<string | number>();

    // Start chain from each spawning node
    nodes.forEach(node => {
      if (!visited.has(node.id) && spawns.some(s => s.parentNode.id === node.id)) {
        const chain = this.buildSpawnChain(node, spawns, visited);
        if (chain.nodes.length > 1) {
          chains.push(chain);
        }
      }
    });

    return chains;
  }

  /**
   * Build spawn chain from node
   */
  private buildSpawnChain(
    startNode: MultiLanguageNode,
    spawns: ProcessSpawn[],
    visited: Set<string | number>
  ): SpawnChain {
    const nodes: MultiLanguageNode[] = [startNode];
    const chainSpawns: ProcessSpawn[] = [];
    const languages = new Set<string>([startNode.language]);
    
    let currentNode = startNode;
    let depth = 0;

    while (true) {
      visited.add(currentNode.id);
      
      // Find spawns from current node
      const nodeSpawns = spawns.filter(s => s.parentNode.id === currentNode.id);
      if (nodeSpawns.length === 0) break;

      // Add first spawn to chain (simplified)
      const spawn = nodeSpawns[0];
      chainSpawns.push(spawn);
      
      if (spawn.childLanguage) {
        languages.add(spawn.childLanguage);
      }

      // Try to find next node in chain
      const nextNode = nodes.find(n => 
        n.name === spawn.childCommand || 
        n.file_path?.includes(spawn.childCommand)
      );

      if (!nextNode || visited.has(nextNode.id)) break;

      nodes.push(nextNode);
      currentNode = nextNode;
      depth++;

      if (depth > 10) break; // Prevent infinite loops
    }

    // Check if chain is recursive
    const isRecursive = chainSpawns.some(spawn => 
      nodes.some(node => node.id === spawn.parentNode.id && 
                        node.name === spawn.childCommand)
    );

    return {
      id: `chain_${startNode.id}`,
      nodes,
      spawns: chainSpawns,
      languages,
      totalDepth: depth,
      isRecursive
    };
  }

  /**
   * Analyze all spawn patterns in codebase
   */
  async analyzeSpawns(
    nodes: MultiLanguageNode[],
    edges: CrossLanguageEdge[]
  ): Promise<SpawnAnalysisResult> {
    const spawns: ProcessSpawn[] = [];
    
    // This is a simplified version - in real implementation,
    // you would analyze actual code content
    edges.forEach(edge => {
      if (edge.connectionType === 'spawn') {
        const parentNode = nodes.find(n => n.id === edge.source);
        const childNode = nodes.find(n => n.id === edge.target);
        
        if (parentNode && childNode) {
          spawns.push({
            id: `spawn_${edge.source}_${edge.target}`,
            parentNode,
            childCommand: childNode.name,
            childLanguage: childNode.language,
            spawnType: 'spawn',
            isAsync: true,
            capturesOutput: false
          });
        }
      }
    });

    // Build process tree
    const processTree = this.buildProcessTree(nodes, spawns);

    // Detect spawn chains
    const spawnChains = this.detectSpawnChains(nodes, spawns);

    // Calculate statistics
    const statistics = this.calculateStatistics(spawns, spawnChains);

    return {
      spawns,
      processTree,
      spawnChains,
      statistics
    };
  }

  /**
   * Calculate spawn statistics
   */
  private calculateStatistics(
    spawns: ProcessSpawn[],
    chains: SpawnChain[]
  ): SpawnStatistics {
    const spawnsByLanguage = new Map<string, number>();
    const spawnTypes = new Map<string, number>();
    
    let crossLanguageSpawns = 0;
    let asyncSpawns = 0;

    spawns.forEach(spawn => {
      // Count by parent language
      const lang = spawn.parentNode.language;
      spawnsByLanguage.set(lang, (spawnsByLanguage.get(lang) || 0) + 1);

      // Count by type
      spawnTypes.set(spawn.spawnType, (spawnTypes.get(spawn.spawnType) || 0) + 1);

      // Count cross-language
      if (spawn.childLanguage && spawn.childLanguage !== spawn.parentNode.language) {
        crossLanguageSpawns++;
      }

      // Count async
      if (spawn.isAsync) {
        asyncSpawns++;
      }
    });

    // Calculate chain statistics
    const chainLengths = chains.map(c => c.nodes.length);
    const averageChainLength = chainLengths.length > 0
      ? chainLengths.reduce((a, b) => a + b, 0) / chainLengths.length
      : 0;

    const maxChainDepth = chains.length > 0
      ? Math.max(...chains.map(c => c.totalDepth))
      : 0;

    return {
      totalSpawns: spawns.length,
      spawnsByLanguage,
      spawnTypes,
      averageChainLength: Math.round(averageChainLength * 10) / 10,
      maxChainDepth,
      crossLanguageSpawns,
      asyncSpawns
    };
  }

  /**
   * Generate spawn visualization data
   */
  generateSpawnVisualization(tree: ProcessTree): any {
    return {
      name: tree.node.name,
      language: tree.node.language,
      value: 1,
      children: tree.children.map(child => this.generateSpawnVisualization(child)),
      spawnInfo: tree.spawnInfo ? {
        type: tree.spawnInfo.spawnType,
        async: tree.spawnInfo.isAsync,
        childLang: tree.spawnInfo.childLanguage
      } : undefined
    };
  }
}
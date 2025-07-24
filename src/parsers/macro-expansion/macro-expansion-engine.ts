/**
 * Advanced Macro Expansion Engine
 *
 * This engine provides sophisticated macro detection, expansion, and relationship
 * generation capabilities. It's designed to handle complex C++ macro patterns
 * like LOG_* macros that expand to multiple chained function calls.
 */

import {
  UniversalSymbol,
  UniversalRelationship,
  UniversalRelationshipType,
} from "../language-parser-interface.js";
import { ParseContext } from "../tree-sitter/cpp-patterns.js";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Macro definition with expansion details
 */
export interface MacroDefinition {
  name: string;
  parameters: string[];
  expansion: string;
  sourceFile: string;
  line: number;

  // Relationship templates for this macro
  relationshipTemplates: MacroRelationshipTemplate[];

  // Metadata
  complexity: number; // 1-5 scale
  isVariadic: boolean;
  isFunction: boolean;
}

/**
 * Template for generating relationships from macro expansions
 */
export interface MacroRelationshipTemplate {
  fromSymbol: string; // 'CALLER' for the calling function
  toSymbol: string; // Target symbol name
  type: UniversalRelationshipType;
  confidence: number;

  // Conditional application
  condition?: string; // JavaScript expression

  // Transitive relationships (chains)
  transitiveTemplates?: MacroRelationshipTemplate[];
}

/**
 * Result of macro expansion
 */
export interface MacroExpansionResult {
  originalMacro: string;
  expandedCode: string;
  parameters: string[];
  definition: MacroDefinition;
  relationships: UniversalRelationship[];

  // Analysis metadata
  complexity: number;
  confidence: number;
}

/**
 * Macro expansion context
 */
export interface MacroExpansionContext {
  parseContext: ParseContext;
  callerSymbol?: UniversalSymbol;
  macroCall: string;
  parameters: string[];
}

/**
 * Advanced Macro Expansion Engine
 */
export class MacroExpansionEngine {
  private macroDefinitions: Map<string, MacroDefinition> = new Map();
  private headerFiles: Set<string> = new Set();
  private debugMode: boolean;

  constructor(debugMode: boolean = false) {
    this.debugMode = debugMode;
    this.initializeBuiltinMacros();
  }

  /**
   * Discover macro definitions from header files
   */
  async discoverMacroDefinitions(
    projectPath: string,
    includePatterns: string[] = ["**/*.h", "**/*.hpp"]
  ): Promise<MacroDefinition[]> {
    const { glob } = await import("glob");
    const discovered: MacroDefinition[] = [];

    for (const pattern of includePatterns) {
      const files = await glob(pattern, { cwd: projectPath, absolute: true });

      for (const file of files) {
        this.headerFiles.add(file);
        const fileMacros = await this.extractMacrosFromFile(file);
        discovered.push(...fileMacros);
      }
    }

    // Store discovered macros
    for (const macro of discovered) {
      this.macroDefinitions.set(macro.name, macro);
    }

    return discovered;
  }

  /**
   * Extract macro definitions from a single header file
   */
  private async extractMacrosFromFile(
    filePath: string
  ): Promise<MacroDefinition[]> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      const macros: MacroDefinition[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip comments and empty lines
        if (!line || line.startsWith("//") || line.startsWith("/*")) {
          continue;
        }

        // Match #define statements
        const defineMatch = line.match(
          /^#define\s+([A-Z_][A-Z0-9_]*)\s*(?:\(([^)]*)\))?\s+(.*)/
        );
        if (defineMatch) {
          const [, name, params, expansion] = defineMatch;

          // Handle multi-line macros
          let fullExpansion = expansion;
          let currentLine = i;
          while (
            fullExpansion.endsWith("\\") &&
            currentLine + 1 < lines.length
          ) {
            currentLine++;
            fullExpansion =
              fullExpansion.slice(0, -1) + " " + lines[currentLine].trim();
          }

          const macro: MacroDefinition = {
            name,
            parameters: params ? params.split(",").map((p) => p.trim()) : [],
            expansion: fullExpansion,
            sourceFile: filePath,
            line: i + 1,
            relationshipTemplates: this.generateRelationshipTemplates(
              name,
              fullExpansion
            ),
            complexity: this.calculateMacroComplexity(fullExpansion),
            isVariadic: params?.includes("...") || false,
            isFunction: !!params,
          };

          macros.push(macro);

          if (this.debugMode) {
            console.log(
              `[MacroEngine] Found macro ${name} in ${path.basename(
                filePath
              )}:${i + 1}`
            );
          }
        }
      }

      return macros;
    } catch (error) {
      return [];
    }
  }

  /**
   * Generate relationship templates for a macro expansion
   */
  private generateRelationshipTemplates(
    macroName: string,
    expansion: string
  ): MacroRelationshipTemplate[] {
    const templates: MacroRelationshipTemplate[] = [];

    // LOG_* macro patterns
    if (macroName.startsWith("LOG_")) {
      // Extract the call chain from expansion like "::Core::Logging::Logger::getInstance().error(...)"
      const callChainMatch = expansion.match(
        /:*([A-Za-z_:]+)::getInstance\(\)\.(\w+)\(/
      );
      if (callChainMatch) {
        const [, loggerClass, methodName] = callChainMatch;

        templates.push(
          {
            fromSymbol: "CALLER",
            toSymbol: loggerClass,
            type: UniversalRelationshipType.Uses,
            confidence: 0.95,
          },
          {
            fromSymbol: "CALLER",
            toSymbol: "getInstance",
            type: UniversalRelationshipType.Calls,
            confidence: 0.95,
          },
          {
            fromSymbol: "CALLER",
            toSymbol: methodName,
            type: UniversalRelationshipType.Calls,
            confidence: 0.95,
          }
        );

        // Look for LOG_CONTEXT usage
        if (expansion.includes("LOG_CONTEXT")) {
          templates.push({
            fromSymbol: "CALLER",
            toSymbol: "Core::Logging::LogContext",
            type: UniversalRelationshipType.Uses,
            confidence: 0.9,
          });
        }
      }
    }

    // Generic function call patterns
    const functionCalls = expansion.match(/\b([A-Za-z_]\w*)\s*\(/g);
    if (functionCalls) {
      for (const call of functionCalls) {
        const funcName = call.replace(/\s*\($/, "");
        if (
          funcName !== macroName &&
          !funcName.match(/^(if|for|while|sizeof)$/)
        ) {
          templates.push({
            fromSymbol: "CALLER",
            toSymbol: funcName,
            type: UniversalRelationshipType.Calls,
            confidence: 0.7,
          });
        }
      }
    }

    return templates;
  }

  /**
   * Calculate macro complexity (1-5 scale)
   */
  private calculateMacroComplexity(expansion: string): number {
    let complexity = 1;

    // Function calls add complexity
    const functionCalls = (expansion.match(/\w+\s*\(/g) || []).length;
    complexity += Math.min(functionCalls * 0.5, 2);

    // Control flow adds complexity
    if (expansion.includes("do {") || expansion.includes("while("))
      complexity += 1;
    if (expansion.includes("if") || expansion.includes("?")) complexity += 0.5;

    // Multiple statements add complexity
    const statements = (expansion.match(/;/g) || []).length;
    complexity += Math.min(statements * 0.3, 1);

    return Math.min(Math.round(complexity), 5);
  }

  /**
   * Expand a macro call in context
   */
  expandMacroInContext(
    macroName: string,
    parameters: string[],
    context: MacroExpansionContext
  ): MacroExpansionResult | null {
    const definition = this.macroDefinitions.get(macroName);
    if (!definition) {
      return null;
    }

    // Perform parameter substitution
    let expandedCode = definition.expansion;

    if (definition.isFunction && definition.parameters.length > 0) {
      for (
        let i = 0;
        i < definition.parameters.length && i < parameters.length;
        i++
      ) {
        const param = definition.parameters[i];
        const value = parameters[i];

        // Handle variadic parameters
        if (param === "...") {
          const remainingParams = parameters.slice(i).join(", ");
          expandedCode = expandedCode.replace("__VA_ARGS__", remainingParams);
          break;
        } else {
          // Replace parameter with value
          const paramRegex = new RegExp(`\\b${param}\\b`, "g");
          expandedCode = expandedCode.replace(paramRegex, value);
        }
      }
    }

    // Generate relationships
    const relationships = this.generateRelationshipsFromTemplates(
      definition.relationshipTemplates,
      context
    );

    return {
      originalMacro: macroName,
      expandedCode,
      parameters,
      definition,
      relationships,
      complexity: definition.complexity,
      confidence: 0.9,
    };
  }

  /**
   * Generate relationships from templates
   */
  private generateRelationshipsFromTemplates(
    templates: MacroRelationshipTemplate[],
    context: MacroExpansionContext
  ): UniversalRelationship[] {
    const relationships: UniversalRelationship[] = [];

    for (const template of templates) {
      // Resolve 'CALLER' to actual calling symbol
      const fromSymbolId =
        template.fromSymbol === "CALLER"
          ? context.callerSymbol?.qualifiedName ||
            context.callerSymbol?.name ||
            "unknown"
          : template.fromSymbol;

      const relationship: UniversalRelationship = {
        fromSymbolId,
        toSymbolId: template.toSymbol,
        type: template.type,
        confidence: template.confidence,
        contextLine: (context.parseContext.currentLine || 0) + 1,
        metadata: {
          macroExpansion: true,
          macroName: context.macroCall.toLowerCase(),
          sourceFile: template.fromSymbol,
        },
      };

      relationships.push(relationship);

      // Process transitive relationships
      if (template.transitiveTemplates) {
        const transitiveRelationships = this.generateRelationshipsFromTemplates(
          template.transitiveTemplates,
          context
        );
        relationships.push(...transitiveRelationships);
      }
    }

    return relationships;
  }

  /**
   * Check if a symbol should be suppressed (not created as symbol)
   */
  shouldSuppressSymbol(symbolName: string, _context: ParseContext): boolean {
    // Check if this is a macro call
    const macro = this.macroDefinitions.get(symbolName);
    if (macro) {
      if (this.debugMode) {
        console.log(
          `[MacroEngine] Suppressing symbol ${symbolName} (it's a macro)`
        );
      }
      return true;
    }

    // Check for LOG_* patterns even if not in definitions
    if (symbolName.startsWith("LOG_")) {
      return true;
    }

    return false;
  }

  /**
   * Get macro definition by name
   */
  getMacroDefinition(name: string): MacroDefinition | undefined {
    return this.macroDefinitions.get(name);
  }

  /**
   * Get all discovered macros
   */
  getAllMacros(): MacroDefinition[] {
    return Array.from(this.macroDefinitions.values());
  }

  /**
   * Initialize built-in macro definitions for common patterns
   */
  private initializeBuiltinMacros(): void {
    // LOG_* macros (fallback if not found in headers)
    const logMacros = [
      "LOG_ERROR",
      "LOG_DEBUG",
      "LOG_INFO",
      "LOG_WARN",
      "LOG_WARNING",
      "LOG_CRITICAL",
      "LOG_TRACE",
      "LOG_FATAL",
    ];

    for (const macroName of logMacros) {
      if (!this.macroDefinitions.has(macroName)) {
        const macro: MacroDefinition = {
          name: macroName,
          parameters: ["component", "..."],
          expansion: `::Core::Logging::Logger::getInstance().${macroName
            .toLowerCase()
            .replace("log_", "")}(LOG_CONTEXT(component), __VA_ARGS__)`,
          sourceFile: "builtin",
          line: 0,
          relationshipTemplates: [
            {
              fromSymbol: "CALLER",
              toSymbol: "Core::Logging::Logger",
              type: UniversalRelationshipType.Uses,
              confidence: 0.9,
            },
            {
              fromSymbol: "CALLER",
              toSymbol: "getInstance",
              type: UniversalRelationshipType.Calls,
              confidence: 0.9,
            },
            {
              fromSymbol: "CALLER",
              toSymbol: macroName.toLowerCase().replace("log_", ""),
              type: UniversalRelationshipType.Calls,
              confidence: 0.9,
            },
            {
              fromSymbol: "CALLER",
              toSymbol: "Core::Logging::LogContext",
              type: UniversalRelationshipType.Uses,
              confidence: 0.8,
            },
          ],
          complexity: 3,
          isVariadic: true,
          isFunction: true,
        };

        this.macroDefinitions.set(macroName, macro);
      }
    }
  }
}

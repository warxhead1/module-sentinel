/**
 * Parser Registry - Plugin system for language parsers
 * 
 * This system manages language parser plugins, allowing dynamic loading
 * and registration of parsers for different programming languages.
 */

import { EventEmitter } from 'events';
import { ILanguageParser, ParserConfig, ParseResult } from './language-parser-interface.js';

/**
 * Parser plugin metadata
 */
export interface ParserPlugin {
  // Plugin identification
  name: string;
  language: string;
  version: string;
  
  // Parser factory function
  createParser: (config?: ParserConfig) => ILanguageParser;
  
  // Plugin metadata
  description?: string;
  author?: string;
  homepage?: string;
  
  // Capabilities
  supportedExtensions: string[];
  features: string[];
  
  // Requirements
  dependencies?: string[];
  minimumNodeVersion?: string;
  
  // Plugin status
  isEnabled: boolean;
  priority: number; // Lower number = higher priority
}

/**
 * Parser registry events
 */
export interface ParserRegistryEvents {
  'parser:registered': (plugin: ParserPlugin) => void;
  'parser:unregistered': (language: string) => void;
  'parser:enabled': (language: string) => void;
  'parser:disabled': (language: string) => void;
  'parser:error': (error: Error, language?: string) => void;
}

/**
 * Parser selection criteria
 */
export interface ParserSelectionCriteria {
  language?: string;
  filePath?: string;
  requiredFeatures?: string[];
  preferredParser?: string;
}

/**
 * Parser registry class
 */
export class ParserRegistry extends EventEmitter {
  private plugins: Map<string, ParserPlugin> = new Map();
  private instances: Map<string, ILanguageParser> = new Map();
  private extensionMap: Map<string, string[]> = new Map(); // extension -> languages
  
  constructor() {
    super();
    this.initializeBuiltinParsers();
  }
  
  /**
   * Register a parser plugin
   */
  registerParser(plugin: ParserPlugin): void {
    // Validate plugin
    this.validatePlugin(plugin);
    
    // Check for conflicts
    const existing = this.plugins.get(plugin.language);
    if (existing && existing.priority <= plugin.priority) {
      throw new Error(`Parser for language '${plugin.language}' already registered with higher or equal priority`);
    }
    
    // Register plugin
    this.plugins.set(plugin.language, plugin);
    
    // Update extension mapping
    this.updateExtensionMap(plugin);
    
    // Clear any cached instance
    this.instances.delete(plugin.language);
    
    this.emit('parser:registered', plugin);
  }
  
  /**
   * Unregister a parser plugin
   */
  unregisterParser(language: string): void {
    const plugin = this.plugins.get(language);
    if (!plugin) {
      throw new Error(`No parser registered for language '${language}'`);
    }
    
    // Remove from registry
    this.plugins.delete(language);
    
    // Remove from extension mapping
    this.removeFromExtensionMap(plugin);
    
    // Clear cached instance
    this.instances.delete(language);
    
    this.emit('parser:unregistered', language);
  }
  
  /**
   * Get a parser instance for a language
   */
  getParser(language: string, config?: ParserConfig): ILanguageParser | null {
    const plugin = this.plugins.get(language);
    if (!plugin || !plugin.isEnabled) {
      return null;
    }
    
    // Check for cached instance
    const cacheKey = `${language}:${JSON.stringify(config || {})}`;
    if (this.instances.has(cacheKey)) {
      return this.instances.get(cacheKey)!;
    }
    
    try {
      // Create new parser instance
      const parser = plugin.createParser(config);
      
      // Validate parser
      if (!parser.validate()) {
        throw new Error(`Parser validation failed for language '${language}'`);
      }
      
      // Cache instance
      this.instances.set(cacheKey, parser);
      
      return parser;
    } catch (error) {
      this.emit('parser:error', error instanceof Error ? error : new Error(String(error)), language);
      return null;
    }
  }
  
  /**
   * Get parser by file path
   */
  getParserByFilePath(filePath: string, config?: ParserConfig): ILanguageParser | null {
    const extension = this.getFileExtension(filePath);
    const languages = this.extensionMap.get(extension) || [];
    
    // Try languages in priority order
    for (const language of languages) {
      const parser = this.getParser(language, config);
      if (parser && parser.canParse(filePath)) {
        return parser;
      }
    }
    
    return null;
  }
  
  /**
   * Select best parser based on criteria
   */
  selectParser(criteria: ParserSelectionCriteria, config?: ParserConfig): ILanguageParser | null {
    let candidates: ParserPlugin[] = [];
    
    // Filter by language
    if (criteria.language) {
      const plugin = this.plugins.get(criteria.language);
      if (plugin && plugin.isEnabled) {
        candidates = [plugin];
      }
    } else {
      // Get all enabled parsers
      candidates = Array.from(this.plugins.values()).filter(p => p.isEnabled);
    }
    
    // Filter by file path
    if (criteria.filePath) {
      const extension = this.getFileExtension(criteria.filePath);
      candidates = candidates.filter(p => 
        p.supportedExtensions.includes(extension)
      );
    }
    
    // Filter by required features
    if (criteria.requiredFeatures) {
      candidates = candidates.filter(p =>
        criteria.requiredFeatures!.every(feature => p.features.includes(feature))
      );
    }
    
    // Prefer specific parser
    if (criteria.preferredParser) {
      const preferred = candidates.find(p => p.name === criteria.preferredParser);
      if (preferred) {
        candidates = [preferred];
      }
    }
    
    // Sort by priority (lower number = higher priority)
    candidates.sort((a, b) => a.priority - b.priority);
    
    // Try to create parser from highest priority candidate
    for (const candidate of candidates) {
      const parser = this.getParser(candidate.language, config);
      if (parser) {
        return parser;
      }
    }
    
    return null;
  }
  
  /**
   * Parse a file using the best available parser
   */
  async parseFile(filePath: string, content?: string, config?: ParserConfig): Promise<ParseResult | null> {
    const parser = this.getParserByFilePath(filePath, config);
    if (!parser) {
      return null;
    }
    
    try {
      return await parser.parse(filePath, content);
    } catch (error) {
      this.emit('parser:error', error instanceof Error ? error : new Error(String(error)), parser.language);
      return null;
    }
  }
  
  /**
   * Get all registered parsers
   */
  getRegisteredParsers(): ParserPlugin[] {
    return Array.from(this.plugins.values()).sort((a, b) => a.priority - b.priority);
  }
  
  /**
   * Get enabled parsers
   */
  getEnabledParsers(): ParserPlugin[] {
    return this.getRegisteredParsers().filter(p => p.isEnabled);
  }
  
  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return Array.from(this.plugins.keys()).sort();
  }
  
  /**
   * Get supported file extensions
   */
  getSupportedExtensions(): string[] {
    const extensions = new Set<string>();
    for (const plugin of this.plugins.values()) {
      if (plugin.isEnabled) {
        plugin.supportedExtensions.forEach(ext => extensions.add(ext));
      }
    }
    return Array.from(extensions).sort();
  }
  
  /**
   * Enable a parser
   */
  enableParser(language: string): void {
    const plugin = this.plugins.get(language);
    if (!plugin) {
      throw new Error(`No parser registered for language '${language}'`);
    }
    
    plugin.isEnabled = true;
    this.emit('parser:enabled', language);
  }
  
  /**
   * Disable a parser
   */
  disableParser(language: string): void {
    const plugin = this.plugins.get(language);
    if (!plugin) {
      throw new Error(`No parser registered for language '${language}'`);
    }
    
    plugin.isEnabled = false;
    
    // Clear cached instances
    const keysToDelete = Array.from(this.instances.keys()).filter(key => key.startsWith(`${language}:`));
    keysToDelete.forEach(key => this.instances.delete(key));
    
    this.emit('parser:disabled', language);
  }
  
  /**
   * Check if a language is supported
   */
  isLanguageSupported(language: string): boolean {
    const plugin = this.plugins.get(language);
    return plugin !== undefined && plugin.isEnabled;
  }
  
  /**
   * Check if a file extension is supported
   */
  isExtensionSupported(extension: string): boolean {
    const languages = this.extensionMap.get(extension);
    return languages !== undefined && languages.length > 0;
  }
  
  /**
   * Clear all cached parser instances
   */
  clearCache(): void {
    this.instances.clear();
  }
  
  /**
   * Get registry statistics
   */
  getStatistics(): {
    totalParsers: number;
    enabledParsers: number;
    supportedLanguages: string[];
    supportedExtensions: string[];
    cachedInstances: number;
  } {
    const plugins = this.getRegisteredParsers();
    const enabledPlugins = plugins.filter(p => p.isEnabled);
    
    return {
      totalParsers: plugins.length,
      enabledParsers: enabledPlugins.length,
      supportedLanguages: this.getSupportedLanguages(),
      supportedExtensions: this.getSupportedExtensions(),
      cachedInstances: this.instances.size
    };
  }
  
  /**
   * Initialize built-in parsers
   */
  private initializeBuiltinParsers(): void {
    // Register C++ parser (existing functionality)
    this.registerParser({
      name: 'unified-cpp-parser',
      language: 'cpp',
      version: '3.0.0',
      createParser: (config) => {
        // Import and create C++ parser
        const { CppLanguageParser } = require('./adapters/cpp-language-parser.js');
        return new CppLanguageParser(config);
      },
      description: 'Unified C++ parser with C++23 module support',
      supportedExtensions: ['.cpp', '.cc', '.cxx', '.hpp', '.h', '.hxx', '.ixx'],
      features: ['modules', 'templates', 'classes', 'functions', 'relationships', 'patterns'],
      isEnabled: true,
      priority: 10
    });
    
    // TODO: Add other built-in parsers (Python, TypeScript, etc.)
    this.registerParser({
      name: 'tree-sitter-typescript-parser',
      language: 'typescript',
      version: '1.0.0',
      createParser: (config) => {
        const { TypeScriptLanguageParser } = require('./adapters/typescript-language-parser.js');
        return new TypeScriptLanguageParser(config);
      },
      description: 'Tree-sitter based TypeScript and JavaScript parser',
      supportedExtensions: ['.ts', '.tsx', '.js', '.jsx'],
      features: ['classes', 'functions', 'interfaces', 'imports', 'exports', 'decorators'],
      isEnabled: true,
      priority: 20
    });

    this.registerParser({
      name: 'tree-sitter-python-parser',
      language: 'python',
      version: '1.0.0',
      createParser: (config) => {
        const { PythonLanguageParser } = require('./adapters/python-language-parser.js');
        return new PythonLanguageParser(config);
      },
      description: 'Tree-sitter based Python parser',
      supportedExtensions: ['.py', '.pyw'],
      features: ['classes', 'functions', 'decorators', 'type-hints'],
      isEnabled: true,
      priority: 20
    });
  }
  
  /**
   * Validate parser plugin
   */
  private validatePlugin(plugin: ParserPlugin): void {
    if (!plugin.name || !plugin.language || !plugin.version) {
      throw new Error('Parser plugin must have name, language, and version');
    }
    
    if (!plugin.createParser || typeof plugin.createParser !== 'function') {
      throw new Error('Parser plugin must have a createParser function');
    }
    
    if (!plugin.supportedExtensions || plugin.supportedExtensions.length === 0) {
      throw new Error('Parser plugin must specify supported file extensions');
    }
    
    if (!plugin.features) {
      plugin.features = [];
    }
    
    if (plugin.priority === undefined) {
      plugin.priority = 100;
    }
  }
  
  /**
   * Update extension mapping
   */
  private updateExtensionMap(plugin: ParserPlugin): void {
    for (const extension of plugin.supportedExtensions) {
      if (!this.extensionMap.has(extension)) {
        this.extensionMap.set(extension, []);
      }
      
      const languages = this.extensionMap.get(extension)!;
      if (!languages.includes(plugin.language)) {
        languages.push(plugin.language);
        // Sort by priority
        languages.sort((a, b) => {
          const pluginA = this.plugins.get(a);
          const pluginB = this.plugins.get(b);
          return (pluginA?.priority || 100) - (pluginB?.priority || 100);
        });
      }
    }
  }
  
  /**
   * Remove from extension mapping
   */
  private removeFromExtensionMap(plugin: ParserPlugin): void {
    for (const extension of plugin.supportedExtensions) {
      const languages = this.extensionMap.get(extension);
      if (languages) {
        const index = languages.indexOf(plugin.language);
        if (index >= 0) {
          languages.splice(index, 1);
          if (languages.length === 0) {
            this.extensionMap.delete(extension);
          }
        }
      }
    }
  }
  
  /**
   * Get file extension
   */
  private getFileExtension(filePath: string): string {
    const parts = filePath.split('.');
    return parts.length > 1 ? `.${parts.pop()!.toLowerCase()}` : '';
  }
}

/**
 * Global parser registry instance
 */
export const parserRegistry = new ParserRegistry();

/**
 * Convenience function to register a parser
 */
export function registerParser(plugin: ParserPlugin): void {
  parserRegistry.registerParser(plugin);
}

/**
 * Convenience function to get a parser
 */
export function getParser(language: string, config?: ParserConfig): ILanguageParser | null {
  return parserRegistry.getParser(language, config);
}

/**
 * Convenience function to parse a file
 */
export async function parseFile(filePath: string, content?: string, config?: ParserConfig): Promise<ParseResult | null> {
  return parserRegistry.parseFile(filePath, content, config);
}
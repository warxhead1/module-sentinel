/**
 * LanguageDetectionService
 *
 * Centralized service for language detection from file extensions.
 * Eliminates hardcoded extension mappings scattered across the codebase
 * and provides a single source of truth for language identification.
 */

import { createLogger } from "../utils/logger.js";

export interface LanguageMapping {
  extensions: string[];
  name: string;
  aliases?: string[];
  mimeTypes?: string[];
}

export class LanguageDetectionService {
  private static instance: LanguageDetectionService;
  private logger = createLogger("LanguageDetectionService");
  private extensionMap = new Map<string, string>();
  private aliasMap = new Map<string, string>();

  private readonly languageMappings: LanguageMapping[] = [
    {
      name: "cpp",
      extensions: [".cpp", ".hpp", ".h", ".cc", ".cxx", ".c++", ".hxx", ".hh"],
      aliases: ["c++", "cplusplus"],
      mimeTypes: ["text/x-c++", "text/x-c++hdr"],
    },
    {
      name: "python",
      extensions: [".py", ".pyi", ".pyx", ".pyw"],
      aliases: ["py"],
      mimeTypes: ["text/x-python"],
    },
    {
      name: "typescript",
      extensions: [".ts", ".tsx"],
      aliases: ["ts"],
      mimeTypes: ["text/typescript"],
    },
    {
      name: "javascript",
      extensions: [".js", ".jsx", ".mjs", ".cjs"],
      aliases: ["js", "node"],
      mimeTypes: ["text/javascript", "application/javascript"],
    },
    {
      name: "go",
      extensions: [".go"],
      aliases: ["golang"],
      mimeTypes: ["text/x-go"],
    },
    {
      name: "java",
      extensions: [".java"],
      aliases: [],
      mimeTypes: ["text/x-java"],
    },
    {
      name: "csharp",
      extensions: [".cs"],
      aliases: ["c#", "cs"],
      mimeTypes: ["text/x-csharp"],
    },
    {
      name: "rust",
      extensions: [".rs"],
      aliases: [],
      mimeTypes: ["text/x-rust"],
    },
    {
      name: "swift",
      extensions: [".swift"],
      aliases: [],
      mimeTypes: ["text/x-swift"],
    },
    {
      name: "kotlin",
      extensions: [".kt", ".kts"],
      aliases: [],
      mimeTypes: ["text/x-kotlin"],
    },
  ];

  private constructor() {
    this.initializeMappings();
  }

  public static getInstance(): LanguageDetectionService {
    if (!LanguageDetectionService.instance) {
      LanguageDetectionService.instance = new LanguageDetectionService();
    }
    return LanguageDetectionService.instance;
  }

  private initializeMappings(): void {
    for (const mapping of this.languageMappings) {
      // Map extensions to language names
      for (const ext of mapping.extensions) {
        this.extensionMap.set(ext.toLowerCase(), mapping.name);
      }

      // Map aliases to language names
      if (mapping.aliases) {
        for (const alias of mapping.aliases) {
          this.aliasMap.set(alias.toLowerCase(), mapping.name);
        }
      }
    }

    this.logger.debug(
      `Initialized language detection with ${this.extensionMap.size} extensions and ${this.aliasMap.size} aliases`
    );
  }

  /**
   * Detect language from file extension
   */
  public getLanguageForExtension(extension: string): string | null {
    if (!extension) return null;
    
    const normalizedExt = extension.toLowerCase();
    const language = this.extensionMap.get(normalizedExt);
    
    if (language) {
      this.logger.debug(`Detected language "${language}" for extension "${extension}"`);
    }
    
    return language || null;
  }

  /**
   * Detect language from file path
   */
  public getLanguageForFile(filePath: string): string | null {
    if (!filePath) return null;
    
    const lastDotIndex = filePath.lastIndexOf(".");
    if (lastDotIndex === -1) return null;
    
    const extension = filePath.substring(lastDotIndex);
    return this.getLanguageForExtension(extension);
  }

  /**
   * Detect language from alias or name
   */
  public getLanguageForAlias(alias: string): string | null {
    if (!alias) return null;
    
    const normalizedAlias = alias.toLowerCase();
    return this.aliasMap.get(normalizedAlias) || null;
  }

  /**
   * Get all supported extensions for a language
   */
  public getExtensionsForLanguage(language: string): string[] {
    const mapping = this.languageMappings.find(m => m.name === language);
    return mapping ? [...mapping.extensions] : [];
  }

  /**
   * Get all supported languages
   */
  public getSupportedLanguages(): string[] {
    return this.languageMappings.map(m => m.name);
  }

  /**
   * Check if a language is supported
   */
  public isLanguageSupported(language: string): boolean {
    return this.languageMappings.some(m => m.name === language);
  }

  /**
   * Get language mapping information
   */
  public getLanguageMapping(language: string): LanguageMapping | null {
    return this.languageMappings.find(m => m.name === language) || null;
  }

  /**
   * Add or update a language mapping (for extensibility)
   */
  public addLanguageMapping(mapping: LanguageMapping): void {
    // Remove existing mapping if it exists
    const existingIndex = this.languageMappings.findIndex(m => m.name === mapping.name);
    if (existingIndex !== -1) {
      this.languageMappings[existingIndex] = mapping;
    } else {
      this.languageMappings.push(mapping);
    }

    // Rebuild maps
    this.extensionMap.clear();
    this.aliasMap.clear();
    this.initializeMappings();

    this.logger.debug(`Added/updated language mapping for "${mapping.name}"`);
  }

  /**
   * Batch detect languages for multiple file paths
   */
  public detectLanguagesForFiles(filePaths: string[]): Map<string, string> {
    const results = new Map<string, string>();
    
    for (const filePath of filePaths) {
      const language = this.getLanguageForFile(filePath);
      if (language) {
        results.set(filePath, language);
      }
    }
    
    this.logger.debug(`Detected languages for ${results.size}/${filePaths.length} files`);
    return results;
  }

  /**
   * Get statistics about language distribution in a set of files
   */
  public getLanguageStats(filePaths: string[]): Map<string, number> {
    const stats = new Map<string, number>();
    
    for (const filePath of filePaths) {
      const language = this.getLanguageForFile(filePath);
      if (language) {
        stats.set(language, (stats.get(language) || 0) + 1);
      }
    }
    
    return stats;
  }
}

/**
 * Convenience function to get the singleton instance
 */
export function getLanguageDetectionService(): LanguageDetectionService {
  return LanguageDetectionService.getInstance();
}
/**
 * IndexerFileDiscovery
 * 
 * Handles file discovery, language detection, and file filtering
 * for the Universal Indexer. This includes glob pattern matching,
 * incremental parsing detection, and language mapping.
 */

import { Database } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import * as crypto from "crypto";
import { fileIndex } from "../database/drizzle/schema.js";
import { createLogger } from "../utils/logger.js";

export interface IndexOptions {
  projectPath: string;
  projectName?: string;
  additionalPaths?: string[];
  languages?: string[];
  filePatterns?: string[];
  excludePatterns?: string[];
  maxFiles?: number;
}

interface LanguageParser {
  language: string;
  extensions: string[];
  parser: any;
}

export class IndexerFileDiscovery {
  private db: ReturnType<typeof drizzle>;
  private rawDb: Database;
  private parsers: Map<string, LanguageParser>;
  private logger = createLogger('IndexerFileDiscovery');

  constructor(db: Database, parsers: Map<string, LanguageParser>) {
    this.rawDb = db;
    this.db = drizzle(db);
    this.parsers = parsers;
  }

  /**
   * Discover files to index
   */
  async discoverFiles(options: IndexOptions): Promise<string[]> {
    const files: string[] = [];
    const extensions = this.getTargetExtensions(options.languages || []);

    this.logger.debug(`Target extensions: ${extensions.join(", ")}`);
    this.logger.debug(`Project path: ${options.projectPath}`);

    // Build glob patterns
    const patterns =
      options.filePatterns && options.filePatterns.length > 0
        ? options.filePatterns
        : extensions.map((ext) => `**/*${ext}`);

    this.logger.debug(`Glob patterns: ${patterns.join(", ")}`);

    // Search in main project path and additional paths
    const searchPaths = [options.projectPath];
    if (options.additionalPaths) {
      searchPaths.push(...options.additionalPaths);
      this.logger.debug(
        `Additional paths: ${options.additionalPaths.join(", ")}`
      );
    }

    for (const searchPath of searchPaths) {
      this.logger.debug(`Searching in: ${searchPath}`);

      for (const pattern of patterns) {
        const matches = await glob(pattern, {
          cwd: searchPath,
          absolute: true,
          ignore: options.excludePatterns || [],
        });

        this.logger.debug(
          `Pattern ${pattern} in ${searchPath} found ${matches.length} files`
        );
        files.push(...matches);
      }
    }

    // Filter by language extensions
    const extensionSet = new Set(extensions);
    const filteredFiles = files.filter((file) => {
      const ext = path.extname(file);
      return extensionSet.has(ext);
    });

    // Apply maxFiles limit if specified
    if (options.maxFiles && options.maxFiles > 0) {
      return filteredFiles.slice(0, options.maxFiles);
    }

    return filteredFiles;
  }

  /**
   * Filter files to only those that have changed since last parsing
   */
  async filterChangedFiles(
    files: string[],
    projectId: number
  ): Promise<string[]> {
    // Get existing file index for this project
    const existingFiles = await this.db
      .select({
        filePath: fileIndex.filePath,
        fileHash: fileIndex.fileHash,
        lastParsed: fileIndex.lastParsed,
      })
      .from(fileIndex)
      .where(eq(fileIndex.projectId, projectId));

    const existingFileMap = new Map(existingFiles.map((f) => [f.filePath, f]));

    const changedFiles: string[] = [];

    // Check each file for changes
    for (const file of files) {
      try {
        await fs.stat(file);
        const content = await fs.readFile(file, "utf-8");
        const currentHash = crypto
          .createHash("sha256")
          .update(content)
          .digest("hex");

        const existingFile = existingFileMap.get(file);

        if (!existingFile) {
          // New file - needs parsing
          changedFiles.push(file);
        } else if (existingFile.fileHash !== currentHash) {
          // File content changed - needs reparsing
          changedFiles.push(file);
        } else if (!existingFile.lastParsed) {
          // File exists but was never successfully parsed
          changedFiles.push(file);
        }
        // If hash matches and file was parsed, skip it (incremental optimization)
      } catch (error) {
        this.logger.warn("Failed to read file for change detection", error, { 
          filePath: file,
          reason: "File might be deleted, moved, or inaccessible"
        });
        // If we can't read the file, include it for parsing (it might be deleted/moved)
        changedFiles.push(file);
      }
    }

    return changedFiles;
  }

  /**
   * Get target file extensions for all registered parsers
   */
  getTargetExtensions(languages: string[]): string[] {
    const extensions: string[] = [];

    for (const [_, parser] of this.parsers) {
      if (languages.includes(parser.language)) {
        extensions.push(...parser.extensions);
      }
    }

    return extensions;
  }

  /**
   * Get language for a given file extension
   */
  getLanguageForExtension(ext: string): string | null {
    for (const [lang, parser] of this.parsers) {
      if (parser.extensions.includes(ext)) {
        return lang;
      }
    }
    return null;
  }

  /**
   * Detect language from file path
   */
  detectLanguage(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    return this.getLanguageForExtension(ext);
  }

  /**
   * Get display name for a language
   */
  getLanguageDisplayName(lang: string): string {
    const displayNames: Record<string, string> = {
      cpp: "C++",
      python: "Python",
      typescript: "TypeScript",
      javascript: "JavaScript",
    };

    return displayNames[lang] || lang;
  }

  /**
   * Get parser class name for a language
   */
  getParserClass(lang: string): string {
    const parserClasses: Record<string, string> = {
      cpp: "CppTreeSitterParser",
      python: "PythonTreeSitterParser",
      typescript: "TypeScriptTreeSitterParser",
      javascript: "JavaScriptTreeSitterParser",
      go: "GoLanguageParser",
      java: "JavaLanguageParser",
      csharp: "CSharpLanguageParser",
    };

    return parserClasses[lang] || "UnknownParser";
  }

  /**
   * Get file extensions for a language
   */
  getLanguageExtensions(lang: string): string[] {
    const extensionMap: Record<string, string[]> = {
      cpp: [".cpp", ".hpp", ".ixx", ".cxx", ".hxx"],
      python: [".py", ".pyx", ".pyi"],
      typescript: [".ts", ".tsx"],
      javascript: [".js", ".jsx"],
      go: [".go"],
      java: [".java"],
      csharp: [".cs"],
    };

    return extensionMap[lang] || [];
  }
}
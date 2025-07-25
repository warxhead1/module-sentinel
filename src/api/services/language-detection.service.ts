/**
 * Language Detection Service
 *
 * Automatically detects programming languages present in a project
 * based on file extensions and patterns.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";

export interface LanguageInfo {
  name: string;
  displayName: string;
  extensions: string[];
  fileCount: number;
  sampleFiles: string[];
  confidence: number;
}

export interface ProjectLanguageProfile {
  projectPath: string;
  totalFiles: number;
  languages: LanguageInfo[];
  primaryLanguage: string | null;
  recommendedParsers: string[];
}

export class LanguageDetectionService {
  // Language definitions with file extensions and patterns
  private static readonly LANGUAGE_DEFINITIONS = {
    cpp: {
      name: "cpp",
      displayName: "C++",
      extensions: [
        ".cpp",
        ".cxx",
        ".cc",
        ".c++",
        ".hpp",
        ".hxx",
        ".h++",
        ".h",
        ".ixx",
        ".cppm",
      ],
      patterns: ["**/*.{cpp,cxx,cc,c++,hpp,hxx,h++,h,ixx,cppm}"],
      keywords: [
        "#include",
        "namespace",
        "class",
        "template",
        "std::",
        "export module",
      ],
      weight: 1.0,
    },
    c: {
      name: "c",
      displayName: "C",
      extensions: [".c", ".h"],
      patterns: ["**/*.{c,h}"],
      keywords: ["#include", "struct", "typedef", "malloc", "free"],
      weight: 0.8,
    },
    python: {
      name: "python",
      displayName: "Python",
      extensions: [".py", ".pyx", ".pyi", ".pyw"],
      patterns: ["**/*.{py,pyx,pyi,pyw}"],
      keywords: ["import ", "def ", "class ", "if __name__", "from "],
      weight: 1.0,
    },
    typescript: {
      name: "typescript",
      displayName: "TypeScript",
      extensions: [".ts", ".tsx"],
      patterns: ["**/*.{ts,tsx}"],
      keywords: ["interface ", "type ", "export ", "import ", ": "],
      weight: 1.0,
    },
    javascript: {
      name: "javascript",
      displayName: "JavaScript",
      extensions: [".js", ".jsx", ".mjs"],
      patterns: ["**/*.{js,jsx,mjs}"],
      keywords: ["function", "const ", "let ", "var ", "require("],
      weight: 0.9,
    },
    rust: {
      name: "rust",
      displayName: "Rust",
      extensions: [".rs"],
      patterns: ["**/*.rs"],
      keywords: ["fn ", "let ", "mut ", "use ", "mod "],
      weight: 1.0,
    },
    go: {
      name: "go",
      displayName: "Go",
      extensions: [".go"],
      patterns: ["**/*.go"],
      keywords: ["package ", "func ", "import ", "type ", "var "],
      weight: 1.0,
    },
    java: {
      name: "java",
      displayName: "Java",
      extensions: [".java"],
      patterns: ["**/*.java"],
      keywords: ["public class", "import ", "package ", "public static"],
      weight: 1.0,
    },
    csharp: {
      name: "csharp",
      displayName: "C#",
      extensions: [".cs"],
      patterns: ["**/*.cs"],
      keywords: ["using ", "namespace ", "public class", "private "],
      weight: 1.0,
    },
  };

  private static readonly DEFAULT_EXCLUDE_PATTERNS = [
    "node_modules/**",
    "dist/**",
    "build/**",
    "out/**",
    ".git/**",
    ".svn/**",
    ".hg/**",
    "target/**",
    "bin/**",
    "obj/**",
    "Debug/**",
    "Release/**",
    "CMakeFiles/**",
    "__pycache__/**",
    "*.pyc",
    "*.pyo",
    "*.exe",
    "*.dll",
    "*.so",
    "*.dylib",
    "*.obj",
    "*.o",
    "*.a",
    "*.lib",
  ];

  /**
   * Detect languages in a project directory
   */
  static async detectProjectLanguages(
    projectPath: string,
    excludePatterns: string[] = [],
    maxFilesToSample: number = 1000
  ): Promise<ProjectLanguageProfile> {
    const allExcludePatterns = [
      ...this.DEFAULT_EXCLUDE_PATTERNS,
      ...excludePatterns,
    ];

    // Check if project path exists
    try {
      await fs.access(projectPath);
    } catch (error) {
      throw new Error(
        `Project path does not exist or is not accessible: ${projectPath}`
      );
    }

    const languages: LanguageInfo[] = [];
    let totalFiles = 0;

    // Scan for each language
    for (const [langKey, langDef] of Object.entries(
      this.LANGUAGE_DEFINITIONS
    )) {
      try {
        const files = await glob(langDef.patterns, {
          cwd: projectPath,
          absolute: true,
          ignore: allExcludePatterns,
          nodir: true,
        });

        if (files.length > 0) {
          // Sample files for content analysis
          const sampleFiles = files.slice(0, Math.min(5, files.length));
          const confidence = await this.calculateLanguageConfidence(
            sampleFiles,
            langDef,
            Math.min(files.length, maxFilesToSample)
          );

          if (confidence > 0.1) {
            // Only include if we're somewhat confident
            languages.push({
              name: langDef.name,
              displayName: langDef.displayName,
              extensions: langDef.extensions,
              fileCount: files.length,
              sampleFiles: sampleFiles.map((f) =>
                path.relative(projectPath, f)
              ),
              confidence,
            });

            totalFiles += files.length;
          }
        }
      } catch (error) {
        console.warn(`Failed to scan for ${langDef.displayName} files:`, error);
      }
    }

    // Sort by confidence and file count
    languages.sort((a, b) => {
      const scoreA = a.confidence * a.fileCount;
      const scoreB = b.confidence * b.fileCount;
      return scoreB - scoreA;
    });

    // Determine primary language
    const primaryLanguage = languages.length > 0 ? languages[0].name : null;

    // Get recommended parsers based on detected languages
    const recommendedParsers = this.getRecommendedParsers(languages);

    const profile: ProjectLanguageProfile = {
      projectPath,
      totalFiles,
      languages,
      primaryLanguage,
      recommendedParsers,
    };

    console.log(`✅ Language detection complete:`, {
      totalFiles,
      languagesFound: languages.length,
      primaryLanguage,
      recommendedParsers,
    });

    return profile;
  }

  /**
   * Calculate confidence score for a language based on file content analysis
   */
  private static async calculateLanguageConfidence(
    sampleFiles: string[],
    langDef: any,
    totalFileCount: number
  ): Promise<number> {
    let confidence = 0.3; // Base confidence from file extension match

    // Analyze file contents for language-specific patterns
    let keywordMatches = 0;
    let totalSamples = 0;

    for (const filePath of sampleFiles.slice(0, 3)) {
      // Limit content analysis
      try {
        const content = await fs.readFile(filePath, "utf8");
        const lines = content.split("\n").slice(0, 50); // Only check first 50 lines

        for (const line of lines) {
          for (const keyword of langDef.keywords) {
            if (line.includes(keyword)) {
              keywordMatches++;
              break; // Only count once per line
            }
          }
          totalSamples++;
        }
      } catch (error) {
        // Skip files that can't be read as text
        continue;
      }
    }

    // Boost confidence based on keyword frequency
    if (totalSamples > 0) {
      const keywordRatio = keywordMatches / totalSamples;
      confidence += keywordRatio * 0.6; // Up to 60% boost from keywords
    }

    // Boost confidence based on file count (more files = more confidence)
    const fileCountBoost = Math.min(totalFileCount / 10, 0.2); // Up to 20% boost
    confidence += fileCountBoost;

    // Apply language weight
    confidence *= langDef.weight;

    return Math.min(confidence, 1.0);
  }

  /**
   * Get recommended parsers based on detected languages
   */
  private static getRecommendedParsers(languages: LanguageInfo[]): string[] {
    const parserMap = {
      cpp: "CppTreeSitterParser",
      c: "CppTreeSitterParser", // C can use C++ parser
      python: "PythonTreeSitterParser",
      typescript: "TypeScriptTreeSitterParser",
      javascript: "JavaScriptTreeSitterParser",
      rust: "RustTreeSitterParser",
      go: "GoTreeSitterParser",
      java: "JavaTreeSitterParser",
      csharp: "CSharpTreeSitterParser",
    };

    const parsers: string[] = [];
    const seen = new Set<string>();

    for (const lang of languages) {
      const parser = parserMap[lang.name as keyof typeof parserMap];
      if (parser && !seen.has(parser)) {
        parsers.push(parser);
        seen.add(parser);
      }
    }

    return parsers;
  }

  /**
   * Get supported languages that have available parsers
   */
  static getSupportedLanguages(): string[] {
    return [
      "cpp", // Currently implemented
      // 'python',     // TODO: Implement
      // 'typescript', // TODO: Implement
      // 'javascript', // TODO: Implement
      // 'rust',       // TODO: Implement
      // 'go',         // TODO: Implement
      // 'java',       // TODO: Implement
      // 'csharp'      // TODO: Implement
    ];
  }

  /**
   * Quick language detection based on file extensions only (faster)
   */
  static async quickDetectLanguages(projectPath: string): Promise<string[]> {
    const detectedLanguages: string[] = [];

    try {
      for (const [langKey, langDef] of Object.entries(
        this.LANGUAGE_DEFINITIONS
      )) {
        const files = await glob(langDef.patterns[0], {
          cwd: projectPath,
          ignore: this.DEFAULT_EXCLUDE_PATTERNS,
          nodir: true,
        });

        if (files.length > 0) {
          detectedLanguages.push(langDef.name);
        }
      }
    } catch (error) {
      console.warn("Quick language detection failed:", error);
    }

    return detectedLanguages.filter((lang) =>
      this.getSupportedLanguages().includes(lang)
    );
  }
}

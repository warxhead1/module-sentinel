import * as fs from 'fs/promises';
import * as path from 'path';

export class CppPreprocessor {
  private includePaths: string[] = [];
  private processedFiles: Set<string> = new Set();

  constructor(includePaths: string[] = []) {
    this.includePaths = includePaths;
  }

  public async preprocess(filePath: string): Promise<string> {
    this.processedFiles.clear(); // Reset for each new preprocessing task
    return this.processFile(filePath);
  }

  private async processFile(filePath: string): Promise<string> {
    if (this.processedFiles.has(filePath)) {
      return ''; // Avoid infinite recursion for circular includes
    }
    this.processedFiles.add(filePath);

    let content;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      console.warn(`Warning: Could not read file ${filePath}. Skipping.`);
      return '';
    }

    const lines = content.split('\n');
    let preprocessedContent: string[] = [];

    for (const line of lines) {
      const includeMatch = line.match(/^\s*#include\s*[<\"](.+)[>\"]$/);
      if (includeMatch) {
        const includedFileName = includeMatch[1];
        const includedFilePath = await this.resolveIncludePath(includedFileName, path.dirname(filePath));
        if (includedFilePath) {
          preprocessedContent.push(`// #include \"${includedFileName}\" (resolved from ${includedFilePath})`);
          preprocessedContent.push(await this.processFile(includedFilePath));
        } else {
          preprocessedContent.push(`// #include \"${includedFileName}\" (not found)`);
        }
      } else {
        preprocessedContent.push(line);
      }
    }

    return preprocessedContent.join('\n');
  }

  private async resolveIncludePath(fileName: string, currentDir: string): Promise<string | null> {
    // 1. Check relative to current file's directory
    const relativePath = path.join(currentDir, fileName);
    if (await this.fileExists(relativePath)) {
      return relativePath;
    }

    // 2. Check in provided include paths
    for (const includePath of this.includePaths) {
      const absolutePath = path.join(includePath, fileName);
      if (await this.fileExists(absolutePath)) {
        return absolutePath;
      }
    }

    return null;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
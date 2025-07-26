/**
 * File-based logger for indexing operations
 * Writes to a temporary log file for debugging
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class IndexerLogger {
  private logFile: string;
  private stream: fs.WriteStream | null = null;
  private isEnabled: boolean;
  
  constructor(enabled = true) {
    this.isEnabled = enabled;
    
    // Create log file in tmp directory with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(os.tmpdir(), `module-sentinel-indexer-${timestamp}.log`);
    
    if (this.isEnabled) {
      this.stream = fs.createWriteStream(this.logFile, { flags: 'a' });
      this.log('info', `Indexer logger started - Log file: ${this.logFile}`);
      console.log(`📝 Indexer log file: ${this.logFile}`);
    }
  }
  
  private log(level: string, message: string, data?: any) {
    if (!this.isEnabled || !this.stream) return;
    
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(data && { data })
    };
    
    this.stream.write(JSON.stringify(logEntry) + '\n');
    
    // Also log to console in dev mode
    if (process.env.NODE_ENV === 'development') {
      const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '📊';
      console.log(`${prefix} [${timestamp}] ${message}`, data || '');
    }
  }
  
  info(message: string, data?: any) {
    this.log('info', message, data);
  }
  
  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }
  
  error(message: string, error?: any, data?: any) {
    const errorData = {
      ...data,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error
    };
    this.log('error', message, errorData);
  }
  
  progress(phase: string, current: number, total: number, details?: any) {
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    this.log('progress', `${phase}: ${current}/${total} (${percentage}%)`, details);
  }
  
  close() {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }
  
  getLogFile(): string {
    return this.logFile;
  }
  
  // Helper to get the latest log file
  static getLatestLogFile(): string | null {
    try {
      const tmpDir = os.tmpdir();
      const files = fs.readdirSync(tmpDir)
        .filter(f => f.startsWith('module-sentinel-indexer-') && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(tmpDir, f),
          mtime: fs.statSync(path.join(tmpDir, f)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      
      return files[0]?.path || null;
    } catch {
      return null;
    }
  }
  
  // Helper to tail the log file
  static async tailLog(lines = 50): Promise<string[]> {
    const logFile = IndexerLogger.getLatestLogFile();
    if (!logFile) return ['No log file found'];
    
    try {
      const content = fs.readFileSync(logFile, 'utf8');
      const logLines = content.trim().split('\n');
      return logLines.slice(-lines).map(line => {
        try {
          const entry = JSON.parse(line);
          return `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message} ${entry.data ? JSON.stringify(entry.data) : ''}`;
        } catch {
          return line;
        }
      });
    } catch (error) {
      return [`Error reading log file: ${error}`];
    }
  }
}
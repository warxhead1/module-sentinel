import * as fs from "fs";
import * as path from "path";
import { EventEmitter } from "events";
import { createLogger } from "../utils/logger.js";

/**
 * File watcher for detecting changes and triggering re-indexing
 */
export class FileWatcher extends EventEmitter {
  private logger = createLogger("FileWatcher");
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private watchedExtensions = new Set([
    ".cpp",
    ".h",
    ".hpp",
    ".hxx",
    ".cxx",
    ".cc",
    ".ixx",
    ".cppm",
  ]);
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceDelay = 1000; // 1 second debounce

  /**
   * Start watching a directory for C++ file changes
   */
  watchDirectory(directoryPath: string): void {
    try {
      const watcher = fs.watch(
        directoryPath,
        { recursive: true },
        (eventType, filename) => {
          if (!filename) return;

          const fullPath = path.join(directoryPath, filename);
          const ext = path.extname(filename);

          // Only watch C++ files
          if (!this.watchedExtensions.has(ext)) return;

          // Debounce to avoid multiple events for the same file
          this.debounceFileChange(fullPath, eventType);
        }
      );

      this.watchers.set(directoryPath, watcher);
    } catch (error) {
      console.error(`Failed to watch directory ${directoryPath}:`, error);
    }
  }

  /**
   * Stop watching a directory
   */
  stopWatching(directoryPath: string): void {
    const watcher = this.watchers.get(directoryPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(directoryPath);
    }
  }

  /**
   * Stop all watchers
   */
  stopAll(): void {
    for (const [_path, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * Debounce file change events to avoid spam
   */
  private debounceFileChange(filePath: string, eventType: string): void {
    // Clear existing timer for this file
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.handleFileChange(filePath, eventType);
      this.debounceTimers.delete(filePath);
    }, this.debounceDelay);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Handle actual file change after debouncing
   */
  private handleFileChange(filePath: string, eventType: string): void {
    try {
      // Check if file still exists (might have been deleted)
      if (!fs.existsSync(filePath)) {
        this.emit("fileDeleted", filePath);
        return;
      }

      // Check file stats
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) return;

      // Emit file change event
      this.emit("fileChanged", {
        filePath,
        eventType,
        size: stats.size,
        mtime: stats.mtime,
      });
    } catch (error) {
      console.error(`Error handling file change for ${filePath}:`, error);
    }
  }

  /**
   * Get list of currently watched directories
   */
  getWatchedDirectories(): string[] {
    return Array.from(this.watchers.keys());
  }

  /**
   * Set debounce delay (in milliseconds)
   */
  setDebounceDelay(ms: number): void {
    this.debounceDelay = ms;
  }
}

/**
 * Global file watcher instance
 */
export const globalFileWatcher = new FileWatcher();

/**
 * Helper to set up file watching with automatic re-indexing
 */
export function setupFileWatchingWithReindexing(
  projectPath: string,
  reindexCallback: (filePath: string) => Promise<void>
): void {
  // Start watching the project directory
  globalFileWatcher.watchDirectory(projectPath);

  // Set up event handler for file changes
  globalFileWatcher.on("fileChanged", async (changeEvent) => {
    const { filePath, eventType: _eventType } = changeEvent;

    try {
      await reindexCallback(filePath);
    } catch (error) {
      console.error(` Re-indexing failed for ${filePath}:`, error);
    }
  });

  // Handle file deletions
  globalFileWatcher.on("fileDeleted", (filePath) => {
    const logger = createLogger("FileWatcher");
    logger.info("File deleted, triggering cleanup", { file: filePath });
    // TODO: Implement database cleanup for deleted files
    // Should remove symbols, relationships, and file index entries
    globalFileWatcher.emit("fileCleanupNeeded", filePath);
  });
}

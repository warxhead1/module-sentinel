/**
 * Indexing Service for Module Sentinel API
 * 
 * Provides a clean interface between the API layer and the Universal Indexer
 * for handling multi-project, multi-language indexing operations.
 */

import Database from 'better-sqlite3';
import { UniversalIndexer, IndexOptions, IndexResult, IndexProgress } from '../../indexing/universal-indexer.js';
import { EventEmitter } from 'events';

export interface IndexingJob {
  id: string;
  projectId: number;
  projectName: string;
  rootPath: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: IndexProgress | null;
  result: IndexResult | null;
  error: string | null;
  startTime: number;
  endTime: number | null;
}

export interface IndexingServiceOptions {
  maxConcurrentJobs?: number;
  enableProgressTracking?: boolean;
  debugMode?: boolean;
}

export class IndexingService extends EventEmitter {
  private db: Database.Database;
  private jobs: Map<string, IndexingJob> = new Map();
  private activeJobs: Set<string> = new Set();
  private options: Required<IndexingServiceOptions>;

  constructor(database: Database.Database, options: IndexingServiceOptions = {}) {
    super();
    this.db = database;
    
    this.options = {
      maxConcurrentJobs: options.maxConcurrentJobs || 2,
      enableProgressTracking: options.enableProgressTracking ?? true,
      debugMode: options.debugMode || false
    };
  }

  /**
   * Start indexing a project
   */
  async indexProject(
    projectId: number,
    projectName: string,
    rootPath: string,
    indexOptions: Partial<IndexOptions> = {}
  ): Promise<string> {
    const jobId = this.generateJobId(projectId);
    
    // Check if project is already being indexed
    if (this.activeJobs.has(jobId)) {
      throw new Error(`Project ${projectName} is already being indexed`);
    }

    // Check concurrent job limit
    if (this.activeJobs.size >= this.options.maxConcurrentJobs) {
      throw new Error(`Maximum concurrent jobs (${this.options.maxConcurrentJobs}) reached`);
    }

    // Create job record
    const job: IndexingJob = {
      id: jobId,
      projectId,
      projectName,
      rootPath,
      status: 'queued',
      progress: null,
      result: null,
      error: null,
      startTime: Date.now(),
      endTime: null
    };

    this.jobs.set(jobId, job);
    this.emit('job-created', job);

    // Start indexing asynchronously
    this.startIndexing(jobId, indexOptions);

    return jobId;
  }

  /**
   * Get job status
   */
  getJob(jobId: string): IndexingJob | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get all jobs
   */
  getAllJobs(): IndexingJob[] {
    return Array.from(this.jobs.values()).sort((a, b) => b.startTime - a.startTime);
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }

    if (job.status === 'running') {
      job.status = 'cancelled';
      job.endTime = Date.now();
      this.activeJobs.delete(jobId);
      this.emit('job-cancelled', job);
      return true;
    }

    return false;
  }

  /**
   * Start the actual indexing process
   */
  private async startIndexing(jobId: string, indexOptions: Partial<IndexOptions>): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    try {
      // Update job status
      job.status = 'running';
      this.activeJobs.add(jobId);
      this.emit('job-started', job);

      this.debug(`🔄 Starting indexing job ${jobId} for project: ${job.projectName}`);

      // Prepare indexing options
      const options: IndexOptions = {
        projectPath: job.rootPath,
        projectName: job.projectName,
        languages: indexOptions.languages || ['cpp'],
        debugMode: this.options.debugMode,
        enableSemanticAnalysis: indexOptions.enableSemanticAnalysis ?? true,
        enablePatternDetection: indexOptions.enablePatternDetection ?? true,
        parallelism: indexOptions.parallelism || 4,
        excludePatterns: indexOptions.excludePatterns || [
          'node_modules/**',
          'dist/**',
          'build/**',
          '.git/**',
          'CMakeFiles/**',
          '*.obj',
          '*.o',
          '*.exe'
        ],
        progressCallback: this.options.enableProgressTracking 
          ? (progress) => this.handleProgress(jobId, progress)
          : undefined,
        ...indexOptions
      };

      // Create and run indexer
      const indexer = new UniversalIndexer(this.db, options);
      
      // Set up progress tracking
      if (this.options.enableProgressTracking) {
        indexer.on('progress', (progress: IndexProgress) => {
          this.handleProgress(jobId, progress);
        });
      }

      // Run indexing
      const result = await indexer.indexProject();

      // Update job with result
      job.result = result;
      job.status = result.success ? 'completed' : 'failed';
      job.endTime = Date.now();
      
      if (!result.success && result.errors.length > 0) {
        job.error = result.errors.join('; ');
      }

      this.activeJobs.delete(jobId);
      this.emit('job-completed', job);

      this.debug(`✅ Indexing job ${jobId} completed successfully`);
      this.debug(`   Files indexed: ${result.filesIndexed}`);
      this.debug(`   Symbols found: ${result.symbolsFound}`);
      this.debug(`   Relationships: ${result.relationshipsFound}`);
      this.debug(`   Duration: ${result.duration}ms`);

    } catch (error) {
      // Handle indexing error
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.endTime = Date.now();
      
      this.activeJobs.delete(jobId);
      this.emit('job-failed', job);

      console.error(`❌ Indexing job ${jobId} failed:`, error);
    }
  }

  /**
   * Handle progress updates from indexer
   */
  private handleProgress(jobId: string, progress: IndexProgress): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    job.progress = progress;
    this.emit('job-progress', job);

    // Log progress for debugging
    const percentage = job.progress.totalFiles > 0 
      ? Math.round((job.progress.processedFiles / job.progress.totalFiles) * 100)
      : 0;

    this.debug(`📊 Job ${jobId} progress: ${percentage}% (${job.progress.processedFiles}/${job.progress.totalFiles}) - ${job.progress.phase}`);
    
    if (job.progress.currentFile) {
      this.debug(`   Current: ${job.progress.currentFile}`);
    }
  }

  /**
   * Clean up old completed jobs
   */
  cleanupOldJobs(maxAge: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAge;
    let cleaned = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status !== 'running' && job.startTime < cutoff) {
        this.jobs.delete(jobId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.debug(`🧹 Cleaned up ${cleaned} old indexing jobs`);
    }

    return cleaned;
  }

  /**
   * Get indexing statistics
   */
  getStats(): {
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    const stats = {
      total: this.jobs.size,
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };

    for (const job of this.jobs.values()) {
      stats[job.status]++;
    }

    return stats;
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(projectId: number): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `idx_${projectId}_${timestamp}_${random}`;
  }

  /**
   * Debug logging
   */
  private debug(message: string, ...args: any[]): void {
    if (this.options.debugMode) {
      console.log(`[IndexingService] ${message}`, ...args);
    }
  }
}
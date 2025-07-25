#!/usr/bin/env tsx

/**
 * Workflow Testing Script
 * 
 * Tests GitHub Actions workflows locally using act or dry-run mode
 * Can also validate workflow syntax without execution
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { createLogger } from '../src/utils/logger.js';

const execAsync = promisify(exec);
const logger = createLogger('WorkflowTester');

interface WorkflowTest {
  name: string;
  workflow: string;
  event?: string;
  inputs?: Record<string, any>;
  expectedSteps?: string[];
  timeout?: number;
}

class WorkflowTester {
  private workflowsDir = '.github/workflows';
  private hasAct = false;

  async checkPrerequisites(): Promise<void> {
    // Check if act is installed
    try {
      await execAsync('act --version');
      this.hasAct = true;
      logger.info('act is installed and available');
    } catch {
      logger.warn('act is not installed. Will run in validation-only mode', {
        installCommand: 'brew install act'
      });
    }
  }

  async validateWorkflowSyntax(workflowPath: string): Promise<void> {
    try {
      const content = await fs.readFile(workflowPath, 'utf8');
      const workflow = yaml.load(content) as any;
      
      // Basic validation
      if (!workflow.name) {
        throw new Error('Workflow missing required "name" field');
      }
      
      if (!workflow.on) {
        throw new Error('Workflow missing required "on" field');
      }
      
      if (!workflow.jobs || Object.keys(workflow.jobs).length === 0) {
        throw new Error('Workflow has no jobs defined');
      }
      
      // Validate each job
      for (const [jobName, job] of Object.entries(workflow.jobs) as [string, any][]) {
        if (!job['runs-on']) {
          throw new Error(`Job "${jobName}" missing required "runs-on" field`);
        }
        
        if (!job.steps || job.steps.length === 0) {
          throw new Error(`Job "${jobName}" has no steps defined`);
        }
        
        // Validate steps
        for (let i = 0; i < job.steps.length; i++) {
          const step = job.steps[i];
          if (!step.uses && !step.run) {
            throw new Error(`Step ${i + 1} in job "${jobName}" must have either "uses" or "run"`);
          }
          
          // Check for unpinned actions
          if (step.uses && step.uses.includes('@') && !step.uses.match(/@v\d+\.\d+\.\d+/)) {
            logger.warn(`Unpinned action detected`, {
              job: jobName,
              step: step.name || `Step ${i + 1}`,
              action: step.uses
            });
          }
        }
        
        // Check for timeout
        if (!job['timeout-minutes']) {
          logger.warn(`Job missing timeout`, {
            job: jobName,
            recommendation: 'Add timeout-minutes to prevent runaway jobs'
          });
        }
      }
      
      logger.info('Workflow syntax validation passed', { 
        workflow: path.basename(workflowPath) 
      });
    } catch (error) {
      logger.error('Workflow syntax validation failed', error, {
        workflow: path.basename(workflowPath)
      });
      throw error;
    }
  }

  async runWorkflowTest(test: WorkflowTest): Promise<void> {
    const workflowPath = path.join(this.workflowsDir, test.workflow);
    
    // Always validate syntax first
    await this.validateWorkflowSyntax(workflowPath);
    
    if (!this.hasAct) {
      logger.info('Skipping workflow execution (act not installed)', {
        test: test.name
      });
      return;
    }
    
    // Build act command
    let command = `act ${test.event || 'push'} -W ${workflowPath}`;
    
    // Add dry-run flag for safety
    command += ' --dryrun';
    
    // Add inputs if provided
    if (test.inputs) {
      for (const [key, value] of Object.entries(test.inputs)) {
        command += ` --input ${key}="${value}"`;
      }
    }
    
    logger.info('Running workflow test', {
      test: test.name,
      command
    });
    
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: test.timeout || 60000 // 1 minute default
      });
      
      // Check for expected steps if provided
      if (test.expectedSteps) {
        for (const expectedStep of test.expectedSteps) {
          if (!stdout.includes(expectedStep)) {
            throw new Error(`Expected step not found: ${expectedStep}`);
          }
        }
      }
      
      logger.info('Workflow test passed', {
        test: test.name
      });
    } catch (error) {
      logger.error('Workflow test failed', error, {
        test: test.name
      });
      throw error;
    }
  }

  async runAllTests(): Promise<void> {
    await this.checkPrerequisites();
    
    const tests: WorkflowTest[] = [
      {
        name: 'Test workflow - basic push',
        workflow: 'test.yml',
        event: 'push',
        expectedSteps: ['checkout', 'setup-node', 'npm test']
      },
      {
        name: 'Claude review on PR',
        workflow: 'claude-code-review.yml',
        event: 'pull_request',
        expectedSteps: ['checkout', 'claude-code-action']
      },
      {
        name: 'Claude interaction on issue comment',
        workflow: 'claude.yml',
        event: 'issue_comment',
        inputs: {
          'comment-body': '@claude help me fix this bug'
        },
        expectedSteps: ['checkout', 'claude-code-action']
      }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
      try {
        await this.runWorkflowTest(test);
        passed++;
      } catch (error) {
        failed++;
      }
    }
    
    logger.info('Workflow test summary', {
      total: tests.length,
      passed,
      failed
    });
    
    if (failed > 0) {
      process.exit(1);
    }
  }

  async listWorkflows(): Promise<void> {
    const files = await fs.readdir(this.workflowsDir);
    const workflows = files.filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
    
    logger.info('Found workflows', {
      count: workflows.length,
      workflows
    });
    
    for (const workflow of workflows) {
      const workflowPath = path.join(this.workflowsDir, workflow);
      try {
        await this.validateWorkflowSyntax(workflowPath);
      } catch (error) {
        // Error already logged
      }
    }
  }
}

// CLI interface
async function main() {
  const tester = new WorkflowTester();
  const args = process.argv.slice(2);
  
  try {
    if (args.includes('--list')) {
      await tester.listWorkflows();
    } else if (args.includes('--validate-only')) {
      await tester.listWorkflows(); // This validates all workflows
    } else {
      await tester.runAllTests();
    }
  } catch (error) {
    logger.error('Workflow testing failed', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
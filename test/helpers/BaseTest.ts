import { TestDatabaseManager } from './TestDatabaseManager';
import * as path from 'path';

export abstract class BaseTest {
  protected dbManager: TestDatabaseManager;
  protected projectPath: string;
  protected testName: string;

  constructor(testName: string, projectPath: string = '/home/warxh/planet_procgen') {
    this.testName = testName;
    this.projectPath = projectPath;
    this.dbManager = new TestDatabaseManager(`.test-db/${testName}`);
  }

  async setup(): Promise<void> {
    console.log(`\n🔧 Setting up test: ${this.testName}`);
    await this.dbManager.initialize();
    await this.specificSetup();
  }

  async teardown(): Promise<void> {
    console.log(`\n🧹 Tearing down test: ${this.testName}`);
    await this.specificTeardown();
    this.dbManager.closeAll();
  }

  abstract specificSetup(): Promise<void>;
  abstract specificTeardown(): Promise<void>;
  abstract run(): Promise<void>;

  async execute(): Promise<void> {
    try {
      await this.setup();
      await this.run();
      console.log(`Test ${this.testName} completed successfully`);
    } catch (error) {
      console.error(` Test ${this.testName} failed:`, error);
      throw error;
    } finally {
      await this.teardown();
    }
  }
}
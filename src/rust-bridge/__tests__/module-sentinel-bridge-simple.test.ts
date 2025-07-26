/**
 * Simplified tests for ModuleSentinelBridge
 */

import { ModuleSentinelBridge, quickSearch, quickAnalyze, checkRustBindings } from '../module-sentinel-bridge';
import * as path from 'path';

// Mock the logger
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    operation: jest.fn(() => jest.fn())
  })
}));

// Mock child_process for quick functions
jest.mock('child_process');

// Mock fs/promises
jest.mock('fs/promises', () => ({
  readdir: jest.fn(),
  stat: jest.fn()
}));

describe('ModuleSentinelBridge - Simple Tests', () => {
  const testProjectPath = '/test/project';
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Bridge Creation', () => {
    it('should create bridge with project path', () => {
      const bridge = new ModuleSentinelBridge(testProjectPath);
      expect(bridge).toBeDefined();
    });
  });
  
  describe('Quick Functions', () => {
    it('quickSearch should be exported', () => {
      expect(quickSearch).toBeDefined();
      expect(typeof quickSearch).toBe('function');
    });
    
    it('quickAnalyze should be exported', () => {
      expect(quickAnalyze).toBeDefined();
      expect(typeof quickAnalyze).toBe('function');
    });
  });
  
  describe('Rust Bindings Check', () => {
    it('checkRustBindings should be exported', () => {
      expect(checkRustBindings).toBeDefined();
      expect(typeof checkRustBindings).toBe('function');
    });
    
    it('checkRustBindings should return a boolean', async () => {
      const result = await checkRustBindings();
      expect(typeof result).toBe('boolean');
    });
  });
});
import { GraphNode, GraphEdge } from '../../../src/shared/types/api';

describe('GraphNode Interface', () => {
  it('should correctly define GraphNode properties', () => {
    const node: GraphNode = {
      id: 'test-node-1',
      name: 'TestClass',
      type: 'class',
      namespace: 'TestNamespace',
      moduleId: 'test-file-123',
      parentGroupId: 'test-namespace-group',
      size: 100,
      metrics: {
        loc: 500,
        cyclomaticComplexity: 25,
      },
    };

    expect(node.id).toBe('test-node-1');
    expect(node.name).toBe('TestClass');
    expect(node.type).toBe('class');
    expect(node.namespace).toBe('TestNamespace');
    expect(node.moduleId).toBe('test-file-123');
    expect(node.parentGroupId).toBe('test-namespace-group');
    expect(node.size).toBe(100);
    expect(node.metrics?.loc).toBe(500);
    expect(node.metrics?.cyclomaticComplexity).toBe(25);
  });

  it('should allow optional properties to be undefined', () => {
    const node: GraphNode = {
      id: 'test-node-2',
      name: 'TestFunction',
      type: 'function',
    };

    expect(node.id).toBe('test-node-2');
    expect(node.name).toBe('TestFunction');
    expect(node.type).toBe('function');
    expect(node.namespace).toBeUndefined();
    expect(node.moduleId).toBeUndefined();
    expect(node.parentGroupId).toBeUndefined();
    expect(node.size).toBeUndefined();
    expect(node.metrics).toBeUndefined();
  });
});

describe('GraphEdge Interface', () => {
  it('should correctly define GraphEdge properties', () => {
    const edge: GraphEdge = {
      source: 'node-a',
      target: 'node-b',
      type: 'calls',
      details: 'calls "someMethod" at line 123',
      weight: 0.8,
    };

    expect(edge.source).toBe('node-a');
    expect(edge.target).toBe('node-b');
    expect(edge.type).toBe('calls');
    expect(edge.details).toBe('calls "someMethod" at line 123');
    expect(edge.weight).toBe(0.8);
  });

  it('should allow optional properties to be undefined', () => {
    const edge: GraphEdge = {
      source: 'node-c',
      target: 'node-d',
      type: 'uses',
    };

    expect(edge.source).toBe('node-c');
    expect(edge.target).toBe('node-d');
    expect(edge.type).toBe('uses');
    expect(edge.details).toBeUndefined();
    expect(edge.weight).toBeUndefined();
  });
});

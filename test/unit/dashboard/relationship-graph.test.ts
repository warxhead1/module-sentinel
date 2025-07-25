import { GraphNode, GraphEdge } from '../../../src/shared/types/api';

// Mock RelationshipGraph component for testing data transformation
class MockRelationshipGraph {
  transformRelationshipsToGraph(relationships: any[]) {
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];

    relationships.forEach(rel => {
      // Create source node if not exists
      if (!nodes.has(rel.from_symbol_id.toString())) {
        nodes.set(rel.from_symbol_id.toString(), {
          id: rel.from_symbol_id.toString(),
          name: rel.from_name || 'Unknown',
          type: rel.from_kind || 'unknown',
          namespace: rel.from_namespace,
          language: this.detectLanguageFromSymbol(rel),
          size: 10,
          metrics: {
            loc: 0,
            callCount: 0,
            crossLanguageCalls: 0
          }
        });
      }

      // Create target node if not exists  
      if (!nodes.has(rel.to_symbol_id.toString())) {
        nodes.set(rel.to_symbol_id.toString(), {
          id: rel.to_symbol_id.toString(),
          name: rel.to_name || 'Unknown',
          type: rel.to_kind || 'unknown',
          namespace: rel.to_namespace,
          language: this.detectLanguageFromSymbol(rel, 'to'),
          size: 10,
          metrics: {
            loc: 0,
            callCount: 0,
            crossLanguageCalls: 0
          }
        });
      }

      // Create edge
      const metadata = rel.metadata ? JSON.parse(rel.metadata) : {};
      edges.push({
        source: rel.from_symbol_id.toString(),
        target: rel.to_symbol_id.toString(),
        type: rel.type,
        weight: rel.confidence || 1,
        confidence: rel.confidence || 1,
        isCrossLanguage: metadata.crossLanguage || false,
        details: `${rel.type}: ${rel.from_name} → ${rel.to_name}`
      });
    });

    return {
      nodes: Array.from(nodes.values()),
      edges
    };
  }

  detectLanguageFromSymbol(rel: any, prefix: 'from' | 'to' = 'from'): string {
    const qualifiedName = prefix === 'from' ? rel.from_qualified_name : rel.to_qualified_name;
    
    if (qualifiedName?.includes('::')) {
      return 'cpp';
    }
    
    if (qualifiedName?.includes('.') && !qualifiedName?.includes('::')) {
      return 'python';
    }
    
    return 'cpp';
  }
}

describe('RelationshipGraph Data Transformation', () => {
  let mockGraph: MockRelationshipGraph;

  beforeEach(() => {
    mockGraph = new MockRelationshipGraph();
  });

  describe('transformRelationshipsToGraph', () => {
    it('should transform simple C++ relationship data to graph format', () => {
      const mockRelationships = [
        {
          id: 1,
          from_symbol_id: 100,
          to_symbol_id: 200,
          type: 'inherits',
          confidence: 0.9,
          metadata: '{"crossLanguage":false}',
          from_name: 'DerivedClass',
          from_qualified_name: 'PlanetGen::DerivedClass',
          from_kind: 'class',
          from_namespace: 'PlanetGen',
          to_name: 'BaseClass',
          to_qualified_name: 'PlanetGen::BaseClass',
          to_kind: 'class',
          to_namespace: 'PlanetGen'
        }
      ];

      const result = mockGraph.transformRelationshipsToGraph(mockRelationships);

      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);

      // Check source node
      const sourceNode = result.nodes.find(n => n.id === '100');
      expect(sourceNode).toBeDefined();
      expect(sourceNode?.name).toBe('DerivedClass');
      expect(sourceNode?.type).toBe('class');
      expect(sourceNode?.namespace).toBe('PlanetGen');
      expect(sourceNode?.language).toBe('cpp');

      // Check target node
      const targetNode = result.nodes.find(n => n.id === '200');
      expect(targetNode).toBeDefined();
      expect(targetNode?.name).toBe('BaseClass');
      expect(targetNode?.type).toBe('class');
      expect(targetNode?.namespace).toBe('PlanetGen');
      expect(targetNode?.language).toBe('cpp');

      // Check edge
      const edge = result.edges[0];
      expect(edge.source).toBe('100');
      expect(edge.target).toBe('200');
      expect(edge.type).toBe('inherits');
      expect(edge.weight).toBe(0.9);
      expect(edge.confidence).toBe(0.9);
      expect(edge.isCrossLanguage).toBe(false);
      expect(edge.details).toBe('inherits: DerivedClass → BaseClass');
    });

    it('should handle cross-language relationships', () => {
      const mockRelationships = [
        {
          id: 2,
          from_symbol_id: 300,
          to_symbol_id: 400,
          type: 'spawns',
          confidence: 0.8,
          metadata: '{"crossLanguage":true,"spawnType":"script"}',
          from_name: 'TerrainProcessor',
          from_qualified_name: 'App.TerrainProcessor',
          from_kind: 'function',
          from_namespace: 'App',
          to_name: 'terrain_generator',
          to_qualified_name: 'terrain_generator.py',
          to_kind: 'script',
          to_namespace: null
        }
      ];

      const result = mockGraph.transformRelationshipsToGraph(mockRelationships);

      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);

      // Check source node (TypeScript)
      const sourceNode = result.nodes.find(n => n.id === '300');
      expect(sourceNode?.language).toBe('python'); // Detected from qualified name pattern

      // Check target node (Python)
      const targetNode = result.nodes.find(n => n.id === '400');
      expect(targetNode?.language).toBe('python');

      // Check cross-language edge
      const edge = result.edges[0];
      expect(edge.isCrossLanguage).toBe(true);
      expect(edge.type).toBe('spawns');
    });

    it('should handle empty relationships array', () => {
      const result = mockGraph.transformRelationshipsToGraph([]);

      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('should handle duplicate symbol IDs correctly', () => {
      const mockRelationships = [
        {
          id: 1,
          from_symbol_id: 100,
          to_symbol_id: 200,
          type: 'calls',
          confidence: 0.9,
          metadata: '{}',
          from_name: 'FunctionA',
          from_qualified_name: 'Namespace::FunctionA',
          from_kind: 'function',
          from_namespace: 'Namespace',
          to_name: 'FunctionB',
          to_qualified_name: 'Namespace::FunctionB',
          to_kind: 'function',
          to_namespace: 'Namespace'
        },
        {
          id: 2,
          from_symbol_id: 100, // Same source
          to_symbol_id: 300,  // Different target
          type: 'calls',
          confidence: 0.8,
          metadata: '{}',
          from_name: 'FunctionA',
          from_qualified_name: 'Namespace::FunctionA',
          from_kind: 'function',
          from_namespace: 'Namespace',
          to_name: 'FunctionC',
          to_qualified_name: 'Namespace::FunctionC',
          to_kind: 'function',
          to_namespace: 'Namespace'
        }
      ];

      const result = mockGraph.transformRelationshipsToGraph(mockRelationships);

      expect(result.nodes).toHaveLength(3); // Should have 3 unique nodes
      expect(result.edges).toHaveLength(2); // Should have 2 edges
    });
  });

  describe('detectLanguageFromSymbol', () => {
    it('should detect C++ from qualified names with ::', () => {
      const rel = {
        from_qualified_name: 'PlanetGen::Generation::Features::Class',
        to_qualified_name: 'Another::Namespace::Function'
      };

      expect(mockGraph.detectLanguageFromSymbol(rel, 'from')).toBe('cpp');
      expect(mockGraph.detectLanguageFromSymbol(rel, 'to')).toBe('cpp');
    });

    it('should detect Python from qualified names with dots', () => {
      const rel = {
        from_qualified_name: 'terrain_generator.generate_terrain',
        to_qualified_name: 'visualizer.display_data'
      };

      expect(mockGraph.detectLanguageFromSymbol(rel, 'from')).toBe('python');
      expect(mockGraph.detectLanguageFromSymbol(rel, 'to')).toBe('python');
    });

    it('should default to cpp for ambiguous cases', () => {
      const rel = {
        from_qualified_name: 'SomeFunction',
        to_qualified_name: null
      };

      expect(mockGraph.detectLanguageFromSymbol(rel, 'from')).toBe('cpp');
      expect(mockGraph.detectLanguageFromSymbol(rel, 'to')).toBe('cpp');
    });
  });
});

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

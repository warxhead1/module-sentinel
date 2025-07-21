import { RelationshipGraph } from '../../../src/dashboard/components/relationship-graph';
import { dataService } from '../../../src/dashboard/services/data.service';
import { GraphNode, GraphEdge } from '../../../src/shared/types/api';

describe('Data Flow Integration Test', () => {
  let relationshipGraph: RelationshipGraph;
  let originalGetRelationships: any;

  beforeEach(() => {
    // Mock dataService.getRelationships
    originalGetRelationships = dataService.getRelationships;
    dataService.getRelationships = jest.fn().mockResolvedValue({
      success: true,
      data: {
        nodes: [
          { id: 'node1', name: 'ClassA', type: 'class', moduleId: 'module1', namespace: 'ns1', size: 100, metrics: { loc: 500, cyclomaticComplexity: 10 } },
          { id: 'node2', name: 'funcB', type: 'function', moduleId: 'module1', namespace: 'ns1', size: 50, metrics: { loc: 100, cyclomaticComplexity: 5 } },
          { id: 'node3', name: 'ClassC', type: 'class', moduleId: 'module2', namespace: 'ns2', size: 120, metrics: { loc: 600, cyclomaticComplexity: 12 } },
          { id: 'module-group-module1', name: 'module1', type: 'module-group', size: 150 },
          { id: 'namespace-group-ns1', name: 'ns1', type: 'namespace-group', size: 150 },
        ],
        edges: [
          { source: 'node1', target: 'node2', type: 'calls', details: 'calls funcB' },
          { source: 'node1', target: 'node3', type: 'uses', details: 'uses ClassC' },
        ],
      },
    });

    relationshipGraph = new RelationshipGraph();
    document.body.appendChild(relationshipGraph);
  });

  afterEach(() => {
    // Restore original method
    dataService.getRelationships = originalGetRelationships;
    document.body.removeChild(relationshipGraph);
  });

  it('should fetch and process graph data correctly', async () => {
    await relationshipGraph.loadData();

    expect(dataService.getRelationships).toHaveBeenCalledTimes(1);
    expect(relationshipGraph['graphData']).toBeDefined();
    expect(relationshipGraph['hierarchicalGraphData']).toBeDefined();

    const hierarchicalNodes = relationshipGraph['hierarchicalGraphData'].nodes;
    const hierarchicalEdges = relationshipGraph['hierarchicalGraphData'].edges;

    // Verify original nodes are present
    expect(hierarchicalNodes.some((n: GraphNode) => n.id === 'node1')).toBe(true);
    expect(hierarchicalNodes.some((n: GraphNode) => n.id === 'node2')).toBe(true);
    expect(hierarchicalNodes.some((n: GraphNode) => n.id === 'node3')).toBe(true);

    // Verify group nodes are created
    expect(hierarchicalNodes.some((n: GraphNode) => n.id === 'module-group-module1' && n.type === 'module-group')).toBe(true);
    expect(hierarchicalNodes.some((n: GraphNode) => n.id === 'namespace-group-ns1' && n.type === 'namespace-group')).toBe(true);

    // Verify parentGroupId is assigned
    const node1 = hierarchicalNodes.find((n: GraphNode) => n.id === 'node1');
    expect(node1?.parentGroupId).toBe('module-group-module1');

    // Verify edges are present
    expect(hierarchicalEdges.some((e: GraphEdge) => e.source.id === 'node1' && e.target.id === 'node2')).toBe(true);
    expect(hierarchicalEdges.some((e: GraphEdge) => e.source.id === 'node1' && e.target.id === 'node3')).toBe(true);
  });

  it('should handle API errors gracefully', async () => {
    dataService.getRelationships = jest.fn().mockResolvedValue({
      success: false,
      error: 'Failed to fetch data',
    });

    await relationshipGraph.loadData();

    expect(relationshipGraph['_error']).toBe('Failed to fetch data');
    expect(relationshipGraph['graphData']).toBeNull();
    expect(relationshipGraph['hierarchicalGraphData']).toBeNull();
  });
});

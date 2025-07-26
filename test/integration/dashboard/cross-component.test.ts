import { RelationshipGraph } from '../../../src/dashboard/components/relationship-graph';
import { stateService } from '../../../src/dashboard/services/state.service';
import { GraphNode } from '../../../src/shared/types/api';

// Mock a subscribing component
class MockSubscribingComponent extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  public receivedNodeId: string | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot!.innerHTML = `<div>Mock Component</div>`;
  }

  connectedCallback() {
    this.unsubscribe = stateService.subscribe('selectedNodeId', (nodeId: string) => {
      this.receivedNodeId = nodeId;
    });
  }

  disconnectedCallback() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}

customElements.define('mock-subscribing-component', MockSubscribingComponent);

describe('Cross-Component Communication Integration Test', () => {
  let relationshipGraph: RelationshipGraph;
  let mockSubscribingComponent: MockSubscribingComponent;
  let originalGetRelationships: any;

  beforeEach(() => {
    // Mock dataService.getRelationships for RelationshipGraph
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

    // Clear state before each test to ensure isolation
    stateService.clearAllState();

    relationshipGraph = new RelationshipGraph();
    mockSubscribingComponent = new MockSubscribingComponent();

    document.body.appendChild(relationshipGraph);
    document.body.appendChild(mockSubscribingComponent);
  });

  afterEach(() => {
    // Restore original method
    dataService.getRelationships = originalGetRelationships;
    document.body.removeChild(relationshipGraph);
    document.body.removeChild(mockSubscribingComponent);
  });

  it('should publish selected node ID to stateService and allow other components to subscribe', async () => {
    // Load data and initialize graph
    await relationshipGraph.loadData();

    // Simulate a click on 'node1'
    const node1Element = relationshipGraph.shadowRoot!.querySelector('[data-id="node1"]');
    if (node1Element) {
      // Manually trigger the click event on the node's SVG group element
      // D3 attaches data to the DOM element, so we can simulate a click directly
      const nodeData = relationshipGraph['hierarchicalGraphData'].nodes.find((n: GraphNode) => n.id === 'node1');
      if (nodeData) {
        // Create a mock event object with necessary properties
        const mockEvent = {
          pageX: 100, // Dummy coordinates for tooltip positioning
          pageY: 100,
          currentTarget: node1Element, // Simulate currentTarget for event delegation
        };
        // Call the internal selectNode method directly with the node data
        // This bypasses D3's internal event handling but directly tests the logic
        relationshipGraph['selectNode'](nodeData);
      }
    }

    // Assert that the mock subscribing component received the correct node ID
    expect(mockSubscribingComponent.receivedNodeId).toBe('node1');

    // Simulate a click on 'node2'
    const node2Element = relationshipGraph.shadowRoot!.querySelector('[data-id="node2"]');
    if (node2Element) {
      const nodeData = relationshipGraph['hierarchicalGraphData'].nodes.find((n: GraphNode) => n.id === 'node2');
      if (nodeData) {
        const mockEvent = { pageX: 200, pageY: 200, currentTarget: node2Element };
        relationshipGraph['selectNode'](nodeData);
      }
    }
    expect(mockSubscribingComponent.receivedNodeId).toBe('node2');
  });
});

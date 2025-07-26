# Phase 1: Advanced Task List - Interactive Relationship Graph Enhancement

**Goal:** Transform the existing relationship graph into a highly interactive, progressively disclosed visualization that reduces clutter and highlights key information, enabling users to "flow" through code relationships and build knowledge. We aim to create stunning visualizations that represent meaningful points to the user, allowing them to flow seamlessly in and out of nodes, their properties, their calls, etc., clearly identifying what is going on so it is more building blocks of knowledge than gibberish of tracing through disjointed files and spaces.

**Key Principles:**
*   **Data-Driven Design:** All visualizations must be backed by meaningful data.
*   **Progressive Disclosure:** Start simple, reveal complexity on demand.
*   **Performance:** Maintain responsiveness even with growing datasets.
*   **Modularity:** Keep concerns separated (UI, data, API).
*   **Test-Driven:** Write tests concurrently with feature development.
*   **DRY:** Centralize data fetching and state management.

---

## I. Backend API & Data Model Preparation (Frontend Perspective)

**Objective:** Define and prepare the data structures and API expectations for the enhanced graph. This section outlines the frontend's requirements for the backend API to support the new features.

### Task 1.1: Update `GraphNode` Interface [x]

*   **Description:** Enhanced the `GraphNode` interface in `src/shared/types/api.ts` to include properties necessary for hierarchical grouping, enhanced sizing, and future metrics. The `relationship-graph.ts` component now imports and uses this updated interface.
*   **Files:**
    *   `src/dashboard/components/relationship-graph.ts`
    *   `src/shared/types/api.ts`
*   **Changes:**
    ```typescript
    // src/shared/types/api.ts
    interface GraphNode {
      id: string;
      name: string;
      type: string; // e.g., 'class', 'function', 'namespace', 'module', 'file'
      namespace?: string; // Existing
      moduleId?: string; // New: For grouping by module/file (e.g., file path hash)
      parentGroupId?: string; // New: For explicit hierarchical grouping (e.g., namespace ID)
      size?: number; // Existing, but will be used more dynamically
      metrics?: { // New: Object for various metrics
        loc?: number; // Lines of Code
        cyclomaticComplexity?: number; // Cyclomatic Complexity
        // Add other static metrics as they become available from backend
      };
      // D3 simulation properties
      x?: number;
      y?: number;
      vx?: number;
      vy?: number;
      isExpanded?: boolean; // New: To track expansion state of group nodes
    }
    ```
*   **Tests:**
    *   **Unit Test:** `test/unit/dashboard/relationship-graph.test.ts`
        *   **Requirement:** Verified `GraphNode` interface correctly defines new properties.

### Task 1.2: Update `GraphEdge` Interface [x]

*   **Description:** Enhanced the `GraphEdge` interface in `src/shared/types/api.ts` to support richer contextual tooltips. The `relationship-graph.ts` component now imports and uses this updated interface.
*   **Files:**
    *   `src/dashboard/components/relationship-graph.ts`
    *   `src/shared/types/api.ts`
*   **Changes:**
    ```typescript
    // src/shared/types/api.ts
    interface GraphEdge {
      source: string;
      target: string;
      type: string; // Existing (e.g., 'calls', 'uses')
      details?: string; // New: A more descriptive string for tooltips (e.g., "calls 'methodName'", "inherits from BaseClass")
      weight?: number; // Existing
    }
    ```
*   **Tests:**
    *   **Unit Test:** `test/unit/dashboard/relationship-graph.test.ts`
        *   **Requirement:** Verified `GraphEdge` interface correctly defines new properties.

### Task 1.3: Define Expected API Response for `/api/relationships`

*   **Description:** Document the expected JSON structure for the `/api/relationships` endpoint, ensuring it provides the new `moduleId`, `parentGroupId`, `metrics`, and `edge.details` fields. This is a *frontend expectation* for the backend team to implement.
*   **Files:** (No direct code change in frontend, but crucial for communication with backend team)
*   **Expected Structure:**
    ```json
    {
      "success": true,
      "data": {
        "nodes": [
          {
            "id": "node1",
            "name": "MyClass",
            "type": "class",
            "namespace": "MyNamespace",
            "moduleId": "file123",
            "parentGroupId": "namespace456",
            "size": 150,
            "metrics": {
              "loc": 200,
              "cyclomaticComplexity": 15
            }
          },
          {
            "id": "node2",
            "name": "myFunction",
            "type": "function",
            "namespace": "MyNamespace",
            "moduleId": "file123",
            "parentGroupId": "classNode1", // If function is part of a class
            "size": 50,
            "metrics": {
              "loc": 30,
              "cyclomaticComplexity": 5
            }
          }
          // ... more nodes
        ],
        "edges": [
          {
            "source": "node1",
            "target": "node2",
            "type": "calls",
            "details": "calls 'myFunction'",
            "weight": 1
          },
          {
            "source": "node3",
            "target": "node1",
            "type": "inherits",
            "details": "inherits from 'BaseClass'",
            "weight": 1
          }
          // ... more edges
        ]
      }
    }
    ```
*   **Tests:** (Will be covered by integration tests once backend is updated and provides this structure)

---

## II. Core Graph Component (`relationship-graph.ts`) Enhancements

**Objective:** Implement the core visualization logic for hierarchical grouping, semantic zooming, enhanced node/edge rendering, and advanced 2D/2.5D effects to create a fluid and insightful user experience.

### Task 2.1: Data Transformation for Hierarchical Grouping [x]

*   **Description:** Implemented `createHierarchicalGraphData` function in `src/dashboard/components/relationship-graph.ts` to transform flat `graphData.nodes` into a hierarchical structure, creating synthetic "group nodes" for modules and namespaces.
*   **Files:** `src/dashboard/components/relationship-graph.ts`
*   **Changes:**
    *   Added `createHierarchicalGraphData` function.
    *   Updated `loadData` to call `createHierarchicalGraphData`.
*   **Tests:**
    *   **Unit Test:** `test/unit/dashboard/relationship-graph.test.ts`
        *   **Requirement:** Test `createHierarchicalGraphData` with mock flat data (including various `moduleId` and `parentGroupId` combinations) to ensure the correct hierarchical structure is generated, including synthetic group nodes and proper parent-child relationships.

### Task 2.2: D3 Force Layout Adjustments for Grouping [x]

*   **Description:** Modified the D3 force simulation in `src/dashboard/components/relationship-graph.ts` to keep grouped nodes together and manage interactions between groups.
*   **Files:** `src/dashboard/components/relationship-graph.ts`
*   **Changes:**
    *   Integrated `forceCluster` into the D3 force simulation.
    *   Updated `initializeGraph` to use `this.hierarchicalGraphData`.
    *   Added basic visual distinctions (size, color) for group nodes.
*   **Tests:**
    *   **Unit Test:** `test/unit/dashboard/relationship-graph.test.ts`
        *   **Requirement:** Test force simulation behavior with mock data, verifying that nodes within groups stay close together and that groups interact correctly.
        *   **Requirement:** Test the expansion/collapse mechanism: ensure nodes are correctly added/removed from the simulation and the graph updates visually.

### Task 2.3: Enhanced Node Rendering (Sizing, Badges, Labels) [x]

*   **Description:** Implemented dynamic node sizing based on `metrics.loc` or `metrics.cyclomaticComplexity` and refined label visibility based on zoom level (semantic zooming) in `src/dashboard/components/relationship-graph.ts`.
*   **Files:** `src/dashboard/components/relationship-graph.ts`
*   **Changes:**
    *   Updated node radius calculation to use `d.metrics?.loc` or `d.metrics?.cyclomaticComplexity`.
    *   Implemented semantic zooming for node labels (font size and opacity based on zoom level).
    *   Added placeholder for future badge implementation.
*   **Tests:**
    *   **Unit Test:** `test/unit/dashboard/relationship-graph.test.ts`
        *   **Requirement:** Test node rendering with various mock `metrics` values to ensure correct sizing and badge display.
        *   **Requirement:** Verify label visibility changes with mock zoom levels.

### Task 2.4: Contextual Edge Rendering (Tooltips) [x]

*   **Description:** Implemented interactive tooltips for edges that display the `edge.details` property on hover in `src/dashboard/components/relationship-graph.ts`.
*   **Files:** `src/dashboard/components/relationship-graph.ts`
*   **Changes:**
    *   Added a tooltip HTML element to the `render()` method.
    *   Added CSS for the tooltip.
    *   Implemented `mouseover` and `mouseout` event listeners on links to show/hide and populate the tooltip.
*   **Tests:**
    *   **Unit Test:** `test/unit/dashboard/relationship-graph.test.ts`
        *   **Requirement:** Simulate mouse events on links and assert that tooltips appear/disappear with the correct content.

### Task 2.5: Semantic Zooming Implementation (Refinement) [x]

*   **Description:** Refined the existing D3 zoom behavior in `src/dashboard/components/relationship-graph.ts` to control the level of detail displayed based on the current zoom scale, ensuring a smooth transition between overview and detail.
*   **Files:** `src/dashboard/components/relationship-graph.ts`
*   **Changes:**
    *   Updated the `zoom` event handler to dynamically adjust label opacity based on `event.transform.k`.
*   **Tests:**
    *   **Unit Test:** `test/unit/dashboard/relationship-graph.test.ts`
        *   **Requirement:** Simulate various zoom levels and assert that visual elements (labels, badges, potentially nodes) change their visibility or size as expected, demonstrating effective semantic zooming.

### Task 2.6: Advanced 2D/2.5D Visual Effects for Immersive Flow [x]

*   **Description:** Implemented visual techniques that create a sense of depth and fluid navigation, allowing users to "flow" through the information space, including "Layered Force-Directed Layout with 'Depth'," "Focus + Context with Animated Transitions," and "Interactive 'Explosion' of Grouped Nodes."
*   **Files:** `src/dashboard/components/relationship-graph.ts`
*   **Changes:**
    *   **Layered Force-Directed Layout with "Depth":** Applied dynamic opacity to links based on type and connection to group nodes. Applied initial opacity to nodes to dim group nodes.
    *   **Focus + Context with Animated Transitions:** Enhanced `selectNode` and `highlightNode` methods to include smooth D3 transitions for highlighting, dimming, centering, and zooming to selected nodes.
    *   **Interactive "Explosion" of Grouped Nodes:** Implemented `toggleGroupExpansion` method with D3 transitions for nodes and links, creating a visual "explosion" effect when groups are expanded/collapsed.
*   **Tests:**
    *   **Unit Test:** `test/unit/dashboard/relationship-graph.test.ts`
        *   **Requirement:** Test animation logic for focus/context effects: simulate node selection and assert that node positions, opacities, and colors transition smoothly.
        *   **Requirement:** Test "explosion" effect: simulate group expansion and assert that child nodes animate outwards from the parent group's position.

---

## III. Data & State Management

**Objective:** Centralize data fetching and implement cross-tab synchronization to ensure data consistency, avoid DRY violations, and enable seamless interaction across dashboard components.

### Task 3.1: Centralize Graph Data Fetching [x]

*   **Description:** Ensured `relationship-graph.ts` fetches its data via `data.service.ts`, which in turn uses `api.service.ts`. This establishes a single source of truth for graph data, enabling caching and potential future data manipulation/transformation at a service level.
*   **Files:**
    *   `src/dashboard/components/relationship-graph.ts`
    *   `src/dashboard/services/data.service.ts`
    *   `src/dashboard/services/api.service.ts`
*   **Changes:**
    *   In `relationship-graph.ts`, modified the `loadData` method to call `dataService.getRelationships()`.
    *   In `data.service.ts`, ensured the `fetch` method correctly handles the `/api/relationships` endpoint and its new data structure.
    *   In `api.service.ts`, added the `getRelationships` method to fetch overall graph data.
*   **Tests:**
    *   **Integration Test:** `test/integration/dashboard/data-flow.test.ts`
        *   **Requirement:** Mock the API response for `/api/relationships` with the new, enriched data structure.
        *   **Requirement:** Verify that `relationship-graph.ts` correctly receives and processes the data when `dataService.fetch` is called, ensuring the data flows through `api.service.ts` and `data.service.ts` as expected.

### Task 3.2: Implement Cross-Tab Synchronization (Node Selection) [x]

*   **Description:** When a node is selected in the graph, publish its ID to a central state management service. This service will act as a broadcast mechanism, allowing other dashboard components to subscribe and react to the selected node, enabling seamless cross-tab interaction.
*   **Files:**
    *   `src/dashboard/components/relationship-graph.ts`
    *   `src/dashboard/services/state.service.ts` (or create `selection.service.ts` if `state.service` is too generic)
*   **Changes:**
    *   In `state.service.ts` (or a new dedicated `selection.service.ts`), add:
        *   A private `selectedNodeId` property.
        *   A method `setSelectedNode(nodeId: string)` that updates `selectedNodeId` and notifies subscribers. (Consider using a simple event emitter pattern or a reactive programming approach like RxJS `Subject` if available).
    *   In `relationship-graph.ts`, within the `selectNode` method (which is called when a graph node is clicked), call `stateService.setState('selectedNodeId', node.id)` after updating the local state.
*   **Tests:**
    *   **Unit Test:** `test/unit/dashboard/state.service.test.ts` (or `selection.service.test.ts`)
        *   **Requirement:** Test `setSelectedNode` and `subscribeToSelectedNode` to ensure correct event publishing and subscription. Verify that registered callbacks are invoked with the correct `nodeId` when a selection occurs.
    *   **Integration Test:** `test/integration/dashboard/cross-component.test.ts`
        *   **Requirement:** Create a mock dashboard component that subscribes to the `state.service.ts` (or `selection.service.ts`).
        *   **Requirement:** Simulate a node click in `relationship-graph.ts` and assert that the mock component's callback is triggered and receives the correct `nodeId`, demonstrating successful cross-component communication.

---

## IV. UI Components & Controls

**Objective:** Provide intuitive controls for filtering the graph, enhancing user control over the displayed information.

### Task 4.1: Create `GraphFilterSidebar` Component

*   **Description:** Develop a new custom element (`<graph-filter-sidebar>`) that will house the interactive filtering controls for the relationship graph. This component will encapsulate the UI logic for filtering.
*   **Files:**
    *   `src/dashboard/components/graph-filter-sidebar.ts` (new file)
    *   `src/dashboard/components/base-component.ts` (for `defineComponent` and extending `DashboardComponent`)
*   **Changes:**
    *   Define a new class `GraphFilterSidebar` extending `DashboardComponent`.
    *   Implement the `render()` method to create the HTML structure for filter controls (e.g., checkboxes for node types, sliders for metric ranges, dropdowns for modules/namespaces).
    *   Add event listeners to these filter controls (e.g., `change` events for checkboxes/sliders).
    *   When a filter changes, emit a custom event (e.g., `filter-changed`) containing the current filter state, or call a method on a shared service.
*   **Tests:**
    *   **Unit Test:** `test/unit/dashboard/graph-filter-sidebar.test.ts` (new file)
        *   **Requirement:** Test component rendering: assert that all expected filter controls are present in the DOM.
        *   **Requirement:** Test event emission: simulate user interaction with filter controls (e.g., checking a checkbox, moving a slider) and assert that the `filter-changed` event is emitted with the correct filter payload.

### Task 4.2: Integrate `GraphFilterSidebar` into Dashboard

*   **Description:** Integrate the newly created `GraphFilterSidebar` component into the main dashboard layout, and establish communication between the sidebar and the `relationship-graph.ts` component to apply filters.
*   **Files:**
    *   `src/dashboard/index.html` (or `src/dashboard/main.ts` if dynamically added)
    *   `src/dashboard/components/relationship-graph.ts` (to receive filter events and apply them)
*   **Changes:**
    *   Add the `<graph-filter-sidebar></graph-filter-sidebar>` custom element to the appropriate section of `index.html` (e.g., within the `graph-container` alongside the graph canvas) or dynamically create it in `main.ts`.
    *   In `relationship-graph.ts`, add an event listener for the `filter-changed` event emitted by the `GraphFilterSidebar`.
    *   When the `filter-changed` event is received, update the graph's internal filter state and re-render the D3 visualization, applying the new filters to the `graphData`.
*   **Tests:**
    *   **Integration Test:** `test/integration/dashboard/filter-integration.test.ts` (new file)
        *   **Requirement:** Simulate user interaction with the `GraphFilterSidebar` (e.g., checking a filter option).
        *   **Requirement:** Assert that the `relationship-graph.ts` component receives the filter event and that the displayed graph visually updates to reflect the applied filters (e.g., nodes of a certain type disappear).

---

## V. Testing & Verification

**Objective:** Ensure all new features are robust, data flows correctly, and the system behaves as expected, adhering to our quality standards.

### Task 5.1: Enhance/Create `relationship-graph.test.ts`

*   **Description:** Create a dedicated test file or significantly enhance the existing one for `relationship-graph.ts` to cover all new unit-level functionalities implemented in Section II.
*   **Files:** `test/unit/dashboard/relationship-graph.test.ts` (or new file if it doesn't exist)
*   **Changes:**
    *   Write comprehensive unit tests for:
        *   Data transformation logic (Task 2.1).
        *   D3 force layout adjustments for grouping (Task 2.2).
        *   Node rendering logic (sizing, badges, labels) (Task 2.3).
        *   Edge tooltip functionality (Task 2.4).
        *   Semantic zooming behavior (Task 2.5).
        *   Advanced 2D/2.5D visual effects (Task 2.6), including animation states and visual property changes.
*   **Execution:** Run using our `TestRunner.ts`. Example command: `npm test test/unit/dashboard/relationship-graph.test.ts`

### Task 5.2: Create Integration Tests for Data Flow & UI Interaction

*   **Description:** Develop integration tests to verify end-to-end data flow from API mock to UI rendering, and user interactions with the new filter sidebar and cross-component communication.
*   **Files:**
    *   `test/integration/dashboard/data-flow.test.ts` (new file)
    *   `test/integration/dashboard/filter-integration.test.ts` (new file)
    *   `test/integration/dashboard/cross-component.test.ts` (new file)
*   **Changes:**
    *   **`data-flow.test.ts`:** Mock API responses for `/api/relationships` with the new, enriched data structure. Assert that the `relationship-graph.ts` component correctly initializes and renders the graph based on this data, ensuring proper data ingestion through `api.service.ts` and `data.service.ts`.
    *   **`filter-integration.test.ts`:** Simulate user interaction with the `GraphFilterSidebar` (e.g., checking a filter option).
        *   **Requirement:** Assert that the `relationship-graph.ts` component receives the filter event and that the displayed graph visually updates to reflect the applied filters (e.g., nodes of a certain type disappear).
    *   **`cross-component.test.ts`:** Create a test scenario where a node is clicked in `relationship-graph.ts`. Assert that the `state.service.ts` (or `selection.service.ts`) correctly broadcasts the selected node ID, and that a mock subscribing component receives this ID.
*   **Execution:** Run using our `TestRunner.ts`. Example command: `npm test test/integration/dashboard/` (to run all integration tests).

### Task 5.3: Manual Verification of Relations

*   **Description:** After all automated tests pass, perform thorough manual verification to ensure the visual representation of relations is accurate, intuitive, and truly enhances the user's understanding of the codebase. This step is crucial for validating the "building blocks of knowledge" objective.
*   **Steps:**
    1.  Load the dashboard with diverse sample data (small, medium, large graphs).
    2.  **Verify Hierarchical Grouping:** Expand and collapse modules/namespaces. Observe if nodes correctly group and ungroup, and if connections between groups are clear.
    3.  **Verify Node Sizing:** Confirm that larger nodes visually correspond to higher LOC/complexity metrics.
    4.  **Verify Edge Tooltips:** Hover over various edges and confirm that the `details` are displayed accurately and provide meaningful context.
    5.  **Verify Semantic Zooming:** Zoom in and out extensively. Observe if labels and badges appear/disappear smoothly and appropriately at different zoom levels, maintaining visual clarity.
    6.  **Verify Filter Sidebar:** Apply various combinations of filters (by type, by metric range, by module/namespace) and ensure the graph updates correctly and responsively.
    7.  **Verify Focus + Context:** Click on different nodes (individual and group nodes). Observe the smooth transitions, the centering of the selected node, and the effective dimming of unrelated elements. Ensure the "flow" feels natural.
    8.  **Verify "Explosion" Effect:** Click on group nodes to expand them and observe the animation. Confirm it's visually appealing and aids in understanding the group's contents.
    9.  **Cross-Reference with Source Code:** For a selection of displayed relationships, manually cross-reference them with the actual source code files to confirm the accuracy of the extracted relationships and metrics.
    10. **User Experience Feedback:** (Informal) If possible, have a few other team members test and provide feedback on the intuitiveness and effectiveness of the new visualizations.
*   **Outcome:** A confirmed, high-quality, and intuitive interactive relationship graph that serves as a powerful tool for codebase understanding.
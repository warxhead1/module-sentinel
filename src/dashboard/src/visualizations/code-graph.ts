/**
 * Code Graph Visualization
 * WebGPU-powered force-directed graph for symbols and relationships
 */

import { WebGPURenderer } from '../core/webgpu-renderer.js';
import type { Symbol, UniversalRelationship } from '../types/rust-bindings.js';

interface GraphNode {
  id: string;
  symbol: Symbol;
  position: Float32Array;
  velocity: Float32Array;
  force: Float32Array;
  radius: number;
  color: Float32Array;
}

interface GraphEdge {
  source: string;
  target: string;
  strength: number;
}

export class CodeGraph {
  private renderer: WebGPURenderer;
  private active = false;
  
  // Graph data
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];
  
  // GPU resources
  private nodeBuffer: GPUBuffer | null = null;
  private edgeBuffer: GPUBuffer | null = null;
  private paramsBuffer: GPUBuffer | null = null;
  private computeBindGroup: GPUBindGroup | null = null;
  private renderBindGroup: GPUBindGroup | null = null;
  private forceComputePipeline: GPUComputePipeline | null = null;
  private renderPipeline: GPURenderPipeline | null = null;
  
  // Interaction state
  private hoveredNode: GraphNode | null = null;
  private highlightedNodes = new Set<string>();
  
  // Shader code
  private readonly computeShader = `
    struct Node {
      position: vec3<f32>,
      velocity: vec3<f32>,
      force: vec3<f32>,
      radius: f32,
      color: vec4<f32>,
    };
    
    struct Edge {
      source: u32,
      target_index: u32,
      strength: f32,
    };
    
    @group(0) @binding(0) var<storage, read_write> nodes: array<Node>;
    @group(0) @binding(1) var<storage, read> edges: array<Edge>;
    @group(0) @binding(2) var<uniform> params: vec4<f32>; // node_count, edge_count, dt, damping
    
    @compute @workgroup_size(32)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
      let idx = global_id.x;
      let node_count = u32(params.x);
      
      if (idx >= node_count) { return; }
      
      var node = nodes[idx];
      
      // Reset force
      node.force = vec3<f32>(0.0);
      
      // Repulsion between all nodes
      for (var i = 0u; i < node_count; i++) {
        if (i == idx) { continue; }
        
        let other = nodes[i];
        let diff = node.position - other.position;
        let dist = length(diff);
        
        if (dist > 0.0 && dist < 500.0) {
          let repulsion = 1000.0 / (dist * dist);
          node.force += normalize(diff) * repulsion;
        }
      }
      
      // Attraction along edges
      let edge_count = u32(params.y);
      for (var i = 0u; i < edge_count; i++) {
        let edge = edges[i];
        
        if (edge.source == idx) {
          let target_node = nodes[edge.target_index];
          let diff = target_node.position - node.position;
          let dist = length(diff);
          
          if (dist > 0.0) {
            let attraction = edge.strength * dist * 0.01;
            node.force += normalize(diff) * attraction;
          }
        }
      }
      
      // Update velocity and position
      let dt = params.z;
      let damping = params.w;
      
      node.velocity = node.velocity * damping + node.force * dt;
      node.position += node.velocity * dt;
      
      // Bounds
      node.position = clamp(node.position, vec3<f32>(-1000.0), vec3<f32>(1000.0));
      
      nodes[idx] = node;
    }
  `;
  
  private readonly vertexShader = `
    struct Node {
      @location(0) position: vec3<f32>,
      @location(1) velocity: vec3<f32>,
      @location(2) force: vec3<f32>,
      @location(3) radius: f32,
      @location(4) color: vec4<f32>,
    };
    
    struct VertexOutput {
      @builtin(position) position: vec4<f32>,
      @location(0) color: vec4<f32>,
      @location(1) uv: vec2<f32>,
    };
    
    @group(0) @binding(0) var<uniform> viewProjection: mat4x4<f32>;
    
    @vertex
    fn main(
      node: Node,
      @builtin(vertex_index) vertex_idx: u32
    ) -> VertexOutput {
      var output: VertexOutput;
      
      // Create quad vertices
      let quad_pos = array<vec2<f32>, 4>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>( 1.0,  1.0)
      );
      
      let pos = quad_pos[vertex_idx];
      let world_pos = node.position + vec3<f32>(pos * node.radius, 0.0);
      
      output.position = viewProjection * vec4<f32>(world_pos, 1.0);
      output.color = node.color;
      output.uv = pos * 0.5 + 0.5;
      
      return output;
    }
  `;
  
  private readonly fragmentShader = `
    struct FragmentInput {
      @location(0) color: vec4<f32>,
      @location(1) uv: vec2<f32>,
    };
    
    @fragment
    fn main(input: FragmentInput) -> @location(0) vec4<f32> {
      let dist = length(input.uv - vec2<f32>(0.5));
      if (dist > 0.5) { discard; }
      
      let alpha = smoothstep(0.5, 0.4, dist);
      return vec4<f32>(input.color.rgb, input.color.a * alpha);
    }
  `;
  
  constructor(renderer: WebGPURenderer) {
    this.renderer = renderer;
  }
  
  async init(): Promise<void> {
    const device = this.renderer.getDevice();
    if (!device) throw new Error('WebGPU device not available');
    
    // Create compute pipeline for force simulation
    const computeModule = this.renderer.createShaderModule(this.computeShader, 'Force Compute Shader');
    if (!computeModule) throw new Error('Failed to create compute shader');
    
    const computeBindGroupLayout = this.renderer.createBindGroupLayout('forceCompute', {
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }
      ]
    });
    
    if (!computeBindGroupLayout) throw new Error('Failed to create bind group layout');
    
    this.forceComputePipeline = this.renderer.createComputePipeline('forceCompute', {
      layout: device.createPipelineLayout({
        bindGroupLayouts: [computeBindGroupLayout]
      }),
      compute: {
        module: computeModule,
        entryPoint: 'main'
      }
    });
    
    // Create render pipeline
    const vertexModule = this.renderer.createShaderModule(this.vertexShader, 'Graph Vertex Shader');
    const fragmentModule = this.renderer.createShaderModule(this.fragmentShader, 'Graph Fragment Shader');
    
    if (!vertexModule || !fragmentModule) throw new Error('Failed to create shaders');
    
    const renderBindGroupLayout = this.renderer.createBindGroupLayout('graphRender', {
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }
      ]
    });
    
    this.renderPipeline = this.renderer.createRenderPipeline('graphRender', {
      layout: device.createPipelineLayout({
        bindGroupLayouts: [renderBindGroupLayout]
      }),
      vertex: {
        module: vertexModule,
        entryPoint: 'main',
        buffers: [{
          arrayStride: 64, // 3*4 + 3*4 + 3*4 + 4 + 4*4 = 64 bytes
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },  // position
            { shaderLocation: 1, offset: 12, format: 'float32x3' }, // velocity
            { shaderLocation: 2, offset: 24, format: 'float32x3' }, // force
            { shaderLocation: 3, offset: 36, format: 'float32' },   // radius
            { shaderLocation: 4, offset: 40, format: 'float32x4' }  // color
          ]
        }]
      },
      fragment: {
        module: fragmentModule,
        entryPoint: 'main',
        targets: [{
          format: this.renderer.getFormat(),
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add'
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add'
            }
          }
        }]
      },
      primitive: {
        topology: 'triangle-strip',
        stripIndexFormat: 'uint16'
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus'
      }
    });
    
    // Create persistent params buffer
    this.paramsBuffer = device.createBuffer({
      label: 'Force Compute Params',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    
    // Register render pass
    this.renderer.registerRenderPass((pass: GPURenderPassEncoder) => {
      if (this.active) {
        this.renderGraph(pass);
      }
    });
    
    // Register compute pass
    this.renderer.registerComputePass((encoder: GPUCommandEncoder) => {
      if (this.active && this.computeBindGroup) {
        this.runForceSimulation(encoder);
      }
    });
    
    console.info('CodeGraph visualization initialized');
  }
  
  updateData(data: { symbols: Symbol[], relations: UniversalRelationship[] }): void {
    // Clear existing data
    this.nodes.clear();
    this.edges = [];
    
    // Create nodes from symbols
    data.symbols.forEach((symbol) => {
      const node: GraphNode = {
        id: symbol.id,
        symbol,
        position: new Float32Array([
          (Math.random() - 0.5) * 1000,
          (Math.random() - 0.5) * 1000,
          (Math.random() - 0.5) * 100
        ]),
        velocity: new Float32Array(3),
        force: new Float32Array(3),
        radius: 5 + Math.sqrt(symbol.endLine - symbol.startLine),
        color: this.getColorForLanguage(symbol.language)
      };
      
      this.nodes.set(symbol.id, node);
    });
    
    // Create edges from relations
    data.relations.forEach(relation => {
      const sourceId = relation.fromSymbolId?.toString() || '';
      const targetId = relation.toSymbolId?.toString() || '';
      
      if (this.nodes.has(sourceId) && this.nodes.has(targetId)) {
        this.edges.push({
          source: sourceId,
          target: targetId,
          strength: relation.confidence
        });
      }
    });
    
    // Update GPU buffers
    this.updateBuffers();
  }
  
  private getColorForLanguage(language: string): Float32Array {
    const colors: Record<string, number[]> = {
      'Rust': [1.0, 0.5, 0.0, 1.0],
      'TypeScript': [0.0, 0.5, 1.0, 1.0],
      'JavaScript': [1.0, 1.0, 0.0, 1.0],
      'Python': [0.0, 1.0, 0.5, 1.0],
      'Cpp': [0.5, 0.5, 1.0, 1.0],
      'Go': [0.0, 0.8, 0.8, 1.0]
    };
    
    const color = colors[language] || [0.7, 0.7, 0.7, 1.0];
    return new Float32Array(color);
  }
  
  private updateBuffers(): void {
    const device = this.renderer.getDevice();
    if (!device) return;
    
    // Convert nodes to buffer data
    const nodeArray = Array.from(this.nodes.values());
    const nodeData = new Float32Array(nodeArray.length * 16); // 64 bytes / 4 = 16 floats
    
    nodeArray.forEach((node, i) => {
      const offset = i * 16;
      nodeData.set(node.position, offset);
      nodeData.set(node.velocity, offset + 3);
      nodeData.set(node.force, offset + 6);
      nodeData[offset + 9] = node.radius;
      nodeData.set(node.color, offset + 10);
    });
    
    // Create or update node buffer
    if (this.nodeBuffer) {
      this.nodeBuffer.destroy();
    }
    
    this.nodeBuffer = device.createBuffer({
      size: nodeData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    
    new Float32Array(this.nodeBuffer!.getMappedRange()).set(nodeData);
    this.nodeBuffer!.unmap();
    
    // Convert edges to buffer data
    const edgeIndices = new Map<string, number>();
    nodeArray.forEach((node, i) => edgeIndices.set(node.id, i));
    
    const edgeData = new Float32Array(this.edges.length * 4); // source, target, strength, padding
    
    this.edges.forEach((edge, i) => {
      const offset = i * 4;
      edgeData[offset] = edgeIndices.get(edge.source) || 0;
      edgeData[offset + 1] = edgeIndices.get(edge.target) || 0;
      edgeData[offset + 2] = edge.strength;
      edgeData[offset + 3] = 0; // padding
    });
    
    // Create or update edge buffer
    if (this.edgeBuffer) {
      this.edgeBuffer.destroy();
    }
    
    this.edgeBuffer = device.createBuffer({
      size: Math.max(16, edgeData.byteLength), // Minimum 16 bytes
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    
    new Float32Array(this.edgeBuffer!.getMappedRange()).set(edgeData);
    this.edgeBuffer!.unmap();
    
    // Invalidate bind groups when buffers change
    this.computeBindGroup = null;
    this.renderBindGroup = null;
  }
  
  update(deltaTime: number): void {
    if (!this.active || !this.forceComputePipeline || !this.nodeBuffer || !this.edgeBuffer || !this.paramsBuffer) return;
    
    const device = this.renderer.getDevice();
    if (!device) return;
    
    // Update params buffer
    device.queue.writeBuffer(
      this.paramsBuffer,
      0,
      new Float32Array([
        this.nodes.size,  // node count
        this.edges.length, // edge count
        deltaTime * 0.001, // dt in seconds
        0.98              // damping
      ])
    );
    
    // Create compute bind group if needed or if buffers changed
    if (!this.computeBindGroup) {
      this.computeBindGroup = device.createBindGroup({
        layout: this.forceComputePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.nodeBuffer } },
          { binding: 1, resource: { buffer: this.edgeBuffer } },
          { binding: 2, resource: { buffer: this.paramsBuffer } }
        ]
      });
    }
  }
  
  private runForceSimulation(encoder: GPUCommandEncoder): void {
    if (!this.forceComputePipeline || !this.computeBindGroup || this.nodes.size === 0) return;
    
    const computePass = encoder.beginComputePass({
      label: 'Force Compute Pass'
    });
    
    computePass.setPipeline(this.forceComputePipeline);
    computePass.setBindGroup(0, this.computeBindGroup);
    computePass.dispatchWorkgroups(Math.ceil(this.nodes.size / 32));
    computePass.end();
  }
  
  private renderGraph(pass: GPURenderPassEncoder): void {
    if (!this.renderPipeline || !this.nodeBuffer || this.nodes.size === 0) return;
    
    const device = this.renderer.getDevice();
    if (!device) return;
    
    // Get camera matrices
    const viewProjectionBuffer = this.renderer.getBuffer('viewProjectionMatrix');
    if (!viewProjectionBuffer) return;
    
    // Create render bind group once
    if (!this.renderBindGroup) {
      this.renderBindGroup = device.createBindGroup({
        layout: this.renderPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: viewProjectionBuffer } } // viewProjection matrix
        ]
      });
    }
    
    pass.setPipeline(this.renderPipeline);
    pass.setBindGroup(0, this.renderBindGroup);
    pass.setVertexBuffer(0, this.nodeBuffer);
    pass.draw(4, this.nodes.size);
  }
  
  setActive(active: boolean): void {
    this.active = active;
  }
  
  isActive(): boolean {
    return this.active;
  }
  
  raycast(x: number, y: number): Symbol | null {
    // Convert screen coordinates to world space
    const nodes = Array.from(this.nodes.values());
    const matrices = this.renderer.getCameraMatrices();
    
    // Simple distance-based picking for now
    // TODO: Implement proper GPU-based picking with depth testing
    let closestNode: GraphNode | undefined;
    let closestDistance = Infinity;
    
    nodes.forEach(node => {
      // Project node position to screen space
      const screenPos = this.projectToScreen(node.position, matrices.viewProjection);
      const dx = screenPos.x - x;
      const dy = screenPos.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < node.radius && distance < closestDistance) {
        closestDistance = distance;
        closestNode = node;
      }
    });
    
    return closestNode ? closestNode.symbol : null;
  }
  
  private projectToScreen(worldPos: Float32Array, viewProjection: Float32Array): { x: number, y: number } {
    // Simple projection - will be replaced with proper matrix math
    const w = viewProjection[3] * worldPos[0] + viewProjection[7] * worldPos[1] + 
              viewProjection[11] * worldPos[2] + viewProjection[15];
    const x = (viewProjection[0] * worldPos[0] + viewProjection[4] * worldPos[1] + 
               viewProjection[8] * worldPos[2] + viewProjection[12]) / w;
    const y = (viewProjection[1] * worldPos[0] + viewProjection[5] * worldPos[1] + 
               viewProjection[9] * worldPos[2] + viewProjection[13]) / w;
    
    return { x, y };
  }
  
  hover(x: number, y: number): void {
    const symbol = this.raycast(x, y);
    const newHoveredNode = symbol ? this.nodes.get(symbol.id) || null : null;
    
    if (newHoveredNode !== this.hoveredNode) {
      // Reset previous hovered node
      if (this.hoveredNode) {
        this.hoveredNode.radius = 5 + Math.sqrt(this.hoveredNode.symbol.endLine - this.hoveredNode.symbol.startLine);
      }
      
      // Highlight new hovered node
      if (newHoveredNode) {
        newHoveredNode.radius *= 1.5;
      }
      
      this.hoveredNode = newHoveredNode;
      this.updateBuffers();
    }
  }
  
  highlightSymbol(symbol: Symbol): void {
    this.highlightedNodes.clear();
    this.highlightedNodes.add(symbol.id);
    
    // Also highlight related symbols
    symbol.similarSymbols.forEach((id: string) => this.highlightedNodes.add(id));
    
    // Update node colors
    this.nodes.forEach(node => {
      if (this.highlightedNodes.has(node.id)) {
        // Brighten highlighted nodes
        node.color = new Float32Array([
          Math.min(1.0, node.color[0] * 1.5),
          Math.min(1.0, node.color[1] * 1.5),
          Math.min(1.0, node.color[2] * 1.5),
          1.0
        ]);
      } else {
        // Dim non-highlighted nodes
        node.color[3] = 0.3; // Reduce alpha
      }
    });
    
    this.updateBuffers();
  }
  
  clearHighlight(): void {
    this.highlightedNodes.clear();
    
    // Restore original colors
    this.nodes.forEach(node => {
      node.color = this.getColorForLanguage(node.symbol.language);
    });
    
    this.updateBuffers();
  }
}
/**
 * Flow Simulation Visualization
 * GPU-accelerated particle flow for data movement visualization
 */

import { WebGPURenderer } from '../core/webgpu-renderer.js';
import type { Symbol, UniversalRelationship } from '../types/rust-bindings.js';

interface FlowParticle {
  position: Float32Array;
  velocity: Float32Array;
  life: number;
  sourceId: string;
  targetId: string;
}

export class FlowSimulation {
  private renderer: WebGPURenderer;
  private active = false;
  
  // Particle system
  private particles: FlowParticle[] = [];
  private maxParticles = 10000;
  private particleIndex = 0;
  
  // GPU resources
  private particleBuffer: GPUBuffer | null = null;
  private particleStateBuffer: GPUBuffer | null = null;
  private symbolPositionsBuffer: GPUBuffer | null = null;
  private computePipeline: GPUComputePipeline | null = null;
  private renderPipeline: GPURenderPipeline | null = null;
  private computeBindGroup: GPUBindGroup | null = null;
  private renderBindGroup: GPUBindGroup | null = null;
  
  // Symbol positions for flow paths
  private symbolPositions = new Map<string, Float32Array>();
  
  constructor(renderer: WebGPURenderer) {
    this.renderer = renderer;
  }
  
  async init(): Promise<void> {
    const device = this.renderer.getDevice();
    if (!device) throw new Error('WebGPU device not available');
    
    // Create shaders
    const computeShader = this.createComputeShader();
    const vertexShader = this.createVertexShader();
    const fragmentShader = this.createFragmentShader();
    
    // Create compute pipeline for particle simulation
    const computeModule = this.renderer.createShaderModule(computeShader, 'Particle Compute Shader');
    if (!computeModule) throw new Error('Failed to create compute shader');
    
    const computeBindGroupLayout = this.renderer.createBindGroupLayout('particleCompute', {
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // particles
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // particle states
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // symbol positions
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } } // params
      ]
    });
    
    this.computePipeline = this.renderer.createComputePipeline('particleCompute', {
      layout: device.createPipelineLayout({
        bindGroupLayouts: [computeBindGroupLayout!]
      }),
      compute: {
        module: computeModule,
        entryPoint: 'main'
      }
    });
    
    // Create render pipeline
    const vertexModule = this.renderer.createShaderModule(vertexShader, 'Particle Vertex Shader');
    const fragmentModule = this.renderer.createShaderModule(fragmentShader, 'Particle Fragment Shader');
    
    if (!vertexModule || !fragmentModule) throw new Error('Failed to create shaders');
    
    const renderBindGroupLayout = this.renderer.createBindGroupLayout('particleRender', {
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } } // viewProjection
      ]
    });
    
    this.renderPipeline = this.renderer.createRenderPipeline('particleRender', {
      layout: device.createPipelineLayout({
        bindGroupLayouts: [renderBindGroupLayout!]
      }),
      vertex: {
        module: vertexModule,
        entryPoint: 'main',
        buffers: [{
          arrayStride: 32, // position(vec3) + velocity(vec3) + life(f32) + sourceId(u32)
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },  // position
            { shaderLocation: 1, offset: 12, format: 'float32x3' }, // velocity
            { shaderLocation: 2, offset: 24, format: 'float32' },   // life
            { shaderLocation: 3, offset: 28, format: 'uint32' }     // sourceId
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
              dstFactor: 'one',
              operation: 'add'
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one',
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
        depthWriteEnabled: false,
        depthCompare: 'less',
        format: 'depth24plus'
      }
    });
    
    // Initialize particle buffers
    this.initializeBuffers();
    
    // Register passes
    this.renderer.registerComputePass((encoder: GPUCommandEncoder) => {
      if (this.active && this.computeBindGroup) {
        this.runParticleSimulation(encoder);
      }
    });
    
    this.renderer.registerRenderPass((pass: GPURenderPassEncoder) => {
      if (this.active) {
        this.renderParticles(pass);
      }
    });
    
    console.info('FlowSimulation visualization initialized with WebGPU acceleration');
  }
  
  updateData(data: { symbols: Symbol[], relations: UniversalRelationship[] }): void {
    const device = this.renderer.getDevice();
    if (!device) return;
    
    // Cache symbol positions
    this.symbolPositions.clear();
    const symbolArray: Float32Array[] = [];
    const symbolIdMap = new Map<string, number>();
    
    data.symbols.forEach((symbol, index) => {
      // Generate positions based on symbol properties
      const x = this.hashString(symbol.filePath) * 1000 - 500;
      const y = symbol.startLine * 0.5 - 250;
      const z = this.hashString(symbol.language) * 100 - 50;
      const pos = new Float32Array([x, y, z]);
      
      this.symbolPositions.set(symbol.id, pos);
      symbolArray.push(pos);
      symbolIdMap.set(symbol.id, index);
    });
    
    // Create symbol positions buffer
    if (this.symbolPositionsBuffer) {
      this.symbolPositionsBuffer.destroy();
    }
    
    const positionsData = new Float32Array(symbolArray.length * 4); // vec3 + padding
    symbolArray.forEach((pos, i) => {
      positionsData.set(pos, i * 4);
    });
    
    this.symbolPositionsBuffer = device.createBuffer({
      label: 'Symbol Positions Buffer',
      size: Math.max(16, positionsData.byteLength), // Minimum 16 bytes
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Float32Array(this.symbolPositionsBuffer.getMappedRange()).set(positionsData);
    this.symbolPositionsBuffer.unmap();
    
    // Reset particles
    this.particles = [];
    
    // Create particle flows for relationships
    data.relations.forEach(relation => {
      if (relation.confidence > 0.5) { // Only strong relationships
        const sourceIdx = symbolIdMap.get(relation.fromSymbolId?.toString() || '');
        const targetIdx = symbolIdMap.get(relation.toSymbolId?.toString() || '');
        
        if (sourceIdx !== undefined && targetIdx !== undefined) {
          this.createParticleFlowGPU(sourceIdx, targetIdx, relation.confidence);
        }
      }
    });
    
    // Update GPU buffers
    this.updateParticleBufferGPU();
    
    // Invalidate bind groups
    this.computeBindGroup = null;
    this.renderBindGroup = null;
  }
  
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) / 2147483647; // Normalize to 0-1
  }
  
  private createParticleFlowGPU(sourceIdx: number, targetIdx: number, strength: number): void {
    // Create multiple particles for the flow
    const particleCount = Math.ceil(strength * 10);
    
    for (let i = 0; i < particleCount; i++) {
      if (this.particles.length >= this.maxParticles) {
        break; // Don't exceed max particles
      }
      
      const particle: FlowParticle = {
        position: new Float32Array(3),
        velocity: new Float32Array(3),
        life: Math.random() * 0.5 + 0.5, // Randomize initial life
        sourceId: sourceIdx.toString(),
        targetId: targetIdx.toString()
      };
      
      this.particles.push(particle);
    }
  }
  
  update(deltaTime: number): void {
    if (!this.active || !this.computeBindGroup) return;
    
    const device = this.renderer.getDevice();
    if (!device) return;
    
    const paramsBuffer = this.renderer.getBuffer('particleParams');
    if (!paramsBuffer) return;
    
    // Update params
    const time = performance.now() * 0.001;
    device.queue.writeBuffer(
      paramsBuffer,
      0,
      new Float32Array([
        deltaTime * 0.001, // deltaTime in seconds
        time, // current time
        this.particles.length, // particle count
        this.symbolPositions.size // symbol count
      ])
    );
  }
  
  private updateParticleBufferGPU(): void {
    if (!this.particleBuffer || !this.particleStateBuffer || this.particles.length === 0) return;
    
    const device = this.renderer.getDevice();
    if (!device || !this.symbolPositionsBuffer) return;
    
    // Convert particles to buffer format
    const particleData = new Float32Array(this.particles.length * 8);
    const stateData = new Float32Array(this.particles.length * 4);
    
    this.particles.forEach((particle, i) => {
      // Particle data
      const pOffset = i * 8;
      const sourceIdx = parseInt(particle.sourceId);
      const sourcePos = this.symbolPositions.get(Object.keys(Object.fromEntries(this.symbolPositions))[sourceIdx]);
      
      if (sourcePos) {
        particleData.set(sourcePos, pOffset); // Initial position at source
      }
      particleData.set(particle.velocity, pOffset + 3);
      particleData[pOffset + 6] = particle.life;
      particleData[pOffset + 7] = sourceIdx; // sourceId as uint32
      
      // State data
      const sOffset = i * 4;
      const targetIdx = parseInt(particle.targetId);
      stateData[sOffset] = targetIdx; // targetId
      stateData[sOffset + 1] = 50 + Math.random() * 50; // initialSpeed
      stateData[sOffset + 2] = 5 + Math.random() * 5; // turbulence
      stateData[sOffset + 3] = 0; // padding
    });
    
    // Update buffers
    device.queue.writeBuffer(this.particleBuffer, 0, particleData);
    device.queue.writeBuffer(this.particleStateBuffer, 0, stateData);
    
    // Create compute bind group
    if (!this.computePipeline) return;
    
    const paramsBuffer = device.createBuffer({
      label: 'Particle Params',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    
    this.computeBindGroup = device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.particleBuffer } },
        { binding: 1, resource: { buffer: this.particleStateBuffer } },
        { binding: 2, resource: { buffer: this.symbolPositionsBuffer } },
        { binding: 3, resource: { buffer: paramsBuffer } }
      ]
    });
    
    // Store params buffer for updates
    this.renderer.createBuffer('particleParams', {
      label: 'Particle Params',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
  }
  
  setActive(active: boolean): void {
    this.active = active;
  }
  
  isActive(): boolean {
    return this.active;
  }
  
  raycast(x: number, y: number): Symbol | null {
    // Flow particles don't support direct picking
    // Could implement by checking proximity to flow paths
    console.info(`Flow raycast at ${x}, ${y}`);
    return null;
  }
  
  hover(x: number, y: number): void {
    // Could highlight flows near cursor
    // For now, just track cursor position
    console.info(`Flow hover at ${x}, ${y}`);
  }
  
  highlightSymbol(symbol: Symbol): void {
    // Increase particle generation for flows involving this symbol
    this.particles.forEach(particle => {
      if (particle.sourceId === symbol.id || particle.targetId === symbol.id) {
        particle.life = Math.min(particle.life * 1.5, 1.0);
      }
    });
  }
  
  clearHighlight(): void {
    // TODO: Clear highlighting
  }
  
  private createComputeShader(): string {
    return `
      struct Particle {
        position: vec3<f32>,
        velocity: vec3<f32>,
        life: f32,
        sourceId: u32,
      };
      
      struct ParticleState {
        targetId: u32,
        initialSpeed: f32,
        turbulence: f32,
        pad: u32,
      };
      
      struct Params {
        deltaTime: f32,
        time: f32,
        particleCount: u32,
        symbolCount: u32,
      };
      
      @group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
      @group(0) @binding(1) var<storage, read> particleStates: array<ParticleState>;
      @group(0) @binding(2) var<storage, read> symbolPositions: array<vec3<f32>>;
      @group(0) @binding(3) var<uniform> params: Params;
      
      @compute @workgroup_size(64)
      fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let idx = global_id.x;
        if (idx >= params.particleCount) { return; }
        
        var particle = particles[idx];
        let state = particleStates[idx];
        
        if (particle.life <= 0.0) { return; }
        
        // Get target position
        let targetPos = symbolPositions[state.targetId];
        let toTarget = targetPos - particle.position;
        let distance = length(toTarget);
        
        // Update velocity with attraction to target
        if (distance > 1.0) {
          let attraction = normalize(toTarget) * state.initialSpeed;
          particle.velocity = mix(particle.velocity, attraction, 0.1);
        }
        
        // Add turbulence
        let turbulence = vec3<f32>(
          sin(params.time * 0.001 + f32(idx) * 0.1) * state.turbulence,
          cos(params.time * 0.001 + f32(idx) * 0.15) * state.turbulence,
          sin(params.time * 0.001 + f32(idx) * 0.2) * state.turbulence * 0.5
        );
        particle.velocity += turbulence;
        
        // Update position
        particle.position += particle.velocity * params.deltaTime;
        
        // Update life
        particle.life -= params.deltaTime * 0.5;
        
        // Reset if reached target or dead
        if (distance < 20.0 || particle.life <= 0.0) {
          let sourcePos = symbolPositions[particle.sourceId];
          particle.position = sourcePos;
          particle.life = 1.0;
          
          // Recalculate initial velocity
          let newToTarget = targetPos - sourcePos;
          let newDistance = length(newToTarget);
          if (newDistance > 0.0) {
            particle.velocity = normalize(newToTarget) * state.initialSpeed;
          }
        }
        
        particles[idx] = particle;
      }
    `;
  }
  
  private createVertexShader(): string {
    return `
      struct Particle {
        @location(0) position: vec3<f32>,
        @location(1) velocity: vec3<f32>,
        @location(2) life: f32,
        @location(3) sourceId: u32,
      };
      
      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) color: vec4<f32>,
        @location(1) uv: vec2<f32>,
      };
      
      @group(0) @binding(0) var<uniform> viewProjection: mat4x4<f32>;
      
      @vertex
      fn main(
        particle: Particle,
        @builtin(vertex_index) vertex_idx: u32
      ) -> VertexOutput {
        var output: VertexOutput;
        
        // Create billboard quad
        let quad_pos = array<vec2<f32>, 4>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>( 1.0, -1.0),
          vec2<f32>(-1.0,  1.0),
          vec2<f32>( 1.0,  1.0)
        );
        
        let pos = quad_pos[vertex_idx];
        let size = 2.0 + particle.life * 3.0;
        
        // Billboard facing camera
        let world_pos = particle.position + vec3<f32>(pos * size, 0.0);
        
        output.position = viewProjection * vec4<f32>(world_pos, 1.0);
        output.color = vec4<f32>(0.2, 0.8, 1.0, particle.life * 0.8);
        output.uv = pos * 0.5 + 0.5;
        
        return output;
      }
    `;
  }
  
  private createFragmentShader(): string {
    return `
      struct FragmentInput {
        @location(0) color: vec4<f32>,
        @location(1) uv: vec2<f32>,
      };
      
      @fragment
      fn main(input: FragmentInput) -> @location(0) vec4<f32> {
        let dist = length(input.uv - vec2<f32>(0.5));
        if (dist > 0.5) { discard; }
        
        let glow = 1.0 - smoothstep(0.0, 0.5, dist);
        let alpha = glow * input.color.a;
        
        return vec4<f32>(input.color.rgb * glow, alpha);
      }
    `;
  }
  
  private initializeBuffers(): void {
    const device = this.renderer.getDevice();
    if (!device) return;
    
    // Create particle buffer
    const particleData = new Float32Array(this.maxParticles * 8); // 32 bytes per particle
    this.particleBuffer = device.createBuffer({
      label: 'Particle Buffer',
      size: particleData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Float32Array(this.particleBuffer.getMappedRange()).set(particleData);
    this.particleBuffer.unmap();
    
    // Create particle state buffer
    const stateData = new Float32Array(this.maxParticles * 4); // 16 bytes per state
    this.particleStateBuffer = device.createBuffer({
      label: 'Particle State Buffer',
      size: stateData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Float32Array(this.particleStateBuffer.getMappedRange()).set(stateData);
    this.particleStateBuffer.unmap();
    
    // Symbol positions buffer will be created when data is updated
  }
  
  private runParticleSimulation(encoder: GPUCommandEncoder): void {
    if (!this.computePipeline || !this.computeBindGroup) return;
    
    const computePass = encoder.beginComputePass({
      label: 'Particle Simulation Pass'
    });
    
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroup);
    computePass.dispatchWorkgroups(Math.ceil(this.particles.length / 64));
    computePass.end();
  }
  
  private renderParticles(pass: GPURenderPassEncoder): void {
    if (!this.renderPipeline || !this.particleBuffer || this.particles.length === 0) return;
    
    const device = this.renderer.getDevice();
    if (!device) return;
    
    const viewProjectionBuffer = this.renderer.getBuffer('viewProjectionMatrix');
    if (!viewProjectionBuffer) return;
    
    if (!this.renderBindGroup) {
      this.renderBindGroup = device.createBindGroup({
        layout: this.renderPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: viewProjectionBuffer } }
        ]
      });
    }
    
    pass.setPipeline(this.renderPipeline);
    pass.setBindGroup(0, this.renderBindGroup);
    pass.setVertexBuffer(0, this.particleBuffer);
    pass.draw(4, this.particles.length);
  }
}
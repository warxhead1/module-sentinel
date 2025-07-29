/**
 * WebGPU Renderer
 * Core WebGPU abstraction with compute and render pipeline management
 */

/// <reference types="@webgpu/types" />

import { mat4, vec3 } from '../utils/math.js';

interface Camera {
  position: Float32Array;
  target: Float32Array;
  up: Float32Array;
  fov: number;
  near: number;
  far: number;
  zoom: number;
}

interface Matrices {
  view: Float32Array;
  projection: Float32Array;
  viewProjection: Float32Array;
}

interface FrameInfo {
  time: number;
  deltaTime: number;
  resolution: Float32Array;
}

export class WebGPURenderer {
  private canvas: HTMLCanvasElement;
  private context: GPUCanvasContext | null = null;
  private device: GPUDevice | null = null;
  private adapter: GPUAdapter | null = null;
  private format: GPUTextureFormat = 'bgra8unorm';
  
  // Pipeline management
  private renderPipelines = new Map<string, GPURenderPipeline>();
  private computePipelines = new Map<string, GPUComputePipeline>();
  
  // Resource management
  private buffers = new Map<string, GPUBuffer>();
  private textures = new Map<string, GPUTexture>();
  private bindGroups = new Map<string, GPUBindGroup>();
  private bindGroupLayouts = new Map<string, GPUBindGroupLayout>();
  
  // Camera and view
  private camera: Camera = {
    position: new Float32Array([0, 0, 100]),
    target: new Float32Array([0, 0, 0]),
    up: new Float32Array([0, 1, 0]),
    fov: 60,
    near: 0.1,
    far: 10000,
    zoom: 1
  };
  
  private matrices: Matrices = {
    view: new Float32Array(16),
    projection: new Float32Array(16),
    viewProjection: new Float32Array(16)
  };
  
  // Frame info
  private frameInfo: FrameInfo = {
    time: 0,
    deltaTime: 0,
    resolution: new Float32Array([0, 0])
  };
  
  // Performance tracking
  private lastFrameTime = 0;
  private frameCount = 0;
  private fpsUpdateInterval = 1000; // Update FPS every second
  private lastFpsUpdate = 0;
  private currentFps = 0;
  
  // Compute pass callbacks
  private computePassCallbacks: Array<(encoder: GPUCommandEncoder) => void> = [];
  
  // Render pass callbacks
  private renderPassCallbacks: Array<(pass: GPURenderPassEncoder) => void> = [];
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }
  
  async init(): Promise<void> {
    // Check WebGPU support with detailed diagnostics
    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser. Ensure you are using Chrome 113+, Edge 113+, or Firefox with webgpu flag enabled.');
    }
    
    // Check if canvas supports webgpu context type
    const supportedContexts = (this.canvas as any).getContextAttributes ? 
      Object.keys(this.canvas.constructor.prototype).filter(k => k.includes('Context')) : 
      ['2d', 'webgl', 'webgl2'];
    
    console.info('Canvas supported contexts:', supportedContexts);
    console.info('Navigator GPU:', !!navigator.gpu);
    console.info('User Agent:', navigator.userAgent);
    
    // Try to get WebGPU context early to fail fast
    this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
    if (!this.context) {
      throw new Error(`Failed to get WebGPU context. Browser: ${navigator.userAgent.split(' ').pop()}. Try enabling WebGPU experimental features or use a WebGPU-compatible browser.`);
    }
    
    // Request adapter with fallback options
    this.adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
      forceFallbackAdapter: false
    });
    
    if (!this.adapter) {
      // Try again with fallback adapter
      this.adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'low-power',
        forceFallbackAdapter: true
      });
    }
    
    if (!this.adapter) {
      throw new Error('Failed to get WebGPU adapter. Your GPU may not support WebGPU or drivers need updating.');
    }
    
    // Log adapter info for debugging
    const adapterInfo = await (this.adapter as any).requestAdapterInfo?.() || {};
    console.info('WebGPU Adapter:', {
      vendor: adapterInfo.vendor || 'unknown',
      architecture: adapterInfo.architecture || 'unknown',
      device: adapterInfo.device || 'unknown',
      description: adapterInfo.description || 'unknown'
    });
    
    // Get adapter limits
    const adapterLimits = this.adapter.limits;
    
    // Request device with conservative limits for better compatibility
    this.device = await this.adapter.requestDevice({
      requiredFeatures: [],
      requiredLimits: {
        maxBindGroups: Math.min(4, adapterLimits.maxBindGroups),
        maxStorageBufferBindingSize: Math.min(128 * 1024 * 1024, adapterLimits.maxStorageBufferBindingSize),
        maxBufferSize: Math.min(256 * 1024 * 1024, adapterLimits.maxBufferSize),
        maxComputeWorkgroupStorageSize: Math.min(16 * 1024, adapterLimits.maxComputeWorkgroupStorageSize), // More conservative
        maxComputeInvocationsPerWorkgroup: Math.min(256, adapterLimits.maxComputeInvocationsPerWorkgroup),
        maxComputeWorkgroupsPerDimension: Math.min(65535, adapterLimits.maxComputeWorkgroupsPerDimension)
      }
    });
    
    // Handle device lost
    this.device.lost.then((info) => {
      console.error('WebGPU device lost:', info);
    });
    
    this.format = navigator.gpu.getPreferredCanvasFormat();
    
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied'
    });
    
    // Initialize default resources
    this.initDefaultResources();
    
    // Set initial size
    this.resize();
    
    console.info('WebGPU renderer initialized');
    console.info('Device limits:');
    console.info('  Max buffer size:', this.device.limits.maxBufferSize);
    console.info('  Max storage buffer size:', this.device.limits.maxStorageBufferBindingSize);
    console.info('  Max workgroup size:', this.device.limits.maxComputeInvocationsPerWorkgroup);
    console.info('  Max compute workgroups:', this.device.limits.maxComputeWorkgroupsPerDimension);
  }
  
  private initDefaultResources(): void {
    if (!this.device) return;
    
    // Create uniform buffer for frame data
    const frameDataBuffer = this.device.createBuffer({
      label: 'Frame Data Buffer',
      size: 32, // time(f32) + deltaTime(f32) + resolution(vec2<f32>) + padding
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.buffers.set('frameData', frameDataBuffer);
    
    // Create camera uniform buffer
    // Create separate buffers for each matrix to avoid alignment issues
    const viewBuffer = this.device.createBuffer({
      label: 'View Matrix Buffer',
      size: 64, // mat4x4<f32>
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.buffers.set('viewMatrix', viewBuffer);
    
    const projectionBuffer = this.device.createBuffer({
      label: 'Projection Matrix Buffer',
      size: 64, // mat4x4<f32>
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.buffers.set('projectionMatrix', projectionBuffer);
    
    const viewProjectionBuffer = this.device.createBuffer({
      label: 'ViewProjection Matrix Buffer',
      size: 64, // mat4x4<f32>
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.buffers.set('viewProjectionMatrix', viewProjectionBuffer);
    
    // Create default bind group layouts
    this.createDefaultBindGroupLayouts();
    
    // Create depth texture
    this.createDepthTexture();
  }
  
  private createDefaultBindGroupLayouts(): void {
    if (!this.device) return;
    
    // Frame data bind group layout
    const frameLayout = this.device.createBindGroupLayout({
      label: 'Frame Bind Group Layout',
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
        buffer: { type: 'uniform' }
      }]
    });
    this.bindGroupLayouts.set('frame', frameLayout);
    
    // Camera bind group layout
    const cameraLayout = this.device.createBindGroupLayout({
      label: 'Camera Bind Group Layout',
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
        buffer: { type: 'uniform' }
      }]
    });
    this.bindGroupLayouts.set('camera', cameraLayout);
  }
  
  private createDepthTexture(): void {
    if (!this.device) return;
    
    // Remove old depth texture if it exists
    const oldDepth = this.textures.get('depth');
    if (oldDepth) {
      oldDepth.destroy();
    }
    
    const depthTexture = this.device.createTexture({
      label: 'Depth Texture',
      size: [this.canvas.width, this.canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
    
    this.textures.set('depth', depthTexture);
  }
  
  resize(): void {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const width = Math.floor(this.canvas.clientWidth * devicePixelRatio);
    const height = Math.floor(this.canvas.clientHeight * devicePixelRatio);
    
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      
      // Update frame info
      this.frameInfo.resolution[0] = width;
      this.frameInfo.resolution[1] = height;
      
      // Recreate depth texture
      this.createDepthTexture();
      
      // Update projection matrix
      this.updateProjectionMatrix();
    }
  }
  
  private updateProjectionMatrix(): void {
    const aspect = this.canvas.width / this.canvas.height;
    mat4.perspective(
      this.matrices.projection,
      (this.camera.fov * Math.PI) / 180,
      aspect,
      this.camera.near,
      this.camera.far
    );
    this.updateViewProjectionMatrix();
  }
  
  private updateViewMatrix(): void {
    mat4.lookAt(
      this.matrices.view,
      this.camera.position,
      this.camera.target,
      this.camera.up
    );
    this.updateViewProjectionMatrix();
  }
  
  private updateViewProjectionMatrix(): void {
    mat4.multiply(
      this.matrices.viewProjection,
      this.matrices.projection,
      this.matrices.view
    );
  }
  
  zoom(delta: number): void {
    this.camera.zoom *= 1 + delta * 0.001;
    this.camera.zoom = Math.max(0.1, Math.min(10, this.camera.zoom));
    
    // Update camera position based on zoom
    const direction = vec3.create();
    vec3.subtract(direction, this.camera.position, this.camera.target);
    
    const distance = vec3.length(direction) / this.camera.zoom;
    vec3.normalize(direction, direction);
    vec3.scale(direction, direction, distance);
    vec3.add(this.camera.position, this.camera.target, direction);
    
    this.updateViewMatrix();
  }
  
  createShaderModule(code: string, label?: string): GPUShaderModule | null {
    if (!this.device) return null;
    
    return this.device.createShaderModule({
      label,
      code
    });
  }
  
  createRenderPipeline(name: string, descriptor: GPURenderPipelineDescriptor): GPURenderPipeline | null {
    if (!this.device) return null;
    
    const pipeline = this.device.createRenderPipeline(descriptor);
    this.renderPipelines.set(name, pipeline);
    return pipeline;
  }
  
  createComputePipeline(name: string, descriptor: GPUComputePipelineDescriptor): GPUComputePipeline | null {
    if (!this.device) return null;
    
    const pipeline = this.device.createComputePipeline(descriptor);
    this.computePipelines.set(name, pipeline);
    return pipeline;
  }
  
  createBuffer(name: string, descriptor: GPUBufferDescriptor): GPUBuffer | null {
    if (!this.device) return null;
    
    const buffer = this.device.createBuffer(descriptor);
    this.buffers.set(name, buffer);
    return buffer;
  }
  
  createBindGroupLayout(name: string, descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout | null {
    if (!this.device) return null;
    
    const layout = this.device.createBindGroupLayout(descriptor);
    this.bindGroupLayouts.set(name, layout);
    return layout;
  }
  
  createBindGroup(name: string, descriptor: GPUBindGroupDescriptor): GPUBindGroup | null {
    if (!this.device) return null;
    
    const bindGroup = this.device.createBindGroup(descriptor);
    this.bindGroups.set(name, bindGroup);
    return bindGroup;
  }
  
  registerComputePass(callback: (encoder: GPUCommandEncoder) => void): void {
    this.computePassCallbacks.push(callback);
  }
  
  registerRenderPass(callback: (pass: GPURenderPassEncoder) => void): void {
    this.renderPassCallbacks.push(callback);
  }
  
  render(): void {
    if (!this.device || !this.context) return;
    
    // Calculate accurate delta time
    const currentTime = performance.now();
    if (this.lastFrameTime === 0) {
      this.lastFrameTime = currentTime;
    }
    
    this.frameInfo.deltaTime = Math.min(currentTime - this.lastFrameTime, 33.33); // Cap at 30 FPS minimum
    this.frameInfo.time = currentTime;
    this.lastFrameTime = currentTime;
    
    // Update FPS counter
    this.frameCount++;
    if (currentTime - this.lastFpsUpdate >= this.fpsUpdateInterval) {
      this.currentFps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = currentTime;
    }
    
    this.device.queue.writeBuffer(
      this.buffers.get('frameData')!,
      0,
      new Float32Array([
        this.frameInfo.time,
        this.frameInfo.deltaTime,
        this.frameInfo.resolution[0],
        this.frameInfo.resolution[1]
      ])
    );
    
    // Update camera matrices in separate buffers
    this.device.queue.writeBuffer(
      this.buffers.get('viewMatrix')!,
      0,
      this.matrices.view
    );
    this.device.queue.writeBuffer(
      this.buffers.get('projectionMatrix')!,
      0,
      this.matrices.projection
    );
    this.device.queue.writeBuffer(
      this.buffers.get('viewProjectionMatrix')!,
      0,
      this.matrices.viewProjection
    );
    
    // Get current texture to render to
    const currentTexture = this.context.getCurrentTexture();
    
    // Create command encoder
    const commandEncoder = this.device.createCommandEncoder({
      label: 'Frame Command Encoder'
    });
    
    // Execute compute passes
    this.computePassCallbacks.forEach(callback => callback(commandEncoder));
    
    // Execute render passes
    const renderPassDescriptor: GPURenderPassDescriptor = {
      label: 'Main Render Pass',
      colorAttachments: [{
        view: currentTexture.createView(),
        clearValue: { r: 0.04, g: 0.04, b: 0.04, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store'
      }],
      depthStencilAttachment: {
        view: this.textures.get('depth')!.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store'
      }
    };
    
    const renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
    this.renderPassCallbacks.forEach(callback => callback(renderPass));
    renderPass.end();
    
    // Submit commands
    this.device.queue.submit([commandEncoder.finish()]);
  }
  
  // Getters
  getDevice(): GPUDevice | null {
    return this.device;
  }
  
  getFormat(): GPUTextureFormat {
    return this.format;
  }
  
  getBuffer(name: string): GPUBuffer | undefined {
    return this.buffers.get(name);
  }
  
  getBindGroupLayout(name: string): GPUBindGroupLayout | undefined {
    return this.bindGroupLayouts.get(name);
  }
  
  getBindGroup(name: string): GPUBindGroup | undefined {
    return this.bindGroups.get(name);
  }
  
  getRenderPipeline(name: string): GPURenderPipeline | undefined {
    return this.renderPipelines.get(name);
  }
  
  getComputePipeline(name: string): GPUComputePipeline | undefined {
    return this.computePipelines.get(name);
  }
  
  getCameraMatrices(): Matrices {
    return this.matrices;
  }
  
  getFrameInfo(): FrameInfo {
    return this.frameInfo;
  }
  
  getCurrentFps(): number {
    return this.currentFps;
  }
  
  // Cleanup method
  dispose(): void {
    // Clear callbacks
    this.computePassCallbacks = [];
    this.renderPassCallbacks = [];
    
    // Destroy all buffers
    this.buffers.forEach(buffer => buffer.destroy());
    this.buffers.clear();
    
    // Destroy all textures
    this.textures.forEach(texture => texture.destroy());
    this.textures.clear();
    
    // Clear bind groups and layouts
    this.bindGroups.clear();
    this.bindGroupLayouts.clear();
    
    // Clear pipelines
    this.renderPipelines.clear();
    this.computePipelines.clear();
    
    // Unconfigure context
    if (this.context) {
      this.context.unconfigure();
    }
  }
}
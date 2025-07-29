/**
 * WebGL Fallback Renderer
 * Provides basic visualization when WebGPU is not available
 */

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

export class WebGLFallbackRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private camera: Camera;
  private matrices = {
    view: mat4.create(),
    projection: mat4.create(),
    viewProjection: mat4.create()
  };
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.camera = {
      position: new Float32Array([0, 0, 100]),
      target: new Float32Array([0, 0, 0]),
      up: new Float32Array([0, 1, 0]),
      fov: 60,
      near: 0.1,
      far: 10000,
      zoom: 1
    };
  }
  
  async init(): Promise<void> {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance'
    });
    
    if (!gl) {
      throw new Error('WebGL2 is not supported in this browser');
    }
    
    this.gl = gl;
    
    // Basic WebGL setup
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    this.resize();
    console.info('WebGL fallback renderer initialized');
  }
  
  resize(): void {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const width = Math.floor(this.canvas.clientWidth * devicePixelRatio);
    const height = Math.floor(this.canvas.clientHeight * devicePixelRatio);
    
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      
      if (this.gl) {
        this.gl.viewport(0, 0, width, height);
      }
      
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
    
    const direction = vec3.create();
    vec3.subtract(direction, this.camera.position, this.camera.target);
    
    const distance = vec3.length(direction) / this.camera.zoom;
    vec3.normalize(direction, direction);
    vec3.scale(direction, direction, distance);
    vec3.add(this.camera.position, this.camera.target, direction);
    
    this.updateViewMatrix();
  }
  
  render(): void {
    if (!this.gl) return;
    
    const gl = this.gl;
    
    // Clear
    gl.clearColor(0.04, 0.04, 0.04, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    // TODO: Implement basic WebGL rendering
    // For now, just show a message
    this.drawMessage('WebGL Fallback Mode - Limited Features');
  }
  
  private drawMessage(text: string): void {
    if (!this.gl) return;
    
    // This is a placeholder - in a real implementation,
    // you would render text using a texture atlas or canvas 2D
    console.info('WebGL fallback rendering:', text);
  }
  
  // Stub methods to match WebGPU renderer interface
  createShaderModule(): null { return null; }
  createRenderPipeline(): null { return null; }
  createComputePipeline(): null { return null; }
  createBuffer(): null { return null; }
  createBindGroupLayout(): null { return null; }
  createBindGroup(): null { return null; }
  registerComputePass(): void {}
  registerRenderPass(): void {}
  getDevice(): null { return null; }
  getFormat(): GPUTextureFormat { return 'bgra8unorm'; }
  getBuffer(): undefined { return undefined; }
  getBindGroupLayout(): undefined { return undefined; }
  getBindGroup(): undefined { return undefined; }
  getRenderPipeline(): undefined { return undefined; }
  getComputePipeline(): undefined { return undefined; }
  getCameraMatrices() { return this.matrices; }
  getFrameInfo() { 
    return { 
      time: performance.now(), 
      deltaTime: 16.67, 
      resolution: new Float32Array([this.canvas.width, this.canvas.height]) 
    }; 
  }
}
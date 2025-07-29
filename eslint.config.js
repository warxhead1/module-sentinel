import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/dashboard/**/*'],
    languageOptions: {
      parser: parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json'
      },
      globals: {
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        Buffer: 'readonly',
        // Timer functions
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        // TypeScript Node types
        NodeJS: 'readonly',
        NodeRequire: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': typescript
    },
    rules: {
      ...typescript.configs.recommended.rules,
      // Allow underscore prefix for intentionally unused variables (CLAUDE.md pattern)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { 
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      // Allow require() for .node modules (NAPI bindings)
      '@typescript-eslint/no-var-requires': 'off',
      // Allow any type for NAPI bindings
      '@typescript-eslint/no-explicit-any': 'warn',
      // Prefer const assertions for type safety
      'prefer-const': 'error',
      // Disallow console.log in favor of structured logging
      'no-console': ['error', { allow: ['warn', 'error'] }]
    }
  },
  {
    files: ['scripts/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module'
    }
  },
  {
    // Dashboard-specific configuration
    files: ['src/dashboard/**/*.ts', 'src/dashboard/**/*.tsx'],
    languageOptions: {
      parser: parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json'
      },
      globals: {
        // Browser globals
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        HTMLElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLButtonElement: 'readonly',
        MouseEvent: 'readonly',
        WheelEvent: 'readonly',
        KeyboardEvent: 'readonly',
        Event: 'readonly',
        DOMRect: 'readonly',
        WebGLRenderingContext: 'readonly',
        WebGL2RenderingContext: 'readonly',
        // WebGPU types
        GPUAdapter: 'readonly',
        GPUBindGroup: 'readonly',
        GPUBindGroupDescriptor: 'readonly',
        GPUBindGroupEntry: 'readonly',
        GPUBindGroupLayout: 'readonly',
        GPUBindGroupLayoutDescriptor: 'readonly',
        GPUBindGroupLayoutEntry: 'readonly',
        GPUBlendComponent: 'readonly',
        GPUBlendFactor: 'readonly',
        GPUBlendOperation: 'readonly',
        GPUBlendState: 'readonly',
        GPUBuffer: 'readonly',
        GPUBufferBinding: 'readonly',
        GPUBufferBindingLayout: 'readonly',
        GPUBufferBindingType: 'readonly',
        GPUBufferDescriptor: 'readonly',
        GPUBufferUsage: 'readonly',
        GPUCanvasContext: 'readonly',
        GPUColorDict: 'readonly',
        GPUColorTargetState: 'readonly',
        GPUColorWrite: 'readonly',
        GPUCommandBuffer: 'readonly',
        GPUCommandBufferDescriptor: 'readonly',
        GPUCommandEncoder: 'readonly',
        GPUCommandEncoderDescriptor: 'readonly',
        GPUCompareFunction: 'readonly',
        GPUCompilationInfo: 'readonly',
        GPUCompilationMessage: 'readonly',
        GPUCompilationMessageType: 'readonly',
        GPUComputePassDescriptor: 'readonly',
        GPUComputePassEncoder: 'readonly',
        GPUComputePipeline: 'readonly',
        GPUComputePipelineDescriptor: 'readonly',
        GPUCullMode: 'readonly',
        GPUDepthStencilState: 'readonly',
        GPUDevice: 'readonly',
        GPUDeviceDescriptor: 'readonly',
        GPUDeviceLostInfo: 'readonly',
        GPUDeviceLostReason: 'readonly',
        GPUError: 'readonly',
        GPUErrorFilter: 'readonly',
        GPUExtent3D: 'readonly',
        GPUExtent3DDict: 'readonly',
        GPUFeatureName: 'readonly',
        GPUFilterMode: 'readonly',
        GPUFrontFace: 'readonly',
        GPUImageCopyBuffer: 'readonly',
        GPUImageCopyExternalImage: 'readonly',
        GPUImageCopyTexture: 'readonly',
        GPUImageCopyTextureTagged: 'readonly',
        GPUImageDataLayout: 'readonly',
        GPUIndex32: 'readonly',
        GPUIndexFormat: 'readonly',
        GPUIntegerCoordinate: 'readonly',
        GPUIntegerCoordinateOut: 'readonly',
        GPULoadOp: 'readonly',
        GPUMapMode: 'readonly',
        GPUMipmapFilterMode: 'readonly',
        GPUMultisampleState: 'readonly',
        GPUObjectBase: 'readonly',
        GPUObjectDescriptorBase: 'readonly',
        GPUOrigin2D: 'readonly',
        GPUOrigin2DDict: 'readonly',
        GPUOrigin3D: 'readonly',
        GPUOrigin3DDict: 'readonly',
        GPUOutOfMemoryError: 'readonly',
        GPUPipelineDescriptorBase: 'readonly',
        GPUPipelineLayout: 'readonly',
        GPUPipelineLayoutDescriptor: 'readonly',
        GPUPipelineStatisticName: 'readonly',
        GPUPowerPreference: 'readonly',
        GPUPredefinedColorSpace: 'readonly',
        GPUPrimitiveState: 'readonly',
        GPUPrimitiveTopology: 'readonly',
        GPUProgrammableStage: 'readonly',
        GPUQuerySet: 'readonly',
        GPUQuerySetDescriptor: 'readonly',
        GPUQueryType: 'readonly',
        GPUQueue: 'readonly',
        GPURenderBundle: 'readonly',
        GPURenderBundleDescriptor: 'readonly',
        GPURenderBundleEncoder: 'readonly',
        GPURenderBundleEncoderDescriptor: 'readonly',
        GPURenderPassColorAttachment: 'readonly',
        GPURenderPassDepthStencilAttachment: 'readonly',
        GPURenderPassDescriptor: 'readonly',
        GPURenderPassEncoder: 'readonly',
        GPURenderPassLayout: 'readonly',
        GPURenderPipeline: 'readonly',
        GPURenderPipelineDescriptor: 'readonly',
        GPURequestAdapterOptions: 'readonly',
        GPUSampler: 'readonly',
        GPUSamplerBindingLayout: 'readonly',
        GPUSamplerBindingType: 'readonly',
        GPUSamplerDescriptor: 'readonly',
        GPUShaderModule: 'readonly',
        GPUShaderModuleCompilationHint: 'readonly',
        GPUShaderModuleDescriptor: 'readonly',
        GPUShaderStage: 'readonly',
        GPUSignedOffset32: 'readonly',
        GPUSize32: 'readonly',
        GPUSize32Out: 'readonly',
        GPUSize64: 'readonly',
        GPUSize64Out: 'readonly',
        GPUStencilFaceState: 'readonly',
        GPUStencilOperation: 'readonly',
        GPUStencilValue: 'readonly',
        GPUStorageTextureAccess: 'readonly',
        GPUStorageTextureBindingLayout: 'readonly',
        GPUStoreOp: 'readonly',
        GPUSupportedFeatures: 'readonly',
        GPUSupportedLimits: 'readonly',
        GPUTexture: 'readonly',
        GPUTextureAspect: 'readonly',
        GPUTextureBindingLayout: 'readonly',
        GPUTextureDescriptor: 'readonly',
        GPUTextureDimension: 'readonly',
        GPUTextureFormat: 'readonly',
        GPUTextureSampleType: 'readonly',
        GPUTextureUsage: 'readonly',
        GPUTextureView: 'readonly',
        GPUTextureViewDescriptor: 'readonly',
        GPUTextureViewDimension: 'readonly',
        GPUUncapturedErrorEvent: 'readonly',
        GPUUncapturedErrorEventInit: 'readonly',
        GPUValidationError: 'readonly',
        GPUVertexAttribute: 'readonly',
        GPUVertexBufferLayout: 'readonly',
        GPUVertexFormat: 'readonly',
        GPUVertexState: 'readonly',
        GPUVertexStepMode: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        CustomEvent: 'readonly',
        EventSource: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': typescript
    },
    rules: {
      ...typescript.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { 
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'prefer-const': 'error',
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }]
    }
  },
  {
    ignores: [
      'dist/**/*',
      'node_modules/**/*',
      'module-sentinel-rust/**/*',
      '*.node',
      'coverage/**/*',
      '**/*.test.ts',
      '**/__tests__/**'
    ]
  }
];
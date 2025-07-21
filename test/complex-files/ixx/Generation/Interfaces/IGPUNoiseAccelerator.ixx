module;

#include <memory>
#include <vector>
#include <optional>
#include <string>
#include <glm/glm.hpp>
#include <utility>

export module IGPUNoiseAccelerator;

import NoiseTypes;

export namespace PlanetGen::Generation {

/**
 * Abstract interface for GPU-accelerated noise generation
 * 
 * This interface provides abstraction over GPU noise generation backends,
 * allowing the generation layer to use GPU acceleration without direct
 * dependency on specific rendering systems like Vulkan.
 * 
 * This follows the same pattern as IPhysicsGPUAccelerator and solves
 * the circular dependency issue where generation modules were directly
 * importing Vulkan rendering modules.
 */
class IGPUNoiseAccelerator {
public:
    virtual ~IGPUNoiseAccelerator() = default;
    
    // Initialization and cleanup
    virtual bool Initialize(Rendering::Noise::NoiseType noiseType) = 0;
    virtual void Cleanup() = 0;
    virtual bool IsInitialized() const = 0;
    
    // Basic noise generation
    virtual bool GenerateNoise2D(
        const Rendering::Noise::GPUNoiseParameters& params,
        float* outData,
        uint32_t width,
        uint32_t height) = 0;
    
    virtual bool GenerateNoise3D(
        const Rendering::Noise::GPUNoiseParameters& params,
        float* outData,
        uint32_t width,
        uint32_t height,
        uint32_t depth) = 0;
    
    // Async noise generation handle
    struct AsyncNoiseHandle {
        void* internalHandle = nullptr;  // Opaque handle to avoid exposing Vulkan types
        uint32_t width = 0;
        uint32_t height = 0;
        uint32_t depth = 0;
        bool is3D = false;
    };
    
    // Async operations
    virtual std::optional<AsyncNoiseHandle> BeginNoiseGeneration2D(
        const Rendering::Noise::GPUNoiseParameters& params,
        uint32_t width,
        uint32_t height) = 0;
    
    virtual std::optional<AsyncNoiseHandle> BeginNoiseGeneration3D(
        const Rendering::Noise::GPUNoiseParameters& params,
        uint32_t width,
        uint32_t height,
        uint32_t depth) = 0;
    
    virtual bool EndNoiseGeneration(
        const AsyncNoiseHandle& handle,
        float* outData) = 0;
    
    // Planetary-specific generation
    virtual bool GeneratePlanetaryElevation(
        const std::vector<std::pair<float, float>>& coordinates,
        const std::vector<Rendering::Noise::SimpleNoiseLayer>& layers,
        float worldScale,
        float seaLevel,
        float elevationScale,
        std::vector<float>& outElevation) = 0;
    
    // Performance and diagnostics
    virtual std::string GetAcceleratorName() const = 0;
    virtual bool SupportsAsyncCompute() const = 0;
    virtual size_t GetAvailableMemory() const = 0;
    
    // Capability queries
    virtual bool SupportsNoiseType(Rendering::Noise::NoiseType type) const = 0;
    virtual std::vector<Rendering::Noise::NoiseType> GetSupportedNoiseTypes() const = 0;
};

/**
 * Factory interface for creating GPU noise accelerators
 * This allows different backends (Vulkan, CUDA, etc.) to be registered
 */
class IGPUNoiseAcceleratorFactory {
public:
    virtual ~IGPUNoiseAcceleratorFactory() = default;
    
    virtual std::unique_ptr<IGPUNoiseAccelerator> CreateAccelerator(void* resourceManager = nullptr) = 0;
    virtual std::string GetBackendName() const = 0;
    virtual bool IsBackendAvailable() const = 0;
};

} // namespace PlanetGen::Generation
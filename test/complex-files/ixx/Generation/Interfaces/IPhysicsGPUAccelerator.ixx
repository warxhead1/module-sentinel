module;

#include <memory>
#include <vector>
#include <string>

export module IPhysicsGPUAccelerator;

import GenerationTypes;

export namespace PlanetGen::Generation::Physics {

/**
 * @brief Noise packet structure for physics processing
 * Contains terrain data needed for physics simulation
 */
struct NoisePacket {
    float baseHeight = 0.0f;
    uint32_t terrainMask = 0;
    uint32_t detailLevel = 0;
    uint32_t featureFlags = 0;
};

/**
 * Abstract interface for GPU-accelerated physics computations
 * 
 * This interface provides abstraction over GPU acceleration backends,
 * allowing physics processors to use GPU acceleration without direct
 * dependency on specific rendering systems like Vulkan.
 * 
 * This solves the cross-module dependency issue where physics modules
 * were directly importing Vulkan rendering modules.
 */
class IPhysicsGPUAccelerator {
public:
    virtual ~IPhysicsGPUAccelerator() = default;
    
    // Initialization and cleanup
    virtual bool Initialize() = 0;
    virtual void Cleanup() = 0;
    virtual bool IsInitialized() const = 0;
    
    // GPU-accelerated physics computations
    virtual bool ComputeGravitationalSettling(
        const std::vector<float>& elevation,
        std::vector<float>& result,
        uint32_t resolution) = 0;
    
    virtual bool ComputeAtmosphericErosion(
        const std::vector<float>& elevation,
        std::vector<float>& result,
        uint32_t resolution) = 0;
    
    virtual bool ComputeTectonicActivity(
        const std::vector<float>& elevation,
        std::vector<float>& result,
        uint32_t resolution) = 0;
    
    virtual bool ComputeHydraulicErosion(
        const std::vector<float>& elevation,
        std::vector<float>& result,
        uint32_t resolution,
        float rainAmount = 1.0f,
        float evaporationRate = 0.02f) = 0;
    
    virtual bool ComputeThermalErosion(
        const std::vector<float>& elevation,
        std::vector<float>& result,
        uint32_t resolution,
        float thermalRate = 0.1f,
        float maxSlope = 45.0f) = 0;
    
    // Advanced GPU operations
    virtual bool ComputeStressAnalysis(
        const std::vector<float>& elevation,
        std::vector<float>& stressField,
        uint32_t resolution) = 0;
    
    virtual bool ComputeFluidDynamics(
        const std::vector<float>& elevation,
        const std::vector<float>& waterDepth,
        std::vector<float>& velocityField,
        std::vector<float>& newWaterDepth,
        uint32_t resolution,
        float timeStep = 0.016f) = 0;
    
    // Noise generation and processing
    virtual bool BuildNoisePackets(
        const std::vector<float>& elevationData,
        const std::vector<std::pair<float, float>>& coordinates,
        std::vector<NoisePacket>& result) = 0;
    
    // Performance and diagnostics
    virtual std::vector<std::string> GetDiagnostics() const = 0;
    virtual std::string GetAcceleratorName() const = 0;
    virtual std::string GetAcceleratorVersion() const = 0;
    
    // Resource management
    virtual bool SupportsAsyncCompute() const = 0;
    virtual size_t GetAvailableMemory() const = 0;
    virtual size_t GetUsedMemory() const = 0;
    
    // Capability queries
    virtual bool SupportsGravitationalCompute() const = 0;
    virtual bool SupportsErosionCompute() const = 0;
    virtual bool SupportsTectonicCompute() const = 0;
    virtual bool SupportsFluidDynamics() const = 0;
};

/**
 * Factory interface for creating GPU accelerators
 * This allows different backends (Vulkan, CUDA, etc.) to be registered
 */
class IPhysicsGPUAcceleratorFactory {
public:
    virtual ~IPhysicsGPUAcceleratorFactory() = default;
    
    virtual std::unique_ptr<IPhysicsGPUAccelerator> CreateAccelerator() = 0;
    virtual std::string GetBackendName() const = 0;
    virtual bool IsBackendAvailable() const = 0;
};

} // namespace PlanetGen::Generation::Physics
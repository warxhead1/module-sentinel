module;

#include <vulkan/vulkan.h>
#include <unordered_map>
#include <memory>
#include <string>
#include <vector>
#include <functional>
#include <mutex>
#include <atomic>
#include <array>

export module VulkanPipelineManager;

import PipelineTypes;
import VulkanPipelineCreator;
import VulkanTypes;
import VulkanBase;
import BufferCore;

export namespace PlanetGen::Rendering::Pipeline {

/**
 * @brief Intelligent pipeline cache and lifecycle manager
 * 
 * This class provides high-level pipeline management with:
 * - Automatic caching based on shader content and configuration
 * - Reference counting for safe cleanup
 * - Application-specific convenience methods
 * - Thread-safe operations
 * - Automatic cache optimization and cleanup
 */
class VulkanPipelineManager {
public:
    explicit VulkanPipelineManager(Rendering::VulkanBase* vulkanBase);
    ~VulkanPipelineManager();

    // Non-copyable, moveable
    VulkanPipelineManager(const VulkanPipelineManager&) = delete;
    VulkanPipelineManager& operator=(const VulkanPipelineManager&) = delete;
    VulkanPipelineManager(VulkanPipelineManager&&) noexcept;
    VulkanPipelineManager& operator=(VulkanPipelineManager&&) noexcept;

    // =============================================================================
    // CORE PIPELINE MANAGEMENT
    // =============================================================================

    /**
     * @brief Get or create a pipeline with automatic caching
     * @param params Pipeline creation parameters
     * @return Pipeline result (cached or newly created)
     */
    PipelineResult GetOrCreatePipeline(const PipelineCreationParams& params);

    /**
     * @brief Create pipeline with explicit key for caching
     * @param key Unique pipeline key
     * @param params Creation parameters
     * @param replaceExisting Whether to replace existing pipeline
     * @return Pipeline result
     */
    PipelineResult CreatePipeline(
        const PipelineKey& key,
        const PipelineCreationParams& params,
        bool replaceExisting = false);

    /**
     * @brief Get existing pipeline by key
     * @param key Pipeline key to lookup
     * @return Pipeline result if found, null handles if not found
     */
    PipelineResult GetPipeline(const PipelineKey& key);

    /**
     * @brief Remove pipeline from cache and destroy resources
     * @param key Pipeline key to remove
     * @return True if pipeline was found and removed
     */
    bool RemovePipeline(const PipelineKey& key);

    // =============================================================================
    // APPLICATION-SPECIFIC CONVENIENCE METHODS
    // =============================================================================

    /**
     * @brief Get terrain pipeline for specific LOD level
     * @param lod Level of detail
     * @param vertexShader Vertex shader path
     * @param fragmentShader Fragment shader path
     * @param renderPass Target render pass
     * @param extent Viewport extent
     * @param enableTessellation Whether to enable tessellation
     * @return Terrain pipeline optimized for specified LOD
     */
    PipelineResult GetTerrainPipeline(
        Rendering::LODLevel lod,
        const std::string& vertexShader,
        const std::string& fragmentShader,
        VkRenderPass renderPass,
        const VkExtent2D& extent,
        bool enableTessellation = false);

    /**
     * @brief Get water rendering pipeline with quality settings
     * @param quality Water rendering quality level
     * @param vertexShader Vertex shader path
     * @param fragmentShader Fragment shader path
     * @param renderPass Target render pass
     * @param extent Viewport extent
     * @return Water pipeline optimized for specified quality
     */
    PipelineResult GetWaterPipeline(
        const std::string& vertexShader,
        const std::string& fragmentShader,
        VkRenderPass renderPass,
        const VkExtent2D& extent,
        bool enableTransparency = true);

    /**
     * @brief Get atmosphere rendering pipeline
     * @param vertexShader Vertex shader path
     * @param fragmentShader Fragment shader path
     * @param renderPass Target render pass
     * @param extent Viewport extent
     * @return Atmosphere pipeline with appropriate blending
     */
    PipelineResult GetAtmospherePipeline(
        const std::string& vertexShader,
        const std::string& fragmentShader,
        VkRenderPass renderPass,
        const VkExtent2D& extent);

    /**
     * @brief Get compute pipeline for specific operation type
     * @param operationType Type of compute operation (e.g., "noise", "erosion", "water")
     * @param computeShader Compute shader path
     * @param workGroupSize Work group dimensions (optional)
     * @return Optimized compute pipeline
     */
    PipelineResult GetComputePipeline(
        const std::string& operationType,
        const std::string& computeShader,
        const std::array<uint32_t, 3>& workGroupSize = {16, 16, 1});

    /**
     * @brief Get noise generation compute pipeline
     * @param computeShader Compute shader path
     * @return Noise generation pipeline with optimized settings
     */
    PipelineResult GetNoisePipeline(const std::string& computeShader);

    /**
     * @brief Get standard mesh rendering pipeline
     * @param vertexShader Vertex shader path
     * @param fragmentShader Fragment shader path
     * @param renderPass Target render pass
     * @param extent Viewport extent
     * @param enableBlending Whether to enable blending
     * @return Standard mesh pipeline
     */
    PipelineResult GetStandardPipeline(
        const std::string& vertexShader,
        const std::string& fragmentShader,
        VkRenderPass renderPass,
        const VkExtent2D& extent,
        bool enableBlending = false);

    // =============================================================================
    // HIGH-LEVEL EXECUTION METHODS
    // =============================================================================

    /**
     * @brief Execute compute shader with automatic resource management
     * @param shaderPath Path to compute shader
     * @param width Dispatch width
     * @param height Dispatch height
     * @param bufferBindings Map of binding names to buffer resources
     * @param pushConstants Push constants data (optional)
     * @return True if execution succeeded
     */
    bool ExecuteCompute(
        const std::string& shaderPath,
        uint32_t width,
        uint32_t height,
        const std::map<std::string, BufferResourcePtr>& bufferBindings,
        const void* pushConstants = nullptr,
        size_t pushConstantsSize = 0);

    /**
     * @brief Execute compute shader with multiple iterations and barriers
     * @param shaderPath Path to compute shader
     * @param width Dispatch width
     * @param height Dispatch height
     * @param iterations Number of iterations to execute
     * @param bufferBindings Map of binding names to buffer resources
     * @param updatePushConstants Callback to update push constants per iteration
     * @param pushConstantsSize Size of push constants structure
     * @return True if execution succeeded
     */
    bool ExecuteComputeWithIterations(
        const std::string& shaderPath,
        uint32_t width,
        uint32_t height,
        uint32_t iterations,
        const std::map<std::string, BufferResourcePtr>& bufferBindings,
        std::function<void(uint32_t iteration, void* pushConstants)> updatePushConstants = nullptr,
        size_t pushConstantsSize = 0);

    // =============================================================================
    // CACHE MANAGEMENT
    // =============================================================================

    /**
     * @brief Cache statistics and information
     */
    struct CacheStatistics {
        size_t totalPipelines = 0;
        size_t activePipelines = 0;
        size_t cacheHits = 0;
        size_t cacheMisses = 0;
        size_t memoryUsageBytes = 0;
        double hitRatio = 0.0;
        
        // Most frequently used pipelines
        std::vector<std::pair<std::string, uint32_t>> topPipelines;
    };

    /**
     * @brief Get cache statistics
     * @return Current cache statistics
     */
    CacheStatistics GetCacheStatistics() const;

    /**
     * @brief Clear cache and destroy all pipelines
     * @param waitForIdle Whether to wait for device idle before cleanup
     */
    void ClearCache(bool waitForIdle = true);

    /**
     * @brief Optimize cache by removing unused pipelines
     * @param maxUnusedAge Maximum age in frames for unused pipelines
     * @return Number of pipelines removed
     */
    size_t OptimizeCache(uint32_t maxUnusedAge = 60);

    /**
     * @brief Precompile common pipelines for faster runtime access
     * @param commonShaderPaths List of commonly used shader combinations
     * @param renderPass Default render pass for graphics pipelines
     * @param extent Default extent for graphics pipelines
     */
    void PrecompileCommonPipelines(
        const std::vector<std::vector<std::string>>& commonShaderPaths,
        VkRenderPass renderPass,
        const VkExtent2D& extent);

    // =============================================================================
    // PIPELINE LIFECYCLE AND REFERENCE COUNTING
    // =============================================================================

    /**
     * @brief Increment reference count for a pipeline
     * @param key Pipeline key
     * @return Current reference count, 0 if pipeline not found
     */
    uint32_t AddReference(const PipelineKey& key);

    /**
     * @brief Decrement reference count for a pipeline
     * @param key Pipeline key
     * @return Current reference count after decrement
     */
    uint32_t RemoveReference(const PipelineKey& key);

    /**
     * @brief Get current reference count for a pipeline
     * @param key Pipeline key
     * @return Current reference count, 0 if pipeline not found
     */
    uint32_t GetReferenceCount(const PipelineKey& key) const;

    // =============================================================================
    // ADVANCED FEATURES
    // =============================================================================

    /**
     * @brief Register a callback for pipeline creation events
     * @param callback Function to call when pipelines are created/destroyed
     */
    using PipelineEventCallback = std::function<void(const PipelineKey&, bool /* created */)>;
    void RegisterEventCallback(PipelineEventCallback callback);

    /**
     * @brief Enable/disable automatic cache optimization
     * @param enable Whether to enable automatic optimization
     * @param frameInterval Interval in frames between optimizations
     */
    void SetAutomaticOptimization(bool enable, uint32_t frameInterval = 300);

    /**
     * @brief Update frame counter for cache age tracking
     * Call this once per frame for proper cache management
     */
    void UpdateFrameCounter();

    /**
     * @brief Validate all cached pipelines for consistency
     * @return Validation results with any issues found
     */
    std::vector<std::string> ValidateCache() const;

private:
    Rendering::VulkanBase* m_vulkanBase;
    std::unique_ptr<VulkanPipelineCreator> m_creator;
    
    // =============================================================================
    // CACHE DATA STRUCTURES
    // =============================================================================

    struct CachedPipeline {
        PipelineResult result;
        uint32_t referenceCount = 0;
        uint64_t lastUsedFrame = 0;
        uint64_t creationFrame = 0;
        uint32_t accessCount = 0;
        std::string debugName;
        
        // Hash for quick validation
        size_t configHash = 0;
    };

    // Thread-safe cache using custom hash for PipelineKey
    struct PipelineKeyHash {
        size_t operator()(const PipelineKey& key) const {
            return HashPipelineKey(key);
        }
    };

    mutable std::mutex m_cacheMutex;
    std::unordered_map<PipelineKey, CachedPipeline, PipelineKeyHash> m_pipelineCache;
    
    // Statistics tracking
    mutable std::atomic<uint64_t> m_cacheHits{0};
    mutable std::atomic<uint64_t> m_cacheMisses{0};
    mutable std::atomic<uint64_t> m_currentFrame{0};
    
    // Event handling
    std::vector<PipelineEventCallback> m_eventCallbacks;
    
    // Automatic optimization
    bool m_autoOptimizationEnabled = true;
    uint32_t m_optimizationFrameInterval = 300;
    uint64_t m_lastOptimizationFrame = 0;

    // =============================================================================
    // INTERNAL METHODS
    // =============================================================================

    /**
     * @brief Generate pipeline key from creation parameters
     * @param params Creation parameters
     * @return Generated pipeline key
     */
    PipelineKey GeneratePipelineKey(const PipelineCreationParams& params);

    /**
     * @brief Create optimized configuration for specific application types
     * @param baseConfig Base configuration
     * @param applicationType Type of application (terrain, water, etc.)
     * @return Optimized configuration
     */
    template<typename ConfigType>
    ConfigType OptimizeConfigForApplication(
        const ConfigType& baseConfig,
        const std::string& applicationType);

    /**
     * @brief Check if automatic optimization should run
     * @return True if optimization should run
     */
    bool ShouldRunAutomaticOptimization() const;

    /**
     * @brief Internal cache optimization implementation
     * @param maxUnusedAge Maximum age for unused pipelines
     * @return Number of pipelines removed
     */
    size_t OptimizeCacheInternal(uint32_t maxUnusedAge);

    /**
     * @brief Fire pipeline event callbacks
     * @param key Pipeline key
     * @param created Whether pipeline was created (true) or destroyed (false)
     */
    void FirePipelineEvent(const PipelineKey& key, bool created);

    /**
     * @brief Cleanup pipeline resources safely
     * @param cachedPipeline Pipeline to cleanup
     */
    void CleanupPipeline(const CachedPipeline& cachedPipeline);

    /**
     * @brief Calculate memory usage of cached pipeline
     * @param cachedPipeline Pipeline to calculate size for
     * @return Estimated memory usage in bytes
     */
    size_t CalculatePipelineMemoryUsage(const CachedPipeline& cachedPipeline) const;
};

} // namespace PlanetGen::Rendering::Pipeline
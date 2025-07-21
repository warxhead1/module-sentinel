module;

#include <vulkan/vulkan.h>
#include <memory>
#include <vector>
#include <string>
#include <functional>
#include <unordered_map>
#include <any>
#include <optional>
#include <future>

export module AdvancedHeightGenerator;

import VulkanTypes;
import VulkanBase;
import VulkanNoiseGenerator;
import VulkanPipelineManager;
import NoiseTypes;
import GenerationTypes;
import BufferCore;
import GLMModule;
// Remove buffer management dependency - use pure DI

export namespace PlanetGen::Generation {

// Pure dependency injection approach - no concrete dependencies

/**
 * @brief Basic noise parameters for height generation
 */
struct BasicNoiseParams {
    PlanetGen::Rendering::Noise::NoiseType type = PlanetGen::Rendering::Noise::NoiseType::Simplex;
    float frequency = 0.01f;
    float amplitude = 1.0f;
    int octaves = 4;
    float persistence = 0.5f;
    float lacunarity = 2.0f;
    vec2 offset = vec2(0.0f);
    int seed = 1337;
    bool useRidgedNoise = false;
    float ridgeOffset = 1.0f;
    
    // Validation
    bool IsValid() const {
        return frequency > 0.0f && 
               amplitude >= 0.0f && 
               octaves >= 1 && octaves <= 16 &&
               persistence >= 0.0f && persistence <= 1.0f &&
               lacunarity >= 1.0f && lacunarity <= 4.0f;
    }
};

/**
 * @brief Enhanced noise layer with blending and transformation
 */
struct AdvancedNoiseLayer {
    BasicNoiseParams noiseParams;
    
    // Layer blending
    float weight = 1.0f;
    bool additive = true;  // true = add, false = multiply
    float blendFactor = 1.0f;
    
    // Transformation parameters
    float heightOffset = 0.0f;
    float heightScale = 1.0f;
    float heightClamp = 0.0f; // 0 = no clamping
    
    // Mask parameters
    bool useMask = false;
    float maskThreshold = 0.5f;
    float maskSoftness = 0.1f;
    
    // Domain warping
    bool enableDomainWarp = false;
    float warpStrength = 0.5f;
    float warpFrequency = 0.02f;
    
    // Validation
    bool IsValid() const {
        return noiseParams.IsValid() && 
               weight >= 0.0f && 
               blendFactor >= 0.0f && 
               blendFactor <= 1.0f;
    }
};

/**
 * @brief Planetary feature parameters
 */
struct PlanetaryFeatureParams {
    // Continental features
    float continentalAmplitude = 5000.0f;
    float continentalFrequency = 0.001f;
    float continentalRoughness = 0.5f;
    
    // Mountain ranges
    float mountainAmplitude = 3000.0f;
    float mountainFrequency = 0.005f;
    float mountainRidgeSharpness = 0.8f;
    
    // Ocean basins
    float oceanDepth = -4000.0f;
    float oceanFrequency = 0.0008f;
    float oceanSmoothness = 0.3f;
    
    // Volcanic features
    uint32_t volcanicHotspots = 10;
    float volcanicIntensity = 2000.0f;
    float volcanicRadius = 100.0f;
    
    // River systems
    uint32_t riverCount = 50;
    float riverDepth = 100.0f;
    float riverWidth = 50.0f;
    
    // Validation
    bool IsValid() const {
        return continentalAmplitude >= 0.0f && 
               mountainAmplitude >= 0.0f && 
               oceanDepth <= 0.0f &&
               volcanicHotspots <= 100 &&
               riverCount <= 1000;
    }
};

/**
 * @brief Geological process parameters
 */
struct GeologicalProcessParams {
    // Tectonic activity
    bool enableTectonics = true;
    uint32_t tectonicPlateCount = 7;
    float tectonicIntensity = 0.5f;
    float plateAge = 100.0f; // Million years
    
    // Erosion parameters
    bool enableErosion = true;
    uint32_t erosionIterations = 100;
    float erosionRate = 0.1f;
    float sedimentCapacity = 0.5f;
    float evaporationRate = 0.01f;
    
    // Glaciation
    bool enableGlaciation = false;
    float glaciationIntensity = 0.0f;
    float iceAge = 0.0f; // 0.0 = no ice age, 1.0 = full ice age
    
    // Volcanism
    bool enableVolcanism = true;
    float volcanismActivity = 0.5f;
    float lavaFlowDistance = 1000.0f;
    
    // Validation
    bool IsValid() const {
        return tectonicPlateCount >= 1 && tectonicPlateCount <= 20 &&
               tectonicIntensity >= 0.0f && tectonicIntensity <= 1.0f &&
               erosionIterations <= 1000 &&
               erosionRate >= 0.0f && erosionRate <= 1.0f &&
               glaciationIntensity >= 0.0f && glaciationIntensity <= 1.0f &&
               volcanismActivity >= 0.0f && volcanismActivity <= 1.0f;
    }
};

/**
 * @brief Climate integration parameters
 */
struct ClimateParams {
    // Temperature effects
    bool enableTemperatureEffects = false;
    float temperatureInfluence = 0.1f;
    float temperatureGradient = -6.5f; // degrees per 1000m
    
    // Precipitation effects
    bool enablePrecipitationEffects = false;
    float precipitationInfluence = 0.05f;
    float orographicLiftEffect = 0.2f;
    
    // Seasonal variation
    bool enableSeasonalEffects = false;
    float seasonalVariation = 0.1f;
    float dayOfYear = 180.0f; // 0-365
    
    // Latitude effects
    bool enableLatitudeEffects = true;
    float latitudeStrength = 0.3f;
    float equatorTemperature = 30.0f; // Celsius
    float poleTemperature = -20.0f; // Celsius
    
    // Validation
    bool IsValid() const {
        return temperatureInfluence >= 0.0f && temperatureInfluence <= 1.0f &&
               precipitationInfluence >= 0.0f && precipitationInfluence <= 1.0f &&
               seasonalVariation >= 0.0f && seasonalVariation <= 1.0f &&
               dayOfYear >= 0.0f && dayOfYear <= 365.0f &&
               latitudeStrength >= 0.0f && latitudeStrength <= 1.0f;
    }
};

/**
 * @brief Performance and quality parameters
 */
struct PerformanceParams {
    // Generation settings
    uint32_t resolution = 1024;
    uint32_t tileSize = 256;
    bool enableAsyncGeneration = true;
    bool enableProgressReporting = true;
    
    // Quality settings
    float qualityLevel = 1.0f; // 0.1 = low, 1.0 = high
    bool enableDetailedFeatures = true;
    bool enablePostProcessing = true;
    
    // Memory management
    bool enableMemoryOptimization = true;
    size_t maxMemoryUsage = 1024 * 1024 * 1024; // 1GB
    
    // GPU settings
    bool preferGPUCompute = true;
    uint32_t workGroupSize = 64;
    
    // Validation
    bool IsValid() const {
        return resolution >= 64 && resolution <= 16384 &&
               tileSize >= 32 && tileSize <= 1024 &&
               qualityLevel >= 0.1f && qualityLevel <= 1.0f &&
               workGroupSize >= 32 && workGroupSize <= 1024;
    }
};

/**
 * @brief Comprehensive height generation parameters
 */
struct HeightGenerationParameters {
    // Core parameters
    BasicNoiseParams baseNoise;
    std::vector<AdvancedNoiseLayer> noiseLayers;
    
    // Feature parameters
    PlanetaryFeatureParams planetary;
    GeologicalProcessParams geological;
    ClimateParams climate;
    PerformanceParams performance;
    
    // Global settings
    float planetRadius = 6371000.0f; // meters
    float maxElevation = 40000.0f; // meters
    float planetScale = 1.0f; // Scale factor for planet features
    float seaLevel = 0.0f; // Sea level height
    float elevationScale = 1000.0f; // Elevation scale factor
    uint32_t resolution = 512; // Generation resolution
    float heightExaggeration = 1.0f;
    
    // Spherical correction
    bool enableSphericalCorrection = true;
    float sphericalCorrectionStrength = 1.0f;
    
    // Output settings
    bool normalizeOutput = true;
    float outputMin = -10000.0f;
    float outputMax = 10000.0f;
    
    // Validation
    bool IsValid() const {
        if (!baseNoise.IsValid() || !planetary.IsValid() || 
            !geological.IsValid() || !climate.IsValid() || 
            !performance.IsValid()) {
            return false;
        }
        
        for (const auto& layer : noiseLayers) {
            if (!layer.IsValid()) {
                return false;
            }
        }
        
        return planetRadius > 0.0f && 
               maxElevation > 0.0f && 
               elevationScale > 0.0f && 
               heightExaggeration > 0.0f &&
               outputMin < outputMax;
    }
};

/**
 * @brief Result of height generation
 */
struct HeightGenerationResult {
    std::vector<float> heightData;
    uint32_t width = 0;
    uint32_t height = 0;
    
    // Statistics
    float minHeight = 0.0f;
    float maxHeight = 0.0f;
    float averageHeight = 0.0f;
    float standardDeviation = 0.0f;
    
    // Generation info
    bool success = false;
    std::string errorMessage;
    float generationTimeMs = 0.0f;
    size_t memoryUsed = 0;
    
    // Validation
    bool IsValid() const {
        return success && 
               !heightData.empty() && 
               width > 0 && height > 0 &&
               heightData.size() == width * height;
    }
};

/**
 * @brief Progress callback for async generation
 */
using ProgressCallback = std::function<void(float progress, const std::string& stage)>;

/**
 * @brief Advanced Height Generator - GPU-accelerated, fully parametric
 * 
 * This class replaces UnifiedHeightGenerator with a clean, high-performance
 * implementation that supports:
 * - GPU-first generation via VulkanNoiseGenerator
 * - Comprehensive parameter system with live tweaking
 * - Multi-layer noise with advanced blending
 * - Planetary features and geological processes
 * - Async generation with progress reporting
 * - Built-in presets for common planet types
 */
class AdvancedHeightGenerator {
public:
    /**
     * @brief Constructor with dependency injection
     * @param vulkanBase Vulkan base system
     * @param noiseGenerator GPU noise generator
     * @param pipelineManager Vulkan pipeline manager
     * @param bufferManager Buffer management system
     */
    AdvancedHeightGenerator(
        PlanetGen::Rendering::VulkanNoiseGenerator* noiseGenerator,
        PlanetGen::Rendering::Pipeline::VulkanPipelineManager* pipelineManager
    );
    
    ~AdvancedHeightGenerator();
    
    // Disable copy, enable move
    AdvancedHeightGenerator(const AdvancedHeightGenerator&) = delete;
    AdvancedHeightGenerator& operator=(const AdvancedHeightGenerator&) = delete;
    AdvancedHeightGenerator(AdvancedHeightGenerator&&) = default;
    AdvancedHeightGenerator& operator=(AdvancedHeightGenerator&&) = default;
    
    /**
     * @brief Initialize the height generator
     * @return true if successful
     */
    bool Initialize();
    
    /**
     * @brief Cleanup resources
     */
    void Cleanup();
    
    /**
     * @brief Check if generator is initialized
     */
    bool IsInitialized() const { return m_initialized; }
    
    // =============================================================================
    // HEIGHT GENERATION METHODS
    // =============================================================================
    
    /**
     * @brief Generate height data synchronously
     * @param params Generation parameters
     * @return Height generation result
     */
    HeightGenerationResult GenerateHeight(const HeightGenerationParameters& params);
    
    /**
     * @brief Generate height data asynchronously
     * @param params Generation parameters
     * @param progressCallback Optional progress callback
     * @return Future containing height generation result
     */
    std::future<HeightGenerationResult> GenerateHeightAsync(
        const HeightGenerationParameters& params,
        ProgressCallback progressCallback = nullptr
    );
    
    /**
     * @brief Generate height data for spherical coordinates
     * @param params Generation parameters
     * @param coordinates Spherical coordinates (lat, lon pairs)
     * @return Height generation result
     */
    HeightGenerationResult GenerateHeightSpherical(
        const HeightGenerationParameters& params,
        const std::vector<std::pair<float, float>>& coordinates
    );
    
    // =============================================================================
    // PARAMETER MANAGEMENT
    // =============================================================================
    
    /**
     * @brief Update a single parameter value
     * @param paramName Parameter name
     * @param value New parameter value
     * @return true if update successful
     */
    bool UpdateParameter(const std::string& paramName, const std::any& value);
    
    /**
     * @brief Update multiple parameters
     * @param parameters Map of parameter names to values
     * @return true if all updates successful
     */
    bool UpdateParameters(const std::unordered_map<std::string, std::any>& parameters);
    
    /**
     * @brief Get current parameter values
     * @return Map of parameter names to values
     */
    std::unordered_map<std::string, std::any> GetCurrentParameters() const;
    
    /**
     * @brief Validate parameter set
     * @param params Parameters to validate
     * @return true if valid
     */
    bool ValidateParameters(const HeightGenerationParameters& params) const;
    
    // =============================================================================
    // PARAMETER PROVIDER INTEGRATION
    // =============================================================================
    
    /**
     * @brief Get current parameters as JSON string
     * @return JSON representation of current parameters
     */
    std::string GetParametersAsJSON() const;
    
    /**
     * @brief Set parameters from JSON string
     * @param jsonString JSON parameter string
     * @return true if successful
     */
    bool SetParametersFromJSON(const std::string& jsonString);
    
    // =============================================================================
    // PRESET MANAGEMENT
    // =============================================================================
    
    /**
     * @brief Load built-in preset
     * @param presetName Preset name (e.g., "earth", "mars", "ocean_world")
     * @return true if preset found and loaded
     */
    bool LoadPreset(const std::string& presetName);
    
    /**
     * @brief Save current parameters as preset
     * @param presetName Preset name
     * @param params Parameters to save
     * @return true if saved successfully
     */
    bool SavePreset(const std::string& presetName, const HeightGenerationParameters& params);
    
    /**
     * @brief Get list of available presets
     * @return Vector of preset names
     */
    std::vector<std::string> GetAvailablePresets() const;
    
    /**
     * @brief Get preset parameters
     * @param presetName Preset name
     * @return Parameters if preset exists
     */
    std::optional<HeightGenerationParameters> GetPresetParameters(const std::string& presetName) const;
    
    // =============================================================================
    // UTILITY METHODS
    // =============================================================================
    
    /**
     * @brief Get generation statistics
     * @return Statistics about recent generations
     */
    struct GenerationStats {
        uint32_t totalGenerations = 0;
        float averageGenerationTime = 0.0f;
        size_t averageMemoryUsage = 0;
        float cacheHitRatio = 0.0f;
    };
    GenerationStats GetGenerationStats() const;
    
    /**
     * @brief Clear generation cache
     */
    void ClearCache();
    
    /**
     * @brief Get memory usage
     * @return Current memory usage in bytes
     */
    size_t GetMemoryUsage() const;
    
private:
    // Dependencies (pure DI - no concrete types)
    PlanetGen::Rendering::VulkanNoiseGenerator* m_noiseGenerator;
    PlanetGen::Rendering::Pipeline::VulkanPipelineManager* m_pipelineManager;
    
    // State
    bool m_initialized = false;
    HeightGenerationParameters m_currentParams;
    
    // Built-in presets
    std::unordered_map<std::string, HeightGenerationParameters> m_presets;
    
    // Statistics
    mutable GenerationStats m_stats;
    
    // Internal methods
    bool InitializePresets();
    HeightGenerationResult GenerateHeightInternal(const HeightGenerationParameters& params);
    bool GenerateBaseNoise(const HeightGenerationParameters& params, std::vector<float>& heightData);
    bool ApplyNoiseLayers(const HeightGenerationParameters& params, std::vector<float>& heightData);
    bool ApplyPlanetaryFeatures(const HeightGenerationParameters& params, std::vector<float>& heightData);
    bool ApplyGeologicalProcesses(const HeightGenerationParameters& params, std::vector<float>& heightData);
    bool ApplyClimateEffects(const HeightGenerationParameters& params, std::vector<float>& heightData);
    bool ApplySphericalCorrection(const HeightGenerationParameters& params, std::vector<float>& heightData);
    bool PostProcessHeight(const HeightGenerationParameters& params, std::vector<float>& heightData);
    
    // Parameter conversion methods
    std::string HeightParamsToJSON(const HeightGenerationParameters& params) const;
    HeightGenerationParameters JSONToHeightParams(const std::string& jsonString) const;
    
    // Validation helpers
    bool ValidateBasicNoiseParams(const BasicNoiseParams& params) const;
    bool ValidateNoiseLayer(const AdvancedNoiseLayer& layer) const;
    
    // Statistics helpers
    void UpdateGenerationStats(const HeightGenerationResult& result);
    
    // Preset creation helpers
    HeightGenerationParameters CreateEarthPreset() const;
    HeightGenerationParameters CreateMarsPreset() const;
    HeightGenerationParameters CreateOceanWorldPreset() const;
    HeightGenerationParameters CreateDesertWorldPreset() const;
    HeightGenerationParameters CreateIceWorldPreset() const;
    HeightGenerationParameters CreateVolcanicWorldPreset() const;
};

} // namespace PlanetGen::Generation
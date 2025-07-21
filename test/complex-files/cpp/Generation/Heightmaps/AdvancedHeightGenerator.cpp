module;

#include <vulkan/vulkan.h>
#include <algorithm>
#include <cmath>
#include <numeric>
#include <execution>
#include <chrono>
#include <future>
#include <any>
#include <Core/Logging/LoggerMacros.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

module AdvancedHeightGenerator;

import Core.Logging.Logger;

namespace PlanetGen::Generation {

// Simplified parameter management using JSON

// =============================================================================
// CONSTRUCTOR/DESTRUCTOR
// =============================================================================

AdvancedHeightGenerator::AdvancedHeightGenerator(
    PlanetGen::Rendering::VulkanNoiseGenerator* noiseGenerator,
    PlanetGen::Rendering::Pipeline::VulkanPipelineManager* pipelineManager)
    : m_noiseGenerator(noiseGenerator)
    , m_pipelineManager(pipelineManager)
    , m_initialized(false) {
    
    if (!m_noiseGenerator || !m_pipelineManager) {
        throw std::runtime_error("AdvancedHeightGenerator: Invalid dependencies provided");
    }
}

AdvancedHeightGenerator::~AdvancedHeightGenerator() {
    Cleanup();
}

// =============================================================================
// INITIALIZATION
// =============================================================================

bool AdvancedHeightGenerator::Initialize() {
    if (m_initialized) {
        return true;
    }
    
    LOG_INFO("AdvancedHeightGenerator", "Initializing height generator...");
    
    // VulkanNoiseGenerator will be initialized lazily on first use
    // This allows the user to select noise type through GUI first
    LOG_INFO("AdvancedHeightGenerator", "VulkanNoiseGenerator will be initialized on first use");
    
    // Initialize built-in presets
    if (!InitializePresets()) {
        LOG_ERROR("AdvancedHeightGenerator", "Failed to initialize presets");
        return false;
    }
    
    // Set default parameters
    m_currentParams = CreateEarthPreset();
    
    m_initialized = true;
    LOG_INFO("AdvancedHeightGenerator", "Height generator initialized successfully");
    return true;
}

void AdvancedHeightGenerator::Cleanup() {
    if (!m_initialized) {
        return;
    }
    
    LOG_INFO("AdvancedHeightGenerator", "Cleaning up height generator...");
    
    // Clear cache and reset state
    ClearCache();
    m_presets.clear();
    m_stats = {};
    
    m_initialized = false;
    LOG_INFO("AdvancedHeightGenerator", "Height generator cleanup complete");
}

// =============================================================================
// HEIGHT GENERATION METHODS
// =============================================================================

HeightGenerationResult AdvancedHeightGenerator::GenerateHeight(const HeightGenerationParameters& params) {
    if (!m_initialized) {
        LOG_ERROR("AdvancedHeightGenerator", "Generator not initialized");
        return {.success = false, .errorMessage = "Generator not initialized"};
    }
    
    if (!ValidateParameters(params)) {
        LOG_ERROR("AdvancedHeightGenerator", "Invalid parameters provided");
        return {.success = false, .errorMessage = "Invalid parameters"};
    }
    
    LOG_INFO("AdvancedHeightGenerator", "Starting height generation ({}x{})", 
             params.performance.resolution, params.performance.resolution);
    
    auto startTime = std::chrono::high_resolution_clock::now();
    
    // Generate height data
    auto result = GenerateHeightInternal(params);
    
    auto endTime = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime);
    result.generationTimeMs = static_cast<float>(duration.count());
    
    // Update statistics
    UpdateGenerationStats(result);
    
    if (result.success) {
        LOG_INFO("AdvancedHeightGenerator", "Height generation completed in {:.2f}ms", result.generationTimeMs);
    } else {
        LOG_ERROR("AdvancedHeightGenerator", "Height generation failed: {}", result.errorMessage);
    }
    
    return result;
}

std::future<HeightGenerationResult> AdvancedHeightGenerator::GenerateHeightAsync(
    const HeightGenerationParameters& params,
    ProgressCallback progressCallback) {
    
    return std::async(std::launch::async, [this, params, progressCallback]() -> HeightGenerationResult {
        if (progressCallback) {
            progressCallback(0.0f, "Starting generation");
        }
        
        auto result = GenerateHeight(params);
        
        if (progressCallback) {
            progressCallback(1.0f, "Generation complete");
        }
        
        return result;
    });
}

HeightGenerationResult AdvancedHeightGenerator::GenerateHeightSpherical(
    const HeightGenerationParameters& params,
    const std::vector<std::pair<float, float>>& coordinates) {
    
    if (!m_initialized) {
        return {.success = false, .errorMessage = "Generator not initialized"};
    }
    
    LOG_INFO("AdvancedHeightGenerator", "Starting spherical height generation for {} coordinates", coordinates.size());
    
    auto startTime = std::chrono::high_resolution_clock::now();
    
    // Use VulkanNoiseGenerator for planetary elevation
    std::vector<float> heightData;
    std::vector<PlanetGen::Rendering::Noise::SimpleNoiseLayer> layers;
    
    // Convert base noise to layer
    PlanetGen::Rendering::Noise::SimpleNoiseLayer baseLayer;
    baseLayer.type = params.baseNoise.type;
    baseLayer.frequency = params.baseNoise.frequency;
    baseLayer.amplitude = params.baseNoise.amplitude;
    baseLayer.octaves = params.baseNoise.octaves;
    baseLayer.persistence = params.baseNoise.persistence;
    baseLayer.lacunarity = params.baseNoise.lacunarity;
    baseLayer.offset = params.baseNoise.offset;
    baseLayer.seed = params.baseNoise.seed;
    layers.push_back(baseLayer);
    
    // Add noise layers
    for (const auto& layer : params.noiseLayers) {
        PlanetGen::Rendering::Noise::SimpleNoiseLayer noiseLayer;
        noiseLayer.type = layer.noiseParams.type;
        noiseLayer.frequency = layer.noiseParams.frequency;
        noiseLayer.amplitude = layer.noiseParams.amplitude * layer.weight;
        noiseLayer.octaves = layer.noiseParams.octaves;
        noiseLayer.persistence = layer.noiseParams.persistence;
        noiseLayer.lacunarity = layer.noiseParams.lacunarity;
        noiseLayer.offset = layer.noiseParams.offset;
        noiseLayer.seed = layer.noiseParams.seed;
        noiseLayer.additive = layer.additive;
        layers.push_back(noiseLayer);
    }
    
    // Generate planetary elevation
    bool success = m_noiseGenerator->GeneratePlanetaryElevation(
        coordinates,
        layers,
        params.planetRadius,
        params.seaLevel,
        params.elevationScale,
        heightData
    );
    
    auto endTime = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime);
    
    if (!success) {
        return {.success = false, .errorMessage = "Failed to generate planetary elevation"};
    }
    
    // Calculate statistics
    auto minMax = std::minmax_element(heightData.begin(), heightData.end());
    float minHeight = *minMax.first;
    float maxHeight = *minMax.second;
    float averageHeight = std::accumulate(heightData.begin(), heightData.end(), 0.0f) / heightData.size();
    
    // Calculate standard deviation
    float variance = 0.0f;
    for (float height : heightData) {
        float diff = height - averageHeight;
        variance += diff * diff;
    }
    variance /= heightData.size();
    float stdDev = std::sqrt(variance);
    
    HeightGenerationResult result;
    result.heightData = std::move(heightData);
    result.width = static_cast<uint32_t>(std::sqrt(coordinates.size()));
    result.height = result.width;
    result.minHeight = minHeight;
    result.maxHeight = maxHeight;
    result.averageHeight = averageHeight;
    result.standardDeviation = stdDev;
    result.success = true;
    result.generationTimeMs = static_cast<float>(duration.count());
    result.memoryUsed = result.heightData.size() * sizeof(float);
    
    UpdateGenerationStats(result);
    
    LOG_INFO("AdvancedHeightGenerator", "Spherical height generation completed in {:.2f}ms", result.generationTimeMs);
    
    return result;
}

// =============================================================================
// PARAMETER MANAGEMENT
// =============================================================================

bool AdvancedHeightGenerator::UpdateParameter(const std::string& paramName, const std::any& value) {
    // This is a simplified version - in a full implementation,
    // we would have a comprehensive parameter mapping system
    
    try {
        if (paramName == "baseNoise.frequency") {
            m_currentParams.baseNoise.frequency = std::any_cast<float>(value);
            return true;
        } else if (paramName == "baseNoise.amplitude") {
            m_currentParams.baseNoise.amplitude = std::any_cast<float>(value);
            return true;
        } else if (paramName == "baseNoise.octaves") {
            m_currentParams.baseNoise.octaves = std::any_cast<int>(value);
            return true;
        } else if (paramName == "baseNoise.persistence") {
            m_currentParams.baseNoise.persistence = std::any_cast<float>(value);
            return true;
        } else if (paramName == "baseNoise.lacunarity") {
            m_currentParams.baseNoise.lacunarity = std::any_cast<float>(value);
            return true;
        } else if (paramName == "baseNoise.seed") {
            m_currentParams.baseNoise.seed = std::any_cast<int>(value);
            return true;
        } else if (paramName == "planetary.mountainAmplitude") {
            m_currentParams.planetary.mountainAmplitude = std::any_cast<float>(value);
            return true;
        } else if (paramName == "planetary.oceanDepth") {
            m_currentParams.planetary.oceanDepth = std::any_cast<float>(value);
            return true;
        } else if (paramName == "performance.resolution") {
            m_currentParams.performance.resolution = std::any_cast<uint32_t>(value);
            return true;
        }
        
        LOG_WARNING("AdvancedHeightGenerator", "Unknown parameter: {}", paramName);
        return false;
    } catch (const std::bad_any_cast& e) {
        LOG_ERROR("AdvancedHeightGenerator", "Invalid parameter type for {}: {}", paramName, e.what());
        return false;
    }
}

bool AdvancedHeightGenerator::UpdateParameters(const std::unordered_map<std::string, std::any>& parameters) {
    bool allSuccess = true;
    
    for (const auto& [paramName, value] : parameters) {
        if (!UpdateParameter(paramName, value)) {
            allSuccess = false;
        }
    }
    
    return allSuccess;
}

std::unordered_map<std::string, std::any> AdvancedHeightGenerator::GetCurrentParameters() const {
    std::unordered_map<std::string, std::any> params;
    
    // Base noise parameters
    params["baseNoise.frequency"] = m_currentParams.baseNoise.frequency;
    params["baseNoise.amplitude"] = m_currentParams.baseNoise.amplitude;
    params["baseNoise.octaves"] = m_currentParams.baseNoise.octaves;
    params["baseNoise.persistence"] = m_currentParams.baseNoise.persistence;
    params["baseNoise.lacunarity"] = m_currentParams.baseNoise.lacunarity;
    params["baseNoise.seed"] = m_currentParams.baseNoise.seed;
    
    // Planetary parameters
    params["planetary.mountainAmplitude"] = m_currentParams.planetary.mountainAmplitude;
    params["planetary.oceanDepth"] = m_currentParams.planetary.oceanDepth;
    
    // Performance parameters
    params["performance.resolution"] = m_currentParams.performance.resolution;
    
    return params;
}

bool AdvancedHeightGenerator::ValidateParameters(const HeightGenerationParameters& params) const {
    return params.IsValid();
}

// =============================================================================
// PARAMETER PROVIDER INTEGRATION
// =============================================================================

std::string AdvancedHeightGenerator::GetParametersAsJSON() const {
    return HeightParamsToJSON(m_currentParams);
}

bool AdvancedHeightGenerator::SetParametersFromJSON(const std::string& jsonString) {
    try {
        HeightGenerationParameters newParams = JSONToHeightParams(jsonString);
        
        // Validate parameters
        if (!ValidateBasicNoiseParams(newParams.baseNoise)) {
            LOG_ERROR("AdvancedHeightGenerator", "Invalid basic noise parameters");
            return false;
        }
        
        // Validate noise layers
        for (const auto& layer : newParams.noiseLayers) {
            if (!ValidateNoiseLayer(layer)) {
                LOG_ERROR("AdvancedHeightGenerator", "Invalid noise layer parameters");
                return false;
            }
        }
        
        // Apply new parameters
        m_currentParams = newParams;
        
        LOG_INFO("AdvancedHeightGenerator", "Parameters updated successfully");
        return true;
    } catch (const std::exception& e) {
        LOG_ERROR("AdvancedHeightGenerator", "Failed to set parameters: {}", e.what());
        return false;
    }
}

// =============================================================================
// PRESET MANAGEMENT
// =============================================================================

bool AdvancedHeightGenerator::LoadPreset(const std::string& presetName) {
    auto it = m_presets.find(presetName);
    if (it == m_presets.end()) {
        LOG_WARNING("AdvancedHeightGenerator", "Preset not found: {}", presetName);
        return false;
    }
    
    m_currentParams = it->second;
    LOG_INFO("AdvancedHeightGenerator", "Loaded preset: {}", presetName);
    return true;
}

bool AdvancedHeightGenerator::SavePreset(const std::string& presetName, const HeightGenerationParameters& params) {
    if (!ValidateParameters(params)) {
        LOG_ERROR("AdvancedHeightGenerator", "Cannot save invalid parameters as preset");
        return false;
    }
    
    m_presets[presetName] = params;
    LOG_INFO("AdvancedHeightGenerator", "Saved preset: {}", presetName);
    return true;
}

std::vector<std::string> AdvancedHeightGenerator::GetAvailablePresets() const {
    std::vector<std::string> presets;
    presets.reserve(m_presets.size());
    
    for (const auto& [name, _] : m_presets) {
        presets.push_back(name);
    }
    
    return presets;
}

std::optional<HeightGenerationParameters> AdvancedHeightGenerator::GetPresetParameters(const std::string& presetName) const {
    auto it = m_presets.find(presetName);
    if (it == m_presets.end()) {
        return std::nullopt;
    }
    
    return it->second;
}

// =============================================================================
// UTILITY METHODS
// =============================================================================

AdvancedHeightGenerator::GenerationStats AdvancedHeightGenerator::GetGenerationStats() const {
    return m_stats;
}

void AdvancedHeightGenerator::ClearCache() {
    // Clear any cached data
    m_stats.cacheHitRatio = 0.0f;
    LOG_INFO("AdvancedHeightGenerator", "Cache cleared");
}

size_t AdvancedHeightGenerator::GetMemoryUsage() const {
    // Calculate approximate memory usage
    size_t usage = sizeof(*this);
    usage += m_presets.size() * sizeof(HeightGenerationParameters);
    return usage;
}

// =============================================================================
// INTERNAL METHODS
// =============================================================================

bool AdvancedHeightGenerator::InitializePresets() {
    try {
        m_presets["earth"] = CreateEarthPreset();
        m_presets["mars"] = CreateMarsPreset();
        m_presets["ocean_world"] = CreateOceanWorldPreset();
        m_presets["desert_world"] = CreateDesertWorldPreset();
        m_presets["ice_world"] = CreateIceWorldPreset();
        m_presets["volcanic_world"] = CreateVolcanicWorldPreset();
        
        LOG_INFO("AdvancedHeightGenerator", "Initialized {} presets", m_presets.size());
        return true;
    } catch (const std::exception& e) {
        LOG_ERROR("AdvancedHeightGenerator", "Failed to initialize presets: {}", e.what());
        return false;
    }
}

HeightGenerationResult AdvancedHeightGenerator::GenerateHeightInternal(const HeightGenerationParameters& params) {
    HeightGenerationResult result;
    result.width = params.performance.resolution;
    result.height = params.performance.resolution;
    result.heightData.resize(result.width * result.height);
    
    try {
        // Step 1: Generate base noise
        if (!GenerateBaseNoise(params, result.heightData)) {
            result.success = false;
            result.errorMessage = "Failed to generate base noise";
            return result;
        }
        
        // Step 2: Apply noise layers
        if (!ApplyNoiseLayers(params, result.heightData)) {
            result.success = false;
            result.errorMessage = "Failed to apply noise layers";
            return result;
        }
        
        // Step 3: Apply planetary features
        if (!ApplyPlanetaryFeatures(params, result.heightData)) {
            result.success = false;
            result.errorMessage = "Failed to apply planetary features";
            return result;
        }
        
        // Step 4: Apply geological processes
        if (!ApplyGeologicalProcesses(params, result.heightData)) {
            result.success = false;
            result.errorMessage = "Failed to apply geological processes";
            return result;
        }
        
        // Step 5: Apply climate effects
        if (!ApplyClimateEffects(params, result.heightData)) {
            result.success = false;
            result.errorMessage = "Failed to apply climate effects";
            return result;
        }
        
        // Step 6: Apply spherical correction
        if (params.enableSphericalCorrection) {
            if (!ApplySphericalCorrection(params, result.heightData)) {
                result.success = false;
                result.errorMessage = "Failed to apply spherical correction";
                return result;
            }
        }
        
        // Step 7: Post-process height data
        if (!PostProcessHeight(params, result.heightData)) {
            result.success = false;
            result.errorMessage = "Failed to post-process height data";
            return result;
        }
        
        // Calculate statistics
        auto minMax = std::minmax_element(result.heightData.begin(), result.heightData.end());
        result.minHeight = *minMax.first;
        result.maxHeight = *minMax.second;
        result.averageHeight = std::accumulate(result.heightData.begin(), result.heightData.end(), 0.0f) / result.heightData.size();
        
        // Calculate standard deviation
        float variance = 0.0f;
        for (float height : result.heightData) {
            float diff = height - result.averageHeight;
            variance += diff * diff;
        }
        variance /= result.heightData.size();
        result.standardDeviation = std::sqrt(variance);
        
        result.success = true;
        result.memoryUsed = result.heightData.size() * sizeof(float);
        
    } catch (const std::exception& e) {
        result.success = false;
        result.errorMessage = std::string("Generation failed: ") + e.what();
    }
    
    return result;
}

bool AdvancedHeightGenerator::GenerateBaseNoise(const HeightGenerationParameters& params, std::vector<float>& heightData) {
    // Use VulkanNoiseGenerator for GPU-accelerated noise generation
    PlanetGen::Rendering::Noise::GPUNoiseParameters noiseParams;
    noiseParams.type = params.baseNoise.type;
    noiseParams.seed = params.baseNoise.seed;
    noiseParams.frequency = params.baseNoise.frequency;
    noiseParams.octaves = params.baseNoise.octaves;
    noiseParams.persistence = params.baseNoise.persistence;
    noiseParams.lacunarity = params.baseNoise.lacunarity;
    noiseParams.offset = params.baseNoise.offset;
    noiseParams.amplitude = params.baseNoise.amplitude;
    noiseParams.useRidgedNoise = params.baseNoise.useRidgedNoise;
    noiseParams.ridgeOffset = params.baseNoise.ridgeOffset;
    noiseParams.width = params.performance.resolution;
    noiseParams.height = params.performance.resolution;
    
    return m_noiseGenerator->GenerateNoise2D(
        noiseParams,
        heightData.data(),
        params.performance.resolution,
        params.performance.resolution
    );
}

bool AdvancedHeightGenerator::ApplyNoiseLayers(const HeightGenerationParameters& params, std::vector<float>& heightData) {
    // Apply additional noise layers
    for (const auto& layer : params.noiseLayers) {
        std::vector<float> layerData(heightData.size());
        
        PlanetGen::Rendering::Noise::GPUNoiseParameters noiseParams;
        noiseParams.type = layer.noiseParams.type;
        noiseParams.seed = layer.noiseParams.seed;
        noiseParams.frequency = layer.noiseParams.frequency;
        noiseParams.octaves = layer.noiseParams.octaves;
        noiseParams.persistence = layer.noiseParams.persistence;
        noiseParams.lacunarity = layer.noiseParams.lacunarity;
        noiseParams.offset = layer.noiseParams.offset;
        noiseParams.amplitude = layer.noiseParams.amplitude;
        noiseParams.useRidgedNoise = layer.noiseParams.useRidgedNoise;
        noiseParams.ridgeOffset = layer.noiseParams.ridgeOffset;
        noiseParams.width = params.performance.resolution;
        noiseParams.height = params.performance.resolution;
        
        if (!m_noiseGenerator->GenerateNoise2D(
            noiseParams,
            layerData.data(),
            params.performance.resolution,
            params.performance.resolution)) {
            return false;
        }
        
        // Blend layer with existing height data
        for (size_t i = 0; i < heightData.size(); ++i) {
            float layerValue = layerData[i] * layer.weight;
            
            if (layer.additive) {
                heightData[i] += layerValue;
            } else {
                heightData[i] *= layerValue;
            }
        }
    }
    
    return true;
}

bool AdvancedHeightGenerator::ApplyPlanetaryFeatures(const HeightGenerationParameters& params, std::vector<float>& heightData) {
    // Apply planetary features like mountains, oceans, etc.
    // This is a simplified implementation - in practice, this would use
    // specialized compute shaders for each feature type
    
    const auto& planetary = params.planetary;
    
    // Apply mountain ranges
    if (planetary.mountainAmplitude > 0.0f) {
        for (size_t i = 0; i < heightData.size(); ++i) {
            // Simple mountain enhancement based on existing height
            if (heightData[i] > 0.0f) {
                heightData[i] += heightData[i] * planetary.mountainAmplitude / 10000.0f;
            }
        }
    }
    
    // Apply ocean basins
    if (planetary.oceanDepth < 0.0f) {
        for (size_t i = 0; i < heightData.size(); ++i) {
            // Simple ocean basin creation
            if (heightData[i] < 0.0f) {
                heightData[i] = std::min(heightData[i], planetary.oceanDepth);
            }
        }
    }
    
    return true;
}

bool AdvancedHeightGenerator::ApplyGeologicalProcesses(const HeightGenerationParameters& params, std::vector<float>& heightData) {
    // Apply geological processes like erosion, tectonics, etc.
    // This is a simplified implementation - in practice, this would use
    // the EarthProcessor compute shaders
    
    const auto& geological = params.geological;
    
    // Simple erosion simulation
    if (geological.enableErosion) {
        std::vector<float> tempData = heightData;
        
        for (uint32_t iter = 0; iter < geological.erosionIterations; ++iter) {
            for (uint32_t y = 1; y < params.performance.resolution - 1; ++y) {
                for (uint32_t x = 1; x < params.performance.resolution - 1; ++x) {
                    size_t idx = y * params.performance.resolution + x;
                    
                    // Simple erosion: average with neighbors
                    float sum = 0.0f;
                    sum += tempData[idx - 1];
                    sum += tempData[idx + 1];
                    sum += tempData[idx - params.performance.resolution];
                    sum += tempData[idx + params.performance.resolution];
                    sum += tempData[idx] * 4.0f;
                    
                    float average = sum / 8.0f;
                    heightData[idx] = std::lerp(tempData[idx], average, geological.erosionRate);
                }
            }
            tempData = heightData;
        }
    }
    
    return true;
}

bool AdvancedHeightGenerator::ApplyClimateEffects(const HeightGenerationParameters& params, std::vector<float>& heightData) {
    // Apply climate effects like temperature and precipitation influence
    const auto& climate = params.climate;
    
    if (climate.enableLatitudeEffects) {
        uint32_t resolution = params.performance.resolution;
        
        for (uint32_t y = 0; y < resolution; ++y) {
            for (uint32_t x = 0; x < resolution; ++x) {
                size_t idx = y * resolution + x;
                
                // Calculate latitude effect (-1 to 1, where -1 is south pole, 1 is north pole)
                float latitude = (static_cast<float>(y) / resolution - 0.5f) * 2.0f;
                
                // Apply latitude-based height modification
                float latitudeEffect = 1.0f - std::abs(latitude) * climate.latitudeStrength;
                heightData[idx] *= latitudeEffect;
            }
        }
    }
    
    return true;
}

bool AdvancedHeightGenerator::ApplySphericalCorrection(const HeightGenerationParameters& params, std::vector<float>& heightData) {
    // Apply spherical correction for planetary surfaces
    uint32_t resolution = params.performance.resolution;
    float radius = params.planetRadius;
    
    for (uint32_t y = 0; y < resolution; ++y) {
        for (uint32_t x = 0; x < resolution; ++x) {
            size_t idx = y * resolution + x;
            
            // Convert to spherical coordinates
            float u = static_cast<float>(x) / resolution;
            float v = static_cast<float>(y) / resolution;
            
            // Apply spherical correction
            float longitude = (u - 0.5f) * 2.0f * M_PI;
            float latitude = (v - 0.5f) * M_PI;
            
            // Calculate correction factor based on latitude
            float correctionFactor = std::cos(latitude);
            correctionFactor = std::lerp(1.0f, correctionFactor, params.sphericalCorrectionStrength);
            
            heightData[idx] *= correctionFactor;
        }
    }
    
    return true;
}

bool AdvancedHeightGenerator::PostProcessHeight(const HeightGenerationParameters& params, std::vector<float>& heightData) {
    // Apply final post-processing
    
    // Apply elevation scale
    if (params.elevationScale != 1.0f) {
        for (float& height : heightData) {
            height *= params.elevationScale;
        }
    }
    
    // Apply height exaggeration
    if (params.heightExaggeration != 1.0f) {
        for (float& height : heightData) {
            height *= params.heightExaggeration;
        }
    }
    
    // Normalize output if requested
    if (params.normalizeOutput) {
        auto minMax = std::minmax_element(heightData.begin(), heightData.end());
        float minVal = *minMax.first;
        float maxVal = *minMax.second;
        
        if (maxVal > minVal) {
            float range = maxVal - minVal;
            float targetRange = params.outputMax - params.outputMin;
            
            for (float& height : heightData) {
                height = (height - minVal) / range * targetRange + params.outputMin;
            }
        }
    }
    
    return true;
}

// =============================================================================
// PARAMETER CONVERSION METHODS
// =============================================================================

std::string AdvancedHeightGenerator::HeightParamsToJSON(const HeightGenerationParameters& params) const {
    // Create a simple JSON representation
    std::string json = "{\n";
    json += "  \"generatorName\": \"AdvancedHeightGenerator\",\n";
    json += "  \"generatorType\": \"height\",\n";
    json += "  \"baseNoise\": {\n";
    json += "    \"frequency\": " + std::to_string(params.baseNoise.frequency) + ",\n";
    json += "    \"amplitude\": " + std::to_string(params.baseNoise.amplitude) + ",\n";
    json += "    \"octaves\": " + std::to_string(params.baseNoise.octaves) + ",\n";
    json += "    \"persistence\": " + std::to_string(params.baseNoise.persistence) + ",\n";
    json += "    \"lacunarity\": " + std::to_string(params.baseNoise.lacunarity) + ",\n";
    json += "    \"seed\": " + std::to_string(params.baseNoise.seed) + "\n";
    json += "  },\n";
    json += "  \"planetScale\": " + std::to_string(params.planetScale) + ",\n";
    json += "  \"seaLevel\": " + std::to_string(params.seaLevel) + ",\n";
    json += "  \"elevationScale\": " + std::to_string(params.elevationScale) + ",\n";
    json += "  \"resolution\": " + std::to_string(params.resolution) + "\n";
    json += "}";
    
    return json;
}

HeightGenerationParameters AdvancedHeightGenerator::JSONToHeightParams(const std::string& jsonString) const {
    // For now, return default parameters
    // TODO: Implement proper JSON parsing when needed
    HeightGenerationParameters params;
    
    // Set default values
    params.baseNoise.frequency = 0.01f;
    params.baseNoise.amplitude = 1.0f;
    params.baseNoise.octaves = 4;
    params.baseNoise.persistence = 0.5f;
    params.baseNoise.lacunarity = 2.0f;
    params.baseNoise.seed = 1337;
    params.planetScale = 1.0f;
    params.seaLevel = 0.0f;
    params.elevationScale = 1000.0f;
    params.resolution = 512;
    
    return params;
}

void AdvancedHeightGenerator::UpdateGenerationStats(const HeightGenerationResult& result) {
    m_stats.totalGenerations++;
    m_stats.averageGenerationTime = (m_stats.averageGenerationTime * (m_stats.totalGenerations - 1) + result.generationTimeMs) / m_stats.totalGenerations;
    m_stats.averageMemoryUsage = (m_stats.averageMemoryUsage * (m_stats.totalGenerations - 1) + result.memoryUsed) / m_stats.totalGenerations;
}

// =============================================================================
// PRESET CREATION METHODS
// =============================================================================

HeightGenerationParameters AdvancedHeightGenerator::CreateEarthPreset() const {
    HeightGenerationParameters params;
    
    // Earth-like base noise
    params.baseNoise.type = PlanetGen::Rendering::Noise::NoiseType::Simplex;
    params.baseNoise.frequency = 0.01f;
    params.baseNoise.amplitude = 1.0f;
    params.baseNoise.octaves = 6;
    params.baseNoise.persistence = 0.5f;
    params.baseNoise.lacunarity = 2.0f;
    params.baseNoise.seed = 1337;
    
    // Earth-like planetary features
    params.planetary.continentalAmplitude = 5000.0f;
    params.planetary.mountainAmplitude = 3000.0f;
    params.planetary.oceanDepth = -4000.0f;
    params.planetary.volcanicHotspots = 10;
    params.planetary.riverCount = 50;
    
    // Earth-like geological processes
    params.geological.enableTectonics = true;
    params.geological.tectonicPlateCount = 7;
    params.geological.enableErosion = true;
    params.geological.erosionIterations = 50;
    params.geological.enableVolcanism = true;
    params.geological.volcanismActivity = 0.3f;
    
    // Earth-like climate
    params.climate.enableLatitudeEffects = true;
    params.climate.latitudeStrength = 0.3f;
    params.climate.enableTemperatureEffects = true;
    params.climate.temperatureInfluence = 0.1f;
    
    return params;
}

HeightGenerationParameters AdvancedHeightGenerator::CreateMarsPreset() const {
    HeightGenerationParameters params = CreateEarthPreset();
    
    // Mars-like modifications
    params.planetary.continentalAmplitude = 8000.0f;
    params.planetary.mountainAmplitude = 5000.0f;
    params.planetary.oceanDepth = -1000.0f;
    params.planetary.volcanicHotspots = 3;
    params.planetary.riverCount = 5;
    
    params.geological.enableTectonics = false;
    params.geological.enableErosion = false;
    params.geological.enableVolcanism = false;
    
    params.climate.enableTemperatureEffects = false;
    params.climate.enablePrecipitationEffects = false;
    
    return params;
}

HeightGenerationParameters AdvancedHeightGenerator::CreateOceanWorldPreset() const {
    HeightGenerationParameters params = CreateEarthPreset();
    
    // Ocean world modifications
    params.planetary.continentalAmplitude = 1000.0f;
    params.planetary.mountainAmplitude = 500.0f;
    params.planetary.oceanDepth = -8000.0f;
    params.planetary.riverCount = 100;
    
    params.geological.enableErosion = true;
    params.geological.erosionIterations = 100;
    
    return params;
}

HeightGenerationParameters AdvancedHeightGenerator::CreateDesertWorldPreset() const {
    HeightGenerationParameters params = CreateEarthPreset();
    
    // Desert world modifications
    params.planetary.continentalAmplitude = 3000.0f;
    params.planetary.mountainAmplitude = 4000.0f;
    params.planetary.oceanDepth = -500.0f;
    params.planetary.riverCount = 0;
    
    params.geological.enableErosion = false;
    params.geological.enableVolcanism = true;
    params.geological.volcanismActivity = 0.8f;
    
    params.climate.enablePrecipitationEffects = false;
    
    return params;
}

HeightGenerationParameters AdvancedHeightGenerator::CreateIceWorldPreset() const {
    HeightGenerationParameters params = CreateEarthPreset();
    
    // Ice world modifications
    params.planetary.continentalAmplitude = 2000.0f;
    params.planetary.mountainAmplitude = 6000.0f;
    params.planetary.oceanDepth = -2000.0f;
    params.planetary.riverCount = 0;
    
    params.geological.enableGlaciation = true;
    params.geological.glaciationIntensity = 0.8f;
    params.geological.enableVolcanism = false;
    
    return params;
}

HeightGenerationParameters AdvancedHeightGenerator::CreateVolcanicWorldPreset() const {
    HeightGenerationParameters params = CreateEarthPreset();
    
    // Volcanic world modifications
    params.planetary.continentalAmplitude = 4000.0f;
    params.planetary.mountainAmplitude = 8000.0f;
    params.planetary.oceanDepth = -3000.0f;
    params.planetary.volcanicHotspots = 50;
    
    params.geological.enableVolcanism = true;
    params.geological.volcanismActivity = 1.0f;
    params.geological.enableTectonics = true;
    params.geological.tectonicIntensity = 0.8f;
    
    return params;
}

} // namespace PlanetGen::Generation
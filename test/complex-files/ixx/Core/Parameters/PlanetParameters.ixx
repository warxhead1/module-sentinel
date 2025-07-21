module;

#include <cstdint>
#include <string>
#include <any>

#include <utility>
#include <vector>
export module Core.Parameters.PlanetParams;

import Core.Parameters.Registry;

export namespace PlanetGen::Core::Parameters::PlanetParams {

// Resolution Parameters
constexpr const char* EVALUATION_RESOLUTION = "planet.evaluation.resolution";
constexpr const char* RENDERING_RESOLUTION = "planet.rendering.resolution";
constexpr const char* TEXTURE_RESOLUTION = "planet.texture.resolution";
constexpr const char* MESH_RESOLUTION = "planet.mesh.resolution";
constexpr const char* HEIGHTMAP_RESOLUTION = "planet.heightmap.resolution";
constexpr const char* WATER_GRID_RESOLUTION = "planet.water.gridResolution";
constexpr const char* CAUSTICS_RESOLUTION = "planet.water.causticsResolution";

// Size Parameters
constexpr const char* PLANET_RADIUS = "planet.geometry.radius";
constexpr const char* HEIGHT_SCALE = "planet.geometry.heightScale";
constexpr const char* OCEAN_DEPTH = "planet.geometry.oceanDepth";
constexpr const char* ATMOSPHERE_HEIGHT = "planet.geometry.atmosphereHeight";

// Processing Parameters
constexpr const char* CHUNK_SIZE = "planet.processing.chunkSize";
constexpr const char* THREAD_COUNT = "planet.processing.threadCount";
constexpr const char* GPU_WORKGROUP_SIZE = "planet.processing.gpuWorkgroupSize";
constexpr const char* MEMORY_LIMIT = "planet.processing.memoryLimit";

// Quality Parameters
constexpr const char* LOD_LEVELS = "planet.quality.lodLevels";
constexpr const char* TERRAIN_QUALITY = "planet.quality.terrainQuality";
constexpr const char* WATER_QUALITY = "planet.quality.waterQuality";
constexpr const char* ATMOSPHERE_QUALITY = "planet.quality.atmosphereQuality";

// Physics Parameters
constexpr const char* GRAVITY = "planet.physics.gravity";
constexpr const char* TIME_SCALE = "planet.physics.timeScale";
constexpr const char* EROSION_STRENGTH = "planet.physics.erosionStrength";
constexpr const char* TECTONIC_ACTIVITY = "planet.physics.tectonicActivity";

// Water Parameters
constexpr const char* WAVE_HEIGHT = "planet.water.waveHeight";
constexpr const char* WAVE_LENGTH = "planet.water.waveLength";
constexpr const char* WAVE_SPEED = "planet.water.waveSpeed";
constexpr const char* WATER_CLARITY = "planet.water.clarity";
constexpr const char* FOAM_INTENSITY = "planet.water.foamIntensity";

// Noise Parameters
constexpr const char* NOISE_OCTAVES = "planet.noise.octaves";
constexpr const char* NOISE_FREQUENCY = "planet.noise.frequency";
constexpr const char* NOISE_AMPLITUDE = "planet.noise.amplitude";
constexpr const char* NOISE_PERSISTENCE = "planet.noise.persistence";
constexpr const char* NOISE_LACUNARITY = "planet.noise.lacunarity";

// Initialize all planet parameters with defaults and constraints
void RegisterDefaults(ParameterRegistry& registry) {
    // Resolution Parameters (powers of 2, typical range 64-8192)
    registry.DefineParameter<uint32_t>(EVALUATION_RESOLUTION, 512u, 64u, 8192u);
    registry.DefineParameter<uint32_t>(RENDERING_RESOLUTION, 512u, 64u, 8192u);
    registry.DefineParameter<uint32_t>(TEXTURE_RESOLUTION, 1024u, 128u, 4096u);
    registry.DefineParameter<uint32_t>(MESH_RESOLUTION, 256u, 64u, 2048u);
    registry.DefineParameter<uint32_t>(HEIGHTMAP_RESOLUTION, 512u, 64u, 4096u);
    registry.DefineParameter<uint32_t>(WATER_GRID_RESOLUTION, 256u, 64u, 1024u);
    registry.DefineParameter<uint32_t>(CAUSTICS_RESOLUTION, 512u, 128u, 2048u);
    
    // Add power-of-2 validators for resolution parameters
    auto powerOf2Validator = [](uint32_t value) {
        return (value & (value - 1)) == 0;
    };
    registry.AddValidator<uint32_t>(EVALUATION_RESOLUTION, powerOf2Validator);
    registry.AddValidator<uint32_t>(RENDERING_RESOLUTION, powerOf2Validator);
    registry.AddValidator<uint32_t>(TEXTURE_RESOLUTION, powerOf2Validator);
    registry.AddValidator<uint32_t>(MESH_RESOLUTION, powerOf2Validator);
    registry.AddValidator<uint32_t>(HEIGHTMAP_RESOLUTION, powerOf2Validator);
    registry.AddValidator<uint32_t>(WATER_GRID_RESOLUTION, powerOf2Validator);
    registry.AddValidator<uint32_t>(CAUSTICS_RESOLUTION, powerOf2Validator);
    
    // Size Parameters
    registry.DefineParameter<float>(PLANET_RADIUS, 6371000.0f, 1000.0f, 1e8f);
    registry.DefineParameter<float>(HEIGHT_SCALE, 8000.0f, 100.0f, 50000.0f);
    registry.DefineParameter<float>(OCEAN_DEPTH, 3000.0f, 10.0f, 20000.0f);
    registry.DefineParameter<float>(ATMOSPHERE_HEIGHT, 100000.0f, 1000.0f, 500000.0f);
    
    // Processing Parameters
    registry.DefineParameter<uint32_t>(CHUNK_SIZE, 512u, 64u, 2048u);
    registry.DefineParameter<uint32_t>(THREAD_COUNT, 8u, 1u, 64u);
    registry.DefineParameter<uint32_t>(GPU_WORKGROUP_SIZE, 16u, 8u, 32u);
    registry.DefineParameter<uint64_t>(MEMORY_LIMIT, 4294967296ull, 268435456ull, 68719476736ull); // 4GB default, 256MB min, 64GB max
    
    // Quality Parameters (0=lowest, 4=highest)
    registry.DefineParameter<uint32_t>(LOD_LEVELS, 5u, 1u, 10u);
    registry.DefineParameter<uint32_t>(TERRAIN_QUALITY, 2u, 0u, 4u);
    registry.DefineParameter<uint32_t>(WATER_QUALITY, 2u, 0u, 4u);
    registry.DefineParameter<uint32_t>(ATMOSPHERE_QUALITY, 2u, 0u, 4u);
    
    // Physics Parameters
    registry.DefineParameter<float>(GRAVITY, 9.81f, 0.1f, 50.0f);
    registry.DefineParameter<float>(TIME_SCALE, 1.0f, 0.001f, 1000.0f);
    registry.DefineParameter<float>(EROSION_STRENGTH, 0.5f, 0.0f, 1.0f);
    registry.DefineParameter<float>(TECTONIC_ACTIVITY, 0.3f, 0.0f, 1.0f);
    
    // Water Parameters
    registry.DefineParameter<float>(WAVE_HEIGHT, 2.0f, 0.1f, 50.0f);
    registry.DefineParameter<float>(WAVE_LENGTH, 20.0f, 1.0f, 200.0f);
    registry.DefineParameter<float>(WAVE_SPEED, 5.0f, 0.1f, 50.0f);
    registry.DefineParameter<float>(WATER_CLARITY, 0.8f, 0.0f, 1.0f);
    registry.DefineParameter<float>(FOAM_INTENSITY, 0.5f, 0.0f, 1.0f);
    
    // Noise Parameters
    registry.DefineParameter<uint32_t>(NOISE_OCTAVES, 6u, 1u, 16u);
    registry.DefineParameter<float>(NOISE_FREQUENCY, 0.001f, 0.00001f, 1.0f);
    registry.DefineParameter<float>(NOISE_AMPLITUDE, 1.0f, 0.0f, 10.0f);
    registry.DefineParameter<float>(NOISE_PERSISTENCE, 0.5f, 0.0f, 1.0f);
    registry.DefineParameter<float>(NOISE_LACUNARITY, 2.0f, 1.0f, 4.0f);
}

// Setup standard parameter relationships
void SetupParameterRelationships(ParameterRegistry& registry, ParameterRelationships& relationships) {
    // Resolution cascade: evaluation -> rendering -> texture -> mesh
    std::vector<std::pair<std::string, float>> resolutionTargets = {
        {RENDERING_RESOLUTION, 1.0f},      // Rendering matches evaluation
        {TEXTURE_RESOLUTION, 2.0f},         // Texture is 2x evaluation
        {MESH_RESOLUTION, 0.5f},            // Mesh is 0.5x evaluation
        {HEIGHTMAP_RESOLUTION, 1.0f}       // Heightmap matches evaluation
    };
    relationships.AddCascade(EVALUATION_RESOLUTION, resolutionTargets);
    
    // Quality cascade: terrain quality affects multiple parameters
    auto terrainQualityUpdater = [](ParameterRegistry& reg, const std::any& value) -> void {
        try {
            uint32_t quality = std::any_cast<uint32_t>(value);
            
            // Adjust resolutions based on quality
            uint32_t baseRes = 256u * (1u << quality); // 256, 512, 1024, 2048, 4096
            reg.SetRuntimeOverride(EVALUATION_RESOLUTION, baseRes);
            
            // Adjust noise parameters
            reg.SetRuntimeOverride(NOISE_OCTAVES, 4u + quality * 2u);
            
            // Adjust LOD levels
            reg.SetRuntimeOverride(LOD_LEVELS, 3u + quality);
        } catch (const std::bad_any_cast&) {
            // Log error handled in ParameterRelationships
        }
    };
    relationships.AddRelationship(TERRAIN_QUALITY, terrainQualityUpdater);
    
    // Water quality cascade
    auto waterQualityUpdater = [](ParameterRegistry& reg, const std::any& value) -> void {
        try {
            uint32_t quality = std::any_cast<uint32_t>(value);
            
            // Adjust water grid resolution
            uint32_t gridRes = 128u * (1u << quality); // 128, 256, 512, 1024, 2048
            reg.SetRuntimeOverride(WATER_GRID_RESOLUTION, gridRes);
            
            // Adjust caustics resolution
            uint32_t causticsRes = 256u * (1u << quality);
            reg.SetRuntimeOverride(CAUSTICS_RESOLUTION, causticsRes);
        } catch (const std::bad_any_cast&) {
            // Log error handled in ParameterRelationships
        }
    };
    relationships.AddRelationship(WATER_QUALITY, waterQualityUpdater);
    
    // Chunk size adapts to resolution
    auto chunkSizeUpdater = [](ParameterRegistry& reg, const std::any& value) -> void {
        try {
            uint32_t resolution = std::any_cast<uint32_t>(value);
            
            // Chunk size is typically 1/4 of resolution, clamped to reasonable range
            uint32_t chunkSize = std::min(512u, std::max(64u, resolution / 4u));
            
            // Ensure chunk size is power of 2
            uint32_t powerOf2 = 1u;
            while (powerOf2 < chunkSize) powerOf2 <<= 1;
            if (powerOf2 > chunkSize) powerOf2 >>= 1;
            
            reg.SetRuntimeOverride(CHUNK_SIZE, powerOf2);
        } catch (const std::bad_any_cast&) {
            // Log error handled in ParameterRelationships
        }
    };
    relationships.AddRelationship(EVALUATION_RESOLUTION, chunkSizeUpdater);
    
    // Apply all relationships to the registry
    relationships.ApplyRelationships(registry);
}

// Helper to get all resolution parameters
std::vector<std::string> GetResolutionParameters() {
    return {
        EVALUATION_RESOLUTION,
        RENDERING_RESOLUTION,
        TEXTURE_RESOLUTION,
        MESH_RESOLUTION,
        HEIGHTMAP_RESOLUTION,
        WATER_GRID_RESOLUTION,
        CAUSTICS_RESOLUTION
    };
}

// Helper to get all quality parameters
std::vector<std::string> GetQualityParameters() {
    return {
        LOD_LEVELS,
        TERRAIN_QUALITY,
        WATER_QUALITY,
        ATMOSPHERE_QUALITY
    };
}

// Helper to create quality presets
void ApplyQualityPreset(ParameterRegistry& registry, const std::string& preset) {
    if (preset == "low") {
        registry.SetRuntimeOverride(TERRAIN_QUALITY, 0u);
        registry.SetRuntimeOverride(WATER_QUALITY, 0u);
        registry.SetRuntimeOverride(ATMOSPHERE_QUALITY, 0u);
    } else if (preset == "medium") {
        registry.SetRuntimeOverride(TERRAIN_QUALITY, 2u);
        registry.SetRuntimeOverride(WATER_QUALITY, 2u);
        registry.SetRuntimeOverride(ATMOSPHERE_QUALITY, 2u);
    } else if (preset == "high") {
        registry.SetRuntimeOverride(TERRAIN_QUALITY, 3u);
        registry.SetRuntimeOverride(WATER_QUALITY, 3u);
        registry.SetRuntimeOverride(ATMOSPHERE_QUALITY, 3u);
    } else if (preset == "ultra") {
        registry.SetRuntimeOverride(TERRAIN_QUALITY, 4u);
        registry.SetRuntimeOverride(WATER_QUALITY, 4u);
        registry.SetRuntimeOverride(ATMOSPHERE_QUALITY, 4u);
    }
}

} // namespace PlanetGen::Core::Parameters::PlanetParams
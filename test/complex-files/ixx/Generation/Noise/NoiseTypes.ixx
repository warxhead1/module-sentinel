module;

#include <glm/glm.hpp>
#include <string>
#include <stdexcept>

export module NoiseTypes;

export namespace PlanetGen::Rendering::Noise {

/**
 * @brief Types of noise generators available for procedural universe generation
 */
enum class NoiseType {
  // Basic noise types
  Simplex,      // Basic Simplex noise
  Worley,       // Worley/Cellular noise
  SimpleNoise,  // Our custom noise implementation
  GPU,          // GPU-accelerated noise
  
  // Advanced fractal noise variations  
  RidgedNoise,        // Ridged multi-fractal noise (mountain ridges, canyons)
  BillowNoise,        // Billowy noise (clouds, rolling hills)
  TurbulenceNoise,    // Turbulence noise (atmospheric effects)
  FractalBrownian,    // Fractal Brownian Motion (natural terrain)
  HybridMultifractal, // Hybrid multifractal (complex terrain)
  
  // Domain warping variants
  DomainWarpedSimplex,  // Simplex with domain warping
  DomainWarpedWorley,   // Worley with domain warping
  FlowNoise,            // Flow field noise (fluid simulation)
  CurlNoise,            // Curl noise (swirling patterns)
  
  // Voronoi variations (for cellular structures)
  VoronoiF1,           // Distance to closest point
  VoronoiF2,           // Distance to second closest point
  VoronoiF2MinusF1,    // F2 - F1 (edge detection)
  VoronoiCrackle,      // Crackle noise (stone textures)
  VoronoiManhattan,    // Manhattan distance Voronoi
  VoronoiChebyshev,    // Chebyshev distance Voronoi
  
  // Specialized cosmic noise types
  StarFieldNoise,      // For generating star distributions
  NebulaHotnoise,      // Nebula and gas cloud formations  
  GalaxySpiral,        // Spiral galaxy arm patterns
  ClusteredNoise,      // Clustered distributions (asteroid fields)
  
  // Planetary surface specializations
  ContinentalNoise,    // Continental shelf patterns
  MountainRidge,       // Mountain ridge formations
  RiverNetwork,        // River and erosion patterns
  CraterField,         // Impact crater distributions
  VolcanicNoise,       // Volcanic terrain patterns
  
  // Atmospheric and weather
  CloudLayers,         // Multi-layer cloud systems
  WeatherFronts,       // Weather system patterns
  AuroralNoise,        // Aurora-like patterns
  
  // Composite and utility types
  LayeredNoise,        // Multiple noise layers combined
  MaskedNoise,         // Noise with masking regions
  DistanceField,       // Distance field based noise
  GradientNoise        // Gradient-based noise
};

/**
 * @brief Categories of noise for easier organization and selection
 */
enum class NoiseCategory {
  Basic,        // Simple, fundamental noise types
  Fractal,      // Fractal and multi-octave variations
  Cellular,     // Cell-based and Voronoi variations
  Warped,       // Domain-warped variations  
  Cosmic,       // Space and cosmic structure noise
  Planetary,    // Planet surface specializations
  Atmospheric,  // Weather and atmospheric effects
  Composite,    // Complex multi-layer combinations
  Utility       // Helper and utility noise types
};

/**
 * @brief Parameters for GPU-accelerated noise generation
 *
 * This structure contains all parameters needed for GPU noise generation,
 * including both common noise parameters and GPU-specific settings.
 */
struct GPUNoiseParameters {
  // Noise type and basic parameters
  NoiseType type = NoiseType::Simplex;
  int seed = 1337;
  float frequency = 0.01f;
  int octaves = 4;
  float persistence = 0.5f;
  float lacunarity = 2.0f;

  // GPU-specific parameters
  glm::vec2 offset{0.0f, 0.0f};  // Noise offset for tiling
  float amplitude = 1.0f;        // Output amplitude scaling
  bool useRidgedNoise = false;   // Enable ridged noise variant
  float ridgeOffset = 1.0f;      // Offset for ridged noise

  // Dimensions for proper bounds checking
  uint32_t width = 0;
  uint32_t height = 0;
};

/**
 * @brief Simple noise layer for planetary generation
 * Matches the structure used in UnifiedHeightGenerator
 */
struct SimpleNoiseLayer {
    NoiseType type = NoiseType::Simplex;
    float frequency = 0.01f;
    float amplitude = 1.0f;
    int octaves = 4;
    float persistence = 0.5f;
    float lacunarity = 2.0f;
    glm::vec2 offset = glm::vec2(0.0f);
    int seed = 1337;
    
    // Layer blending
    float weight = 1.0f;
    bool additive = true;  // true = add, false = multiply
    float ridgeOffset = 1.0f; // For ridged noise types
};

/**
 * @brief GPU-compatible noise layer structure
 * Matches exactly with the GLSL NoiseLayer struct in shaders
 */
struct GPUNoiseLayer {
    int32_t type;           // NoiseType enum (0=Simplex, 1=Worley, 2=Ridged, etc.)
    int32_t seed;
    float frequency;
    int32_t octaves;
    float persistence;
    float lacunarity;
    glm::vec2 offset;       // 8 bytes
    float amplitude;
    float weight;
    uint32_t additive;      // 1 = additive, 0 = multiplicative
    float ridgeOffset;      // For ridged noise
    uint32_t padding;       // Alignment
};

/**
 * @brief Parameters for planetary elevation compute shader
 */
struct PlanetaryElevationParams {
    uint32_t coordinateCount;
    float worldScale;
    float planetRadius;
    uint32_t layerCount;
    int globalSeed;
    float seaLevel;
    float elevationScale;
    uint32_t resolution;
};

/**
 * @brief Parameters for temperature field compute shader
 */
struct TemperatureFieldParams {
    uint32_t resolution;
    float baseTemperature;      // Planetary base temperature (Kelvin)
    float temperatureVariation; // Temperature scaling factor
    float greenhouse;           // Greenhouse effect factor
    float dayOfYear;           // Day of year for seasonal variation
    float axialTilt;           // Planet's axial tilt in degrees
    uint32_t coordinateCount;
    float padding;             // Alignment
};

/**
 * @brief Parameters for precipitation field compute shader
 */
struct PrecipitationFieldParams {
    uint32_t resolution;
    float basePrecipitation;    // Base precipitation level (mm/year)
    float precipitationScale;   // Scaling factor for precipitation
    float orographicFactor;     // Orographic lift effect strength
    float temperatureFactor;    // Temperature dependency strength
    float seasonalFactor;       // Seasonal variation strength
    float dayOfYear;           // Day of year for seasonal effects
    uint32_t coordinateCount;
};

// Compile-time size verification
static_assert(sizeof(GPUNoiseLayer) == 52, "GPUNoiseLayer must be exactly 52 bytes to match GLSL layout");

/**
 * @brief Convert SimpleNoiseLayer to GPU-compatible format
 */
inline GPUNoiseLayer ConvertToGPULayer(const SimpleNoiseLayer& layer) {
    GPUNoiseLayer gpuLayer{};
    gpuLayer.type = static_cast<int32_t>(layer.type);
    gpuLayer.seed = layer.seed;
    gpuLayer.frequency = layer.frequency;
    gpuLayer.octaves = layer.octaves;
    gpuLayer.persistence = layer.persistence;
    gpuLayer.lacunarity = layer.lacunarity;
    gpuLayer.offset = layer.offset;
    gpuLayer.amplitude = layer.amplitude;
    gpuLayer.weight = layer.weight;
    gpuLayer.additive = layer.additive ? 1u : 0u;
    gpuLayer.ridgeOffset = layer.ridgeOffset;
    gpuLayer.padding = 0; // Initialize padding
    return gpuLayer;
}

/**
 * @brief Convert NoiseType to string representation
 */
inline std::string NoiseTypeToString(NoiseType type) {
    switch (type) {
        case NoiseType::Simplex: return "Simplex";
        case NoiseType::Worley: return "Worley";  
        case NoiseType::SimpleNoise: return "SimpleNoise";
        case NoiseType::GPU: return "GPU";
        case NoiseType::RidgedNoise: return "RidgedNoise";
        case NoiseType::BillowNoise: return "BillowNoise";
        case NoiseType::TurbulenceNoise: return "TurbulenceNoise";
        case NoiseType::FractalBrownian: return "FractalBrownian";
        case NoiseType::HybridMultifractal: return "HybridMultifractal";
        case NoiseType::DomainWarpedSimplex: return "DomainWarpedSimplex";
        case NoiseType::DomainWarpedWorley: return "DomainWarpedWorley";
        case NoiseType::FlowNoise: return "FlowNoise";
        case NoiseType::CurlNoise: return "CurlNoise";
        case NoiseType::VoronoiF1: return "VoronoiF1";
        case NoiseType::VoronoiF2: return "VoronoiF2";
        case NoiseType::VoronoiF2MinusF1: return "VoronoiF2MinusF1";
        case NoiseType::VoronoiCrackle: return "VoronoiCrackle";
        case NoiseType::VoronoiManhattan: return "VoronoiManhattan";
        case NoiseType::VoronoiChebyshev: return "VoronoiChebyshev";
        case NoiseType::StarFieldNoise: return "StarFieldNoise";
        case NoiseType::NebulaHotnoise: return "NebulaHotnoise";
        case NoiseType::GalaxySpiral: return "GalaxySpiral";
        case NoiseType::ClusteredNoise: return "ClusteredNoise";
        case NoiseType::ContinentalNoise: return "ContinentalNoise";
        case NoiseType::MountainRidge: return "MountainRidge";
        case NoiseType::RiverNetwork: return "RiverNetwork";
        case NoiseType::CraterField: return "CraterField";
        case NoiseType::VolcanicNoise: return "VolcanicNoise";
        case NoiseType::CloudLayers: return "CloudLayers";
        case NoiseType::WeatherFronts: return "WeatherFronts";
        case NoiseType::AuroralNoise: return "AuroralNoise";
        case NoiseType::LayeredNoise: return "LayeredNoise";
        case NoiseType::MaskedNoise: return "MaskedNoise";
        case NoiseType::DistanceField: return "DistanceField";
        case NoiseType::GradientNoise: return "GradientNoise";
        default: return "Unknown";
    }
}

/**
 * @brief Convert string to NoiseType
 */
inline NoiseType StringToNoiseType(const std::string& str) {
    if (str == "Simplex") return NoiseType::Simplex;
    if (str == "Worley") return NoiseType::Worley;
    if (str == "SimpleNoise") return NoiseType::SimpleNoise;
    if (str == "GPU") return NoiseType::GPU;
    if (str == "RidgedNoise") return NoiseType::RidgedNoise;
    if (str == "BillowNoise") return NoiseType::BillowNoise;
    if (str == "TurbulenceNoise") return NoiseType::TurbulenceNoise;
    if (str == "FractalBrownian") return NoiseType::FractalBrownian;
    if (str == "HybridMultifractal") return NoiseType::HybridMultifractal;
    if (str == "DomainWarpedSimplex") return NoiseType::DomainWarpedSimplex;
    if (str == "DomainWarpedWorley") return NoiseType::DomainWarpedWorley;
    if (str == "FlowNoise") return NoiseType::FlowNoise;
    if (str == "CurlNoise") return NoiseType::CurlNoise;
    if (str == "VoronoiF1") return NoiseType::VoronoiF1;
    if (str == "VoronoiF2") return NoiseType::VoronoiF2;
    if (str == "VoronoiF2MinusF1") return NoiseType::VoronoiF2MinusF1;
    if (str == "VoronoiCrackle") return NoiseType::VoronoiCrackle;
    if (str == "VoronoiManhattan") return NoiseType::VoronoiManhattan;
    if (str == "VoronoiChebyshev") return NoiseType::VoronoiChebyshev;
    if (str == "StarFieldNoise") return NoiseType::StarFieldNoise;
    if (str == "NebulaHotnoise") return NoiseType::NebulaHotnoise;
    if (str == "GalaxySpiral") return NoiseType::GalaxySpiral;
    if (str == "ClusteredNoise") return NoiseType::ClusteredNoise;
    if (str == "ContinentalNoise") return NoiseType::ContinentalNoise;
    if (str == "MountainRidge") return NoiseType::MountainRidge;
    if (str == "RiverNetwork") return NoiseType::RiverNetwork;
    if (str == "CraterField") return NoiseType::CraterField;
    if (str == "VolcanicNoise") return NoiseType::VolcanicNoise;
    if (str == "CloudLayers") return NoiseType::CloudLayers;
    if (str == "WeatherFronts") return NoiseType::WeatherFronts;
    if (str == "AuroralNoise") return NoiseType::AuroralNoise;
    if (str == "LayeredNoise") return NoiseType::LayeredNoise;
    if (str == "MaskedNoise") return NoiseType::MaskedNoise;
    if (str == "DistanceField") return NoiseType::DistanceField;
    if (str == "GradientNoise") return NoiseType::GradientNoise;
    
    throw std::invalid_argument("Unknown noise type: " + str);
}

/**
 * @brief Get the category of a noise type
 */
inline NoiseCategory GetNoiseCategory(NoiseType type) {
    switch (type) {
        case NoiseType::Simplex:
        case NoiseType::Worley:
        case NoiseType::SimpleNoise:
        case NoiseType::GPU:
            return NoiseCategory::Basic;
            
        case NoiseType::RidgedNoise:
        case NoiseType::BillowNoise:
        case NoiseType::TurbulenceNoise:
        case NoiseType::FractalBrownian:
        case NoiseType::HybridMultifractal:
            return NoiseCategory::Fractal;
            
        case NoiseType::VoronoiF1:
        case NoiseType::VoronoiF2:
        case NoiseType::VoronoiF2MinusF1:
        case NoiseType::VoronoiCrackle:
        case NoiseType::VoronoiManhattan:
        case NoiseType::VoronoiChebyshev:
            return NoiseCategory::Cellular;
            
        case NoiseType::DomainWarpedSimplex:
        case NoiseType::DomainWarpedWorley:
        case NoiseType::FlowNoise:
        case NoiseType::CurlNoise:
            return NoiseCategory::Warped;
            
        case NoiseType::StarFieldNoise:
        case NoiseType::NebulaHotnoise:
        case NoiseType::GalaxySpiral:
        case NoiseType::ClusteredNoise:
            return NoiseCategory::Cosmic;
            
        case NoiseType::ContinentalNoise:
        case NoiseType::MountainRidge:
        case NoiseType::RiverNetwork:
        case NoiseType::CraterField:
        case NoiseType::VolcanicNoise:
            return NoiseCategory::Planetary;
            
        case NoiseType::CloudLayers:
        case NoiseType::WeatherFronts:
        case NoiseType::AuroralNoise:
            return NoiseCategory::Atmospheric;
            
        case NoiseType::LayeredNoise:
        case NoiseType::MaskedNoise:
            return NoiseCategory::Composite;
            
        case NoiseType::DistanceField:
        case NoiseType::GradientNoise:
            return NoiseCategory::Utility;
            
        default:
            return NoiseCategory::Basic;
    }
}

}  // namespace PlanetGen::Rendering::Noise

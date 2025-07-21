module;

#include <vector>
#include <string>
#include <memory>
#include <unordered_map>

#include <utility>
export module TerrainAnalysisTypes;

import GLMModule;

export namespace PlanetGen::Generation::Analysis {

/**
 * @brief Analysis of tectonic activity and mountain formation realism
 */
struct TectonicActivity {
    float ridgeFormation = 0.0f;      // How well mountains form ridges (0-1)
    float valleyCarving = 0.0f;       // How well valleys are carved (0-1)
    float plateauFormation = 0.0f;    // Large flat elevated areas (0-1)
    float coastalComplexity = 0.0f;   // Realistic coastline patterns (0-1)
    float overallRealism = 0.0f;      // Combined tectonic realism score (0-1)
};

/**
 * @brief Analysis of erosion patterns and realism
 */
struct ErosionAnalysis {
    float waterErosionPattern = 0.0f;    // River valley patterns (0-1)
    float windErosionPattern = 0.0f;     // Desert/exposed rock patterns (0-1)
    float glacialErosionPattern = 0.0f;  // U-shaped valleys in mountains (0-1)
    float overallErosionRealism = 0.0f;  // Combined erosion realism (0-1)
};

// Mountain structure analysis for realistic terrain evaluation
struct MountainChain {
    std::vector<size_t> peakIndices;
    float averageElevation = 0.0f;
    float chainLength = 0.0f;
    vec3 orientation = vec3(0.0f);
    std::string type = "unknown"; // "volcanic", "fold", "fault_block"
};

/**
 * Biome classification system with realistic biome types
 */
enum class BiomeType : uint32_t {
    Ocean = 0,
    DeepOcean,
    ShallowSea,
    Beach,
    Desert,
    DesertOasis,
    Grassland,
    Savanna,
    TemperateForest,
    TropicalRainforest,
    BorealForest,
    Tundra,
    AlpineTundra,
    Taiga,
    Mountain,
    HighMountain,
    Glacier,
    IceCap,
    Wetland,
    Marsh,
    RiverDelta,
    VolcanicWasteland,
    LavaField,
    COUNT
};

/**
 * Climate zone classification
 */
enum class ClimateZone : uint32_t {
    Tropical = 0,
    Arid,
    Temperate,
    Continental,
    Polar,
    Highland,
    COUNT
};

/**
 * Geological classification
 */
enum class GeologyType : uint32_t {
    Sedimentary = 0,
    Igneous,
    Metamorphic,
    Volcanic,
    Glacial,
    Alluvial,
    COUNT
};

/**
 * Color mapping for different terrain features
 */
struct TerrainColor {
    vec3 baseColor{0.5f, 0.5f, 0.5f};
    vec3 highlightColor{0.6f, 0.6f, 0.6f};
    vec3 shadowColor{0.4f, 0.4f, 0.4f};
    float roughness = 0.5f;
    float metallic = 0.0f;
    float specular = 0.5f;
    
    TerrainColor() = default;
    TerrainColor(const vec3& base, const vec3& highlight, const vec3& shadow, 
                float rough = 0.5f, float metal = 0.0f, float spec = 0.5f)
        : baseColor(base), highlightColor(highlight), shadowColor(shadow),
          roughness(rough), metallic(metal), specular(spec) {}
};

/**
 * Comprehensive terrain analysis result for a single point
 */
struct TerrainAnalysisPoint {
    // Geographic properties
    float elevation = 0.0f;
    float slope = 0.0f;
    float aspect = 0.0f;  // Direction slope faces (0-360 degrees)
    
    // Climate properties
    float temperature = 15.0f;  // Celsius
    float precipitation = 500.0f;  // mm/year
    float humidity = 0.5f;  // 0-1
    float windExposure = 0.5f;  // 0-1
    
    // Biome classification
    BiomeType primaryBiome = BiomeType::Grassland;
    BiomeType secondaryBiome = BiomeType::Grassland;
    float biomeBlend = 0.0f;  // 0 = primary, 1 = secondary
    ClimateZone climateZone = ClimateZone::Temperate;
    GeologyType geology = GeologyType::Sedimentary;
    
    // Visual properties
    TerrainColor color;
    float vegetation = 0.5f;  // 0-1
    float rockExposure = 0.3f;  // 0-1
    float waterProximity = 0.0f;  // 0-1, distance to water
    
    // Additional analysis data
    float habitability = 0.5f;  // 0-1, suitability for life
    float stability = 1.0f;  // 0-1, geological stability
    float resourceDensity = 0.0f;  // 0-1, mineral/resource availability
};

/**
 * Terrain analysis parameters for different analysis types
 */
struct TerrainAnalysisParams {
    // Biome classification parameters
    float seaLevel = 0.0f;  // Sea level elevation
    float mountainThreshold = 0.7f;  // Elevation threshold for mountains (normalized)
    float glacierThreshold = 0.9f;  // Elevation threshold for glaciers
    float desertTemperatureMin = 25.0f;  // Minimum temperature for desert
    float tundraTemperatureMax = -5.0f;  // Maximum temperature for tundra
    
    // Climate analysis parameters
    float equatorTemperature = 30.0f;  // Temperature at equator
    float poleTemperature = -40.0f;  // Temperature at poles
    float elevationTemperatureLapse = 6.5f;  // °C per 1000m elevation
    float precipitationVariability = 0.3f;  // How much precipitation varies
    
    // Color mapping parameters
    bool useRealisticColors = true;
    float colorVariation = 0.1f;  // Amount of color variation within biomes
    float seasonalVariation = 0.0f;  // Seasonal color changes (0-1)
    
    // Analysis resolution parameters
    bool enableDetailedAnalysis = true;
    bool enableParallelProcessing = true;
    uint32_t maxThreads = 0;  // 0 = use hardware concurrency
    uint32_t chunkSize = 1024;  // Points per processing chunk
};

/**
 * Result of terrain analysis for a region or entire planet
 */
struct TerrainAnalysisResult {
    std::vector<TerrainAnalysisPoint> analysisPoints;
    std::vector<uint32_t> biomeDistribution;  // Count of each biome type
    std::vector<uint32_t> climateDistribution;  // Count of each climate zone
    
    // Summary statistics
    float averageElevation = 0.0f;
    float averageTemperature = 15.0f;
    float averagePrecipitation = 500.0f;
    float habitabilityIndex = 0.5f;  // Overall planet habitability
    float biodiversityIndex = 0.5f;  // Biome diversity measure
    
    // FITNESS EVALUATION - Replaces IFitnessEvaluator
    float overallFitness = 0.0f;  // 0-1 overall quality score
    struct FitnessComponents {
        float biomeVariety = 0.0f;      // How diverse are the biomes (0-1)
        float terrainRealism = 0.0f;    // How realistic is the terrain (0-1)
        float climateCoherence = 0.0f;  // How well climate zones match expectations (0-1)
        float geologicalAccuracy = 0.0f; // How accurate is the geology (0-1)
        float transitionSmoothness = 0.0f; // How smooth are biome transitions (0-1)
        float featureDistribution = 0.0f;  // How well distributed are features (0-1)
        float waterCoverage = 0.0f;     // Percentage of water coverage
        float mountainCoverage = 0.0f;  // Percentage of mountain coverage
    } fitness;
    
    // DETAILED METRICS - Replaces ITerrainMetric
    struct TerrainMetrics {
        // Elevation metrics
        float elevationRange = 0.0f;
        float elevationVariance = 0.0f;
        float elevationSkewness = 0.0f;
        float elevationKurtosis = 0.0f;
        
        // Slope metrics
        float averageSlope = 0.0f;
        float maxSlope = 0.0f;
        float slopeVariance = 0.0f;
        
        // Climate metrics
        float temperatureRange = 0.0f;
        float precipitationRange = 0.0f;
        float humidityVariance = 0.0f;
        
        // Biome transition metrics
        float averageTransitionZoneWidth = 0.0f;
        float transitionDensity = 0.0f;  // transitions per km
        uint32_t totalTransitions = 0;
        
        // Feature detection results
        uint32_t mountainChainCount = 0;
        uint32_t riverSystemCount = 0;
        uint32_t coastlineComplexity = 0;
        std::vector<MountainChain> detectedMountainChains;
    } metrics;
    
    // Analysis metadata
    std::string processingReport;
    uint32_t pointsAnalyzed = 0;
    float processingTimeMs = 0.0f;
    bool analysisSuccessful = false;
    
    // Color and texture data
    std::vector<vec3> terrainColors;  // RGB colors for each point
    std::vector<vec3> terrainNormals;  // Surface normals for lighting
    std::vector<float> materialProperties;  // Roughness, metallic, etc.
    
    TerrainAnalysisResult() {
        biomeDistribution.resize(static_cast<size_t>(BiomeType::COUNT), 0);
        climateDistribution.resize(static_cast<size_t>(ClimateZone::COUNT), 0);
    }
    
    // Helper method to calculate overall fitness from components
    void CalculateOverallFitness() {
        overallFitness = (fitness.biomeVariety * 0.2f +
                         fitness.terrainRealism * 0.2f +
                         fitness.climateCoherence * 0.15f +
                         fitness.geologicalAccuracy * 0.15f +
                         fitness.transitionSmoothness * 0.2f +
                         fitness.featureDistribution * 0.1f);
    }
};

/**
 * Terraforming operation for selective terrain modification
 */
struct TerraformingOperation {
    enum class OperationType {
        ElevationChange,
        TemperatureChange,
        PrecipitationChange,
        BiomeConversion,
        GeologyChange,
        ComplexTerraforming
    };
    
    OperationType type = OperationType::ElevationChange;
    std::string name = "Unnamed Operation";
    std::string description;
    
    // Target area (can be circular, rectangular, or custom polygon)
    vec2 center{0.0f, 0.0f};  // Lat/lon center
    float radius = 1.0f;  // km for circular operations
    std::vector<vec2> customArea;  // For polygon-based operations
    
    // Operation parameters
    float intensity = 1.0f;  // 0-1, how strong the effect is
    float falloffDistance = 2.0f;  // km, distance over which effect fades
    bool enableUndo = true;
    
    // Type-specific parameters
    float elevationDelta = 0.0f;  // m, for elevation changes
    float temperatureDelta = 0.0f;  // °C, for temperature changes
    float precipitationDelta = 0.0f;  // mm/year, for precipitation changes
    BiomeType targetBiome = BiomeType::Grassland;  // For biome conversion
    GeologyType targetGeology = GeologyType::Sedimentary;  // For geology changes
    
    // Advanced terraforming parameters
    bool enableEcosystemSimulation = false;
    bool enableClimateSimulation = false;
    uint32_t simulationSteps = 10;  // Number of simulation iterations
};

/**
 * Chunk-based processing parameters for large terrain datasets
 */
struct TerrainChunk {
    uint32_t startX, startY;
    uint32_t width, height;
    uint32_t chunkId;
    std::vector<float> elevationData;
    std::vector<std::pair<float, float>> coordinates;
    TerrainAnalysisParams analysisParams;
    
    // Results storage
    std::vector<TerrainAnalysisPoint> results;
    bool processed = false;
    std::string processingError;
};

/**
 * Biome definition with characteristic properties
 */
struct BiomeDefinition {
    BiomeType type;
    std::string name;
    std::string description;
    
    // Environmental constraints
    float minElevation = -1000.0f;  // m
    float maxElevation = 9000.0f;   // m
    float minTemperature = -50.0f;  // °C
    float maxTemperature = 50.0f;   // °C
    float minPrecipitation = 0.0f;  // mm/year
    float maxPrecipitation = 4000.0f;  // mm/year
    float minSlope = 0.0f;  // degrees
    float maxSlope = 90.0f;  // degrees
    
    // Visual characteristics
    TerrainColor baseColor;
    float vegetationDensity = 0.5f;  // 0-1
    float rockExposure = 0.3f;  // 0-1
    std::vector<GeologyType> commonGeology;
    
    // Habitability factors
    float habitabilityScore = 0.5f;  // 0-1
    float resourceAbundance = 0.3f;  // 0-1
    
    BiomeDefinition() = default;
    BiomeDefinition(BiomeType t, const std::string& n, const TerrainColor& color)
        : type(t), name(n), baseColor(color) {}
};

} // namespace PlanetGen::Generation::Analysis
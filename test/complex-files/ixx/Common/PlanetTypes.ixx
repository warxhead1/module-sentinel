  // Planetary biome types based on real Earth characteristics
  enum class PlanetaryBiome {
    Ocean,           // Deep water (< -1000m)
    ShallowWater,    // Shallow seas (-1000m to 0m)
    Beach,           // Coastal areas (0m to 50m)
    Plains,          // Flat grasslands (50m to 500m)
    Forest,          // Temperate forests (100m to 1500m)
    Hills,           // Rolling hills (500m to 1000m)
    Mountains,       // Mountain ranges (1000m to 3000m)
    HighMountains,   // High peaks (3000m to 5000m)
    Alpine,          // Alpine regions (5000m to 7000m)
    Polar,           // Polar ice caps (latitude-based)
    Desert,          // Arid regions (latitude + precipitation based)
    Tundra,          // Cold steppes
    Volcanic,        // Active volcanic regions
    Glacier          // Permanent ice
};

// Planetary climate zones
enum class ClimateZone {
    Tropical,        // Equatorial regions
    Subtropical,     // Hot, variable precipitation
    Temperate,       // Moderate climate
    Continental,     // Large temperature variations
    Polar,           // Cold climate
    Alpine,          // High altitude climate
    Arid,            // Desert climate
    Mediterranean    // Mild, wet winters, dry summers
};

// Geological feature types
enum class GeologicalFeature {
    ContinentalShelf,
    OceanTrench,
    MidOceanRidge,
    VolcanicArc,
    RiftValley,
    MountainRange,
    Plateau,
    Basin,
    Delta,
    Archipelago
};

// TerraMind-inspired modality structure for planetary features
struct PlanetaryModality {
    std::string name;
    std::vector<float> data;
    uint32_t width, height;
    float minValue, maxValue;
    
    // Normalization and scaling functions
    void normalize();
    void scale(float newMin, float newMax);
    float sample(float x, float y) const;  // Bilinear sampling
};

// Advanced noise layer configuration for planetary features
struct PlanetaryNoiseLayer {
    PlanetGen::Rendering::Noise::NoiseType type;
    float frequency;
    float amplitude;
    uint32_t octaves;
    float persistence;
    float lacunarity;
    vec2 offset;
    uint32_t seed;
    
    // Advanced features inspired by TerraMind
    bool useRidgedNoise = false;
    bool useDomainWarping = false;
    float warpStrength = 0.0f;
    float warpFrequency = 0.0f;
    
    // Planetary-specific features
    bool isLatitudeDependent = false;  // Varies with latitude
    bool isElevationDependent = false; // Varies with elevation
    float latitudeExponent = 1.0f;     // How strongly latitude affects this layer
    float elevationExponent = 1.0f;    // How strongly elevation affects this layer
    
    // Multi-modal influence
    PlanetaryBiome affectedBiome = PlanetaryBiome::Plains;
    float biomeStrength = 1.0f;
};

// Multi-modal planetary data inspired by TerraMind's approach
struct PlanetaryData {
    PlanetaryModality elevation;      // Digital Elevation Model (DEM)
    PlanetaryModality temperature;    // Surface temperature distribution
    PlanetaryModality precipitation;  // Annual precipitation
    PlanetaryModality humidity;       // Relative humidity
    PlanetaryModality windSpeed;      // Average wind speed
    PlanetaryModality vegetation;     // Vegetation density (NDVI-like)
    PlanetaryModality geology;        // Geological composition
    PlanetaryModality landUse;        // Land use classification (LULC-like)
    
    // Derived modalities
    PlanetaryModality slope;          // Terrain slope
    PlanetaryModality aspect;         // Terrain aspect (direction)
    PlanetaryModality drainage;       // Water drainage patterns
    PlanetaryModality erosion;        // Erosion susceptibility
    
    // Spherical coordinate grid for proper planet surface sampling
    std::vector<std::pair<float, float>> latlonGrid; // (latitude, longitude) pairs
    
    uint32_t planetRadius = 6371000;  // Earth radius in meters
    float seaLevel = 0.0f;
    vec3 axialTilt = vec3(23.5f, 0.0f, 0.0f);  // Earth-like axial tilt
};

// Core planetary generation parameters for optimization
struct PlanetaryParameters {
    float scale = 100.0f;
    int octaves = 6;
    float persistence = 0.5f;
    float lacunarity = 2.0f;
    uint32_t seed = 12345;
    std::vector<float> noiseWeights = {1.0f, 0.5f, 0.25f, 0.125f};
    
    // Required for CRTP optimization interfaces
    using value_type = float;
};

// Parameters for planet mesh generation
// Flexible structure to support any planet type (not just terrain/terra)
struct PlanetGenerationParams {
    uint32_t resolution = 256;          // Grid resolution (power of 2 recommended)
    float baseRadius = 6371000.0f;      // Base planet radius in meters
    float heightScale = 1.0f;           // Height scaling factor
    float elevationExaggeration = 1.0f; // Visual elevation exaggeration
    bool useComprehensivePlanetaryData = true; // Use full multi-modal data
    
    // Optional parameters for different planet types
    float atmosphereThickness = 0.0f;   // For gas giants
    float iceThickness = 0.0f;          // For ice worlds
    float liquidLevel = 0.0f;           // For liquid-covered worlds
    bool generateWaterMask = true;      // Generate water regions
    bool generateVegetationMask = true; // Generate vegetation regions
    bool generateClimateZones = true;   // Generate climate-based zones
};

// Planetary configuration for different planet types
struct PlanetaryConfig {
    enum class PlanetType {
        Terrestrial,     // Earth-like
        Desert,          // Mars-like
        Ocean,           // Water world
        Frozen,          // Ice world
        Volcanic,        // Io-like
        Gaseous,         // Jupiter-like (surface sim)
        Exotic           // Alien world
    };
    
    PlanetType type = PlanetType::Terrestrial;
    float size = 1.0f;              // Relative to Earth
    float mass = 1.0f;              // Relative to Earth
    float atmosphereDensity = 1.0f; // Relative to Earth
    float temperature = 288.0f;     // Average surface temperature (K)
    float dayLength = 24.0f;        // Hours
    float yearLength = 365.25f;     // Days
    bool hasOceans = true;
    bool hasAtmosphere = true;
    bool hasMagneticField = true;
    bool isHabitable = true;
    
    // Climate parameters
    float greenhouse = 1.0f;        // Greenhouse effect strength
    float albedo = 0.3f;           // Planetary albedo
    float obliquity = 23.5f;       // Axial tilt in degrees
    float eccentricity = 0.017f;   // Orbital eccentricity
};

// Result of orchestrated terrain generation
struct OrchestrationResult {
    PlanetaryData planetaryData;
    std::string generationReport;
    std::vector<std::string> appliedProcessors;
    float designMatchScore = 0.0f;     // How well result matches template (0-1)
    bool generationSuccessful = false;
    
    // Analysis of generated features
    float actualWaterCoverage = 0.0f;
    float actualMountainCoverage = 0.0f;
    float actualVegetationCoverage = 0.0f;
    float actualDesertCoverage = 0.0f;
    float actualForestCoverage = 0.0f;
    
    // Performance metrics
    float generationTimeMs = 0.0f;
    uint32_t iterationsUsed = 0;
    std::string performanceBreakdown;
};

/**
 * Terraforming slider parameter - for UI controls
 */
struct TerraformingSlider {
    std::string name;
    std::string description;
    float minValue;
    float maxValue;
    float currentValue;
    float stepSize;
    
    // Apply the current value to affect planetary generation
    void SetValue(float value) {
        currentValue = std::clamp(value, minValue, maxValue);
    }
    
    float GetNormalizedValue() const {
        return (currentValue - minValue) / (maxValue - minValue);
    }
};

/**
 * Celestial body physical properties from JSON
 */
struct CelestialBodyConfig {
    double mass;           // kg
    double radius;         // meters
    float gravity;         // m/s²
    float rotationPeriod;  // hours
    
    struct AtmosphereConfig {
        float pressure;         // Earth atmospheres
        float density;          // Earth = 1.0
        float greenhouseEffect; // Earth = 1.0
        std::unordered_map<std::string, float> composition;
    } atmosphere;
    
    struct CoreConfig {
        std::string type;       // "liquid", "solid", "partially_solid"
        float temperature;      // Kelvin
        float magneticField;    // Earth = 1.0
        std::string composition;
    } core;
};

/**
 * Processing pipeline stage configuration
 */
struct ProcessingStage {
    std::string name;
    std::string processor;
    bool enabled;
    std::unordered_map<std::string, float> parameters;
};

/**
 * Noise parameters for terrain generation
 */
struct NoiseParameters {
    NoiseType type = NoiseType::Simplex;
    float frequency = 0.01f;
    float amplitude = 1.0f;
    int octaves = 6;
    float persistence = 0.5f;
    float lacunarity = 2.0f;
    int seed = 1337;
};

/**
 * Noise configuration for terrain generation
 */
struct NoiseConfiguration {
    NoiseParameters primaryNoise;
    std::optional<NoiseParameters> secondaryNoise;
    bool combineAdditive = true;  // true = add, false = multiply
    float blendFactor = 0.5f;     // blend between primary and secondary
    
    // Debug parameters for terrain rendering troubleshooting
    float debugHeightMultiplier = 1.0f;  // Raw height multiplier
    float debugRadiusOverride = 0.0f;    // Override radius (0 = use calculated)
    bool enableShaderDebug = false;      // Enable shader debugging
    
    // Water debug parameters (to avoid circular dependencies)
    int waterDebugMode = 0;               // Water debug mode as int
    float waterDebugIntensity = 1.0f;     // Debug intensity
    float waterWireframeWidth = 0.02f;    // Wireframe width
    vec3 waterWireframeColor = vec3(1.0f, 1.0f, 0.0f);  // Wireframe color
    vec3 waterSurfaceColor = vec3(0.4f, 0.8f, 1.0f);    // Surface debug color
    vec3 waterDeepColor = vec3(0.0f, 0.2f, 0.6f);       // Deep water debug color
    float waterDepthScale = 0.1f;         // Depth scale
    bool waterDebugAnimation = true;      // Enable debug animation
};

/**
 * Biome parameters for climate zones
 */
struct BiomeParameters {
    std::pair<float, float> temperatureRange = {-20.0f, 35.0f};
    std::pair<float, float> precipitationRange = {0.0f, 2000.0f};
    float humidityBase = 0.5f;
    float altitudeTemperatureGradient = -6.5f; // degrees per 1000m
};
    /**
 * Feature distribution controls - where major features are placed
 */
 struct FeatureDistribution {
    // Continental layout
    uint32_t majorContinents = 3;      // Number of large landmasses
    uint32_t minorContinents = 5;      // Number of smaller landmasses
    uint32_t islandChains = 8;         // Number of archipelagos
    
    // Mountain systems
    uint32_t majorMountainRanges = 4;  // Large mountain chains
    uint32_t volcanicHotspots = 6;     // Volcanic regions
    uint32_t plateauRegions = 3;       // High flat regions
    
    // Water features
    uint32_t majorOceanBasins = 2;     // Large oceanic regions
    uint32_t inlandSeas = 3;           // Large lakes/inland seas
    uint32_t majorRiverSystems = 8;    // Large river networks
    
    // Climate zones
    bool hasEquatorialBelt = true;     // Tropical zone around equator
    bool hasPolarIceCaps = true;       // Ice at poles
    bool hasDesertBelts = true;        // Desert zones at ~30° latitude
    bool hasTemperateZones = true;     // Moderate climate zones
};

/**
 * High-level planetary design parameters - loaded from JSON or created programmatically
 */
struct PlanetaryDesignTemplate {
    std::string name;
    std::string description;
    
    // Primary characteristics (0.0 to 1.0)
    float waterCoverage = 0.7f;        // 0.0 = desert world, 1.0 = ocean world
    float mountainDensity = 0.3f;      // 0.0 = flat plains, 1.0 = mountainous
    float vegetationCoverage = 0.6f;   // 0.0 = barren, 1.0 = lush
    float volcanism = 0.1f;            // 0.0 = stable, 1.0 = highly volcanic
    float glaciation = 0.1f;           // 0.0 = warm, 1.0 = ice age
    
    // Climate control
    float temperatureRange = 60.0f;    // Temperature difference between equator and poles
    float averageTemperature = 15.0f;  // Global average temperature (Celsius)
    float precipitationLevel = 1.0f;   // Global precipitation multiplier
    
    // Geological activity
    float tectonicActivity = 0.5f;     // Plate movement intensity
    float erosionRate = 0.5f;          // Weathering and erosion speed
    float crustalAge = 0.5f;           // 0.0 = young/active, 1.0 = ancient/stable
    
    // Atmospheric properties
    float atmosphereDensity = 1.0f;    // Relative to Earth
    float greenhouseEffect = 1.0f;     // Climate warming factor
    
    // Planet scaling parameters - critical for dynamic planet generation
    float planetRadius = 6371.0f;      // Planet radius in meters (Earth default)
    float maxElevation = 40000.0f;        // Maximum elevation in meters (40km default)
    float heightScale = 1.0f;             // User-controlled height scaling factor
    float elevationExaggeration = 1.0f;   // Visual exaggeration for rendering
    
    // Variation control
    float continentalVariation = 0.3f; // How much continents vary in size/shape
    float climateVariation = 0.2f;     // How much climate zones vary
    uint32_t randomSeed = 0;           // For controlled variation

    // render stuff
    float visualScaleRatio = 0.05f; // 5% default
    float minRenderRadius = 50.0f; // 50km default
    float maxRenderRadius = 500.0f; // 500km default
    
    // Water rendering parameters
    vec3 waterColor = vec3(0.0f, 0.2f, 0.4f);
    vec3 shallowWaterColor = vec3(0.2f, 0.6f, 0.8f);
    vec3 foamColor = vec3(1.0f, 1.0f, 1.0f);
    float foamThreshold = 2.0f;
    float deepWaterDepth = 50.0f;
    float shallowWaterDepth = 5.0f;
    float waveHeight = 2.0f;
    float waterRoughness = 0.1f;
    float flowSpeed = 0.5f;
    vec2 flowDirection = vec2(1.0f, 0.0f);
    float causticStrength = 1.0f;
    float waveSpeed = 1.0f;
    float waterOpacity = 0.8f;
    float refractionStrength = 0.1f;
    float reflectionStrength = 1.0f;
    float fresnelPower = 5.0f;
    float fresnelBias = 0.02f;
    vec3 skyColor = vec3(0.5f, 0.7f, 1.0f);
    vec3 horizonColor = vec3(0.8f, 0.9f, 1.0f);
    vec3 ambientColor = vec3(0.2f, 0.3f, 0.4f);
    
    // Note: WaterDebugParams is handled separately to avoid circular dependencies
    
    // Noise configuration for terrain generation
    NoiseConfiguration noiseConfig;
    
    // Biome configuration
    BiomeParameters biomeParams;
    
    // Feature distribution
    FeatureDistribution featureDistribution;
    
    // Extended configuration from JSON
    CelestialBodyConfig celestialBody;
    std::vector<TerraformingSlider> terraformingSliders;
    std::vector<ProcessingStage> processingPipeline;
    
    // JSON loading methods
    static PlanetaryDesignTemplate LoadFromJSON(const std::string& filePath);
    void SaveToJSON(const std::string& filePath) const;
    
    // Terraforming methods
    void SetTerraformingParameter(const std::string& paramName, float value);
    float GetTerraformingParameter(const std::string& paramName) const;
    std::vector<std::string> GetTerraformingParameterNames() const {
        std::vector<std::string> names;
        names.reserve(terraformingSliders.size());
        for (const auto& slider : terraformingSliders) {
            names.push_back(slider.name);
        }
        return names;
    }
    TerraformingSlider* FindSlider(const std::string& name);
    const TerraformingSlider* FindSlider(const std::string& name) const;
};


}

export namespace PlanetGen::Rendering {

/**
* @brief Terrain generation settings structure
*/
struct TerrainSettings {
Noise::NoiseType noiseType = Noise::NoiseType::Simplex;
float frequency = 0.01f;
float amplitude = 1.0f;
int octaves = 4;
float persistence = 0.5f;
float lacunarity = 2.0f;
float baseHeight = 0.0f;

// Advanced features
bool useRidgedNoise = false;
float ridgeOffset = 1.0f;

bool enableTerracing = false;
float terracingStrength = 0.1f;

bool enableDomainWarping = false;
float warpFrequency = 0.01f;
float warpStrength = 25.0f;
};
// For Ocean Influence shader
struct OceanInfluencePushConstants {
uint32_t width;           // 4 bytes
uint32_t height;          // 4 bytes  
int32_t basinRadius;      // 4 bytes
float oceanBasinDepth;    // 4 bytes
// Total: 16 bytes (perfect alignment)
};

// For Ocean Basin Apply shader  
struct OceanBasinApplyPushConstants {
uint32_t dataSize;        // 4 bytes
float seaLevel;           // 4 bytes
float padding[2];         // 8 bytes padding for 16-byte alignment
// Total: 16 bytes (aligned)
};

/**
* Biome data for terrain coloring and features
*/
struct BiomeData {
enum class Type {
    Ocean,
    Beach,
    Desert,
    Grassland,
    Forest,
    Taiga,
    Tundra,
    Ice,
    Mountain,
    Volcanic
};

Type type;
vec3 baseColor;
vec3 detailColor;
float moistureRange[2];  // Min/max moisture
float temperatureRange[2]; // Min/max temperature
float altitudeRange[2];   // Min/max altitude
};

/**
* Planetary terrain configuration
*/
struct PlanetaryTerrainConfig {
// Basic parameters
float radius = 6371.0f;        // km (Earth-like)
float maxElevation = 8.848f;   // km (Everest-like)
float oceanLevel = 0.0f;       // Sea level

// Noise parameters for height generation
Noise::NoiseType noiseType = Noise::NoiseType::Simplex;
float frequency = 0.5f;
int octaves = 8;
float lacunarity = 2.0f;
float persistence = 0.5f;

// Advanced terrain features
bool useTectonicPlates = true;
bool useErosion = true;
bool useCraters = false;  // For moon-like bodies

// Atmosphere affects terrain appearance
bool hasAtmosphere = true;
float atmosphereDensity = 1.0f;
};

/**
* Terrain patch for quadtree LOD system
*/
struct TerrainPatch {
vec3 center;           // World space center
float size;            // Size of the patch
uint32_t lodLevel;     // 0 = highest detail

// Bounding info for culling
float minHeight;
float maxHeight;

// Neighbor connectivity for seamless LOD
std::array<TerrainPatch*, 4> neighbors = {nullptr}; // N, E, S, W

// GPU buffer offsets
uint32_t vertexOffset;
uint32_t indexOffset;
uint32_t indexCount;
};
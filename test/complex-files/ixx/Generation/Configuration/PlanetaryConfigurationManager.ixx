module;

#include <memory>
#include <string>
#include <unordered_map>
#include <vector>
#include <variant>
#include <functional>
#include <optional>

export module PlanetaryConfigurationManager;

import GLMModule;
import NoiseTypes;
import GenerationTypes;

export namespace PlanetGen::Generation::Configuration {

// Forward declarations
class PlanetaryPreset;
class PlanetTypeConfig;
class PlanetInstanceConfig;

// Noise layer configuration
struct NoiseLayerConfig {
    std::string noiseType = "perlin";
    float scale = 100.0f;
    float amplitude = 1.0f;
    float frequency = 1.0f;
    int octaves = 4;
    float persistence = 0.5f;
    float lacunarity = 2.0f;
    uint32_t seed = 12345;
    vec3 offset = vec3(0.0f);
    
    // Additional noise-specific parameters
    std::unordered_map<std::string, float> extraParams;
};

// Biome configuration
struct BiomeConfig {
    std::string name;
    float elevationMin = -1.0f;
    float elevationMax = 1.0f;
    float moistureMin = 0.0f;
    float moistureMax = 1.0f;
    float temperatureMin = -40.0f;
    float temperatureMax = 40.0f;
    
    vec3 baseColor = vec3(0.5f);
    vec3 slopeColor = vec3(0.4f);
    float roughness = 0.5f;
    float metallic = 0.0f;
};

// Atmosphere configuration
struct AtmosphereConfig {
    bool enabled = true;
    float density = 1.0f;
    float scaleHeight = 8.0f;
    vec3 scatteringCoefficients = vec3(5.8e-3f, 13.5e-3f, 33.1e-3f);
    float planetRadius = 6371.0f; // km
    float atmosphereRadius = 6471.0f; // km
};

// Ocean configuration
struct OceanConfig {
    bool enabled = false;
    float level = 0.0f;
    vec3 shallowColor = vec3(0.0f, 0.5f, 0.8f);
    vec3 deepColor = vec3(0.0f, 0.2f, 0.6f);
    float depthScale = 100.0f;
    float waveScale = 10.0f;
    float waveSpeed = 0.5f;
};

// Ring system configuration
struct RingSystemConfig {
    bool enabled = false;
    float innerRadius = 1.5f;
    float outerRadius = 2.5f;
    vec3 color = vec3(0.8f, 0.7f, 0.6f);
    float opacity = 0.8f;
    float rotation = 0.0f;
    vec3 normal = vec3(0.0f, 1.0f, 0.0f);
};

// Physics processing configuration
struct PhysicsConfig {
    bool enabled = true;
    
    // Enabled physics processors
    bool enableGravitationalSettling = true;
    bool enableAtmosphericErosion = true;
    bool enableTectonicActivity = true;
    bool enableAdvancedErosion = false;
    
    // Simulation parameters
    uint32_t simulationSteps = 50;
    float timeStep = 1000.0f; // years per step
    bool useGPUAcceleration = true;
    
    // Gravitational settings
    float settlingStrength = 1.0f;
    float minimumStableSlope = 35.0f; // degrees
    
    // Atmospheric settings
    float atmosphericStrength = 1.0f;
    float windErosionFactor = 0.5f;
    
    // Tectonic settings
    float tectonicActivity = 0.5f;
    
    // Physics processor weights (how much each processor affects the result)
    float gravitationalWeight = 1.0f;
    float atmosphericWeight = 0.8f;
    float tectonicWeight = 0.6f;
    float erosionWeight = 0.4f;
    
    // Celestial body type override (auto-detected from preset if empty)
    std::string celestialBodyType = ""; // "earth_like", "mars_like", "moon_like", etc.
};

// Hierarchical planet configuration
class PlanetaryPreset {
public:
    std::string name;
    std::string category; // e.g., "Terrestrial", "Gas Giant", "Ice World"
    std::string description;
    
    // Physical properties
    float baseRadius = 6371.0f; // km
    float minElevation = -10.0f; // km
    float maxElevation = 10.0f; // km
    float gravity = 9.81f; // m/s^2
    float rotationPeriod = 24.0f; // hours
    float axialTilt = 23.4f; // degrees
    float orbitalPeriod = 365.25f; // days
    float atmosphereDensity = 1.0f; // Earth = 1.0
    bool hasAtmosphere = true;
    bool hasWater = true;
    bool hasClouds = true;
    
    // Generation settings
    std::vector<NoiseLayerConfig> noiseLayers;
    std::vector<BiomeConfig> biomes;
    AtmosphereConfig atmosphere;
    OceanConfig ocean;
    RingSystemConfig rings;
    PhysicsConfig physics; // NEW: Physics processing configuration
    
    // Visual properties
    vec3 baseColor = vec3(0.5f, 0.4f, 0.3f);
    float roughness = 0.8f;
    float metallic = 0.0f;
};

// Planet type configuration (extends preset)
class PlanetTypeConfig : public PlanetaryPreset {
public:
    std::string parentPreset; // Base preset to inherit from
    
    // Type-specific overrides
    std::unordered_map<std::string, std::variant<float, vec3, std::string>> overrides;
    
    // Apply overrides to base preset
    void ApplyToPreset(PlanetaryPreset& preset) const;
};

// Planet instance configuration (extends type)
class PlanetInstanceConfig : public PlanetTypeConfig {
public:
    std::string id; // Unique instance identifier
    std::string parentType; // Parent type to inherit from
    
    // Instance-specific data
    vec3 position = vec3(0.0f);
    vec3 rotation = vec3(0.0f);
    float scale = 1.0f;
    uint32_t uniqueSeed = 0; // Instance-specific seed
    
    // Runtime state
    bool isGenerated = false;
    double lastUpdateTime = 0.0;
};

// Configuration source interface
class IConfigurationSource {
public:
    virtual ~IConfigurationSource() = default;
    
    virtual bool LoadPreset(const std::string& path, PlanetaryPreset& preset) = 0;
    virtual bool SavePreset(const std::string& path, const PlanetaryPreset& preset) = 0;
    virtual std::vector<std::string> ListPresets(const std::string& directory) = 0;
};

// Main configuration manager
class PlanetaryConfigurationManager {
public:
    PlanetaryConfigurationManager();
    ~PlanetaryConfigurationManager();
    
    // Initialization
    bool Initialize(const std::string& configDirectory = "configs/planets");
    void Shutdown();
    
    // Preset management
    bool RegisterPreset(const PlanetaryPreset& preset);
    bool LoadPreset(const std::string& name);
    bool LoadPresetFromFile(const std::string& path);
    bool SavePreset(const std::string& name, const std::string& path);
    std::optional<PlanetaryPreset> GetPreset(const std::string& name) const;
    std::vector<std::string> GetPresetNames() const;
    std::vector<std::string> GetPresetsByCategory(const std::string& category) const;
    
    // Type management
    bool RegisterType(const PlanetTypeConfig& type);
    std::optional<PlanetTypeConfig> GetType(const std::string& name) const;
    std::vector<std::string> GetTypeNames() const;
    
    // Instance management
    std::string CreateInstance(const std::string& typeName, const std::string& instanceId = "");
    bool RegisterInstance(const PlanetInstanceConfig& instance);
    std::optional<PlanetInstanceConfig> GetInstance(const std::string& id) const;
    std::vector<std::string> GetInstanceIds() const;
    bool RemoveInstance(const std::string& id);
    
    // Configuration building
    PlanetInstanceConfig BuildConfiguration(const std::string& preset, 
                                           const std::unordered_map<std::string, std::variant<float, vec3, std::string>>& overrides = {}) const;
    
    // Factory method for complete planet generation data
    std::unique_ptr<PlanetaryData> GeneratePlanetData(const PlanetInstanceConfig& config) const;
    
    // Configuration source management
    void SetConfigurationSource(std::unique_ptr<IConfigurationSource> source);
    
    // Utility methods
    void SetDefaultPreset(const std::string& name);
    std::string GetDefaultPreset() const { return m_defaultPreset; }
    
    // Validation
    bool ValidatePreset(const PlanetaryPreset& preset) const;
    bool ValidateNoiseLayer(const NoiseLayerConfig& layer) const;
    
private:
    class Impl;
    std::unique_ptr<Impl> m_impl;
    
    std::string m_configDirectory;
    std::string m_defaultPreset = "earth_like";
    std::unique_ptr<IConfigurationSource> m_configSource;
    
    // Internal preset database
    std::unordered_map<std::string, PlanetaryPreset> m_presets;
    std::unordered_map<std::string, PlanetTypeConfig> m_types;
    std::unordered_map<std::string, PlanetInstanceConfig> m_instances;
    
    // Helper methods
    void LoadBuiltInPresets();
    void MergeConfigurations(PlanetaryPreset& target, const PlanetaryPreset& source) const;
    uint32_t GenerateInstanceSeed(const std::string& id) const;
};

// JSON configuration source implementation
class JsonConfigurationSource : public IConfigurationSource {
public:
    JsonConfigurationSource();
    ~JsonConfigurationSource();
    
    bool LoadPreset(const std::string& path, PlanetaryPreset& preset) override;
    bool SavePreset(const std::string& path, const PlanetaryPreset& preset) override;
    std::vector<std::string> ListPresets(const std::string& directory) override;
    
private:
    class Impl;
    std::unique_ptr<Impl> m_impl;
};

// Factory for creating configuration sources
class ConfigurationSourceFactory {
public:
    static std::unique_ptr<IConfigurationSource> CreateJsonSource();
    static std::unique_ptr<IConfigurationSource> CreateBinarySource();
    static std::unique_ptr<IConfigurationSource> CreateXmlSource();
};

// Built-in preset templates
namespace Presets {
    PlanetaryPreset CreateEarthLikePreset();
    PlanetaryPreset CreateMarsLikePreset();
    PlanetaryPreset CreateMoonLikePreset();
    PlanetaryPreset CreateGasGiantPreset();
    PlanetaryPreset CreateIceWorldPreset();
    PlanetaryPreset CreateVolcanicWorldPreset();
    PlanetaryPreset CreateOceanWorldPreset();
    PlanetaryPreset CreateDesertWorldPreset();
    PlanetaryPreset CreateRingedPlanetPreset();
}

} // namespace PlanetGen::Generation::Configuration
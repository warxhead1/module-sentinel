module;

#include <memory>
#include <string>
#include <unordered_map>
#include <vector>
#include <filesystem>
#include <fstream>
#include <algorithm>
#include <random>
#include <variant>

module PlanetaryConfigurationManager;

import GLMModule;
import NoiseTypes;
import GenerationTypes;
import JsonConfigurationHelpers;

namespace PlanetGen::Generation::Configuration {

// Internal implementation class
class PlanetaryConfigurationManager::Impl {
public:
    std::mt19937 m_rng{std::random_device{}()};
    
    uint32_t GenerateUniqueId() {
        return m_rng();
    }
};

// PlanetaryConfigurationManager implementation
PlanetaryConfigurationManager::PlanetaryConfigurationManager() 
    : m_impl(std::make_unique<Impl>()) {
}

PlanetaryConfigurationManager::~PlanetaryConfigurationManager() = default;

bool PlanetaryConfigurationManager::Initialize(const std::string& configDirectory) {
    m_configDirectory = configDirectory;
    
    // Load built-in presets
    LoadBuiltInPresets();
    
    // Create JSON configuration source by default
    m_configSource = ConfigurationSourceFactory::CreateJsonSource();
    
    // Load presets from config directory if it exists
    if (std::filesystem::exists(configDirectory)) {
        auto presetFiles = m_configSource->ListPresets(configDirectory);
        for (const auto& file : presetFiles) {
            LoadPresetFromFile(file);
        }
    }
    
    return true;
}

void PlanetaryConfigurationManager::Shutdown() {
    m_presets.clear();
    m_types.clear();
    m_instances.clear();
    m_configSource.reset();
}

bool PlanetaryConfigurationManager::RegisterPreset(const PlanetaryPreset& preset) {
    if (!ValidatePreset(preset)) {
        return false;
    }
    
    m_presets[preset.name] = preset;
    return true;
}

bool PlanetaryConfigurationManager::LoadPreset(const std::string& name) {
    auto it = m_presets.find(name);
    return it != m_presets.end();
}

bool PlanetaryConfigurationManager::LoadPresetFromFile(const std::string& path) {
    if (!m_configSource) {
        return false;
    }
    
    PlanetaryPreset preset;
    if (m_configSource->LoadPreset(path, preset)) {
        return RegisterPreset(preset);
    }
    
    return false;
}

bool PlanetaryConfigurationManager::SavePreset(const std::string& name, const std::string& path) {
    auto it = m_presets.find(name);
    if (it == m_presets.end() || !m_configSource) {
        return false;
    }
    
    return m_configSource->SavePreset(path, it->second);
}

std::optional<PlanetaryPreset> PlanetaryConfigurationManager::GetPreset(const std::string& name) const {
    auto it = m_presets.find(name);
    if (it != m_presets.end()) {
        return it->second;
    }
    return std::nullopt;
}

std::vector<std::string> PlanetaryConfigurationManager::GetPresetNames() const {
    std::vector<std::string> names;
    names.reserve(m_presets.size());
    for (const auto& [name, preset] : m_presets) {
        names.push_back(name);
    }
    return names;
}

std::vector<std::string> PlanetaryConfigurationManager::GetPresetsByCategory(const std::string& category) const {
    std::vector<std::string> names;
    for (const auto& [name, preset] : m_presets) {
        if (preset.category == category) {
            names.push_back(name);
        }
    }
    return names;
}

bool PlanetaryConfigurationManager::RegisterType(const PlanetTypeConfig& type) {
    m_types[type.name] = type;
    return true;
}

std::optional<PlanetTypeConfig> PlanetaryConfigurationManager::GetType(const std::string& name) const {
    auto it = m_types.find(name);
    if (it != m_types.end()) {
        return it->second;
    }
    return std::nullopt;
}

std::vector<std::string> PlanetaryConfigurationManager::GetTypeNames() const {
    std::vector<std::string> names;
    names.reserve(m_types.size());
    for (const auto& [name, type] : m_types) {
        names.push_back(name);
    }
    return names;
}

std::string PlanetaryConfigurationManager::CreateInstance(const std::string& typeName, const std::string& instanceId) {
    PlanetInstanceConfig instance;
    
    // Generate unique ID if not provided
    instance.id = instanceId.empty() ? 
        "planet_" + std::to_string(m_impl->GenerateUniqueId()) : instanceId;
    
    // Copy from type if available
    auto typeOpt = GetType(typeName);
    if (typeOpt) {
        // Copy type configuration
        instance.name = typeOpt->name;
        instance.category = typeOpt->category;
        instance.description = typeOpt->description;
        instance.parentType = typeName;
        
        // Copy all other properties
        instance.baseRadius = typeOpt->baseRadius;
        instance.minElevation = typeOpt->minElevation;
        instance.maxElevation = typeOpt->maxElevation;
        instance.gravity = typeOpt->gravity;
        instance.rotationPeriod = typeOpt->rotationPeriod;
        instance.noiseLayers = typeOpt->noiseLayers;
        instance.biomes = typeOpt->biomes;
        instance.atmosphere = typeOpt->atmosphere;
        instance.ocean = typeOpt->ocean;
        instance.rings = typeOpt->rings;
        instance.baseColor = typeOpt->baseColor;
        instance.roughness = typeOpt->roughness;
        instance.metallic = typeOpt->metallic;
    } else {
        // Use default preset
        auto presetOpt = GetPreset(m_defaultPreset);
        if (presetOpt) {
            // Copy preset configuration
            instance.name = presetOpt->name;
            instance.category = presetOpt->category;
            instance.description = presetOpt->description;
            instance.parentType = m_defaultPreset;
            
            // Copy all other properties
            instance.baseRadius = presetOpt->baseRadius;
            instance.minElevation = presetOpt->minElevation;
            instance.maxElevation = presetOpt->maxElevation;
            instance.gravity = presetOpt->gravity;
            instance.rotationPeriod = presetOpt->rotationPeriod;
            instance.noiseLayers = presetOpt->noiseLayers;
            instance.biomes = presetOpt->biomes;
            instance.atmosphere = presetOpt->atmosphere;
            instance.ocean = presetOpt->ocean;
            instance.rings = presetOpt->rings;
            instance.baseColor = presetOpt->baseColor;
            instance.roughness = presetOpt->roughness;
            instance.metallic = presetOpt->metallic;
        }
    }
    
    // Generate unique seed
    instance.uniqueSeed = GenerateInstanceSeed(instance.id);
    
    // Register the instance
    RegisterInstance(instance);
    
    return instance.id;
}

bool PlanetaryConfigurationManager::RegisterInstance(const PlanetInstanceConfig& instance) {
    m_instances[instance.id] = instance;
    return true;
}

std::optional<PlanetInstanceConfig> PlanetaryConfigurationManager::GetInstance(const std::string& id) const {
    auto it = m_instances.find(id);
    if (it != m_instances.end()) {
        return it->second;
    }
    return std::nullopt;
}

std::vector<std::string> PlanetaryConfigurationManager::GetInstanceIds() const {
    std::vector<std::string> ids;
    ids.reserve(m_instances.size());
    for (const auto& [id, instance] : m_instances) {
        ids.push_back(id);
    }
    return ids;
}

bool PlanetaryConfigurationManager::RemoveInstance(const std::string& id) {
    return m_instances.erase(id) > 0;
}

PlanetInstanceConfig PlanetaryConfigurationManager::BuildConfiguration(
    const std::string& preset,
    const std::unordered_map<std::string, std::variant<float, vec3, std::string>>& overrides) const {
    
    PlanetInstanceConfig config;
    
    // Start with preset
    auto presetOpt = GetPreset(preset);
    if (!presetOpt) {
        presetOpt = GetPreset(m_defaultPreset);
    }
    
    if (presetOpt) {
        // Copy preset to instance config
        config.name = presetOpt->name;
        config.category = presetOpt->category;
        config.description = presetOpt->description;
        config.baseRadius = presetOpt->baseRadius;
        config.minElevation = presetOpt->minElevation;
        config.maxElevation = presetOpt->maxElevation;
        config.gravity = presetOpt->gravity;
        config.rotationPeriod = presetOpt->rotationPeriod;
        config.noiseLayers = presetOpt->noiseLayers;
        config.biomes = presetOpt->biomes;
        config.atmosphere = presetOpt->atmosphere;
        config.ocean = presetOpt->ocean;
        config.rings = presetOpt->rings;
        config.baseColor = presetOpt->baseColor;
        config.roughness = presetOpt->roughness;
        config.metallic = presetOpt->metallic;
    }
    
    // Apply overrides
    for (const auto& [key, value] : overrides) {
        if (key == "baseRadius" && std::holds_alternative<float>(value)) {
            config.baseRadius = std::get<float>(value);
        } else if (key == "minElevation" && std::holds_alternative<float>(value)) {
            config.minElevation = std::get<float>(value);
        } else if (key == "maxElevation" && std::holds_alternative<float>(value)) {
            config.maxElevation = std::get<float>(value);
        } else if (key == "gravity" && std::holds_alternative<float>(value)) {
            config.gravity = std::get<float>(value);
        } else if (key == "baseColor" && std::holds_alternative<vec3>(value)) {
            config.baseColor = std::get<vec3>(value);
        }
        // Add more override handling as needed
    }
    
    // Generate unique ID and seed
    config.id = "planet_" + std::to_string(m_impl->GenerateUniqueId());
    config.uniqueSeed = GenerateInstanceSeed(config.id);
    
    return config;
}

std::unique_ptr<PlanetaryData> PlanetaryConfigurationManager::GeneratePlanetData(const PlanetInstanceConfig& config) const {
    // This will be implemented when we integrate with PlanetTypeFactory
    // For now, return nullptr
    return nullptr;
}

void PlanetaryConfigurationManager::SetConfigurationSource(std::unique_ptr<IConfigurationSource> source) {
    m_configSource = std::move(source);
}

void PlanetaryConfigurationManager::SetDefaultPreset(const std::string& name) {
    if (m_presets.find(name) != m_presets.end()) {
        m_defaultPreset = name;
    }
}

bool PlanetaryConfigurationManager::ValidatePreset(const PlanetaryPreset& preset) const {
    // Basic validation
    if (preset.name.empty()) {
        return false;
    }
    
    if (preset.baseRadius <= 0.0f) {
        return false;
    }
    
    if (preset.minElevation >= preset.maxElevation) {
        return false;
    }
    
    // Validate noise layers
    for (const auto& layer : preset.noiseLayers) {
        if (!ValidateNoiseLayer(layer)) {
            return false;
        }
    }
    
    return true;
}

bool PlanetaryConfigurationManager::ValidateNoiseLayer(const NoiseLayerConfig& layer) const {
    if (layer.scale <= 0.0f || layer.frequency <= 0.0f) {
        return false;
    }
    
    if (layer.octaves < 1 || layer.octaves > 16) {
        return false;
    }
    
    if (layer.persistence < 0.0f || layer.persistence > 1.0f) {
        return false;
    }
    
    if (layer.lacunarity < 1.0f) {
        return false;
    }
    
    return true;
}

void PlanetaryConfigurationManager::LoadBuiltInPresets() {
    RegisterPreset(Presets::CreateEarthLikePreset());
    RegisterPreset(Presets::CreateMarsLikePreset());
    RegisterPreset(Presets::CreateMoonLikePreset());
    RegisterPreset(Presets::CreateGasGiantPreset());
    RegisterPreset(Presets::CreateIceWorldPreset());
    RegisterPreset(Presets::CreateVolcanicWorldPreset());
    RegisterPreset(Presets::CreateOceanWorldPreset());
    RegisterPreset(Presets::CreateDesertWorldPreset());
    RegisterPreset(Presets::CreateRingedPlanetPreset());
}

void PlanetaryConfigurationManager::MergeConfigurations(PlanetaryPreset& target, const PlanetaryPreset& source) const {
    // Merge configurations, with source overriding target
    if (!source.name.empty()) target.name = source.name;
    if (!source.category.empty()) target.category = source.category;
    if (!source.description.empty()) target.description = source.description;
    
    // Merge physical properties
    if (source.baseRadius > 0.0f) target.baseRadius = source.baseRadius;
    if (source.minElevation != -10.0f) target.minElevation = source.minElevation;
    if (source.maxElevation != 10.0f) target.maxElevation = source.maxElevation;
    if (source.gravity != 9.81f) target.gravity = source.gravity;
    if (source.rotationPeriod != 24.0f) target.rotationPeriod = source.rotationPeriod;
    
    // Merge or replace collections
    if (!source.noiseLayers.empty()) target.noiseLayers = source.noiseLayers;
    if (!source.biomes.empty()) target.biomes = source.biomes;
    
    // Merge sub-configurations
    target.atmosphere = source.atmosphere;
    target.ocean = source.ocean;
    target.rings = source.rings;
    
    // Merge visual properties
    target.baseColor = source.baseColor;
    target.roughness = source.roughness;
    target.metallic = source.metallic;
}

uint32_t PlanetaryConfigurationManager::GenerateInstanceSeed(const std::string& id) const {
    std::hash<std::string> hasher;
    return static_cast<uint32_t>(hasher(id));
}

// PlanetTypeConfig implementation
void PlanetTypeConfig::ApplyToPreset(PlanetaryPreset& preset) const {
    // Apply overrides to the preset
    for (const auto& [key, value] : overrides) {
        if (key == "baseRadius" && std::holds_alternative<float>(value)) {
            preset.baseRadius = std::get<float>(value);
        } else if (key == "minElevation" && std::holds_alternative<float>(value)) {
            preset.minElevation = std::get<float>(value);
        } else if (key == "maxElevation" && std::holds_alternative<float>(value)) {
            preset.maxElevation = std::get<float>(value);
        } else if (key == "gravity" && std::holds_alternative<float>(value)) {
            preset.gravity = std::get<float>(value);
        } else if (key == "baseColor" && std::holds_alternative<vec3>(value)) {
            preset.baseColor = std::get<vec3>(value);
        } else if (key == "category" && std::holds_alternative<std::string>(value)) {
            preset.category = std::get<std::string>(value);
        }
        // Add more override handling as needed
    }
}

// Built-in preset implementations
namespace Presets {

PlanetaryPreset CreateEarthLikePreset() {
    PlanetaryPreset preset;
    preset.name = "earth_like";
    preset.category = "Terrestrial";
    preset.description = "Earth-like planet with continents, oceans, and atmosphere";
    
    preset.baseRadius = 6371.0f;
    preset.minElevation = -11.0f; // Mariana Trench
    preset.maxElevation = 8.848f; // Mount Everest
    preset.gravity = 9.81f;
    preset.rotationPeriod = 24.0f;
    
    // Continental base
    NoiseLayerConfig continental;
    continental.noiseType = "ridged";
    continental.scale = 500.0f;
    continental.amplitude = 0.4f;
    continental.frequency = 0.002f;
    continental.octaves = 6;
    continental.persistence = 0.45f;
    continental.lacunarity = 2.2f;
    preset.noiseLayers.push_back(continental);
    
    // Mountain ranges
    NoiseLayerConfig mountains;
    mountains.noiseType = "ridge_mask";
    mountains.scale = 150.0f;
    mountains.amplitude = 0.6f;
    mountains.frequency = 0.008f;
    mountains.octaves = 8;
    mountains.persistence = 0.5f;
    mountains.lacunarity = 2.0f;
    preset.noiseLayers.push_back(mountains);
    
    // Detail layer
    NoiseLayerConfig detail;
    detail.noiseType = "perlin";
    detail.scale = 50.0f;
    detail.amplitude = 0.1f;
    detail.frequency = 0.05f;
    detail.octaves = 4;
    detail.persistence = 0.6f;
    detail.lacunarity = 2.0f;
    preset.noiseLayers.push_back(detail);
    
    // Atmosphere
    preset.atmosphere.enabled = true;
    preset.atmosphere.density = 1.0f;
    preset.atmosphere.scaleHeight = 8.0f;
    preset.atmosphere.planetRadius = preset.baseRadius;
    preset.atmosphere.atmosphereRadius = preset.baseRadius + 100.0f;
    
    // Ocean
    preset.ocean.enabled = true;
    preset.ocean.level = 0.0f;
    preset.ocean.shallowColor = vec3(0.0f, 0.5f, 0.8f);
    preset.ocean.deepColor = vec3(0.0f, 0.2f, 0.6f);
    
    // Biomes
    BiomeConfig ocean;
    ocean.name = "Ocean";
    ocean.elevationMin = -11.0f;
    ocean.elevationMax = 0.0f;
    ocean.baseColor = vec3(0.0f, 0.3f, 0.7f);
    preset.biomes.push_back(ocean);
    
    BiomeConfig beach;
    beach.name = "Beach";
    beach.elevationMin = 0.0f;
    beach.elevationMax = 0.01f;
    beach.baseColor = vec3(0.9f, 0.8f, 0.6f);
    preset.biomes.push_back(beach);
    
    BiomeConfig grassland;
    grassland.name = "Grassland";
    grassland.elevationMin = 0.01f;
    grassland.elevationMax = 0.8f;
    grassland.baseColor = vec3(0.2f, 0.6f, 0.2f);
    preset.biomes.push_back(grassland);
    
    BiomeConfig mountain;
    mountain.name = "Mountain";
    mountain.elevationMin = 0.8f;
    mountain.elevationMax = 2.0f;
    mountain.baseColor = vec3(0.5f, 0.4f, 0.3f);
    preset.biomes.push_back(mountain);
    
    BiomeConfig snow;
    snow.name = "Snow";
    snow.elevationMin = 2.0f;
    snow.elevationMax = 10.0f;
    snow.baseColor = vec3(0.95f, 0.95f, 0.95f);
    preset.biomes.push_back(snow);
    
    // Physics configuration for Earth-like planet
    preset.physics.enabled = true;
    preset.physics.enableGravitationalSettling = true;
    preset.physics.enableAtmosphericErosion = true;
    preset.physics.enableTectonicActivity = true;
    preset.physics.enableAdvancedErosion = true;
    
    preset.physics.simulationSteps = 50;
    preset.physics.timeStep = 1000.0f;
    preset.physics.useGPUAcceleration = true;
    
    preset.physics.settlingStrength = 1.0f;
    preset.physics.minimumStableSlope = 35.0f;
    preset.physics.atmosphericStrength = 1.0f;
    preset.physics.windErosionFactor = 0.7f;
    preset.physics.tectonicActivity = 0.8f;
    
    preset.physics.gravitationalWeight = 1.0f;
    preset.physics.atmosphericWeight = 0.8f;
    preset.physics.tectonicWeight = 0.7f;
    preset.physics.erosionWeight = 0.6f;
    
    preset.physics.celestialBodyType = "earth_like";
    
    return preset;
}

PlanetaryPreset CreateMarsLikePreset() {
    PlanetaryPreset preset;
    preset.name = "mars_like";
    preset.category = "Terrestrial";
    preset.description = "Mars-like planet with canyons, craters, and thin atmosphere";
    
    preset.baseRadius = 3389.5f;
    preset.minElevation = -8.2f; // Hellas Basin
    preset.maxElevation = 21.2f; // Olympus Mons
    preset.gravity = 3.71f;
    preset.rotationPeriod = 24.6f;
    
    // Base terrain
    NoiseLayerConfig base;
    base.noiseType = "perlin";
    base.scale = 800.0f;
    base.amplitude = 0.3f;
    base.frequency = 0.001f;
    base.octaves = 5;
    base.persistence = 0.5f;
    base.lacunarity = 2.0f;
    preset.noiseLayers.push_back(base);
    
    // Canyons
    NoiseLayerConfig canyons;
    canyons.noiseType = "canyon";
    canyons.scale = 300.0f;
    canyons.amplitude = 0.8f;
    canyons.frequency = 0.003f;
    canyons.octaves = 4;
    canyons.persistence = 0.4f;
    canyons.lacunarity = 2.5f;
    preset.noiseLayers.push_back(canyons);
    
    // Crater impacts
    NoiseLayerConfig craters;
    craters.noiseType = "crater";
    craters.scale = 100.0f;
    craters.amplitude = 0.4f;
    craters.frequency = 0.01f;
    craters.octaves = 3;
    craters.persistence = 0.3f;
    craters.lacunarity = 2.0f;
    preset.noiseLayers.push_back(craters);
    
    // Thin atmosphere
    preset.atmosphere.enabled = true;
    preset.atmosphere.density = 0.01f;
    preset.atmosphere.scaleHeight = 11.1f;
    preset.atmosphere.scatteringCoefficients = vec3(19.918e-3f, 13.57e-3f, 5.75e-3f); // Reddish
    
    preset.baseColor = vec3(0.8f, 0.4f, 0.2f); // Rusty red
    preset.roughness = 0.9f;
    
    // Physics configuration for Mars-like planet
    preset.physics.enabled = true;
    preset.physics.enableGravitationalSettling = true;
    preset.physics.enableAtmosphericErosion = true;
    preset.physics.enableTectonicActivity = false; // Mars has low tectonic activity
    preset.physics.enableAdvancedErosion = true;
    
    preset.physics.simulationSteps = 30;
    preset.physics.timeStep = 2000.0f; // Slower processes
    preset.physics.useGPUAcceleration = true;
    
    preset.physics.settlingStrength = 0.8f;
    preset.physics.minimumStableSlope = 40.0f; // Lower gravity allows steeper slopes
    preset.physics.atmosphericStrength = 0.3f; // Thin atmosphere
    preset.physics.windErosionFactor = 1.2f; // More wind erosion due to dust storms
    preset.physics.tectonicActivity = 0.1f; // Very low
    
    preset.physics.gravitationalWeight = 1.0f;
    preset.physics.atmosphericWeight = 0.4f;
    preset.physics.tectonicWeight = 0.1f;
    preset.physics.erosionWeight = 0.8f;
    
    preset.physics.celestialBodyType = "mars_like";
    
    return preset;
}

PlanetaryPreset CreateMoonLikePreset() {
    PlanetaryPreset preset;
    preset.name = "moon_like";
    preset.category = "Terrestrial";
    preset.description = "Moon-like body with heavy cratering and no atmosphere";
    
    preset.baseRadius = 1737.4f;
    preset.minElevation = -9.0f;
    preset.maxElevation = 10.7f;
    preset.gravity = 1.62f;
    preset.rotationPeriod = 655.7f; // Tidally locked
    
    // Base terrain
    NoiseLayerConfig base;
    base.noiseType = "perlin";
    base.scale = 200.0f;
    base.amplitude = 0.1f;
    base.frequency = 0.005f;
    base.octaves = 4;
    base.persistence = 0.5f;
    base.lacunarity = 2.0f;
    preset.noiseLayers.push_back(base);
    
    // Heavy cratering
    NoiseLayerConfig craters;
    craters.noiseType = "crater";
    craters.scale = 50.0f;
    craters.amplitude = 0.9f;
    craters.frequency = 0.02f;
    craters.octaves = 5;
    craters.persistence = 0.6f;
    craters.lacunarity = 1.8f;
    preset.noiseLayers.push_back(craters);
    
    // No atmosphere
    preset.atmosphere.enabled = false;
    
    // No ocean
    preset.ocean.enabled = false;
    
    preset.baseColor = vec3(0.7f, 0.7f, 0.7f);
    preset.roughness = 0.95f;
    
    // Physics configuration for Moon-like body
    preset.physics.enabled = true;
    preset.physics.enableGravitationalSettling = true;
    preset.physics.enableAtmosphericErosion = false; // No atmosphere
    preset.physics.enableTectonicActivity = false; // No tectonics
    preset.physics.enableAdvancedErosion = false; // Minimal erosion
    
    preset.physics.simulationSteps = 20;
    preset.physics.timeStep = 10000.0f; // Very slow processes
    preset.physics.useGPUAcceleration = true;
    
    preset.physics.settlingStrength = 0.5f;
    preset.physics.minimumStableSlope = 50.0f; // Low gravity allows very steep slopes
    preset.physics.atmosphericStrength = 0.0f; // No atmosphere
    preset.physics.windErosionFactor = 0.0f;
    preset.physics.tectonicActivity = 0.0f;
    
    preset.physics.gravitationalWeight = 1.0f;
    preset.physics.atmosphericWeight = 0.0f;
    preset.physics.tectonicWeight = 0.0f;
    preset.physics.erosionWeight = 0.0f;
    
    preset.physics.celestialBodyType = "moon_like";
    
    return preset;
}

PlanetaryPreset CreateGasGiantPreset() {
    PlanetaryPreset preset;
    preset.name = "gas_giant";
    preset.category = "Gas Giant";
    preset.description = "Jupiter-like gas giant with bands and storms";
    
    preset.baseRadius = 69911.0f;
    preset.minElevation = 0.0f; // No solid surface
    preset.maxElevation = 0.0f;
    preset.gravity = 24.79f;
    preset.rotationPeriod = 9.9f;
    
    // Banded structure
    NoiseLayerConfig bands;
    bands.noiseType = "bands";
    bands.scale = 5000.0f;
    bands.amplitude = 1.0f;
    bands.frequency = 0.0001f;
    bands.octaves = 3;
    bands.persistence = 0.7f;
    bands.lacunarity = 1.5f;
    preset.noiseLayers.push_back(bands);
    
    // Storm systems
    NoiseLayerConfig storms;
    storms.noiseType = "turbulence";
    storms.scale = 2000.0f;
    storms.amplitude = 0.5f;
    storms.frequency = 0.0005f;
    storms.octaves = 5;
    storms.persistence = 0.5f;
    storms.lacunarity = 2.0f;
    preset.noiseLayers.push_back(storms);
    
    // Thick atmosphere
    preset.atmosphere.enabled = true;
    preset.atmosphere.density = 10.0f;
    preset.atmosphere.scaleHeight = 27.0f;
    
    preset.baseColor = vec3(0.8f, 0.7f, 0.5f);
    preset.metallic = 0.1f;
    preset.roughness = 0.3f;
    
    return preset;
}

PlanetaryPreset CreateIceWorldPreset() {
    PlanetaryPreset preset;
    preset.name = "ice_world";
    preset.category = "Ice World";
    preset.description = "Frozen world covered in ice with subsurface ocean";
    
    preset.baseRadius = 2410.0f;
    preset.minElevation = -5.0f;
    preset.maxElevation = 3.0f;
    preset.gravity = 3.7f;
    preset.rotationPeriod = 96.0f;
    
    // Ice sheet base
    NoiseLayerConfig iceSheet;
    iceSheet.noiseType = "smooth";
    iceSheet.scale = 300.0f;
    iceSheet.amplitude = 0.2f;
    iceSheet.frequency = 0.003f;
    iceSheet.octaves = 4;
    iceSheet.persistence = 0.4f;
    iceSheet.lacunarity = 2.0f;
    preset.noiseLayers.push_back(iceSheet);
    
    // Cracks and ridges
    NoiseLayerConfig cracks;
    cracks.noiseType = "crack";
    cracks.scale = 50.0f;
    cracks.amplitude = 0.3f;
    cracks.frequency = 0.02f;
    cracks.octaves = 3;
    cracks.persistence = 0.6f;
    cracks.lacunarity = 2.5f;
    preset.noiseLayers.push_back(cracks);
    
    // Thin atmosphere
    preset.atmosphere.enabled = true;
    preset.atmosphere.density = 0.1f;
    preset.atmosphere.scaleHeight = 7.0f;
    
    preset.baseColor = vec3(0.9f, 0.95f, 1.0f);
    preset.roughness = 0.2f;
    preset.metallic = 0.1f;
    
    return preset;
}

PlanetaryPreset CreateVolcanicWorldPreset() {
    PlanetaryPreset preset;
    preset.name = "volcanic_world";
    preset.category = "Terrestrial";
    preset.description = "Highly volcanic world with lava flows and ash";
    
    preset.baseRadius = 1821.0f;
    preset.minElevation = -2.0f;
    preset.maxElevation = 17.0f;
    preset.gravity = 1.8f;
    preset.rotationPeriod = 42.5f;
    
    // Volcanic terrain
    NoiseLayerConfig volcanic;
    volcanic.noiseType = "volcanic";
    volcanic.scale = 200.0f;
    volcanic.amplitude = 0.7f;
    volcanic.frequency = 0.005f;
    volcanic.octaves = 5;
    volcanic.persistence = 0.6f;
    volcanic.lacunarity = 2.2f;
    preset.noiseLayers.push_back(volcanic);
    
    // Lava flows
    NoiseLayerConfig lavaFlows;
    lavaFlows.noiseType = "flow";
    lavaFlows.scale = 50.0f;
    lavaFlows.amplitude = 0.4f;
    lavaFlows.frequency = 0.02f;
    lavaFlows.octaves = 3;
    lavaFlows.persistence = 0.7f;
    lavaFlows.lacunarity = 1.8f;
    preset.noiseLayers.push_back(lavaFlows);
    
    // Sulfur atmosphere
    preset.atmosphere.enabled = true;
    preset.atmosphere.density = 0.5f;
    preset.atmosphere.scaleHeight = 5.0f;
    preset.atmosphere.scatteringCoefficients = vec3(20.0e-3f, 18.0e-3f, 5.0e-3f); // Yellowish
    
    preset.baseColor = vec3(0.2f, 0.1f, 0.05f);
    preset.roughness = 0.8f;
    
    // Lava ocean
    preset.ocean.enabled = true;
    preset.ocean.level = -0.5f;
    preset.ocean.shallowColor = vec3(1.0f, 0.3f, 0.0f);
    preset.ocean.deepColor = vec3(0.8f, 0.1f, 0.0f);
    
    return preset;
}

PlanetaryPreset CreateOceanWorldPreset() {
    PlanetaryPreset preset;
    preset.name = "ocean_world";
    preset.category = "Ocean World";
    preset.description = "World covered entirely by deep ocean";
    
    preset.baseRadius = 4000.0f;
    preset.minElevation = -50.0f;
    preset.maxElevation = 0.5f; // Small islands
    preset.gravity = 7.0f;
    preset.rotationPeriod = 28.0f;
    
    // Seafloor
    NoiseLayerConfig seafloor;
    seafloor.noiseType = "smooth";
    seafloor.scale = 1000.0f;
    seafloor.amplitude = 0.8f;
    seafloor.frequency = 0.001f;
    seafloor.octaves = 4;
    seafloor.persistence = 0.4f;
    seafloor.lacunarity = 2.0f;
    preset.noiseLayers.push_back(seafloor);
    
    // Small islands
    NoiseLayerConfig islands;
    islands.noiseType = "island";
    islands.scale = 100.0f;
    islands.amplitude = 0.2f;
    islands.frequency = 0.01f;
    islands.octaves = 3;
    islands.persistence = 0.3f;
    islands.lacunarity = 2.5f;
    preset.noiseLayers.push_back(islands);
    
    // Dense atmosphere
    preset.atmosphere.enabled = true;
    preset.atmosphere.density = 2.0f;
    preset.atmosphere.scaleHeight = 9.0f;
    
    // Deep ocean
    preset.ocean.enabled = true;
    preset.ocean.level = 0.0f;
    preset.ocean.shallowColor = vec3(0.0f, 0.6f, 0.8f);
    preset.ocean.deepColor = vec3(0.0f, 0.1f, 0.3f);
    preset.ocean.depthScale = 500.0f;
    
    preset.baseColor = vec3(0.0f, 0.4f, 0.7f);
    preset.roughness = 0.1f;
    
    return preset;
}

PlanetaryPreset CreateDesertWorldPreset() {
    PlanetaryPreset preset;
    preset.name = "desert_world";
    preset.category = "Terrestrial";
    preset.description = "Arid desert world with dunes and canyons";
    
    preset.baseRadius = 5200.0f;
    preset.minElevation = -3.0f;
    preset.maxElevation = 5.0f;
    preset.gravity = 8.2f;
    preset.rotationPeriod = 30.0f;
    
    // Sand dunes
    NoiseLayerConfig dunes;
    dunes.noiseType = "dunes";
    dunes.scale = 300.0f;
    dunes.amplitude = 0.4f;
    dunes.frequency = 0.003f;
    dunes.octaves = 4;
    dunes.persistence = 0.5f;
    dunes.lacunarity = 2.0f;
    preset.noiseLayers.push_back(dunes);
    
    // Rocky outcrops
    NoiseLayerConfig rocks;
    rocks.noiseType = "ridged";
    rocks.scale = 150.0f;
    rocks.amplitude = 0.6f;
    rocks.frequency = 0.007f;
    rocks.octaves = 5;
    rocks.persistence = 0.6f;
    rocks.lacunarity = 2.2f;
    preset.noiseLayers.push_back(rocks);
    
    // Thin atmosphere
    preset.atmosphere.enabled = true;
    preset.atmosphere.density = 0.3f;
    preset.atmosphere.scaleHeight = 7.5f;
    preset.atmosphere.scatteringCoefficients = vec3(15.0e-3f, 10.0e-3f, 5.0e-3f); // Dusty
    
    preset.baseColor = vec3(0.9f, 0.7f, 0.4f);
    preset.roughness = 0.9f;
    
    return preset;
}

PlanetaryPreset CreateRingedPlanetPreset() {
    PlanetaryPreset preset;
    preset.name = "ringed_planet";
    preset.category = "Gas Giant";
    preset.description = "Saturn-like planet with prominent ring system";
    
    preset.baseRadius = 58232.0f;
    preset.minElevation = 0.0f;
    preset.maxElevation = 0.0f;
    preset.gravity = 10.44f;
    preset.rotationPeriod = 10.7f;
    
    // Banded atmosphere
    NoiseLayerConfig bands;
    bands.noiseType = "bands";
    bands.scale = 4000.0f;
    bands.amplitude = 1.0f;
    bands.frequency = 0.00015f;
    bands.octaves = 4;
    bands.persistence = 0.6f;
    bands.lacunarity = 1.8f;
    preset.noiseLayers.push_back(bands);
    
    // Ring system
    preset.rings.enabled = true;
    preset.rings.innerRadius = 1.2f; // Relative to planet radius
    preset.rings.outerRadius = 2.5f;
    preset.rings.color = vec3(0.8f, 0.7f, 0.6f);
    preset.rings.opacity = 0.8f;
    
    // Thick atmosphere
    preset.atmosphere.enabled = true;
    preset.atmosphere.density = 8.0f;
    preset.atmosphere.scaleHeight = 59.5f;
    
    preset.baseColor = vec3(0.9f, 0.8f, 0.6f);
    preset.roughness = 0.3f;
    preset.metallic = 0.1f;
    
    return preset;
}

} // namespace Presets

// Configuration source factory implementations
std::unique_ptr<IConfigurationSource> ConfigurationSourceFactory::CreateJsonSource() {
    return std::make_unique<JsonConfigurationSource>();
}

std::unique_ptr<IConfigurationSource> ConfigurationSourceFactory::CreateBinarySource() {
    // TODO: Implement binary source
    return nullptr;
}

std::unique_ptr<IConfigurationSource> ConfigurationSourceFactory::CreateXmlSource() {
    // TODO: Implement XML source
    return nullptr;
}

// JsonConfigurationSource implementation
class JsonConfigurationSource::Impl {
public:
    JsonConfigurationSerializer serializer;
};

JsonConfigurationSource::JsonConfigurationSource() 
    : m_impl(std::make_unique<Impl>()) {
}

JsonConfigurationSource::~JsonConfigurationSource() = default;

bool JsonConfigurationSource::LoadPreset(const std::string& path, PlanetaryPreset& preset) {
    return m_impl->serializer.LoadPresetFromFile(path, preset);
}

bool JsonConfigurationSource::SavePreset(const std::string& path, const PlanetaryPreset& preset) {
    return m_impl->serializer.SavePresetToFile(path, preset);
}

std::vector<std::string> JsonConfigurationSource::ListPresets(const std::string& directory) {
    std::vector<std::string> presets;
    
    try {
        for (const auto& entry : std::filesystem::directory_iterator(directory)) {
            if (entry.is_regular_file() && entry.path().extension() == ".json") {
                presets.push_back(entry.path().string());
            }
        }
    } catch (const std::exception&) {
        // Directory doesn't exist or can't be accessed
    }
    
    return presets;
}

} // namespace PlanetGen::Generation::Configuration
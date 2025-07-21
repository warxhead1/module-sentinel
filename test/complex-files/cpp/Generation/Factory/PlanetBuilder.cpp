module;

#include <memory>
#include <string>
#include <vector>
#include <unordered_map>
#include <variant>
#include <iostream>
#include <algorithm>

module PlanetBuilder;

import GLMModule;
import PlanetTypeFactory;
import PlanetaryConfigurationManager;
import Core.Parameters.ParameterSystemAdapter;
import Core.Parameters.PlanetParams;

namespace PlanetGen::Generation::Factory {

// PlanetBuilder::Impl
class PlanetBuilder::Impl {
public:
    std::vector<std::string> m_validationErrors;
    
    void ClearValidationErrors() {
        m_validationErrors.clear();
    }
    
    void AddValidationError(const std::string& error) {
        m_validationErrors.push_back(error);
    }
};

// PlanetBuilder implementation
PlanetBuilder::PlanetBuilder(IDependencyContainer* container, IComponentFactory* componentFactory)
    : m_impl(std::make_unique<Impl>())
    , m_container(container)
    , m_componentFactory(componentFactory) {
}

PlanetBuilder::~PlanetBuilder() = default;

IPlanetBuilder& PlanetBuilder::WithConfiguration(const Configuration::PlanetInstanceConfig& config) {
    m_config = config;
    return *this;
}

IPlanetBuilder& PlanetBuilder::WithDependencyContainer(IDependencyContainer* container) {
    m_container = container;
    return *this;
}

IPlanetBuilder& PlanetBuilder::WithComponent(const std::string& type, std::shared_ptr<IPlanetComponent> component) {
    m_components[type] = component;
    return *this;
}

IPlanetBuilder& PlanetBuilder::WithTerrain(const std::string& terrainType) {
    m_componentTypes["terrain"] = terrainType;
    return *this;
}

IPlanetBuilder& PlanetBuilder::WithAtmosphere(const std::string& atmosphereType) {
    if (m_config.atmosphere.enabled) {
        m_componentTypes["atmosphere"] = atmosphereType;
    }
    return *this;
}

IPlanetBuilder& PlanetBuilder::WithOcean(const std::string& oceanType) {
    if (m_config.ocean.enabled) {
        m_componentTypes["ocean"] = oceanType;
    }
    return *this;
}

IPlanetBuilder& PlanetBuilder::WithRings(const std::string& ringType) {
    if (m_config.rings.enabled) {
        m_componentTypes["rings"] = ringType;
    }
    return *this;
}

IPlanetBuilder& PlanetBuilder::WithBiomes(const std::vector<std::string>& biomeTypes) {
    // Store biome types in configuration
    // TODO: Update config with biome specifications
    return *this;
}

IPlanetBuilder& PlanetBuilder::WithLODLevels(uint32_t levels) {
    m_lodLevels = levels;
    return *this;
}

IPlanetBuilder& PlanetBuilder::WithTessellationMode(const std::string& mode) {
    m_tessellationMode = mode;
    return *this;
}

IPlanetBuilder& PlanetBuilder::WithTextureResolution(uint32_t resolution) {
    m_textureResolution = resolution;
    return *this;
}

std::unique_ptr<PlanetInstance> PlanetBuilder::Build() {
    m_impl->ClearValidationErrors();
    
    if (!Validate()) {
        std::cerr << "[PlanetBuilder] Validation failed:" << std::endl;
        for (const auto& error : m_impl->m_validationErrors) {
            std::cerr << "  - " << error << std::endl;
        }
        return nullptr;
    }
    
    // Create planet instance
    auto planet = std::make_unique<PlanetInstance>(m_config, m_container);
    
    // Create and add components based on specifications
    for (const auto& [componentName, componentType] : m_componentTypes) {
        CreateComponentFromType(componentName, componentType);
    }
    
    // Add all created components to the planet
    for (const auto& [type, component] : m_components) {
        planet->AddComponent(type, component);
    }
    
    // Apply configuration to components
    ApplyConfigurationToComponents();
    
    // Initialize the planet
    if (!planet->Initialize()) {
        std::cerr << "[PlanetBuilder] Failed to initialize planet instance" << std::endl;
        return nullptr;
    }
    
    // Apply quality settings
    planet->SetLODEnabled(m_lodLevels > 1);
    
    return planet;
}

bool PlanetBuilder::Validate() const {
    m_impl->ClearValidationErrors();
    
    // Validate container
    if (!m_container) {
        m_impl->AddValidationError("No dependency container provided");
        return false;
    }
    
    // Validate component factory
    if (!m_componentFactory) {
        m_impl->AddValidationError("No component factory provided");
        return false;
    }
    
    // Validate configuration
    if (m_config.name.empty()) {
        m_impl->AddValidationError("Planet instance name is required");
    }
    
    if (m_config.baseRadius <= 0.0f) {
        m_impl->AddValidationError("Planet base radius must be positive");
    }
    
    // Validate component configurations
    for (const auto& [componentName, componentType] : m_componentTypes) {
        if (!ValidateComponentConfiguration(componentType)) {
            m_impl->AddValidationError("Invalid configuration for component: " + componentName);
        }
    }
    
    // Ensure terrain component is always present
    if (m_componentTypes.find("terrain") == m_componentTypes.end() && 
        m_components.find("terrain") == m_components.end()) {
        m_impl->AddValidationError("Terrain component is required");
    }
    
    return m_impl->m_validationErrors.empty();
}

std::vector<std::string> PlanetBuilder::GetValidationErrors() const {
    return m_impl->m_validationErrors;
}

void PlanetBuilder::Reset() {
    m_config = Configuration::PlanetInstanceConfig{};
    m_components.clear();
    m_componentTypes.clear();
    m_lodLevels = 4;
    m_tessellationMode = "adaptive";
    m_textureResolution = PlanetGen::Core::Parameters::ParameterSystemAdapter::Get<uint32_t>(
        PlanetGen::Core::Parameters::PlanetParams::TEXTURE_RESOLUTION);
    m_impl->ClearValidationErrors();
}

void PlanetBuilder::CreateComponentFromType(const std::string& componentName, const std::string& componentType) {
    if (m_components.find(componentName) != m_components.end()) {
        // Component already exists, don't overwrite
        return;
    }
    
    auto component = CreateComponent(componentType);
    if (component) {
        m_components[componentName] = component;
    } else {
        std::cerr << "[PlanetBuilder] Failed to create component: " << componentName << " of type: " << componentType << std::endl;
    }
}

bool PlanetBuilder::ValidateComponentConfiguration(const std::string& type) const {
    if (!m_componentFactory) {
        return false;
    }
    
    return m_componentFactory->SupportsType(type);
}

void PlanetBuilder::ApplyConfigurationToComponents() {
    // Apply configuration settings to each component
    for (const auto& [type, component] : m_components) {
        // Components will receive configuration during initialization
        // This method could be extended to apply specific per-component settings
    }
}

std::shared_ptr<IPlanetComponent> PlanetBuilder::CreateComponent(const std::string& type) {
    if (!m_componentFactory) {
        return nullptr;
    }
    
    return m_componentFactory->CreateComponent(type);
}

// PresetPlanetBuilder implementation
PresetPlanetBuilder::PresetPlanetBuilder(IDependencyContainer* container, 
                                        IComponentFactory* componentFactory,
                                        Configuration::PlanetaryConfigurationManager* configManager)
    : m_container(container)
    , m_componentFactory(componentFactory)
    , m_configManager(configManager) {
}

PresetPlanetBuilder::~PresetPlanetBuilder() = default;

std::unique_ptr<PlanetInstance> PresetPlanetBuilder::BuildFromPreset(const std::string& presetName) {
    if (!m_configManager) {
        std::cerr << "[PresetPlanetBuilder] No configuration manager available" << std::endl;
        return nullptr;
    }
    
    if (!ValidatePreset(presetName)) {
        std::cerr << "[PresetPlanetBuilder] Preset validation failed for: " << presetName << std::endl;
        return nullptr;
    }
    
    auto instanceConfig = CreateInstanceConfig(presetName);
    ApplyOverridesToConfig(instanceConfig);
    
    // Create builder and configure it
    PlanetBuilder builder(m_container, m_componentFactory);
    builder.WithConfiguration(instanceConfig)
           .WithLODLevels(m_lodLevels)
           .WithTextureResolution(m_textureResolution)
           .WithTerrain("default");
    
    // Add components based on preset configuration
    if (instanceConfig.atmosphere.enabled) {
        builder.WithAtmosphere("default");
    }
    
    if (instanceConfig.ocean.enabled) {
        builder.WithOcean("default");
    }
    
    if (instanceConfig.rings.enabled) {
        builder.WithRings("default");
    }
    
    return builder.Build();
}

std::unique_ptr<PlanetInstance> PresetPlanetBuilder::BuildFromType(const std::string& typeName,
                                                                  const std::unordered_map<std::string, std::variant<float, vec3, std::string>>& overrides) {
    if (!m_configManager) {
        std::cerr << "[PresetPlanetBuilder] No configuration manager available" << std::endl;
        return nullptr;
    }
    
    // Merge provided overrides with builder overrides
    auto combinedOverrides = m_overrides;
    for (const auto& [key, value] : overrides) {
        combinedOverrides[key] = value;
    }
    
    auto instanceConfig = CreateInstanceConfigFromType(typeName);
    
    // Apply combined overrides
    auto originalOverrides = m_overrides;
    m_overrides = combinedOverrides;
    ApplyOverridesToConfig(instanceConfig);
    m_overrides = originalOverrides;
    
    // Create builder and configure it
    PlanetBuilder builder(m_container, m_componentFactory);
    builder.WithConfiguration(instanceConfig)
           .WithLODLevels(m_lodLevels)
           .WithTextureResolution(m_textureResolution)
           .WithTerrain("default");
    
    // Add components based on configuration
    if (instanceConfig.atmosphere.enabled) {
        builder.WithAtmosphere("default");
    }
    
    if (instanceConfig.ocean.enabled) {
        builder.WithOcean("default");
    }
    
    if (instanceConfig.rings.enabled) {
        builder.WithRings("default");
    }
    
    return builder.Build();
}

PresetPlanetBuilder& PresetPlanetBuilder::WithOverrides(const std::unordered_map<std::string, std::variant<float, vec3, std::string>>& overrides) {
    m_overrides = overrides;
    return *this;
}

PresetPlanetBuilder& PresetPlanetBuilder::WithQualitySettings(uint32_t lodLevels, uint32_t textureResolution) {
    m_lodLevels = lodLevels;
    m_textureResolution = textureResolution;
    return *this;
}

PresetPlanetBuilder& PresetPlanetBuilder::WithPhysicsEnabled(bool enabled) {
    m_physicsEnabled = enabled;
    return *this;
}

bool PresetPlanetBuilder::ValidatePreset(const std::string& presetName) const {
    if (!m_configManager) {
        return false;
    }
    
    auto preset = m_configManager->GetPreset(presetName);
    return preset.has_value();
}

std::vector<std::string> PresetPlanetBuilder::GetValidationErrors(const std::string& presetName) const {
    std::vector<std::string> errors;
    
    if (!m_configManager) {
        errors.push_back("No configuration manager available");
        return errors;
    }
    
    if (!ValidatePreset(presetName)) {
        errors.push_back("Preset not found: " + presetName);
    }
    
    return errors;
}

Configuration::PlanetInstanceConfig PresetPlanetBuilder::CreateInstanceConfig(const std::string& presetName) const {
    Configuration::PlanetInstanceConfig instanceConfig;
    
    if (!m_configManager) {
        return instanceConfig;
    }
    
    auto preset = m_configManager->GetPreset(presetName);
    if (!preset) {
        return instanceConfig;
    }
    
    // Convert preset to instance config
    instanceConfig.name = preset->name + "_instance";
    instanceConfig.baseRadius = preset->baseRadius;
    instanceConfig.minElevation = preset->minElevation;
    instanceConfig.maxElevation = preset->maxElevation;
    instanceConfig.gravity = preset->gravity;
    instanceConfig.rotationPeriod = preset->rotationPeriod;
    instanceConfig.noiseLayers = preset->noiseLayers;
    instanceConfig.biomes = preset->biomes;
    instanceConfig.atmosphere = preset->atmosphere;
    instanceConfig.ocean = preset->ocean;
    instanceConfig.rings = preset->rings;
    instanceConfig.baseColor = preset->baseColor;
    instanceConfig.roughness = preset->roughness;
    instanceConfig.metallic = preset->metallic;
    
    return instanceConfig;
}

Configuration::PlanetInstanceConfig PresetPlanetBuilder::CreateInstanceConfigFromType(const std::string& typeName) const {
    Configuration::PlanetInstanceConfig instanceConfig;
    
    // TODO: Implement type-based configuration creation
    // This would use type definitions to create base configurations
    
    return instanceConfig;
}

void PresetPlanetBuilder::ApplyOverridesToConfig(Configuration::PlanetInstanceConfig& config) const {
    for (const auto& [key, value] : m_overrides) {
        // Apply overrides to configuration
        if (key == "baseRadius" && std::holds_alternative<float>(value)) {
            config.baseRadius = std::get<float>(value);
        } else if (key == "gravity" && std::holds_alternative<float>(value)) {
            config.gravity = std::get<float>(value);
        } else if (key == "rotationPeriod" && std::holds_alternative<float>(value)) {
            config.rotationPeriod = std::get<float>(value);
        } else if (key == "baseColor" && std::holds_alternative<vec3>(value)) {
            config.baseColor = std::get<vec3>(value);
        } else if (key == "roughness" && std::holds_alternative<float>(value)) {
            config.roughness = std::get<float>(value);
        } else if (key == "metallic" && std::holds_alternative<float>(value)) {
            config.metallic = std::get<float>(value);
        }
        // Add more override cases as needed
    }
}

// BuilderFactory implementation
BuilderFactory::BuilderFactory(IDependencyContainer* container, IComponentFactory* componentFactory)
    : m_container(container)
    , m_componentFactory(componentFactory) {
}

BuilderFactory::~BuilderFactory() = default;

std::unique_ptr<PlanetBuilder> BuilderFactory::CreateBuilder() {
    return std::make_unique<PlanetBuilder>(m_container, m_componentFactory);
}

std::unique_ptr<PresetPlanetBuilder> BuilderFactory::CreatePresetBuilder(Configuration::PlanetaryConfigurationManager* configManager) {
    return std::make_unique<PresetPlanetBuilder>(m_container, m_componentFactory, configManager);
}

std::unique_ptr<PlanetInstance> BuilderFactory::CreateEarthLikePlanet() {
    auto config = CreateEarthLikeTemplate();
    
    auto builder = CreateBuilder();
    return builder->WithConfiguration(config)
                  .WithTerrain("default")
                  .WithAtmosphere("default")
                  .WithOcean("default")
                  .WithLODLevels(4)
                  .WithTextureResolution(PlanetGen::Core::Parameters::ParameterSystemAdapter::Get<uint32_t>(
                      PlanetGen::Core::Parameters::PlanetParams::TEXTURE_RESOLUTION))
                  .Build();
}

std::unique_ptr<PlanetInstance> BuilderFactory::CreateMarsLikePlanet() {
    auto config = CreateMarsLikeTemplate();
    
    auto builder = CreateBuilder();
    return builder->WithConfiguration(config)
                  .WithTerrain("default")
                  .WithAtmosphere("thin")
                  .WithLODLevels(4)
                  .WithTextureResolution(PlanetGen::Core::Parameters::ParameterSystemAdapter::Get<uint32_t>(
                      PlanetGen::Core::Parameters::PlanetParams::TEXTURE_RESOLUTION))
                  .Build();
}

std::unique_ptr<PlanetInstance> BuilderFactory::CreateGasGiant() {
    auto config = CreateGasGiantTemplate();
    
    auto builder = CreateBuilder();
    return builder->WithConfiguration(config)
                  .WithAtmosphere("thick")
                  .WithRings("default")
                  .WithLODLevels(3)
                  .WithTextureResolution(PlanetGen::Core::Parameters::ParameterSystemAdapter::Get<uint32_t>(
                      PlanetGen::Core::Parameters::PlanetParams::TEXTURE_RESOLUTION) / 2)
                  .Build();
}

std::unique_ptr<PlanetInstance> BuilderFactory::CreateRockyMoon() {
    auto config = CreateRockyMoonTemplate();
    
    auto builder = CreateBuilder();
    return builder->WithConfiguration(config)
                  .WithTerrain("rocky")
                  .WithLODLevels(3)
                  .WithTextureResolution(PlanetGen::Core::Parameters::ParameterSystemAdapter::Get<uint32_t>(
                      PlanetGen::Core::Parameters::PlanetParams::TEXTURE_RESOLUTION) / 2)
                  .Build();
}

std::unique_ptr<PlanetInstance> BuilderFactory::CreateIceWorld() {
    auto config = CreateIceWorldTemplate();
    
    auto builder = CreateBuilder();
    return builder->WithConfiguration(config)
                  .WithTerrain("icy")
                  .WithAtmosphere("thin")
                  .WithOcean("frozen")
                  .WithLODLevels(4)
                  .WithTextureResolution(PlanetGen::Core::Parameters::ParameterSystemAdapter::Get<uint32_t>(
                      PlanetGen::Core::Parameters::PlanetParams::TEXTURE_RESOLUTION))
                  .Build();
}

std::unique_ptr<PlanetInstance> BuilderFactory::CreateFromTemplate(const std::string& templateName) {
    if (templateName == "earth_like") {
        return CreateEarthLikePlanet();
    } else if (templateName == "mars_like") {
        return CreateMarsLikePlanet();
    } else if (templateName == "gas_giant") {
        return CreateGasGiant();
    } else if (templateName == "rocky_moon") {
        return CreateRockyMoon();
    } else if (templateName == "ice_world") {
        return CreateIceWorld();
    }
    
    std::cerr << "[BuilderFactory] Unknown template: " << templateName << std::endl;
    return nullptr;
}

Configuration::PlanetInstanceConfig BuilderFactory::CreateEarthLikeTemplate() {
    Configuration::PlanetInstanceConfig config;
    config.name = "earth_like_template";
    config.baseRadius = 6371.0f;
    config.minElevation = -11.0f;
    config.maxElevation = 8.8f;
    config.gravity = 9.8f;
    config.rotationPeriod = 24.0f;
    config.baseColor = vec3(0.3f, 0.6f, 0.9f);
    config.roughness = 0.7f;
    config.metallic = 0.1f;
    
    // Enable atmosphere
    config.atmosphere.enabled = true;
    config.atmosphere.density = 1.225f;
    config.atmosphere.scaleHeight = 8.5f;
    config.atmosphere.scatteringCoefficients = vec3(0.058f, 0.135f, 0.331f);
    config.atmosphere.planetRadius = 6371.0f;
    config.atmosphere.atmosphereRadius = 6471.0f;
    
    // Enable ocean
    config.ocean.enabled = true;
    config.ocean.level = 0.0f;
    config.ocean.shallowColor = vec3(0.2f, 0.8f, 0.9f);
    config.ocean.deepColor = vec3(0.0f, 0.2f, 0.6f);
    config.ocean.waveScale = 0.5f;
    config.ocean.waveSpeed = 1.0f;
    
    return config;
}

Configuration::PlanetInstanceConfig BuilderFactory::CreateMarsLikeTemplate() {
    Configuration::PlanetInstanceConfig config;
    config.name = "mars_like_template";
    config.baseRadius = 3389.5f;
    config.minElevation = -8.2f;
    config.maxElevation = 21.2f;
    config.gravity = 3.71f;
    config.rotationPeriod = 24.6f;
    config.baseColor = vec3(0.8f, 0.4f, 0.2f);
    config.roughness = 0.9f;
    config.metallic = 0.0f;
    
    // Thin atmosphere
    config.atmosphere.enabled = true;
    config.atmosphere.density = 0.01f;
    config.atmosphere.scaleHeight = 11.1f;
    config.atmosphere.scatteringCoefficients = vec3(19.918e-3f, 13.57e-3f, 5.75e-3f);
    config.atmosphere.planetRadius = 3389.5f;
    config.atmosphere.atmosphereRadius = 3489.5f;
    
    return config;
}

Configuration::PlanetInstanceConfig BuilderFactory::CreateGasGiantTemplate() {
    Configuration::PlanetInstanceConfig config;
    config.name = "gas_giant_template";
    config.baseRadius = 58232.0f;
    config.minElevation = 0.0f;
    config.maxElevation = 0.0f;
    config.gravity = 10.44f;
    config.rotationPeriod = 10.7f;
    config.baseColor = vec3(0.9f, 0.8f, 0.6f);
    config.roughness = 0.3f;
    config.metallic = 0.1f;
    
    // Thick atmosphere
    config.atmosphere.enabled = true;
    config.atmosphere.density = 8.0f;
    config.atmosphere.scaleHeight = 59.5f;
    config.atmosphere.planetRadius = 58232.0f;
    config.atmosphere.atmosphereRadius = 60000.0f;
    
    // Ring system
    config.rings.enabled = true;
    config.rings.innerRadius = 1.2f;
    config.rings.outerRadius = 2.5f;
    config.rings.color = vec3(0.8f, 0.7f, 0.6f);
    config.rings.opacity = 0.8f;
    
    return config;
}

Configuration::PlanetInstanceConfig BuilderFactory::CreateRockyMoonTemplate() {
    Configuration::PlanetInstanceConfig config;
    config.name = "rocky_moon_template";
    config.baseRadius = 1737.4f;
    config.minElevation = -9.0f;
    config.maxElevation = 10.7f;
    config.gravity = 1.62f;
    config.rotationPeriod = 655.7f;
    config.baseColor = vec3(0.6f, 0.6f, 0.6f);
    config.roughness = 0.95f;
    config.metallic = 0.0f;
    
    return config;
}

Configuration::PlanetInstanceConfig BuilderFactory::CreateIceWorldTemplate() {
    Configuration::PlanetInstanceConfig config;
    config.name = "ice_world_template";
    config.baseRadius = 2500.0f;
    config.minElevation = -5.0f;
    config.maxElevation = 8.0f;
    config.gravity = 1.3f;
    config.rotationPeriod = 30.0f;
    config.baseColor = vec3(0.9f, 0.95f, 1.0f);
    config.roughness = 0.1f;
    config.metallic = 0.0f;
    
    // Thin atmosphere
    config.atmosphere.enabled = true;
    config.atmosphere.density = 0.1f;
    config.atmosphere.scaleHeight = 5.0f;
    config.atmosphere.planetRadius = 2500.0f;
    config.atmosphere.atmosphereRadius = 2600.0f;
    
    // Frozen ocean
    config.ocean.enabled = true;
    config.ocean.level = -1.0f;
    config.ocean.shallowColor = vec3(0.8f, 0.9f, 1.0f);
    config.ocean.deepColor = vec3(0.6f, 0.8f, 1.0f);
    config.ocean.waveScale = 0.1f;
    config.ocean.waveSpeed = 0.2f;
    
    return config;
}

} // namespace PlanetGen::Generation::Factory
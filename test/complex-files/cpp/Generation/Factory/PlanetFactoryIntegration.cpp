module;

#include <memory>
#include <string>
#include <vector>
#include <iostream>
#include <algorithm>

module PlanetFactoryIntegration;

import GLMModule;
import PlanetTypeFactory;
import PlanetBuilder;
import PlanetaryConfigurationManager;
import Core.Parameters.ParameterSystemAdapter;
import Core.Parameters.PlanetParams;

namespace PlanetGen::Generation::Factory {

// PlanetFactoryIntegration implementation
PlanetFactoryIntegration::PlanetFactoryIntegration() = default;

PlanetFactoryIntegration::~PlanetFactoryIntegration() {
    Shutdown();
}

bool PlanetFactoryIntegration::Initialize(void* vulkanRenderSystem, 
                                         std::shared_ptr<Configuration::PlanetaryConfigurationManager> configManager) {
    if (m_initialized) {
        return true;
    }
    
    if (!vulkanRenderSystem || !configManager) {
        std::cerr << "[PlanetFactoryIntegration] Invalid parameters provided" << std::endl;
        return false;
    }
    
    m_configManager = configManager;
    
    // Create dependency container
    m_container = std::make_unique<DefaultDependencyContainer>();
    m_container->RegisterVulkanRenderSystem(vulkanRenderSystem);
    m_container->RegisterConfigurationManager(configManager);
    
    // Create component factory
    m_componentFactory = std::make_unique<DefaultComponentFactory>();
    RegisterDefaultComponents();
    
    // Create main factory
    m_factory = std::make_unique<PlanetTypeFactory>();
    m_factory->SetDependencyContainer(m_container.get());
    m_factory->SetComponentFactory(std::shared_ptr<IComponentFactory>(m_componentFactory.get(), [](IComponentFactory*){/* no-op deleter */}));
    
    if (!m_factory->Initialize(m_container.get())) {
        std::cerr << "[PlanetFactoryIntegration] Failed to initialize planet type factory" << std::endl;
        return false;
    }
    
    // Create builder factory
    m_builderFactory = std::make_unique<BuilderFactory>(m_container.get(), m_componentFactory.get());
    
    if (!ValidateSetup()) {
        std::cerr << "[PlanetFactoryIntegration] Setup validation failed" << std::endl;
        return false;
    }
    
    m_initialized = true;
    
    // Factory integration initialized successfully
    
    return true;
}

void PlanetFactoryIntegration::Shutdown() {
    if (!m_initialized) {
        return;
    }
    
    m_builderFactory.reset();
    
    if (m_factory) {
        m_factory->Shutdown();
        m_factory.reset();
    }
    
    m_componentFactory.reset();
    m_container.reset();
    m_configManager.reset();
    
    m_initialized = false;
}

std::unique_ptr<PlanetInstance> PlanetFactoryIntegration::CreatePlanetFromPreset(const std::string& presetName) {
    if (!m_initialized || !m_factory) {
        std::cerr << "[PlanetFactoryIntegration] Factory not initialized" << std::endl;
        return nullptr;
    }
    
    if (!ValidatePreset(presetName)) {
        std::cerr << "[PlanetFactoryIntegration] Invalid preset: " << presetName << std::endl;
        return nullptr;
    }
    
    auto presetBuilder = std::make_unique<PresetPlanetBuilder>(m_container.get(), 
                                                               m_componentFactory.get(), 
                                                               m_configManager.get());
    
    return presetBuilder->WithQualitySettings(m_defaultLODLevels, m_defaultTextureResolution)
                         .BuildFromPreset(presetName);
}

std::unique_ptr<PlanetInstance> PlanetFactoryIntegration::CreatePlanetFromTemplate(const std::string& templateName) {
    if (!m_initialized || !m_builderFactory) {
        std::cerr << "[PlanetFactoryIntegration] Factory not initialized" << std::endl;
        return nullptr;
    }
    
    return m_builderFactory->CreateFromTemplate(templateName);
}

void PlanetFactoryIntegration::SetDefaultQuality(uint32_t lodLevels, uint32_t textureResolution) {
    m_defaultLODLevels = lodLevels;
    m_defaultTextureResolution = textureResolution;
}

void PlanetFactoryIntegration::SetPerformanceMonitoringEnabled(bool enabled) {
    if (m_factory) {
        m_factory->EnablePerformanceMonitoring(enabled);
    }
}

std::vector<std::string> PlanetFactoryIntegration::GetAvailablePresets() const {
    if (!m_configManager) {
        return {};
    }
    
    return m_configManager->GetPresetNames();
}

std::vector<std::string> PlanetFactoryIntegration::GetAvailableTemplates() const {
    return {"earth_like", "mars_like", "gas_giant", "rocky_moon", "ice_world"};
}

bool PlanetFactoryIntegration::ValidatePreset(const std::string& presetName) const {
    if (!m_configManager) {
        return false;
    }
    
    auto preset = m_configManager->GetPreset(presetName);
    return preset.has_value();
}

PlanetTypeFactory::FactoryStatistics PlanetFactoryIntegration::GetFactoryStatistics() const {
    if (!m_factory) {
        return {};
    }
    
    return m_factory->GetStatistics();
}

std::vector<std::string> PlanetFactoryIntegration::GetDependencyStatus() const {
    std::vector<std::string> status;
    
    if (!m_container) {
        status.push_back("Container: Not created");
        return status;
    }
    
    auto missing = m_container->GetMissingRegistrations();
    if (missing.empty()) {
        status.push_back("Container: All dependencies registered");
    } else {
        status.push_back("Container: Missing dependencies:");
        for (const auto& dep : missing) {
            status.push_back("  - " + dep);
        }
    }
    
    if (m_componentFactory) {
        auto supportedTypes = m_componentFactory->GetSupportedTypes();
        status.push_back("ComponentFactory: " + std::to_string(supportedTypes.size()) + " types registered");
    } else {
        status.push_back("ComponentFactory: Not created");
    }
    
    if (m_factory) {
        status.push_back("PlanetTypeFactory: Initialized");
    } else {
        status.push_back("PlanetTypeFactory: Not initialized");
    }
    
    return status;
}

void PlanetFactoryIntegration::RegisterDefaultComponents() {
    if (!m_componentFactory) {
        return;
    }
    
    // Register default component types
    m_componentFactory->RegisterDefaultComponents();
    
    // TODO: Register additional custom components if needed
}

bool PlanetFactoryIntegration::ValidateSetup() const {
    if (!m_container || !m_componentFactory || !m_factory) {
        return false;
    }
    
    if (!m_container->ValidateRegistrations()) {
        return false;
    }
    
    auto supportedTypes = m_componentFactory->GetSupportedTypes();
    if (supportedTypes.empty()) {
        std::cerr << "[PlanetFactoryIntegration] No component types registered" << std::endl;
        return false;
    }
    
    return true;
}

// SimplePlanetFactory implementation
SimplePlanetFactory::SimplePlanetFactory() = default;

SimplePlanetFactory::~SimplePlanetFactory() = default;

bool SimplePlanetFactory::QuickSetup(void* vulkanRenderSystem, 
                                     std::shared_ptr<Configuration::PlanetaryConfigurationManager> configManager) {
    m_integration = std::make_unique<PlanetFactoryIntegration>();
    
    if (!m_integration->Initialize(vulkanRenderSystem, configManager)) {
        m_integration.reset();
        return false;
    }
    
    // Set reasonable default quality
    SetQuality("medium");
    
    return true;
}

std::unique_ptr<PlanetInstance> SimplePlanetFactory::CreateEarthLikePlanet() {
    if (!m_integration) {
        std::cerr << "[SimplePlanetFactory] Not initialized" << std::endl;
        return nullptr;
    }
    
    return m_integration->CreatePlanetFromTemplate("earth_like");
}

std::unique_ptr<PlanetInstance> SimplePlanetFactory::CreateMarsLikePlanet() {
    if (!m_integration) {
        std::cerr << "[SimplePlanetFactory] Not initialized" << std::endl;
        return nullptr;
    }
    
    return m_integration->CreatePlanetFromTemplate("mars_like");
}

std::unique_ptr<PlanetInstance> SimplePlanetFactory::CreateGasGiant() {
    if (!m_integration) {
        std::cerr << "[SimplePlanetFactory] Not initialized" << std::endl;
        return nullptr;
    }
    
    return m_integration->CreatePlanetFromTemplate("gas_giant");
}

std::unique_ptr<PlanetInstance> SimplePlanetFactory::CreateRockyMoon() {
    if (!m_integration) {
        std::cerr << "[SimplePlanetFactory] Not initialized" << std::endl;
        return nullptr;
    }
    
    return m_integration->CreatePlanetFromTemplate("rocky_moon");
}

std::unique_ptr<PlanetInstance> SimplePlanetFactory::CreateIceWorld() {
    if (!m_integration) {
        std::cerr << "[SimplePlanetFactory] Not initialized" << std::endl;
        return nullptr;
    }
    
    return m_integration->CreatePlanetFromTemplate("ice_world");
}

std::unique_ptr<PlanetInstance> SimplePlanetFactory::CreateFromPreset(const std::string& presetName) {
    if (!m_integration) {
        std::cerr << "[SimplePlanetFactory] Not initialized" << std::endl;
        return nullptr;
    }
    
    return m_integration->CreatePlanetFromPreset(presetName);
}

std::unique_ptr<PlanetInstance> SimplePlanetFactory::CreateCustomPlanet(const std::string& name,
                                                                        float radius,
                                                                        bool hasAtmosphere,
                                                                        bool hasOcean,
                                                                        bool hasRings) {
    if (!m_integration) {
        std::cerr << "[SimplePlanetFactory] Not initialized" << std::endl;
        return nullptr;
    }
    
    // Create custom configuration
    Configuration::PlanetInstanceConfig config;
    config.name = name;
    config.baseRadius = radius;
    config.atmosphere.enabled = hasAtmosphere;
    config.ocean.enabled = hasOcean;
    config.rings.enabled = hasRings;
    
    // Use builder to create planet
    auto builder = m_integration->GetFactory()->CreateBuilder();
    if (!builder) {
        return nullptr;
    }
    
    ApplyQualitySettings(*static_cast<PlanetBuilder*>(builder.get()));
    
    return builder->WithConfiguration(config)
                  .WithTerrain("default")
                  .Build();
}

void SimplePlanetFactory::SetQuality(const std::string& quality) {
    // Use parameter system to apply quality presets
    PlanetGen::Core::Parameters::ParameterSystemAdapter::ApplyQualityPreset(quality);
    
    // Get the updated values from parameter system
    uint32_t terrainQuality = PlanetGen::Core::Parameters::ParameterSystemAdapter::Get<uint32_t>(
        PlanetGen::Core::Parameters::PlanetParams::TERRAIN_QUALITY);
    m_textureResolution = PlanetGen::Core::Parameters::ParameterSystemAdapter::Get<uint32_t>(
        PlanetGen::Core::Parameters::PlanetParams::TEXTURE_RESOLUTION);
    m_lodLevels = PlanetGen::Core::Parameters::ParameterSystemAdapter::Get<uint32_t>(
        PlanetGen::Core::Parameters::PlanetParams::LOD_LEVELS);
    
    if (m_integration) {
        m_integration->SetDefaultQuality(m_lodLevels, m_textureResolution);
    }
}

void SimplePlanetFactory::SetLODLevels(uint32_t levels) {
    m_lodLevels = levels;
    if (m_integration) {
        m_integration->SetDefaultQuality(m_lodLevels, m_textureResolution);
    }
}

void SimplePlanetFactory::SetTextureResolution(uint32_t resolution) {
    m_textureResolution = resolution;
    if (m_integration) {
        m_integration->SetDefaultQuality(m_lodLevels, m_textureResolution);
    }
}

void SimplePlanetFactory::SetCurrentPlanet(std::unique_ptr<PlanetInstance> planet) {
    m_currentPlanet = std::move(planet);
}

void SimplePlanetFactory::UpdateCurrentPlanet(float deltaTime) {
    if (m_currentPlanet) {
        m_currentPlanet->Update(deltaTime);
    }
}

void SimplePlanetFactory::RenderCurrentPlanet(void* renderContext) {
    if (m_currentPlanet) {
        m_currentPlanet->Render(renderContext);
    }
}

std::vector<std::string> SimplePlanetFactory::GetAvailablePresets() const {
    if (!m_integration) {
        return {};
    }
    
    return m_integration->GetAvailablePresets();
}

void SimplePlanetFactory::ApplyQualitySettings(PlanetBuilder& builder) {
    builder.WithLODLevels(m_lodLevels)
           .WithTextureResolution(m_textureResolution);
}

// IntegrationUtils namespace implementation
namespace IntegrationUtils {

Configuration::PlanetInstanceConfig ConvertLegacyData(const LegacyPlanetData& legacy) {
    Configuration::PlanetInstanceConfig config;
    
    config.name = legacy.type + "_converted";
    config.baseRadius = legacy.radius;
    config.gravity = legacy.gravity;
    config.baseColor = legacy.color;
    config.atmosphere.enabled = legacy.hasAtmosphere;
    config.ocean.enabled = legacy.hasOcean;
    config.rings.enabled = legacy.hasRings;
    
    // Set reasonable defaults based on planet type
    if (legacy.type == "earth_like") {
        config.rotationPeriod = 24.0f;
        config.roughness = 0.7f;
        config.metallic = 0.1f;
    } else if (legacy.type == "mars_like") {
        config.rotationPeriod = 24.6f;
        config.roughness = 0.9f;
        config.metallic = 0.0f;
    } else if (legacy.type == "gas_giant") {
        config.rotationPeriod = 10.0f;
        config.roughness = 0.3f;
        config.metallic = 0.1f;
    }
    
    return config;
}

std::unique_ptr<PlanetInstance> CreatePlanetFromLegacy(const LegacyPlanetData& legacy,
                                                      PlanetFactoryIntegration* integration) {
    if (!integration) {
        return nullptr;
    }
    
    auto config = ConvertLegacyData(legacy);
    
    auto builder = integration->GetFactory()->CreateBuilder();
    if (!builder) {
        return nullptr;
    }
    
    return builder->WithConfiguration(config)
                  .WithTerrain("default")
                  .Build();
}

bool MigrateSimplifiedApp(void* vulkanRenderSystem,
                         std::shared_ptr<Configuration::PlanetaryConfigurationManager> configManager,
                         std::unique_ptr<SimplePlanetFactory>& factory) {
    factory = std::make_unique<SimplePlanetFactory>();
    
    if (!factory->QuickSetup(vulkanRenderSystem, configManager)) {
        factory.reset();
        return false;
    }
    
    std::cout << "[IntegrationUtils] Successfully migrated application to use PlanetTypeFactory" << std::endl;
    return true;
}

void OptimizeForMemoryUsage(PlanetFactoryIntegration* integration) {
    if (!integration) {
        return;
    }
    
    // Set conservative quality settings
    integration->SetDefaultQuality(2, 256);
    integration->SetPerformanceMonitoringEnabled(false);
}

void OptimizeForRenderPerformance(PlanetFactoryIntegration* integration) {
    if (!integration) {
        return;
    }
    
    // Set performance-oriented quality settings
    integration->SetDefaultQuality(3, 512);
    integration->SetPerformanceMonitoringEnabled(true);
}

void OptimizeForBuildTime(PlanetFactoryIntegration* integration) {
    if (!integration) {
        return;
    }
    
    // Set fast build settings
    integration->SetDefaultQuality(2, 256);
    integration->SetPerformanceMonitoringEnabled(false);
}

bool ValidateFactorySetup(const PlanetFactoryIntegration* integration) {
    if (!integration) {
        return false;
    }
    
    auto status = integration->GetDependencyStatus();
    for (const auto& line : status) {
        if (line.find("Missing") != std::string::npos || 
            line.find("Not") != std::string::npos) {
            return false;
        }
    }
    
    return true;
}

std::vector<std::string> GetSetupDiagnostics(const PlanetFactoryIntegration* integration) {
    if (!integration) {
        return {"Integration not available"};
    }
    
    return integration->GetDependencyStatus();
}

void LogFactoryStatistics(const PlanetFactoryIntegration* integration) {
    if (!integration) {
        std::cout << "[IntegrationUtils] No integration available for statistics" << std::endl;
        return;
    }
    
    auto stats = integration->GetFactoryStatistics();
    std::cout << "[IntegrationUtils] Factory Statistics:" << std::endl;
    std::cout << "  - Total planets created: " << stats.totalPlanetsCreated << std::endl;
    std::cout << "  - Active planets: " << stats.activePlanets << std::endl;
    std::cout << "  - Total memory allocated: " << stats.totalMemoryAllocated << " bytes" << std::endl;
    
    if (!stats.planetsCreatedByType.empty()) {
        std::cout << "  - Planets by type:" << std::endl;
        for (const auto& [type, count] : stats.planetsCreatedByType) {
            std::cout << "    * " << type << ": " << count << std::endl;
        }
    }
}

} // namespace IntegrationUtils

} // namespace PlanetGen::Generation::Factory
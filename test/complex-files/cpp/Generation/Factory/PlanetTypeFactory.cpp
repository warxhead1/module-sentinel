module;

#include <memory>
#include <string>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <functional>
#include <optional>
#include <algorithm>
#include <iostream>
#include <fstream>
#include <mutex>
#include <variant>

module PlanetTypeFactory;

import GLMModule;
import GenerationTypes;
import PlanetaryConfigurationManager;
import NoiseTypes;
import PlanetBuilder;

namespace PlanetGen::Generation::Factory {

// PlanetInstance::Impl
class PlanetInstance::Impl {
public:
    std::vector<std::string> m_initializationOrder;
    std::mutex m_componentMutex;
    bool m_needsConfigurationUpdate = false;
    
    void DetermineInitializationOrder(const std::unordered_map<std::string, std::shared_ptr<IPlanetComponent>>& components) {
        m_initializationOrder.clear();
        
        // Build dependency graph
        std::unordered_map<std::string, std::vector<std::string>> dependencies;
        std::unordered_set<std::string> allTypes;
        
        for (const auto& [type, component] : components) {
            allTypes.insert(type);
            dependencies[type] = component->GetDependencies();
        }
        
        // Topological sort
        std::unordered_set<std::string> visited;
        std::unordered_set<std::string> inStack;
        
        std::function<void(const std::string&)> dfs = [&](const std::string& type) {
            if (inStack.count(type)) {
                std::cerr << "[PlanetInstance] Circular dependency detected involving: " << type << std::endl;
                return;
            }
            if (visited.count(type)) {
                return;
            }
            
            inStack.insert(type);
            
            if (dependencies.count(type)) {
                for (const auto& dep : dependencies[type]) {
                    if (allTypes.count(dep)) {
                        dfs(dep);
                    }
                }
            }
            
            inStack.erase(type);
            visited.insert(type);
            m_initializationOrder.push_back(type);
        };
        
        for (const auto& type : allTypes) {
            if (!visited.count(type)) {
                dfs(type);
            }
        }
    }
};

// PlanetInstance implementation
PlanetInstance::PlanetInstance(const Configuration::PlanetInstanceConfig& config, IDependencyContainer* container)
    : m_impl(std::make_unique<Impl>())
    , m_config(config)
    , m_container(container) {
}

PlanetInstance::~PlanetInstance() {
    Shutdown();
}

bool PlanetInstance::Initialize() {
    if (m_initialized) {
        return true;
    }
    
    if (!m_container) {
        std::cerr << "[PlanetInstance] No dependency container provided" << std::endl;
        return false;
    }
    
    if (!ValidateComponentDependencies()) {
        std::cerr << "[PlanetInstance] Component dependency validation failed" << std::endl;
        return false;
    }
    
    InitializeComponentsInOrder();
    
    m_initialized = true;
    return true;
}

void PlanetInstance::Update(float deltaTime) {
    if (!m_initialized) {
        return;
    }
    
    std::lock_guard<std::mutex> lock(m_impl->m_componentMutex);
    
    if (m_impl->m_needsConfigurationUpdate) {
        ApplyConfigurationChanges();
        m_impl->m_needsConfigurationUpdate = false;
    }
    
    UpdateComponentsInOrder(deltaTime);
}

void PlanetInstance::Render(void* renderContext) {
    if (!m_initialized) {
        return;
    }
    
    std::lock_guard<std::mutex> lock(m_impl->m_componentMutex);
    RenderComponentsInOrder(renderContext);
}

void PlanetInstance::Shutdown() {
    if (!m_initialized) {
        return;
    }
    
    std::lock_guard<std::mutex> lock(m_impl->m_componentMutex);
    
    // Shutdown components in reverse order
    for (auto it = m_impl->m_initializationOrder.rbegin(); it != m_impl->m_initializationOrder.rend(); ++it) {
        if (auto component = GetComponent(*it)) {
            component->Shutdown();
        }
    }
    
    m_components.clear();
    m_initialized = false;
}

void PlanetInstance::AddComponent(const std::string& type, std::shared_ptr<IPlanetComponent> component) {
    std::lock_guard<std::mutex> lock(m_impl->m_componentMutex);
    m_components[type] = component;
    
    // Recompute initialization order
    m_impl->DetermineInitializationOrder(m_components);
}

void PlanetInstance::RemoveComponent(const std::string& type) {
    std::lock_guard<std::mutex> lock(m_impl->m_componentMutex);
    
    if (auto it = m_components.find(type); it != m_components.end()) {
        it->second->Shutdown();
        m_components.erase(it);
        
        // Recompute initialization order
        m_impl->DetermineInitializationOrder(m_components);
    }
}

std::shared_ptr<IPlanetComponent> PlanetInstance::GetComponent(const std::string& type) const {
    std::lock_guard<std::mutex> lock(m_impl->m_componentMutex);
    
    if (auto it = m_components.find(type); it != m_components.end()) {
        return it->second;
    }
    return nullptr;
}

template<typename T>
std::shared_ptr<T> PlanetInstance::GetComponent() const {
    // This would need RTTI or component type registration to work properly
    // For now, return nullptr and require explicit type-based lookup
    return nullptr;
}

std::shared_ptr<ITerrainComponent> PlanetInstance::GetTerrain() const {
    return std::dynamic_pointer_cast<ITerrainComponent>(GetComponent("terrain"));
}

std::shared_ptr<IAtmosphereComponent> PlanetInstance::GetAtmosphere() const {
    return std::dynamic_pointer_cast<IAtmosphereComponent>(GetComponent("atmosphere"));
}

std::shared_ptr<IOceanComponent> PlanetInstance::GetOcean() const {
    return std::dynamic_pointer_cast<IOceanComponent>(GetComponent("ocean"));
}

std::shared_ptr<IRingSystemComponent> PlanetInstance::GetRings() const {
    return std::dynamic_pointer_cast<IRingSystemComponent>(GetComponent("rings"));
}

void PlanetInstance::UpdateConfiguration(const Configuration::PlanetInstanceConfig& config) {
    m_config = config;
    m_impl->m_needsConfigurationUpdate = true;
}

void PlanetInstance::ApplyConfigurationChanges() {
    // Apply configuration changes to all components
    for (const auto& [type, component] : m_components) {
        component->OnResourcesChanged();
    }
}

void PlanetInstance::UpdateLOD(const vec3& viewerPosition, float viewDistance) {
    if (!m_lodEnabled) {
        return;
    }
    
    if (auto terrain = GetTerrain()) {
        terrain->UpdateLOD(viewerPosition, viewDistance);
    }
}

size_t PlanetInstance::GetTotalMemoryUsage() const {
    std::lock_guard<std::mutex> lock(m_impl->m_componentMutex);
    
    size_t total = 0;
    for (const auto& [type, component] : m_components) {
        total += component->GetMemoryUsage();
    }
    return total;
}

std::unordered_map<std::string, size_t> PlanetInstance::GetComponentMemoryUsage() const {
    std::lock_guard<std::mutex> lock(m_impl->m_componentMutex);
    
    std::unordered_map<std::string, size_t> usage;
    for (const auto& [type, component] : m_components) {
        usage[type] = component->GetMemoryUsage();
    }
    return usage;
}

bool PlanetInstance::SaveState(const std::string& filepath) const {
    // TODO: Implement state serialization
    return false;
}

bool PlanetInstance::LoadState(const std::string& filepath) {
    // TODO: Implement state deserialization
    return false;
}

bool PlanetInstance::ValidateComponentDependencies() const {
    // Check that all component dependencies are satisfied
    for (const auto& [type, component] : m_components) {
        auto dependencies = component->GetDependencies();
        for (const auto& dep : dependencies) {
            if (m_components.find(dep) == m_components.end()) {
                std::cerr << "[PlanetInstance] Component '" << type << "' requires dependency '" << dep << "' which is not available" << std::endl;
                return false;
            }
        }
    }
    return true;
}

void PlanetInstance::InitializeComponentsInOrder() {
    for (const auto& type : m_impl->m_initializationOrder) {
        if (auto component = GetComponent(type)) {
            if (!component->Initialize(m_config, m_container)) {
                std::cerr << "[PlanetInstance] Failed to initialize component: " << type << std::endl;
            }
        }
    }
}

void PlanetInstance::UpdateComponentsInOrder(float deltaTime) {
    for (const auto& type : m_impl->m_initializationOrder) {
        if (auto component = GetComponent(type)) {
            if (component->IsReady()) {
                component->Update(deltaTime);
            }
        }
    }
}

void PlanetInstance::RenderComponentsInOrder(void* renderContext) {
    for (const auto& type : m_impl->m_initializationOrder) {
        if (auto component = GetComponent(type)) {
            if (component->IsReady()) {
                component->Render(renderContext);
            }
        }
    }
}

// DefaultDependencyContainer::Impl
class DefaultDependencyContainer::Impl {
public:
    void* m_vulkanRenderSystem = nullptr;
    std::shared_ptr<Configuration::PlanetaryConfigurationManager> m_configManager;
};

// DefaultDependencyContainer implementation
DefaultDependencyContainer::DefaultDependencyContainer() 
    : m_impl(std::make_unique<Impl>()) {
}

DefaultDependencyContainer::~DefaultDependencyContainer() = default;

void DefaultDependencyContainer::RegisterVulkanRenderSystem(void* renderSystem) {
    m_impl->m_vulkanRenderSystem = renderSystem;
}

void DefaultDependencyContainer::RegisterConfigurationManager(std::shared_ptr<Configuration::PlanetaryConfigurationManager> configManager) {
    m_impl->m_configManager = configManager;
}

void* DefaultDependencyContainer::GetVulkanRenderSystem() const {
    return m_impl->m_vulkanRenderSystem;
}

std::shared_ptr<Configuration::PlanetaryConfigurationManager> DefaultDependencyContainer::GetConfigurationManager() const {
    return m_impl->m_configManager;
}

bool DefaultDependencyContainer::ValidateRegistrations() const {
    return GetMissingRegistrations().empty();
}

std::vector<std::string> DefaultDependencyContainer::GetMissingRegistrations() const {
    std::vector<std::string> missing;
    
    if (!m_impl->m_vulkanRenderSystem) missing.push_back("VulkanRenderSystem");
    if (!m_impl->m_configManager) missing.push_back("ConfigurationManager");
    
    return missing;
}

// DefaultComponentFactory::Impl
class DefaultComponentFactory::Impl {
public:
    std::unordered_map<std::string, std::function<std::shared_ptr<IPlanetComponent>()>> m_factories;
};

// DefaultComponentFactory implementation
DefaultComponentFactory::DefaultComponentFactory() 
    : m_impl(std::make_unique<Impl>()) {
}

DefaultComponentFactory::~DefaultComponentFactory() = default;

std::shared_ptr<IPlanetComponent> DefaultComponentFactory::CreateComponent(const std::string& type) const {
    if (auto it = m_impl->m_factories.find(type); it != m_impl->m_factories.end()) {
        return it->second();
    }
    
    std::cerr << "[DefaultComponentFactory] Unknown component type: " << type << std::endl;
    return nullptr;
}

std::vector<std::string> DefaultComponentFactory::GetSupportedTypes() const {
    std::vector<std::string> types;
    for (const auto& [type, factory] : m_impl->m_factories) {
        types.push_back(type);
    }
    return types;
}

bool DefaultComponentFactory::SupportsType(const std::string& type) const {
    return m_impl->m_factories.find(type) != m_impl->m_factories.end();
}

void DefaultComponentFactory::RegisterComponentType(const std::string& type, 
                                                   std::function<std::shared_ptr<IPlanetComponent>()> factory) {
    m_impl->m_factories[type] = factory;
}

void DefaultComponentFactory::UnregisterComponentType(const std::string& type) {
    m_impl->m_factories.erase(type);
}

void DefaultComponentFactory::RegisterDefaultComponents() {
    // Register default planet component types
    // For now, we'll register placeholder factories that create stub components
    // These will be replaced with actual implementations as they're developed
    
    // Terrain component
    RegisterComponentType("terrain", []() -> std::shared_ptr<IPlanetComponent> {
        // Stub terrain component for now
        class StubTerrainComponent : public ITerrainComponent {
        public:
            bool Initialize(const Configuration::PlanetInstanceConfig& config, IDependencyContainer* container) override {
                return true;
            }
            void Update(float deltaTime) override {}
            void Render(void* renderContext) override {}
            void Shutdown() override {}
            bool IsReady() const override { return true; }
            void OnResourcesChanged() override {}
            size_t GetMemoryUsage() const override { return 0; }
            std::vector<std::string> GetDependencies() const override { return {}; }
            std::string GetComponentType() const override { return "terrain"; }
            
            // ITerrainComponent specific methods
            void RegenerateHeightmap() override {}
            void UpdateLOD(const vec3& viewerPosition, float viewDistance) override {}
            void* GetTerrainMesh() const override { return nullptr; }
            float GetHeightAt(const vec3& position) const override { return 0.0f; }
            vec3 GetNormalAt(const vec3& position) const override { return vec3(0.0f, 1.0f, 0.0f); }
            void SetTessellationLevel(float level) override {}
        };
        return std::make_shared<StubTerrainComponent>();
    });
    
    // Atmosphere component  
    RegisterComponentType("atmosphere", []() -> std::shared_ptr<IPlanetComponent> {
        // Stub atmosphere component for now
        class StubAtmosphereComponent : public IAtmosphereComponent {
        public:
            bool Initialize(const Configuration::PlanetInstanceConfig& config, IDependencyContainer* container) override {
                return true;
            }
            void Update(float deltaTime) override {}
            void Render(void* renderContext) override {}
            void Shutdown() override {}
            bool IsReady() const override { return true; }
            void OnResourcesChanged() override {}
            size_t GetMemoryUsage() const override { return 0; }
            std::vector<std::string> GetDependencies() const override { return {"terrain"}; }
            std::string GetComponentType() const override { return "atmosphere"; }
            
            // IAtmosphereComponent specific methods
            void UpdateAtmosphereParameters(const Configuration::AtmosphereConfig& config) override {}
            vec3 GetScatteringColor(const vec3& viewDirection, const vec3& lightDirection) const override { 
                return vec3(0.5f, 0.7f, 1.0f); 
            }
            float GetAtmosphereDensityAt(float altitude) const override { return 1.0f; }
        };
        return std::make_shared<StubAtmosphereComponent>();
    });
    
    // Ocean component
    RegisterComponentType("ocean", []() -> std::shared_ptr<IPlanetComponent> {
        // Stub ocean component for now
        class StubOceanComponent : public IOceanComponent {
        public:
            bool Initialize(const Configuration::PlanetInstanceConfig& config, IDependencyContainer* container) override {
                return true;
            }
            void Update(float deltaTime) override {}
            void Render(void* renderContext) override {}
            void Shutdown() override {}
            bool IsReady() const override { return true; }
            void OnResourcesChanged() override {}
            size_t GetMemoryUsage() const override { return 0; }
            std::vector<std::string> GetDependencies() const override { return {"terrain"}; }
            std::string GetComponentType() const override { return "ocean"; }
            
            // IOceanComponent specific methods
            void UpdateOceanParameters(const Configuration::OceanConfig& config) override {}
            void SimulateWaves(float time, float windSpeed, const vec3& windDirection) override {}
            float GetWaveHeightAt(const vec2& position, float time) const override { return 0.0f; }
            void* GetOceanMesh() const override { return nullptr; }
        };
        return std::make_shared<StubOceanComponent>();
    });
    
    // Ring system component
    RegisterComponentType("rings", []() -> std::shared_ptr<IPlanetComponent> {
        // Stub ring system component for now
        class StubRingSystemComponent : public IRingSystemComponent {
        public:
            bool Initialize(const Configuration::PlanetInstanceConfig& config, IDependencyContainer* container) override {
                return true;
            }
            void Update(float deltaTime) override {}
            void Render(void* renderContext) override {}
            void Shutdown() override {}
            bool IsReady() const override { return true; }
            void OnResourcesChanged() override {}
            size_t GetMemoryUsage() const override { return 0; }
            std::vector<std::string> GetDependencies() const override { return {}; }
            std::string GetComponentType() const override { return "rings"; }
            
            // IRingSystemComponent specific methods
            void UpdateRingParameters(const Configuration::RingSystemConfig& config) override {}
            void SetRingRotation(float rotation) override {}
            void* GetRingMesh() const override { return nullptr; }
        };
        return std::make_shared<StubRingSystemComponent>();
    });
    
    std::cout << "[DefaultComponentFactory] Registered " << m_impl->m_factories.size() << " default component types" << std::endl;
}

// PlanetTypeFactory::Impl
class PlanetTypeFactory::Impl {
public:
    std::mutex m_statisticsMutex;
};

// PlanetTypeFactory implementation
PlanetTypeFactory::PlanetTypeFactory() 
    : m_impl(std::make_unique<Impl>()) {
}

PlanetTypeFactory::~PlanetTypeFactory() {
    Shutdown();
}

bool PlanetTypeFactory::Initialize(IDependencyContainer* container) {
    if (!container) {
        std::cerr << "[PlanetTypeFactory] No dependency container provided" << std::endl;
        return false;
    }
    
    if (!ValidateContainer()) {
        std::cerr << "[PlanetTypeFactory] Dependency container validation failed" << std::endl;
        return false;
    }
    
    m_container = container;
    
    // Create default component factory if none provided
    if (!m_componentFactory) {
        auto defaultFactory = std::make_unique<DefaultComponentFactory>();
        defaultFactory->RegisterDefaultComponents();
        m_componentFactory = std::move(defaultFactory);
    }
    
    return true;
}

void PlanetTypeFactory::Shutdown() {
    m_container = nullptr;
    m_componentFactory.reset();
}

void PlanetTypeFactory::SetDependencyContainer(IDependencyContainer* container) {
    m_container = container;
}

std::unique_ptr<IPlanetBuilder> PlanetTypeFactory::CreateBuilder() const {
    if (!m_container || !m_componentFactory) {
        return nullptr;
    }
    
    return std::make_unique<PlanetBuilder>(m_container, m_componentFactory.get());
}

std::unique_ptr<IPlanetBuilder> PlanetTypeFactory::CreateBuilderForPreset(const std::string& presetName) const {
    if (!m_container || !m_container->GetConfigurationManager()) {
        return nullptr;
    }
    
    auto preset = m_container->GetConfigurationManager()->GetPreset(presetName);
    if (!preset) {
        std::cerr << "[PlanetTypeFactory] Preset not found: " << presetName << std::endl;
        return nullptr;
    }
    
    // Create builder and configure it with the preset
    auto builder = CreateBuilder();
    if (builder) {
        Configuration::PlanetInstanceConfig instanceConfig;
        // Convert preset to instance config
        // TODO: Implement conversion logic
        builder->WithConfiguration(instanceConfig);
    }
    
    return builder;
}

std::unique_ptr<IPlanetBuilder> PlanetTypeFactory::CreateBuilderForType(const std::string& typeName) const {
    // TODO: Implement type-based builder creation
    return nullptr;
}

std::unique_ptr<PlanetInstance> PlanetTypeFactory::CreatePlanet(const Configuration::PlanetInstanceConfig& config) const {
    if (!m_container) {
        std::cerr << "[PlanetTypeFactory] No dependency container available" << std::endl;
        return nullptr;
    }
    
    if (!Utilities::ValidateConfiguration(config)) {
        std::cerr << "[PlanetTypeFactory] Configuration validation failed" << std::endl;
        return nullptr;
    }
    
    auto planet = std::make_unique<PlanetInstance>(config, m_container);
    
    // Add components based on configuration
    if (!config.atmosphere.enabled == false) { // If atmosphere is enabled
        if (auto atmosphereComponent = m_componentFactory->CreateComponent("atmosphere")) {
            planet->AddComponent("atmosphere", atmosphereComponent);
        }
    }
    
    if (!config.ocean.enabled == false) { // If ocean is enabled
        if (auto oceanComponent = m_componentFactory->CreateComponent("ocean")) {
            planet->AddComponent("ocean", oceanComponent);
        }
    }
    
    if (!config.rings.enabled == false) { // If rings are enabled
        if (auto ringComponent = m_componentFactory->CreateComponent("rings")) {
            planet->AddComponent("rings", ringComponent);
        }
    }
    
    // Always add terrain component
    if (auto terrainComponent = m_componentFactory->CreateComponent("terrain")) {
        planet->AddComponent("terrain", terrainComponent);
    }
    
    if (!planet->Initialize()) {
        std::cerr << "[PlanetTypeFactory] Failed to initialize planet instance" << std::endl;
        return nullptr;
    }
    
    UpdateStatistics("create", "planet");
    return planet;
}

std::unique_ptr<PlanetInstance> PlanetTypeFactory::CreatePlanetFromPreset(const std::string& presetName) const {
    if (!m_container || !m_container->GetConfigurationManager()) {
        return nullptr;
    }
    
    auto preset = m_container->GetConfigurationManager()->GetPreset(presetName);
    if (!preset) {
        return nullptr;
    }
    
    Configuration::PlanetInstanceConfig instanceConfig;
    // TODO: Convert preset to instance config
    
    return CreatePlanet(instanceConfig);
}

std::unique_ptr<PlanetInstance> PlanetTypeFactory::CreatePlanetFromType(const std::string& typeName, 
                                                                       const std::unordered_map<std::string, std::variant<float, vec3, std::string>>& overrides) const {
    // TODO: Implement type-based planet creation with overrides
    return nullptr;
}

void PlanetTypeFactory::SetComponentFactory(std::shared_ptr<IComponentFactory> factory) {
    m_componentFactory = factory;
}

bool PlanetTypeFactory::ValidateTemplate(const Configuration::PlanetInstanceConfig& config) const {
    return GetValidationErrors(config).empty();
}

std::vector<std::string> PlanetTypeFactory::GetValidationErrors(const Configuration::PlanetInstanceConfig& config) const {
    return Utilities::GetConfigurationErrors(config);
}

PlanetTypeFactory::FactoryStatistics PlanetTypeFactory::GetStatistics() const {
    std::lock_guard<std::mutex> lock(m_impl->m_statisticsMutex);
    return m_statistics;
}

void PlanetTypeFactory::ResetStatistics() {
    std::lock_guard<std::mutex> lock(m_impl->m_statisticsMutex);
    m_statistics = FactoryStatistics{};
}

void PlanetTypeFactory::UpdateStatistics(const std::string& operation, const std::string& type) const {
    if (!m_performanceMonitoringEnabled) {
        return;
    }
    
    std::lock_guard<std::mutex> lock(m_impl->m_statisticsMutex);
    
    if (operation == "create") {
        if (type == "planet") {
            m_statistics.totalPlanetsCreated++;
            m_statistics.activePlanets++;
        } else {
            m_statistics.componentsCreatedByType[type]++;
        }
    } else if (operation == "destroy") {
        if (type == "planet") {
            m_statistics.totalPlanetsDestroyed++;
            m_statistics.activePlanets--;
        }
    }
}

bool PlanetTypeFactory::ValidateContainer() const {
    if (!m_container) {
        return false;
    }
    
    // Check if container has required dependencies
    auto missing = static_cast<DefaultDependencyContainer*>(m_container)->GetMissingRegistrations();
    if (!missing.empty()) {
        std::cerr << "[PlanetTypeFactory] Missing required dependencies:";
        for (const auto& dep : missing) {
            std::cerr << " " << dep;
        }
        std::cerr << std::endl;
        return false;
    }
    
    return true;
}

// Utility functions
namespace Utilities {
    
std::unique_ptr<DefaultDependencyContainer> CreateDefaultContainer() {
    return std::make_unique<DefaultDependencyContainer>();
}

std::unique_ptr<DefaultComponentFactory> CreateDefaultComponentFactory() {
    auto factory = std::make_unique<DefaultComponentFactory>();
    factory->RegisterDefaultComponents();
    return factory;
}

std::unique_ptr<PlanetTypeFactory> CreateConfiguredFactory(IDependencyContainer* container) {
    auto factory = std::make_unique<PlanetTypeFactory>();
    if (!factory->Initialize(container)) {
        return nullptr;
    }
    return factory;
}

Configuration::PlanetInstanceConfig CreateInstanceFromPreset(const std::string& presetName, 
                                                           const Configuration::PlanetaryConfigurationManager& configManager) {
    Configuration::PlanetInstanceConfig instanceConfig;
    
    auto preset = configManager.GetPreset(presetName);
    if (preset) {
        // TODO: Convert preset to instance config
    }
    
    return instanceConfig;
}

Configuration::PlanetInstanceConfig CreateInstanceFromType(const std::string& typeName, 
                                                         const Configuration::PlanetaryConfigurationManager& configManager,
                                                         const std::unordered_map<std::string, std::variant<float, vec3, std::string>>& overrides) {
    Configuration::PlanetInstanceConfig instanceConfig;
    
    // TODO: Implement type-based instance creation with overrides
    
    return instanceConfig;
}

size_t EstimateMemoryUsage(const Configuration::PlanetInstanceConfig& config) {
    // TODO: Implement memory estimation based on configuration
    return 0;
}

uint32_t EstimateRenderComplexity(const Configuration::PlanetInstanceConfig& config) {
    // TODO: Implement render complexity estimation
    return 0;
}

bool ValidateConfiguration(const Configuration::PlanetInstanceConfig& config) {
    return GetConfigurationErrors(config).empty();
}

std::vector<std::string> GetConfigurationErrors(const Configuration::PlanetInstanceConfig& config) {
    std::vector<std::string> errors;
    
    // TODO: Implement configuration validation
    // Check for required fields, valid ranges, etc.
    
    return errors;
}

} // namespace Utilities

} // namespace PlanetGen::Generation::Factory
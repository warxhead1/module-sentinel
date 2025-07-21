module;

#include <memory>
#include <string>
#include <vector>
#include <unordered_map>
#include <functional>
#include <optional>
#include <variant>

export module PlanetTypeFactory;

import GLMModule;
import GenerationTypes;
import PlanetaryConfigurationManager;
import NoiseTypes;

export namespace PlanetGen::Generation::Factory {

// Forward declarations
class IPlanetBuilder;
class IPlanetComponent;
class PlanetInstance;

// Forward declarations for rendering system integration
namespace Rendering { class VulkanRenderSystem; }

// Dependency injection container interface
class IDependencyContainer {
public:
    virtual ~IDependencyContainer() = default;
    
    // Core system dependencies
    virtual void RegisterVulkanRenderSystem(void* renderSystem) = 0;
    virtual void RegisterConfigurationManager(std::shared_ptr<Configuration::PlanetaryConfigurationManager> configManager) = 0;
    
    // Retrieval methods
    virtual void* GetVulkanRenderSystem() const = 0;
    virtual std::shared_ptr<Configuration::PlanetaryConfigurationManager> GetConfigurationManager() const = 0;
    
    // Validation
    virtual bool ValidateRegistrations() const = 0;
    virtual std::vector<std::string> GetMissingRegistrations() const = 0;
};

// Planet component interface - represents a single aspect of a planet (terrain, atmosphere, etc.)
class IPlanetComponent {
public:
    virtual ~IPlanetComponent() = default;
    
    // Component lifecycle
    virtual bool Initialize(const Configuration::PlanetInstanceConfig& config, IDependencyContainer* container) = 0;
    virtual void Update(float deltaTime) = 0;
    virtual void Render(void* renderContext) = 0;
    virtual void Shutdown() = 0;
    
    // Component metadata
    virtual std::string GetComponentType() const = 0;
    virtual std::vector<std::string> GetDependencies() const = 0;
    virtual bool IsReady() const = 0;
    
    // Resource management
    virtual void OnResourcesChanged() = 0;
    virtual size_t GetMemoryUsage() const = 0;
};

// Terrain component interface
class ITerrainComponent : public IPlanetComponent {
public:
    virtual void RegenerateHeightmap() = 0;
    virtual void UpdateLOD(const vec3& viewerPosition, float viewDistance) = 0;
    virtual void* GetTerrainMesh() const = 0;
    virtual float GetHeightAt(const vec3& position) const = 0;
    virtual vec3 GetNormalAt(const vec3& position) const = 0;
    virtual void SetTessellationLevel(float level) = 0;
};

// Atmosphere component interface
class IAtmosphereComponent : public IPlanetComponent {
public:
    virtual void UpdateAtmosphereParameters(const Configuration::AtmosphereConfig& config) = 0;
    virtual vec3 GetScatteringColor(const vec3& viewDirection, const vec3& lightDirection) const = 0;
    virtual float GetAtmosphereDensityAt(float altitude) const = 0;
};

// Ocean component interface
class IOceanComponent : public IPlanetComponent {
public:
    virtual void UpdateOceanParameters(const Configuration::OceanConfig& config) = 0;
    virtual void SimulateWaves(float time, float windSpeed, const vec3& windDirection) = 0;
    virtual float GetWaveHeightAt(const vec2& position, float time) const = 0;
    virtual void* GetOceanMesh() const = 0;
};

// Ring system component interface
class IRingSystemComponent : public IPlanetComponent {
public:
    virtual void UpdateRingParameters(const Configuration::RingSystemConfig& config) = 0;
    virtual void SetRingRotation(float rotation) = 0;
    virtual void* GetRingMesh() const = 0;
};

// Planet builder interface - constructs planet instances
class IPlanetBuilder {
public:
    virtual ~IPlanetBuilder() = default;
    
    // Builder configuration
    virtual IPlanetBuilder& WithConfiguration(const Configuration::PlanetInstanceConfig& config) = 0;
    virtual IPlanetBuilder& WithDependencyContainer(IDependencyContainer* container) = 0;
    virtual IPlanetBuilder& WithComponent(const std::string& type, std::shared_ptr<IPlanetComponent> component) = 0;
    
    // Component factory methods
    virtual IPlanetBuilder& WithTerrain(const std::string& terrainType = "default") = 0;
    virtual IPlanetBuilder& WithAtmosphere(const std::string& atmosphereType = "default") = 0;
    virtual IPlanetBuilder& WithOcean(const std::string& oceanType = "default") = 0;
    virtual IPlanetBuilder& WithRings(const std::string& ringType = "default") = 0;
    virtual IPlanetBuilder& WithBiomes(const std::vector<std::string>& biomeTypes) = 0;
    
    // Performance and quality settings
    virtual IPlanetBuilder& WithLODLevels(uint32_t levels) = 0;
    virtual IPlanetBuilder& WithTessellationMode(const std::string& mode) = 0;
    virtual IPlanetBuilder& WithTextureResolution(uint32_t resolution) = 0;
    
    // Build methods
    virtual std::unique_ptr<PlanetInstance> Build() = 0;
    virtual bool Validate() const = 0;
    virtual std::vector<std::string> GetValidationErrors() const = 0;
    
    // Reset builder state
    virtual void Reset() = 0;
};

// Complete planet instance - coordinates all components
class PlanetInstance {
public:
    PlanetInstance(const Configuration::PlanetInstanceConfig& config, IDependencyContainer* container);
    ~PlanetInstance();
    
    // Lifecycle management
    bool Initialize();
    void Update(float deltaTime);
    void Render(void* renderContext);
    void Shutdown();
    
    // Component management
    void AddComponent(const std::string& type, std::shared_ptr<IPlanetComponent> component);
    void RemoveComponent(const std::string& type);
    std::shared_ptr<IPlanetComponent> GetComponent(const std::string& type) const;
    template<typename T>
    std::shared_ptr<T> GetComponent() const;
    
    // Specialized component accessors
    std::shared_ptr<ITerrainComponent> GetTerrain() const;
    std::shared_ptr<IAtmosphereComponent> GetAtmosphere() const;
    std::shared_ptr<IOceanComponent> GetOcean() const;
    std::shared_ptr<IRingSystemComponent> GetRings() const;
    
    // Configuration and state
    const Configuration::PlanetInstanceConfig& GetConfiguration() const { return m_config; }
    void UpdateConfiguration(const Configuration::PlanetInstanceConfig& config);
    void ApplyConfigurationChanges();
    
    // Performance and diagnostics
    void SetLODEnabled(bool enabled) { m_lodEnabled = enabled; }
    bool IsLODEnabled() const { return m_lodEnabled; }
    void UpdateLOD(const vec3& viewerPosition, float viewDistance);
    
    size_t GetTotalMemoryUsage() const;
    std::unordered_map<std::string, size_t> GetComponentMemoryUsage() const;
    
    // Physics integration
    void SetPhysicsEnabled(bool enabled) { m_physicsEnabled = enabled; }
    bool IsPhysicsEnabled() const { return m_physicsEnabled; }
    
    // Serialization support
    bool SaveState(const std::string& filepath) const;
    bool LoadState(const std::string& filepath);
    
private:
    class Impl;
    std::unique_ptr<Impl> m_impl;
    
    Configuration::PlanetInstanceConfig m_config;
    IDependencyContainer* m_container;
    
    std::unordered_map<std::string, std::shared_ptr<IPlanetComponent>> m_components;
    bool m_initialized = false;
    bool m_lodEnabled = true;
    bool m_physicsEnabled = false;
    
    // Internal methods
    bool ValidateComponentDependencies() const;
    void InitializeComponentsInOrder();
    void UpdateComponentsInOrder(float deltaTime);
    void RenderComponentsInOrder(void* renderContext);
};

// Component factory interface
class IComponentFactory {
public:
    virtual ~IComponentFactory() = default;
    
    virtual std::shared_ptr<IPlanetComponent> CreateComponent(const std::string& type) const = 0;
    virtual std::vector<std::string> GetSupportedTypes() const = 0;
    virtual bool SupportsType(const std::string& type) const = 0;
    
    // Component registration
    virtual void RegisterComponentType(const std::string& type, 
                                     std::function<std::shared_ptr<IPlanetComponent>()> factory) = 0;
    virtual void UnregisterComponentType(const std::string& type) = 0;
};

// Main planet type factory
class PlanetTypeFactory {
public:
    PlanetTypeFactory();
    ~PlanetTypeFactory();
    
    // Factory initialization
    bool Initialize(IDependencyContainer* container);
    void Shutdown();
    
    // Dependency container management
    void SetDependencyContainer(IDependencyContainer* container);
    IDependencyContainer* GetDependencyContainer() const { return m_container; }
    
    // Builder creation
    std::unique_ptr<IPlanetBuilder> CreateBuilder() const;
    std::unique_ptr<IPlanetBuilder> CreateBuilderForPreset(const std::string& presetName) const;
    std::unique_ptr<IPlanetBuilder> CreateBuilderForType(const std::string& typeName) const;
    
    // Planet creation convenience methods
    std::unique_ptr<PlanetInstance> CreatePlanet(const Configuration::PlanetInstanceConfig& config) const;
    std::unique_ptr<PlanetInstance> CreatePlanetFromPreset(const std::string& presetName) const;
    std::unique_ptr<PlanetInstance> CreatePlanetFromType(const std::string& typeName, 
                                                        const std::unordered_map<std::string, std::variant<float, vec3, std::string>>& overrides = {}) const;
    
    // Component factory management
    void SetComponentFactory(std::shared_ptr<IComponentFactory> factory);
    std::shared_ptr<IComponentFactory> GetComponentFactory() const { return m_componentFactory; }
    
    // Template validation and diagnostics
    bool ValidateTemplate(const Configuration::PlanetInstanceConfig& config) const;
    std::vector<std::string> GetValidationErrors(const Configuration::PlanetInstanceConfig& config) const;
    
    // Performance monitoring
    void EnablePerformanceMonitoring(bool enabled) { m_performanceMonitoringEnabled = enabled; }
    bool IsPerformanceMonitoringEnabled() const { return m_performanceMonitoringEnabled; }
    
    // Factory statistics
    struct FactoryStatistics {
        uint32_t totalPlanetsCreated = 0;
        uint32_t totalPlanetsDestroyed = 0;
        uint32_t activePlanets = 0;
        size_t totalMemoryAllocated = 0;
        std::unordered_map<std::string, uint32_t> planetsCreatedByType;
        std::unordered_map<std::string, uint32_t> componentsCreatedByType;
    };
    
    FactoryStatistics GetStatistics() const;
    void ResetStatistics();
    
private:
    class Impl;
    std::unique_ptr<Impl> m_impl;
    
    IDependencyContainer* m_container = nullptr;
    std::shared_ptr<IComponentFactory> m_componentFactory;
    bool m_performanceMonitoringEnabled = false;
    
    mutable FactoryStatistics m_statistics;
    
    // Internal helper methods
    void UpdateStatistics(const std::string& operation, const std::string& type) const;
    bool ValidateContainer() const;
};

// Default dependency container implementation
class DefaultDependencyContainer : public IDependencyContainer {
public:
    DefaultDependencyContainer();
    ~DefaultDependencyContainer();
    
    // Registration methods
    void RegisterVulkanRenderSystem(void* renderSystem) override;
    void RegisterConfigurationManager(std::shared_ptr<Configuration::PlanetaryConfigurationManager> configManager) override;
    
    // Retrieval methods
    void* GetVulkanRenderSystem() const override;
    std::shared_ptr<Configuration::PlanetaryConfigurationManager> GetConfigurationManager() const override;
    
    // Validation and diagnostics
    bool ValidateRegistrations() const override;
    std::vector<std::string> GetMissingRegistrations() const override;
    
private:
    class Impl;
    std::unique_ptr<Impl> m_impl;
};

// Default component factory implementation
class DefaultComponentFactory : public IComponentFactory {
public:
    DefaultComponentFactory();
    ~DefaultComponentFactory();
    
    std::shared_ptr<IPlanetComponent> CreateComponent(const std::string& type) const override;
    std::vector<std::string> GetSupportedTypes() const override;
    bool SupportsType(const std::string& type) const override;
    
    void RegisterComponentType(const std::string& type, 
                             std::function<std::shared_ptr<IPlanetComponent>()> factory) override;
    void UnregisterComponentType(const std::string& type) override;
    
    // Register default component types
    void RegisterDefaultComponents();
    
private:
    class Impl;
    std::unique_ptr<Impl> m_impl;
};

// Utility functions
namespace Utilities {
    // Factory setup helpers
    std::unique_ptr<DefaultDependencyContainer> CreateDefaultContainer();
    std::unique_ptr<DefaultComponentFactory> CreateDefaultComponentFactory();
    std::unique_ptr<PlanetTypeFactory> CreateConfiguredFactory(IDependencyContainer* container);
    
    // Configuration helpers
    Configuration::PlanetInstanceConfig CreateInstanceFromPreset(const std::string& presetName, 
                                                               const Configuration::PlanetaryConfigurationManager& configManager);
    Configuration::PlanetInstanceConfig CreateInstanceFromType(const std::string& typeName, 
                                                             const Configuration::PlanetaryConfigurationManager& configManager,
                                                             const std::unordered_map<std::string, std::variant<float, vec3, std::string>>& overrides = {});
    
    // Performance helpers
    size_t EstimateMemoryUsage(const Configuration::PlanetInstanceConfig& config);
    uint32_t EstimateRenderComplexity(const Configuration::PlanetInstanceConfig& config);
    
    // Validation helpers
    bool ValidateConfiguration(const Configuration::PlanetInstanceConfig& config);
    std::vector<std::string> GetConfigurationErrors(const Configuration::PlanetInstanceConfig& config);
}

} // namespace PlanetGen::Generation::Factory
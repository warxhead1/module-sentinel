module;

#include <memory>
#include <string>
#include <vector>
#include <unordered_map>
#include <variant>

export module PlanetBuilder;

import GLMModule;
import PlanetTypeFactory;
import PlanetaryConfigurationManager;

export namespace PlanetGen::Generation::Factory {

// Planet builder implementation for fluent construction
class PlanetBuilder : public IPlanetBuilder {
public:
    PlanetBuilder(IDependencyContainer* container, IComponentFactory* componentFactory);
    ~PlanetBuilder();

    // Builder configuration
    IPlanetBuilder& WithConfiguration(const Configuration::PlanetInstanceConfig& config) override;
    IPlanetBuilder& WithDependencyContainer(IDependencyContainer* container) override;
    IPlanetBuilder& WithComponent(const std::string& type, std::shared_ptr<IPlanetComponent> component) override;
    
    // Component factory methods
    IPlanetBuilder& WithTerrain(const std::string& terrainType = "default") override;
    IPlanetBuilder& WithAtmosphere(const std::string& atmosphereType = "default") override;
    IPlanetBuilder& WithOcean(const std::string& oceanType = "default") override;
    IPlanetBuilder& WithRings(const std::string& ringType = "default") override;
    IPlanetBuilder& WithBiomes(const std::vector<std::string>& biomeTypes) override;
    
    // Performance and quality settings
    IPlanetBuilder& WithLODLevels(uint32_t levels) override;
    IPlanetBuilder& WithTessellationMode(const std::string& mode) override;
    IPlanetBuilder& WithTextureResolution(uint32_t resolution) override;
    
    // Build methods
    std::unique_ptr<PlanetInstance> Build() override;
    bool Validate() const override;
    std::vector<std::string> GetValidationErrors() const override;
    
    // Reset builder state
    void Reset() override;

private:
    class Impl;
    std::unique_ptr<Impl> m_impl;
    
    // Builder state
    Configuration::PlanetInstanceConfig m_config;
    IDependencyContainer* m_container;
    IComponentFactory* m_componentFactory;
    
    std::unordered_map<std::string, std::shared_ptr<IPlanetComponent>> m_components;
    std::unordered_map<std::string, std::string> m_componentTypes;
    
    // Quality settings
    uint32_t m_lodLevels = 4;
    std::string m_tessellationMode = "adaptive";
    uint32_t m_textureResolution = 1024;
    
    // Internal helper methods
    void CreateComponentFromType(const std::string& componentName, const std::string& componentType);
    bool ValidateComponentConfiguration(const std::string& type) const;
    void ApplyConfigurationToComponents();
    std::shared_ptr<IPlanetComponent> CreateComponent(const std::string& type);
};

// Preset-based builder for common planet configurations
class PresetPlanetBuilder {
public:
    PresetPlanetBuilder(IDependencyContainer* container, 
                       IComponentFactory* componentFactory,
                       Configuration::PlanetaryConfigurationManager* configManager);
    ~PresetPlanetBuilder();
    
    // Preset-based construction
    std::unique_ptr<PlanetInstance> BuildFromPreset(const std::string& presetName);
    std::unique_ptr<PlanetInstance> BuildFromType(const std::string& typeName,
                                                 const std::unordered_map<std::string, std::variant<float, vec3, std::string>>& overrides = {});
    
    // Configuration customization
    PresetPlanetBuilder& WithOverrides(const std::unordered_map<std::string, std::variant<float, vec3, std::string>>& overrides);
    PresetPlanetBuilder& WithQualitySettings(uint32_t lodLevels, uint32_t textureResolution);
    PresetPlanetBuilder& WithPhysicsEnabled(bool enabled);
    
    // Validation
    bool ValidatePreset(const std::string& presetName) const;
    std::vector<std::string> GetValidationErrors(const std::string& presetName) const;
    
private:
    IDependencyContainer* m_container;
    IComponentFactory* m_componentFactory;
    Configuration::PlanetaryConfigurationManager* m_configManager;
    
    std::unordered_map<std::string, std::variant<float, vec3, std::string>> m_overrides;
    uint32_t m_lodLevels = 4;
    uint32_t m_textureResolution = 1024;
    bool m_physicsEnabled = false;
    
    // Helper methods
    Configuration::PlanetInstanceConfig CreateInstanceConfig(const std::string& presetName) const;
    Configuration::PlanetInstanceConfig CreateInstanceConfigFromType(const std::string& typeName) const;
    void ApplyOverridesToConfig(Configuration::PlanetInstanceConfig& config) const;
};

// Component specifications for different planet types
namespace ComponentSpecs {
    
    struct TerrainComponentSpec {
        std::string heightmapGenerator = "unified";
        uint32_t heightmapResolution = 1024;
        float maxHeightScale = 25000.0f;
        bool useGPUGeneration = true;
        std::vector<std::string> noiseLayers;
    };
    
    struct AtmosphereComponentSpec {
        bool enabled = false;
        float density = 1.0f;
        float scaleHeight = 8.0f;
        vec3 scatteringCoefficients = vec3(0.058f, 0.135f, 0.331f);
        float planetRadius = 6371.0f;
        float atmosphereRadius = 6471.0f;
    };
    
    struct OceanComponentSpec {
        bool enabled = false;
        float level = 0.0f;
        vec3 shallowColor = vec3(0.2f, 0.8f, 0.9f);
        vec3 deepColor = vec3(0.0f, 0.2f, 0.6f);
        float waveScale = 0.5f;
        float waveSpeed = 1.0f;
    };
    
    struct RingSystemComponentSpec {
        bool enabled = false;
        float innerRadius = 1.2f;
        float outerRadius = 2.5f;
        vec3 color = vec3(0.8f, 0.7f, 0.6f);
        float opacity = 0.8f;
        float rotation = 0.0f;
        vec3 normal = vec3(0.0f, 1.0f, 0.0f);
    };
}

// Factory for creating builders with different configurations
class BuilderFactory {
public:
    BuilderFactory(IDependencyContainer* container, IComponentFactory* componentFactory);
    ~BuilderFactory();
    
    // Builder creation methods
    std::unique_ptr<PlanetBuilder> CreateBuilder();
    std::unique_ptr<PresetPlanetBuilder> CreatePresetBuilder(Configuration::PlanetaryConfigurationManager* configManager);
    
    // Convenience methods for common planet types
    std::unique_ptr<PlanetInstance> CreateEarthLikePlanet();
    std::unique_ptr<PlanetInstance> CreateMarsLikePlanet();
    std::unique_ptr<PlanetInstance> CreateGasGiant();
    std::unique_ptr<PlanetInstance> CreateRockyMoon();
    std::unique_ptr<PlanetInstance> CreateIceWorld();
    
    // Template-based creation
    std::unique_ptr<PlanetInstance> CreateFromTemplate(const std::string& templateName);
    
private:
    IDependencyContainer* m_container;
    IComponentFactory* m_componentFactory;
    
    // Template creation helpers
    Configuration::PlanetInstanceConfig CreateEarthLikeTemplate();
    Configuration::PlanetInstanceConfig CreateMarsLikeTemplate();
    Configuration::PlanetInstanceConfig CreateGasGiantTemplate();
    Configuration::PlanetInstanceConfig CreateRockyMoonTemplate();
    Configuration::PlanetInstanceConfig CreateIceWorldTemplate();
};

} // namespace PlanetGen::Generation::Factory
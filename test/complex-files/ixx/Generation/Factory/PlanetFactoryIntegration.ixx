module;

#include <memory>
#include <string>
#include <vector>

export module PlanetFactoryIntegration;

import GLMModule;
import PlanetTypeFactory;
import PlanetBuilder;
import PlanetaryConfigurationManager;
import PlanetaryGenerator;
import AdvancedHeightGenerator;
import ContinentalFeatureSystem;
import INoiseProvider;
import IResourceManager;

export namespace PlanetGen::Generation::Factory {

// Integration helper for applications using PlanetTypeFactory
class PlanetFactoryIntegration {
public:
    PlanetFactoryIntegration();
    ~PlanetFactoryIntegration();
    
    // Initialization
    bool Initialize(void* vulkanRenderSystem, 
                   std::shared_ptr<Configuration::PlanetaryConfigurationManager> configManager);
    void Shutdown();
    
    // Factory access
    PlanetTypeFactory* GetFactory() const { return m_factory.get(); }
    IDependencyContainer* GetContainer() const { return m_container.get(); }
    
    // Convenience methods for common operations
    std::unique_ptr<PlanetInstance> CreatePlanetFromPreset(const std::string& presetName);
    std::unique_ptr<PlanetInstance> CreatePlanetFromTemplate(const std::string& templateName);
    
    // Quality and performance settings
    void SetDefaultQuality(uint32_t lodLevels, uint32_t textureResolution);
    void SetPerformanceMonitoringEnabled(bool enabled);
    
    // Configuration management
    std::vector<std::string> GetAvailablePresets() const;
    std::vector<std::string> GetAvailableTemplates() const;
    bool ValidatePreset(const std::string& presetName) const;
    
    // Statistics and diagnostics
    PlanetTypeFactory::FactoryStatistics GetFactoryStatistics() const;
    std::vector<std::string> GetDependencyStatus() const;
    
private:
    std::unique_ptr<DefaultDependencyContainer> m_container;
    std::unique_ptr<DefaultComponentFactory> m_componentFactory;
    std::unique_ptr<PlanetTypeFactory> m_factory;
    std::unique_ptr<BuilderFactory> m_builderFactory;
    
    std::shared_ptr<Configuration::PlanetaryConfigurationManager> m_configManager;
    
    // Quality settings
    uint32_t m_defaultLODLevels = 4;
    uint32_t m_defaultTextureResolution = 1024;
    
    bool m_initialized = false;
    
    // Helper methods
    void RegisterDefaultComponents();
    bool ValidateSetup() const;
};

// Simplified interface for applications that just want to create planets
class SimplePlanetFactory {
public:
    SimplePlanetFactory();
    ~SimplePlanetFactory();
    
    // Quick setup for applications
    bool QuickSetup(void* vulkanRenderSystem, 
                   std::shared_ptr<Configuration::PlanetaryConfigurationManager> configManager);
    
    // Simple planet creation methods
    std::unique_ptr<PlanetInstance> CreateEarthLikePlanet();
    std::unique_ptr<PlanetInstance> CreateMarsLikePlanet();
    std::unique_ptr<PlanetInstance> CreateGasGiant();
    std::unique_ptr<PlanetInstance> CreateRockyMoon();
    std::unique_ptr<PlanetInstance> CreateIceWorld();
    
    // Preset-based creation
    std::unique_ptr<PlanetInstance> CreateFromPreset(const std::string& presetName);
    
    // Custom planet creation with basic parameters
    std::unique_ptr<PlanetInstance> CreateCustomPlanet(const std::string& name,
                                                      float radius,
                                                      bool hasAtmosphere = false,
                                                      bool hasOcean = false,
                                                      bool hasRings = false);
    
    // Quality settings
    void SetQuality(const std::string& quality); // "low", "medium", "high", "ultra"
    void SetLODLevels(uint32_t levels);
    void SetTextureResolution(uint32_t resolution);
    
    // Current planet management
    PlanetInstance* GetCurrentPlanet() const { return m_currentPlanet.get(); }
    void SetCurrentPlanet(std::unique_ptr<PlanetInstance> planet);
    void UpdateCurrentPlanet(float deltaTime);
    void RenderCurrentPlanet(void* renderContext);
    
    // Diagnostics
    bool IsInitialized() const { return m_integration && m_integration->GetFactory(); }
    std::vector<std::string> GetAvailablePresets() const;
    
private:
    std::unique_ptr<PlanetFactoryIntegration> m_integration;
    std::unique_ptr<PlanetInstance> m_currentPlanet;
    
    // Quality settings
    uint32_t m_lodLevels = 4;
    uint32_t m_textureResolution = 1024;
    
    // Helper methods
    void ApplyQualitySettings(PlanetBuilder& builder);
};

// Integration utilities for existing applications
namespace IntegrationUtils {
    
    // Helper for migrating from hardcoded planet generation to factory-based
    struct LegacyPlanetData {
        std::string type;
        float radius;
        float gravity;
        vec3 color;
        bool hasAtmosphere;
        bool hasOcean;
        bool hasRings;
    };
    
    // Convert legacy planet data to modern configuration
    Configuration::PlanetInstanceConfig ConvertLegacyData(const LegacyPlanetData& legacy);
    
    // Create planet instance from legacy data
    std::unique_ptr<PlanetInstance> CreatePlanetFromLegacy(const LegacyPlanetData& legacy,
                                                          PlanetFactoryIntegration* integration);
    
    // Migration helpers for existing test applications
    bool MigrateSimplifiedApp(void* vulkanRenderSystem,
                             std::shared_ptr<Configuration::PlanetaryConfigurationManager> configManager,
                             std::unique_ptr<SimplePlanetFactory>& factory);
    
    // Performance optimization helpers
    void OptimizeForMemoryUsage(PlanetFactoryIntegration* integration);
    void OptimizeForRenderPerformance(PlanetFactoryIntegration* integration);
    void OptimizeForBuildTime(PlanetFactoryIntegration* integration);
    
    // Debugging and validation helpers
    bool ValidateFactorySetup(const PlanetFactoryIntegration* integration);
    std::vector<std::string> GetSetupDiagnostics(const PlanetFactoryIntegration* integration);
    void LogFactoryStatistics(const PlanetFactoryIntegration* integration);
}

    // Pure planetary object factory interface - uses dependency injection
    class IPlanetaryFactory {
    public:
        virtual ~IPlanetaryFactory() = default;

        // Planetary Generator Creation (with injected dependencies)
        virtual std::unique_ptr<PlanetGen::Generation::PlanetaryGenerator> CreatePlanetaryGenerator(
            PlanetGen::Generation::INoiseProvider& noiseProvider,
            PlanetGen::Rendering::IResourceManager& resourceManager) = 0;
        
        virtual std::unique_ptr<PlanetGen::Generation::PlanetaryGenerator> CreatePlanetaryGenerator(
            const PlanetGen::Generation::Configuration::PlanetaryPreset& preset,
            PlanetGen::Generation::INoiseProvider& noiseProvider,
            PlanetGen::Rendering::IResourceManager& resourceManager) = 0;
        
        // Heightmap Generator Creation
        virtual std::unique_ptr<PlanetGen::Generation::AdvancedHeightGenerator> CreateHeightGenerator(
            PlanetGen::Generation::INoiseProvider& noiseProvider) = 0;
        
        // Continental Feature System Creation
        virtual std::unique_ptr<PlanetGen::Generation::Features::ContinentalFeatureComposer> CreateContinentalSystem(
            PlanetGen::Generation::INoiseProvider& noiseProvider) = 0;
        
        // Factory Configuration
        virtual void SetDefaultPreset(const PlanetGen::Generation::Configuration::PlanetaryPreset& preset) = 0;
        virtual PlanetGen::Generation::Configuration::PlanetaryPreset GetDefaultPreset() const = 0;
        virtual std::vector<PlanetGen::Generation::Configuration::PlanetaryPreset> GetAvailablePresets() const = 0;
        
        // NO direct resource management!
        // NO VulkanResourceManager creation!
        // Uses dependency injection for all dependencies!
    };

    // Pure planetary generation service - implements IPlanetaryFactory
    class PlanetaryGenerationService : public IPlanetaryFactory {
    public:
        PlanetaryGenerationService(PlanetGen::Generation::INoiseProvider* noiseProvider, PlanetGen::Rendering::IResourceManager* resourceManager)
            : m_noiseProvider(noiseProvider), m_resourceManager(resourceManager) {}
        
        ~PlanetaryGenerationService() override = default;
        
        // IPlanetaryFactory implementation
        std::unique_ptr<PlanetGen::Generation::PlanetaryGenerator> CreatePlanetaryGenerator(
            PlanetGen::Generation::INoiseProvider& noiseProvider,
            PlanetGen::Rendering::IResourceManager& resourceManager) override {
            
            return std::make_unique<PlanetGen::Generation::PlanetaryGenerator>(noiseProvider, resourceManager);
        }
        
        std::unique_ptr<PlanetGen::Generation::PlanetaryGenerator> CreatePlanetaryGenerator(
            const PlanetGen::Generation::Configuration::PlanetaryPreset& preset,
            PlanetGen::Generation::INoiseProvider& noiseProvider,
            PlanetGen::Rendering::IResourceManager& resourceManager) override {
            
            auto generator = std::make_unique<PlanetGen::Generation::PlanetaryGenerator>(noiseProvider, resourceManager);
            generator->SetPreset(preset);
            return generator;
        }
        
        std::unique_ptr<PlanetGen::Generation::AdvancedHeightGenerator> CreateHeightGenerator(
            PlanetGen::Generation::INoiseProvider& noiseProvider) override {
            
            // Create height generator with injected noise provider
            auto heightGen = std::make_unique<PlanetGen::Generation::AdvancedHeightGenerator>();
            // Configure with noise provider
            return heightGen;
        }
        
        std::unique_ptr<PlanetGen::Generation::Features::ContinentalFeatureComposer> CreateContinentalSystem(
            PlanetGen::Generation::INoiseProvider& noiseProvider) override {
            
            // Create continental system with injected noise provider
            auto continentalSystem = std::make_unique<PlanetGen::Generation::Features::ContinentalFeatureComposer>();
            // Configure with noise provider
            return continentalSystem;
        }
        
        void SetDefaultPreset(const PlanetGen::Generation::Configuration::PlanetaryPreset& preset) override {
            m_defaultPreset = preset;
        }
        
        PlanetGen::Generation::Configuration::PlanetaryPreset GetDefaultPreset() const override {
            return m_defaultPreset;
        }
        
        std::vector<PlanetGen::Generation::Configuration::PlanetaryPreset> GetAvailablePresets() const override {
            using namespace PlanetGen::Generation::Configuration;
            return {
                Presets::CreateEarthLikePreset(),
                Presets::CreateMarsLikePreset(), 
                Presets::CreateOceanWorldPreset(),
                Presets::CreateDesertWorldPreset(),
                Presets::CreateIceWorldPreset(),
                Presets::CreateVolcanicWorldPreset(),
                Presets::CreateGasGiantPreset()
            };
        }
        
    private:
        PlanetGen::Generation::INoiseProvider* m_noiseProvider = nullptr;           // Interface dependency
        PlanetGen::Rendering::IResourceManager* m_resourceManager = nullptr;       // Interface dependency
        PlanetGen::Generation::Configuration::PlanetaryPreset m_defaultPreset = PlanetGen::Generation::Configuration::Presets::CreateEarthLikePreset();
    };

} // namespace PlanetGen::Generation::Factory
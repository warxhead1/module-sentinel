module;

#include <vector>
#include <memory>
#include <string>
#include <unordered_map>
#include <algorithm>

export module TerrainOrchestrator;

import GenerationTypes;
import TerrainAnalysisTypes;
import GLMModule;
import INoiseProvider;
import IGPUNoiseAccelerator;
import IPhysicsGPUAccelerator;
import PlanetaryGenerator;
import IPhysicsProcessor;
import TerrainAnalysisProcessor;
import EarthProcessor;
import VulkanBase;
import VulkanPipelineManager;
import ModernVulkanRenderSystem;

// Forward declarations for interface (complete types imported in implementation)
namespace PlanetGen::Generation::Features {
    class ContinentalFeatureSystem;
}

export namespace PlanetGen::Rendering {

// Core generation types are now imported from GenerationTypes module

/**
 * TerrainOrchestrator - coordinates all generation systems to achieve specific planetary designs
 */
class TerrainOrchestrator {
public:
    TerrainOrchestrator();
    ~TerrainOrchestrator(); // Must be defined in implementation where all imported types are complete
    
    // Non-copyable, non-movable
    TerrainOrchestrator(const TerrainOrchestrator&) = delete;
    TerrainOrchestrator& operator=(const TerrainOrchestrator&) = delete;
    TerrainOrchestrator(TerrainOrchestrator&&) = delete;
    TerrainOrchestrator& operator=(TerrainOrchestrator&&) = delete;
    
    // Main orchestration method
    PlanetGen::Generation::OrchestrationResult GeneratePlanet(
        const PlanetGen::Generation::PlanetaryDesignTemplate& design,
        const PlanetGen::Generation::FeatureDistribution& distribution,
        uint32_t resolution = 2048);
    
    
    // Initialize with required components
    void Initialize(PlanetGen::Rendering::VulkanBase* vulkanBase, 
                   PlanetGen::Rendering::Pipeline::VulkanPipelineManager* pipelineManager);
                   
    // Set planetary generator (dependency injection)
    void SetPlanetaryGenerator(std::shared_ptr<PlanetGen::Generation::PlanetaryGenerator> generator) {
        m_planetaryGenerator = generator;
    }
    
    // Enhanced generation with parameter coordination
    PlanetGen::Generation::OrchestrationResult GeneratePlanetFromParameters(
        const PlanetGen::Generation::PlanetaryDesignTemplate& design,
        const PlanetGen::Generation::PlanetaryData& parameterData,
        uint32_t resolution = 2048);
    
    // Variation generation - create N planets from same template with controlled variation
    std::vector<PlanetGen::Generation::OrchestrationResult> GeneratePlanetVariations(
        const PlanetGen::Generation::PlanetaryDesignTemplate& baseDesign,
        uint32_t numVariations,
        float variationIntensity = 0.3f);
    
    // Modern render system integration (replaces SetVulkanResourceManager)
    void SetModernRenderSystem(PlanetGen::Rendering::ModernVulkanRenderSystem* renderSystem);
    
    // Quality level configuration for generation
    void SetQualityLevel(const std::string& qualityLevel);
    
    // Template management
    std::vector<std::string> GetAvailableTemplates() const;
    
    // GPU accelerator integration
    void SetGPUAccelerator(PlanetGen::Generation::IGPUNoiseAccelerator* accelerator);

private:
    // Core orchestration logic
    PlanetGen::Generation::OrchestrationResult ExecuteGenerationPipeline(
        const PlanetGen::Generation::PlanetaryDesignTemplate& design,
        const PlanetGen::Generation::FeatureDistribution& distribution,
        uint32_t resolution);
    
    // Common pipeline application method (DRY principle)
    void ApplyGenerationPipeline(
        PlanetGen::Generation::PlanetaryData& data,
        const PlanetGen::Generation::PlanetaryDesignTemplate& design,
        const PlanetGen::Generation::FeatureDistribution& distribution,
        uint32_t resolution,
        PlanetGen::Generation::OrchestrationResult& result);
    
    // Core generation components
    std::unique_ptr<PlanetGen::Rendering::Terrain::EarthProcessor> m_earthProcessor;
    std::shared_ptr<PlanetGen::Generation::PlanetaryGenerator> m_planetaryGenerator;
    
    // Modern rendering system integration
    PlanetGen::Rendering::ModernVulkanRenderSystem* m_modernRenderSystem = nullptr;
    
    // Configuration
    std::string m_qualityLevel = "medium";
    std::vector<std::string> m_availableTemplates;
    
    // GPU acceleration
    PlanetGen::Generation::IGPUNoiseAccelerator* m_gpuAccelerator = nullptr;
};


} // namespace PlanetGen::Rendering
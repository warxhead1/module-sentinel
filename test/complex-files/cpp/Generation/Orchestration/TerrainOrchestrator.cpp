module;

#include <vulkan/vulkan.h>
#include <stdexcept>
#include <algorithm>
#include <chrono>
#include <Core/Logging/LoggerMacros.h>

module TerrainOrchestrator;

import Core.Logging.Logger;
import GenerationTypes;
import TerrainAnalysisTypes;
import EarthProcessor;
import VulkanBase;
import VulkanPipelineManager;
import BufferManagement;
import BufferCore;

namespace PlanetGen::Rendering {

// =============================================================================
// CONSTRUCTOR/DESTRUCTOR
// =============================================================================

TerrainOrchestrator::TerrainOrchestrator() = default;

TerrainOrchestrator::~TerrainOrchestrator() = default;

// =============================================================================
// INITIALIZATION
// =============================================================================

void TerrainOrchestrator::Initialize(PlanetGen::Rendering::VulkanBase* vulkanBase, 
                                   PlanetGen::Rendering::Pipeline::VulkanPipelineManager* pipelineManager) {
    if (!vulkanBase || !pipelineManager) {
        throw std::invalid_argument("TerrainOrchestrator: Invalid dependencies provided");
    }
    
    // Initialize earth processor
    m_earthProcessor = std::make_unique<PlanetGen::Rendering::Terrain::EarthProcessor>(vulkanBase, pipelineManager);
}

// =============================================================================
// MAIN ORCHESTRATION METHODS
// =============================================================================

PlanetGen::Generation::OrchestrationResult TerrainOrchestrator::GeneratePlanet(
    const PlanetGen::Generation::PlanetaryDesignTemplate& design,
    const PlanetGen::Generation::FeatureDistribution& distribution,
    uint32_t resolution) {
    
    return ExecuteGenerationPipeline(design, distribution, resolution);
}

PlanetGen::Generation::OrchestrationResult TerrainOrchestrator::GeneratePlanetFromParameters(
    const PlanetGen::Generation::PlanetaryDesignTemplate& design,
    const PlanetGen::Generation::PlanetaryData& parameterData,
    uint32_t resolution) {
    
    PlanetGen::Generation::OrchestrationResult result;
    
    // Use the provided parameter data directly
    PlanetGen::Generation::PlanetaryData data = parameterData;
    // Note: resolution is a generation parameter, not stored in PlanetaryData
    
    // Create default distribution 
    PlanetGen::Generation::FeatureDistribution distribution;
    
    // Apply generation pipeline with the actual parameter data
    ApplyGenerationPipeline(data, design, distribution, resolution, result);
    
    return result;
}

std::vector<PlanetGen::Generation::OrchestrationResult> TerrainOrchestrator::GeneratePlanetVariations(
    const PlanetGen::Generation::PlanetaryDesignTemplate& baseDesign,
    uint32_t numVariations,
    float variationIntensity) {
    
    std::vector<PlanetGen::Generation::OrchestrationResult> results;
    results.reserve(numVariations);
    
    for (uint32_t i = 0; i < numVariations; ++i) {
        PlanetGen::Generation::FeatureDistribution distribution;
        results.push_back(GeneratePlanet(baseDesign, distribution, 2048));
    }
    
    return results;
}

// =============================================================================
// PRIVATE METHODS
// =============================================================================

PlanetGen::Generation::OrchestrationResult TerrainOrchestrator::ExecuteGenerationPipeline(
    const PlanetGen::Generation::PlanetaryDesignTemplate& design,
    const PlanetGen::Generation::FeatureDistribution& distribution,
    uint32_t resolution) {
    
    PlanetGen::Generation::OrchestrationResult result;
    
    // Create basic planetary data
    PlanetGen::Generation::PlanetaryData data;
    data.planetRadius = design.planetRadius;
    data.seaLevel = 0.0f; // Default sea level
    
    // Apply generation pipeline
    ApplyGenerationPipeline(data, design, distribution, resolution, result);
    
    return result;
}

void TerrainOrchestrator::ApplyGenerationPipeline(
    PlanetGen::Generation::PlanetaryData& data,
    const PlanetGen::Generation::PlanetaryDesignTemplate& design,
    const PlanetGen::Generation::FeatureDistribution& distribution,
    uint32_t resolution,
    PlanetGen::Generation::OrchestrationResult& result) {
    
    auto startTime = std::chrono::high_resolution_clock::now();
    
    try {
        // Stage 1: Initialize base planetary data from design template
        data.planetRadius = design.planetRadius;
        data.seaLevel = 0.0f; // Default sea level
        
        // Stage 2: Generate planetary data using PlanetaryGenerator
        if (m_planetaryGenerator) {
            // Use the actual PlanetaryGenerator for real data!
            PlanetGen::Generation::PlanetaryData generatedData = m_planetaryGenerator->GeneratePlanet(design, resolution);
            
            // Use the generated data instead of empty arrays
            data = generatedData;
        } else {
            // Fallback: create basic data structure using PlanetaryModality
            size_t dataSize = resolution * resolution;
            
            data.elevation.data.resize(dataSize, 0.0f);
            data.elevation.width = resolution;
            data.elevation.height = resolution;
            data.elevation.minValue = 0.0f;
            data.elevation.maxValue = 8848.0f; // Everest height
            data.elevation.name = "elevation";
            
            data.temperature.data.resize(dataSize, 15.0f);
            data.temperature.width = resolution;
            data.temperature.height = resolution;
            data.temperature.minValue = -50.0f;
            data.temperature.maxValue = 50.0f;
            data.temperature.name = "temperature";
            
            data.precipitation.data.resize(dataSize, 500.0f);
            data.precipitation.width = resolution;
            data.precipitation.height = resolution;
            data.precipitation.minValue = 0.0f;
            data.precipitation.maxValue = 2000.0f;
            data.precipitation.name = "precipitation";
            
            data.vegetation.data.resize(dataSize, 0.5f);
            data.vegetation.width = resolution;
            data.vegetation.height = resolution;
            data.vegetation.minValue = 0.0f;
            data.vegetation.maxValue = 1.0f;
            data.vegetation.name = "vegetation";
        }
        
        // Stage 3: Apply geological features using EarthProcessor
        if (m_earthProcessor && !data.elevation.data.empty()) {
            // Create GPU buffers for the elevation data
            auto& bufferMgmt = PlanetGen::Rendering::BufferManagementSystem::Instance();
            size_t dataSize = data.elevation.data.size() * sizeof(float);
            
            // Create GPU buffer for elevation data
            auto elevationBuffer = bufferMgmt.CreateBuffer(
                dataSize,
                VK_BUFFER_USAGE_STORAGE_BUFFER_BIT | VK_BUFFER_USAGE_TRANSFER_DST_BIT | VK_BUFFER_USAGE_TRANSFER_SRC_BIT,
                VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT | VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT,
                BufferCategory::StorageBuffer,
                BufferUsageHints{}
            );
            
            // Upload CPU data to GPU buffer
            elevationBuffer->UpdateData(data.elevation.data.data(), dataSize);
            
            // Set up parameters for terrain processing
            PlanetGen::Rendering::Terrain::EarthParams params;
            params.inputElevation = elevationBuffer;
            params.outputElevation = elevationBuffer; // Process in-place
            params.width = resolution;
            params.height = resolution;
            params.strength = 0.5f; // Moderate processing strength
            
            // Apply basic erosion to make terrain more realistic
            m_earthProcessor->ProcessEarth(PlanetGen::Rendering::Terrain::EarthOperation::Erosion_Unified, params);
            
            // Apply mountain formation if elevation suggests mountains
            auto minMax = std::minmax_element(data.elevation.data.begin(), data.elevation.data.end());
            if (*minMax.second > data.seaLevel + 1000.0f) { // High elevation detected
                params.strength = 0.3f; // Gentler mountain processing
                m_earthProcessor->ProcessEarth(PlanetGen::Rendering::Terrain::EarthOperation::Mountain_Unified, params);
            }
            
            // Read back the processed data from GPU to CPU
            void* mappedData = nullptr;
            if (elevationBuffer->Map(&mappedData) == VK_SUCCESS) {
                memcpy(data.elevation.data.data(), mappedData, dataSize);
                elevationBuffer->Unmap();
            }
        }
        
        // Stage 4: Apply feature distribution
        // TODO: Apply continental features, mountain ranges, etc. based on distribution
        
        // Stage 5: Ensure data consistency (PlanetaryGenerator may have overridden some values)
        data.planetRadius = design.planetRadius;
        data.seaLevel = 0.0f; // Default sea level, could be derived from design.waterCoverage if needed
        
        // Calculate timing
        auto endTime = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime);
        
        // Set result
        result.generationSuccessful = true;
        result.planetaryData = data;
        result.generationTimeMs = static_cast<float>(duration.count());
        
        // Set additional result fields required by OrchestrationResult
        result.designMatchScore = 1.0f; // Placeholder - should be calculated based on match to design
        result.iterationsUsed = 1;
        result.generationReport = "Generation pipeline completed successfully";
        result.performanceBreakdown = "Single generation iteration with terrain processing";
        
    } catch (const std::exception& e) {
        result.generationSuccessful = false;
        result.generationReport = std::string("Pipeline failed: ") + e.what();
        result.designMatchScore = 0.0f;
        result.iterationsUsed = 0;
        result.performanceBreakdown = "Failed during generation";
    }
}

// =============================================================================
// MODERN RENDER SYSTEM INTEGRATION
// =============================================================================

void TerrainOrchestrator::SetModernRenderSystem(PlanetGen::Rendering::ModernVulkanRenderSystem* renderSystem) {
    m_modernRenderSystem = renderSystem;
    
    // Initialize available templates when render system is set
    if (m_modernRenderSystem && m_availableTemplates.empty()) {
        m_availableTemplates = {"earthlike", "oceanic", "mountainous", "desert", "frozen"};
    }
}

void TerrainOrchestrator::SetQualityLevel(const std::string& qualityLevel) {
    m_qualityLevel = qualityLevel;
    
    // Log quality level change
    LOG_INFO("TerrainOrchestrator", "Quality level set to: {}", qualityLevel);
}

std::vector<std::string> TerrainOrchestrator::GetAvailableTemplates() const {
    return m_availableTemplates;
}

void TerrainOrchestrator::SetGPUAccelerator(PlanetGen::Generation::IGPUNoiseAccelerator* accelerator) {
    m_gpuAccelerator = accelerator;
    
    if (m_gpuAccelerator) {
        LOG_INFO("TerrainOrchestrator", "GPU accelerator set: {}", m_gpuAccelerator->GetAcceleratorName());
    }
}

} // namespace PlanetGen::Rendering
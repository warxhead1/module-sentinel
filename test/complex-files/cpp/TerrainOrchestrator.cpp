module;

#include <memory>
#include <vector>
#include <string>
#include <unordered_map>
#include <algorithm>
#include <random>
#include <cmath>
#include <sstream>
#include <chrono>
#include <iostream>
#include <future>
#include <limits>
#include <thread>
#include <Core/Logging/LoggerMacros.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

module TerrainOrchestrator;

import PlanetaryGenerator;
import ContinentalFeatureSystem;
import PlanetaryPhysicsIntegrator;
import TerrainAnalysisProcessor;
import TerrainCoherenceProcessor;
import NoiseFactory;
import PhysicsProcessorFactory;
import PlanetaryConfigurationManager;
import IResourceManager;
import VulkanBase;
import PhysicsTypes;
import BufferManagement;
import Core.Logging.TerrainProgressReporter;
import UnifiedHeightGenerator;
import VulkanNoiseGenerator;
import DescriptorLayoutDefinitions;
import Core.Logging.Logger;
import DescriptorManager;
import DescriptorLayoutRegistry;
import VulkanPipelineManager;
import VulkanCommandBufferManager;
import NoiseInterface;

// Add missing factory imports  
using TerrainAnalysisProcessorFactory = PlanetGen::Generation::Analysis::TerrainAnalysisProcessorFactory;
using PhysicsIntegratorFactory = PlanetGen::Generation::Physics::PhysicsIntegratorFactory;

namespace PlanetGen::Rendering {

// Destructor needs to be defined here where types are complete
TerrainOrchestrator::~TerrainOrchestrator() {
    // Explicitly delete raw pointers to avoid incomplete type issues
    delete m_planetaryGenerator;
    delete m_continentalSystem;
    delete m_physicsIntegrator;
    delete m_analysisProcessor;
    delete m_coherenceProcessor;
}

TerrainOrchestrator::TerrainOrchestrator() 
    : m_planetaryGenerator(nullptr)
    , m_continentalSystem(nullptr)
    , m_physicsIntegrator(nullptr)
    , m_analysisProcessor(nullptr)
    , m_coherenceProcessor(nullptr)
    , m_gpuInitialized(false) {
    // Initialize default processor enable states
    m_enabledProcessors["continental_features"] = true;
    m_enabledProcessors["terrain_coherence"] = true;  // NEW: Geological coherence processing
    m_enabledProcessors["gravitational_settling"] = true;
    m_enabledProcessors["hydraulic_erosion"] = true;
    m_enabledProcessors["tectonic_activity"] = true;
    m_enabledProcessors["climate_generation"] = true;
    m_enabledProcessors["biome_classification"] = true;
    m_enabledProcessors["vegetation_placement"] = true;
    
    // Register built-in templates
    RegisterPlanetaryTemplate("earth_like", Templates::EarthLike);
    RegisterPlanetaryTemplate("ocean_world", Templates::OceanWorld);
    RegisterPlanetaryTemplate("desert_world", Templates::DesertWorld);
    RegisterPlanetaryTemplate("mountain_world", Templates::MountainWorld);
    RegisterPlanetaryTemplate("forest_world", Templates::ForestWorld);
    RegisterPlanetaryTemplate("ice_world", Templates::IceWorld);
    RegisterPlanetaryTemplate("volcanic_world", Templates::VolcanicWorld);
}

void TerrainOrchestrator::SetVulkanResourceManager(void* resourceManager) {
    // Store as void pointer and cast when needed
    m_resourceManager = resourceManager;
    
    // Initialize GPU resources immediately when resource manager is available
    if (resourceManager && !m_gpuInitialized) {
        InitializeGPUResources();
    }
    
    // Pass the resource manager to sub-components that need it
    if (m_physicsIntegrator && resourceManager) {
        // Use the interface directly - no need to cast
        auto* resourceMgr = resourceManager;
        // Note: Need to verify if PlanetaryPhysicsIntegrator has a method to set resource manager
        // This will depend on the specific integration requirements
    }
}

void TerrainOrchestrator::InitializeGPUResources() {
    if (!m_resourceManager || m_gpuInitialized) {
        return;
    }
    
    try {
        auto* resourceMgr = static_cast<IResourceManager*>(m_resourceManager);
        
        // Check if pipeline manager is available - defer initialization if not
        auto* pipelineManager = resourceMgr->GetPipelineManager();
        if (!pipelineManager) {
            LOG_INFO("TerrainOrchestrator", "Pipeline manager not ready yet, deferring GPU initialization");
            LOG_INFO("TerrainOrchestrator", "ResourceManager state: pipelineManager={}, pipelineRegistry={}", 
                      pipelineManager ? "SET" : "NULL", 
                      resourceMgr->GetPipelineRegistry() ? "SET" : "NULL");
            return;  // Will retry later when pipeline manager is available
        }
        
        LOG_INFO("TerrainOrchestrator", "Pipeline manager available, proceeding with GPU initialization");
        
        // Ensure compute descriptor layouts are registered before creating GPU generators
        auto* descriptorManager = static_cast<Rendering::DescriptorManager*>(resourceMgr->GetDescriptorManager());
        if (descriptorManager) {
            auto* registry = descriptorManager->GetLayoutRegistry();
            
            // Register all compute layouts that might be needed for noise generation
            auto result1 = registry->RegisterLayout(Rendering::Vulkan::DescriptorLayoutDefinitions::GetTerrainComputeLayout());
            LOG_INFO("TerrainOrchestrator", "Registered terrain_compute layout: {}", (result1 == PlanetGen::Rendering::Vulkan::LayoutRegistryResult::Success ? "SUCCESS" : "FAILED"));
            
            auto result2 = registry->RegisterLayout(Rendering::Vulkan::DescriptorLayoutDefinitions::GetErosionLayout());
            LOG_INFO("TerrainOrchestrator", "Registered erosion layout: {}", (result2 == PlanetGen::Rendering::Vulkan::LayoutRegistryResult::Success ? "SUCCESS" : "FAILED"));
            
            auto result3 = registry->RegisterLayout(Rendering::Vulkan::DescriptorLayoutDefinitions::GetOceanLayout());
            LOG_INFO("TerrainOrchestrator", "Registered ocean layout: {}", (result3 == PlanetGen::Rendering::Vulkan::LayoutRegistryResult::Success ? "SUCCESS" : "FAILED"));
        }
        
        // GPU accelerator initialization is now handled via SetGPUAccelerator
        // The m_gpuAccelerator is set externally through dependency injection
        m_gpuInitialized = (m_gpuAccelerator != nullptr);
        if (m_gpuInitialized) {
            LOG_INFO("TerrainOrchestrator", "GPU accelerator available");
        } else {
            LOG_INFO("TerrainOrchestrator", "GPU accelerator not available - will use CPU fallback");
        }
    } catch (const std::exception& e) {
        LOG_ERROR("TerrainOrchestrator", "GPU initialization failed: {}", e.what());
        // Reset handled elsewhere
        m_gpuInitialized = false;
    }
}

OrchestrationResult TerrainOrchestrator::GeneratePlanet(
    const PlanetaryDesignTemplate& design,
    const FeatureDistribution& distribution,
    uint32_t resolution) {
    
    OrchestrationResult result;
    result.generationSuccessful = false;
    
    try {
        result = ExecuteGenerationPipeline(design, distribution, resolution);
        
        // Analyze how well the result matches the design
        result.designMatchScore = AnalyzeDesignMatch(result, design);
        result.generationReport = GenerateDetailedReport(result);
        result.generationSuccessful = true;
        
    } catch (const std::exception& e) {
        result.generationReport = "Generation failed: " + std::string(e.what());
    }
    
    return result;
}

OrchestrationResult TerrainOrchestrator::ExecuteGenerationPipeline(
    const PlanetaryDesignTemplate& design,
    const FeatureDistribution& distribution,
    uint32_t resolution) {
    
    OrchestrationResult result;
    
    // Start pipeline timing and reporting
    auto& reporter = PlanetGen::Core::Logging::TerrainProgressReporter::Instance();
    reporter.StartPipeline();
    auto pipelineStart = std::chrono::high_resolution_clock::now();
    
    // Stage timing storage
    struct StageTimings {
        int baseTerrainTime = 0;
        int continentalTime = 0;
        int coherenceTime = 0;
        int elevationTime = 0;
        int climateTime = 0;
        int physicsTime = 0;
        int biomeTime = 0;
        int validationTime = 0;
        int totalTime = 0;
    } timings;
    
    // Stage 1: Generate base terrain using controlled noise
    auto stageStart = std::chrono::high_resolution_clock::now();
    result.planetaryData = GenerateBaseTerrain(design, resolution);
    result.appliedProcessors.push_back("base_terrain_generation");
    auto stageEnd = std::chrono::high_resolution_clock::now();
    timings.baseTerrainTime = std::chrono::duration_cast<std::chrono::milliseconds>(stageEnd - stageStart).count();
    reporter.ReportStage("Base Terrain Generation", timings.baseTerrainTime);
    
    // Stage 2: Apply continental features based on water coverage target
    if (m_enabledProcessors["continental_features"]) {
        stageStart = std::chrono::high_resolution_clock::now();
        ApplyContinentalFeatures(result.planetaryData, design, distribution);
        result.appliedProcessors.push_back("continental_features");
        stageEnd = std::chrono::high_resolution_clock::now();
        timings.continentalTime = std::chrono::duration_cast<std::chrono::milliseconds>(stageEnd - stageStart).count();
        reporter.ReportStage("Continental Features", timings.continentalTime);
    }
    // Create analysis processor if needed for NoisePacket generation
    if (!m_analysisProcessor) {
        auto analysisProcessorPtr = TerrainAnalysisProcessorFactory::CreateEarthLikeProcessor();
        m_analysisProcessor = analysisProcessorPtr.release();
    }
    std::vector<PlanetGen::Generation::Physics::NoisePacket> noisePackets = BuildNoisePacketsForErosion(result.planetaryData, m_analysisProcessor);
    // Stage 2.5: Apply terrain coherence processing for geological realism
    if (m_enabledProcessors["terrain_coherence"]) {
        stageStart = std::chrono::high_resolution_clock::now();
        ApplyTerrainCoherence(result.planetaryData, design, resolution, noisePackets);
        result.appliedProcessors.push_back("terrain_coherence");
        stageEnd = std::chrono::high_resolution_clock::now();
        int stage2_5Time = std::chrono::duration_cast<std::chrono::milliseconds>(stageEnd - stageStart).count();
        reporter.ReportStage("Terrain Coherence", stage2_5Time);
    }
    
    // Stage 3: Process elevation bands for realistic altitude distributions
    stageStart = std::chrono::high_resolution_clock::now();
    ProcessElevationBands(result.planetaryData, design);
    result.appliedProcessors.push_back("elevation_bands");
    stageEnd = std::chrono::high_resolution_clock::now();
    int stage3Time = std::chrono::duration_cast<std::chrono::milliseconds>(stageEnd - stageStart).count();
    reporter.ReportStage("Elevation Bands", stage3Time);
    
    // Stage 4: Generate realistic climate zones
    if (m_enabledProcessors["climate_generation"]) {
        stageStart = std::chrono::high_resolution_clock::now();
        GenerateClimateZones(result.planetaryData, design);
        result.appliedProcessors.push_back("climate_zones");
        stageEnd = std::chrono::high_resolution_clock::now();
        int stage4Time = std::chrono::duration_cast<std::chrono::milliseconds>(stageEnd - stageStart).count();
        reporter.ReportStage("Climate Zones", stage4Time);
    }
    
    // Stage 5: Apply coordinated physics processing
    stageStart = std::chrono::high_resolution_clock::now();
    ApplyCoordinatedPhysics(result.planetaryData, design);
    result.appliedProcessors.push_back("physics_processing");
    stageEnd = std::chrono::high_resolution_clock::now();
    int stage5Time = std::chrono::duration_cast<std::chrono::milliseconds>(stageEnd - stageStart).count();
    reporter.ReportStage("Physics Processing", stage5Time);
    
    // Stage 6: Generate biome layout and vegetation
    if (m_enabledProcessors["biome_classification"]) {
        stageStart = std::chrono::high_resolution_clock::now();
        GenerateBiomeLayout(result.planetaryData, design);
        result.appliedProcessors.push_back("biome_layout");
        stageEnd = std::chrono::high_resolution_clock::now();
        int stage6Time = std::chrono::duration_cast<std::chrono::milliseconds>(stageEnd - stageStart).count();
        reporter.ReportStage("Biome Layout", stage6Time);
    }
    
    // Stage 7: Final validation and refinement
    stageStart = std::chrono::high_resolution_clock::now();
    ValidateAndRefine(result.planetaryData, design, result);
    result.appliedProcessors.push_back("validation_refinement");
    stageEnd = std::chrono::high_resolution_clock::now();
    int stage7Time = std::chrono::duration_cast<std::chrono::milliseconds>(stageEnd - stageStart).count();
    reporter.ReportStage("Validation & Refinement", stage7Time);
    
    // End pipeline reporting
    reporter.EndPipeline();
    
    return result;
}

PlanetaryData TerrainOrchestrator::GenerateBaseTerrain(
    const PlanetaryDesignTemplate& design,
    uint32_t resolution) {
    
    LOG_INFO("TerrainOrchestrator", "=== GENERATING BASE TERRAIN ===");
    LOG_INFO("TerrainOrchestrator", "Resolution: {}x{}", resolution, resolution);
    
    // Log the actual radius that will be used
    float actualRadius = design.planetRadius;
    if (actualRadius <= 0.0f && design.celestialBody.radius > 0.0f) {
        actualRadius = design.celestialBody.radius;
    }
    if (actualRadius <= 0.0f) {
        actualRadius = 6.371e6f; // Earth radius default
    }
    
    LOG_INFO("TerrainOrchestrator", "Planet radius: {} meters ({} km) [planetRadius={}, celestialBody.radius={}]", 
             actualRadius, actualRadius / 1000.0f, design.planetRadius, design.celestialBody.radius);
    LOG_INFO("TerrainOrchestrator", "Max elevation: {} meters, Height scale: {}, Exaggeration: {}", 
             design.maxElevation, design.heightScale, design.elevationExaggeration);
    
    auto gpuStartTime = std::chrono::high_resolution_clock::now();
    
    // OPTIMIZATION: Use GPU acceleration for base terrain generation
    // This replaces the inefficient CPU-only nested loop with modern Vulkan 1.4 GPU compute
    
    PlanetaryData data;
    data.elevation.width = resolution;
    data.elevation.height = resolution;
    data.elevation.name = "elevation";
    
    // Pass the planet scaling parameters from design template to planetary data
    // Use planetRadius as primary source, fall back to celestialBody.radius if needed
    float radiusForData = design.planetRadius;
    if (radiusForData <= 0.0f && design.celestialBody.radius > 0.0f) {
        radiusForData = design.celestialBody.radius;
        LOG_INFO("TerrainOrchestrator", "Using celestialBody.radius for data.planetRadius as planetRadius was invalid");
    }
    if (radiusForData <= 0.0f) {
        radiusForData = 6.371e6f; // Default to Earth radius
        LOG_WARN("TerrainOrchestrator", "Both planetRadius and celestialBody.radius invalid, using Earth radius for data.planetRadius");
    }
    data.planetRadius = radiusForData;
    data.seaLevel = 0.0f; // Will be computed based on water coverage
    
    // PERFORMANCE UPDATE: GPU micro-tiling eliminated - testing optimized GPU path
    // Previous: 475ms with micro-tiling, Target: 60-80ms with coordinate-free approach
    // Coordinate-free shader eliminates 3MB input buffer transfer overhead
    bool useGPU = true; // Test our optimized GPU implementation
    
    if (useGPU) {
        // VULKAN 1.4 GPU OPTIMIZATION PATH WITH PRE-INITIALIZED PERSISTENT RESOURCES
        PlanetGen::Generation::UnifiedHeightGenerator heightGenerator(
            PlanetGen::Generation::ExecutionMode::GPU, m_gpuAccelerator);
    
        if (heightGenerator.Initialize()) {
        
            // Configure noise layers for planetary generation
            // IMPORTANT: Scale noise frequency based on planet radius
            // The original templates were designed for 60km radius planets
            
            // Use planetRadius as primary source, fall back to celestialBody.radius if needed
            float radiusToUse = design.planetRadius;
            if (radiusToUse <= 0.0f && design.celestialBody.radius > 0.0f) {
                radiusToUse = design.celestialBody.radius;
                LOG_INFO("TerrainOrchestrator", "Using celestialBody.radius ({}) as planetRadius was invalid", design.celestialBody.radius);
            }
            
            float planetRadiusKm = radiusToUse / 1000.0f; // Convert meters to km
            if (planetRadiusKm <= 0.0f) {
                // Default to Earth-like radius if not specified
                planetRadiusKm = 6371.0f; // Earth radius in km
                LOG_WARN("TerrainOrchestrator", "Invalid planet radius {} (from planetRadius={}, celestialBody.radius={}), using Earth radius", 
                         radiusToUse, design.planetRadius, design.celestialBody.radius);
            }
            // Scale proportionally with radius to maintain terrain detail
            // For a 1800km radius planet, we want MORE detail, not less
            float radiusScaleFactor = planetRadiusKm / 60.0f; // Scale with radius to maintain detail
            LOG_INFO("TerrainOrchestrator", "Terrain scaling: planet radius {} km, scale factor {}", planetRadiusKm, radiusScaleFactor);
            
            // Ensure minimum scale for good terrain variation
            if (radiusScaleFactor < 1.0f) {
                radiusScaleFactor = 1.0f; // Don't reduce detail for small planets
            }
            
            heightGenerator.SetPrimaryNoise(design.noiseConfig.primaryNoise.type, 
                0.005f * (1.0f + design.mountainDensity) * radiusScaleFactor, 5000.0f, 6);
            
            // Add detail layer for complex terrain
            heightGenerator.AddDetailLayer(Rendering::Noise::NoiseType::RidgedNoise,
                0.01f * (1.0f + design.mountainDensity * 0.5f) * radiusScaleFactor, 2000.0f, 4);
            
            // ASYNC GPU PATTERN: Start GPU work without waiting (matches coherence processor pattern)
            auto asyncHandle = heightGenerator.BeginHeightMapGeneration(-180.0f, -90.0f, resolution, resolution, 360.0f / resolution);
            
            if (asyncHandle.has_value()) {
                // While GPU works asynchronously, prepare coordinate system (overlapped CPU work)
                data.latlonGrid.reserve(resolution * resolution);
                for (uint32_t y = 0; y < resolution; ++y) {
                    for (uint32_t x = 0; x < resolution; ++x) {
                        float lat = -90.0f + (180.0f * y) / (resolution - 1);
                        float lon = -180.0f + (360.0f * x) / (resolution - 1);
                        data.latlonGrid.emplace_back(lat, lon);
                    }
                }
                
                // Now wait for GPU completion and get result (single fence wait, not per-operation)
                try {
                    data.elevation.data = heightGenerator.EndHeightMapGeneration(asyncHandle.value());
                    
                    // CRITICAL VALIDATION: Check data immediately after async GPU generation
                    size_t validCount = 0;
                    size_t firstTenValid = 0;
                    float minVal = std::numeric_limits<float>::max();
                    float maxVal = std::numeric_limits<float>::lowest();
                    
                    // Check first 10 values specifically
                    for (size_t i = 0; i < std::min(size_t(10), data.elevation.data.size()); ++i) {
                        if (std::isfinite(data.elevation.data[i])) {
                            firstTenValid++;
                        }
                        LOG_DEBUG("TerrainOrchestrator", "Async GPU result[{}] = {}", i, data.elevation.data[i]);
                    }
                    
                    // Check all values
                    for (const auto& val : data.elevation.data) {
                        if (std::isfinite(val)) {
                            validCount++;
                            minVal = std::min(minVal, val);
                            maxVal = std::max(maxVal, val);
                        }
                    }
                    
                    LOG_INFO("TerrainOrchestrator", "POST-ASYNC GPU validation: {} valid out of {}, first 10 valid: {}, range: [{}, {}], ptr: {}",
                             validCount, data.elevation.data.size(), firstTenValid, minVal, maxVal,
                             static_cast<const void*>(data.elevation.data.data()));
                    
                    if (firstTenValid == 0) {
                        LOG_ERROR("TerrainOrchestrator", "CRITICAL: First 10 values from async GPU are all invalid!");
                    }
                } catch (const std::exception& e) {
                    std::cerr << "[BASE TERRAIN] Async GPU retrieval failed: " << e.what() << ", falling back to CPU" << std::endl;
                    useGPU = false;
                }
            } else {
                // Async not supported, use synchronous path
                std::cerr << "[BASE TERRAIN] Async GPU generation not available, using synchronous path" << std::endl;
                data.elevation.data = heightGenerator.GenerateHeightMap(-180.0f, -90.0f, resolution, resolution, 360.0f / resolution);
            }
            
            // Apply design-specific modifications on GPU result if needed
            if (!data.elevation.data.empty() && design.mountainDensity > 0.5f) {
                    // Apply power curve enhancement for extreme mountainous worlds
                    float powerFactor = 1.0f + design.mountainDensity * 0.5f;
                    for (float& elevation : data.elevation.data) {
                        elevation = elevation > 0 ? std::pow(std::abs(elevation), powerFactor) : 
                                                  -std::pow(std::abs(elevation), powerFactor);
                    }
                }
                
                auto gpuEndTime = std::chrono::high_resolution_clock::now();
                auto gpuDuration = std::chrono::duration_cast<std::chrono::milliseconds>(gpuEndTime - gpuStartTime);
                
                LOG_INFO("BASE TERRAIN GPU OPTIMIZATION", "GPU heightmap generation completed in {}ms (vs previous ~350ms CPU)", gpuDuration.count());
        } else {
            LOG_ERROR("BASE TERRAIN", "UnifiedHeightGenerator initialization failed, falling back to CPU");
            useGPU = false;
        }
    }
    
    if (!useGPU) {
        // CPU FALLBACK PATH (original implementation)
        data.elevation.data.resize(resolution * resolution);
        
        auto noiseGen = PlanetGen::Rendering::Noise::NoiseFactory::CreateSimpleNoise(
            design.randomSeed, 
            0.005f * (1.0f + design.mountainDensity),
            6
        );
        
        // OPTIMIZED CPU FALLBACK PATH - Use parallel processing
        data.latlonGrid.reserve(resolution * resolution);
        data.elevation.data.resize(resolution * resolution);
        
        // Pre-calculate constants
        const float latStep = 180.0f / (resolution - 1);
        const float lonStep = 360.0f / (resolution - 1);
        const float heightScale = 5000.0f;
        const bool useMountainBoost = design.mountainDensity > 0.5f;
        const float mountainMultiplier = 1.0f + design.mountainDensity;
        const float powerFactor = 1.0f + design.mountainDensity * 0.5f;
        
        // Use UnifiedHeightGenerator CPU path for better performance
        PlanetGen::Generation::UnifiedHeightGenerator cpuGenerator(
            PlanetGen::Generation::ExecutionMode::CPU);
        
        if (cpuGenerator.Initialize()) {
            // Configure for planetary generation  
            // Scale noise frequency based on planet radius (same as GPU path)
            
            // Use planetRadius as primary source, fall back to celestialBody.radius if needed
            float radiusToUse = design.planetRadius;
            if (radiusToUse <= 0.0f && design.celestialBody.radius > 0.0f) {
                radiusToUse = design.celestialBody.radius;
                LOG_INFO("TerrainOrchestrator", "CPU path: Using celestialBody.radius ({}) as planetRadius was invalid", design.celestialBody.radius);
            }
            
            float planetRadiusKm = radiusToUse / 1000.0f; // Convert meters to km
            if (planetRadiusKm <= 0.0f) {
                // Default to Earth-like radius if not specified
                planetRadiusKm = 6371.0f; // Earth radius in km
                LOG_WARN("TerrainOrchestrator", "Invalid planet radius {} in CPU path (from planetRadius={}, celestialBody.radius={}), using Earth radius", 
                         radiusToUse, design.planetRadius, design.celestialBody.radius);
            }
            // Scale proportionally with radius to maintain terrain detail
            // For a 1800km radius planet, we want MORE detail, not less
            float radiusScaleFactor = planetRadiusKm / 60.0f; // Scale with radius to maintain detail
            LOG_INFO("TerrainOrchestrator", "Terrain scaling: planet radius {} km, scale factor {}", planetRadiusKm, radiusScaleFactor);
            
            // Ensure minimum scale for good terrain variation
            if (radiusScaleFactor < 1.0f) {
                radiusScaleFactor = 1.0f; // Don't reduce detail for small planets
            }
            
            cpuGenerator.SetPrimaryNoise(design.noiseConfig.primaryNoise.type, 
                0.005f * (1.0f + design.mountainDensity) * radiusScaleFactor, heightScale, 6);
            
            // Generate heightmap using optimized CPU with parallelization
            auto elevationData = cpuGenerator.GenerateHeightMap(-180.0f, -90.0f, 
                resolution, resolution, 360.0f / resolution);
            
            if (!elevationData.empty()) {
                data.elevation.data = std::move(elevationData);
                
                // Apply mountain density modifications if needed  
                if (useMountainBoost) {
                    std::transform(data.elevation.data.begin(), data.elevation.data.end(),
                        data.elevation.data.begin(), [mountainMultiplier, powerFactor](float elevation) {
                            elevation *= mountainMultiplier;
                            return elevation > 0 ? std::pow(std::abs(elevation), powerFactor) : 
                                                 -std::pow(std::abs(elevation), powerFactor);
                        });
                }
            }
        }
        
        // Fallback to original if UnifiedHeightGenerator fails
        if (data.elevation.data.empty()) {
            data.elevation.data.resize(resolution * resolution);
            
            // Use the original nested loop as final fallback
            for (uint32_t y = 0; y < resolution; ++y) {
                for (uint32_t x = 0; x < resolution; ++x) {
                    float lat = -90.0f + latStep * y;
                    float lon = -180.0f + lonStep * x;
                    
                    float noise = noiseGen->GetNoise(lon * 0.01f, lat * 0.01f, 0.0f);
                    float elevation = noise * heightScale;
                    
                    if (useMountainBoost) {
                        elevation *= mountainMultiplier;
                        elevation = elevation > 0 ? std::pow(std::abs(elevation), powerFactor) : 
                                                  -std::pow(std::abs(elevation), powerFactor);
                    }
                    
                    data.elevation.data[y * resolution + x] = elevation;
                }
            }
        }
        
        // Generate coordinate grid (this is fast, keep it simple)
        for (uint32_t y = 0; y < resolution; ++y) {
            for (uint32_t x = 0; x < resolution; ++x) {
                float lat = -90.0f + latStep * y;
                float lon = -180.0f + lonStep * x;
                data.latlonGrid.emplace_back(lat, lon);
            }
        }
    }
    
    // Calculate min/max values
    auto minMax = std::minmax_element(data.elevation.data.begin(), data.elevation.data.end());
    data.elevation.minValue = *minMax.first;
    data.elevation.maxValue = *minMax.second;
    
    return data;
}

void TerrainOrchestrator::ApplyContinentalFeatures(
    PlanetaryData& data,
    const PlanetaryDesignTemplate& design,
    const FeatureDistribution& distribution) {
    
    // Generate continental centers based on water coverage target
    auto continentalCenters = GenerateContinentalCenters(distribution, design.randomSeed);
    
    // Calculate target land area based on water coverage
    float targetLandPercentage = 1.0f - design.waterCoverage;
    
    // For each continental center, create landmass
    std::mt19937 rng(design.randomSeed + 100);
    
    for (size_t i = 0; i < continentalCenters.size(); ++i) {
        vec2 center = continentalCenters[i];
        
        // Continental size varies based on design and position
        float continentalRadius = 0.1f + (targetLandPercentage * 0.15f); // Base size
        if (i < distribution.majorContinents) {
            continentalRadius *= 1.5f; // Major continents are larger
        }
        
        // Apply continental variation
        continentalRadius *= (1.0f + design.continentalVariation * (std::uniform_real_distribution<float>(-0.5f, 0.5f)(rng)));
        
        // Modify elevation in continental regions
        for (size_t idx = 0; idx < data.elevation.data.size(); ++idx) {
            uint32_t x = idx % data.elevation.width;
            uint32_t y = idx / data.elevation.width;
            
            // Convert to normalized coordinates
            float normX = (float)x / (data.elevation.width - 1);
            float normY = (float)y / (data.elevation.height - 1);
            vec2 point(normX, normY);
            
            // Calculate distance to continental center
            float distance = length(point - center);
            
            if (distance < continentalRadius) {
                // Apply continental uplift with smooth falloff
                float influence = 1.0f - std::pow(distance / continentalRadius, 2.0f);
                float uplift = influence * 3000.0f; // Base continental elevation
                
                // Stronger uplift for mountain worlds
                if (design.mountainDensity > 0.5f) {
                    uplift *= (1.0f + design.mountainDensity);
                }
                
                data.elevation.data[idx] += uplift;
            }
        }
    }
    
    // Apply ocean basin lowering to achieve target water coverage
    float currentSeaLevel = 0.0f; // We'll adjust this based on target
    
    // Sort elevations to find the right sea level for target water coverage
    std::vector<float> sortedElevations = data.elevation.data;
    std::sort(sortedElevations.begin(), sortedElevations.end());
    
    size_t seaLevelIndex = static_cast<size_t>(design.waterCoverage * sortedElevations.size());
    if (seaLevelIndex < sortedElevations.size()) {
        currentSeaLevel = sortedElevations[seaLevelIndex];
        
        // Lower everything below sea level further to create proper ocean basins
        for (float& elevation : data.elevation.data) {
            if (elevation < currentSeaLevel) {
                float depth = currentSeaLevel - elevation;
                elevation = currentSeaLevel - (depth * 2.0f); // Deepen ocean basins
            }
        }
    }
    
    // Update min/max values
    auto minMax = std::minmax_element(data.elevation.data.begin(), data.elevation.data.end());
    data.elevation.minValue = *minMax.first;
    data.elevation.maxValue = *minMax.second;
}

void TerrainOrchestrator::ProcessElevationBands(
    PlanetaryData& data,
    const PlanetaryDesignTemplate& design) {
    
    // Create elevation-based feature distributions
    float seaLevel = 0.0f; // We'll calculate this dynamically
    
    // Find actual sea level based on water coverage
    std::vector<float> sortedElevations = data.elevation.data;
    std::sort(sortedElevations.begin(), sortedElevations.end());
    size_t seaLevelIndex = static_cast<size_t>(design.waterCoverage * sortedElevations.size());
    if (seaLevelIndex < sortedElevations.size()) {
        seaLevel = sortedElevations[seaLevelIndex];
    }
    
    // Apply elevation band processing
    for (size_t i = 0; i < data.elevation.data.size(); ++i) {
        float elevation = data.elevation.data[i];
        float relativeElevation = elevation - seaLevel;
        
        // Mountain band enhancement for mountain worlds
        if (design.mountainDensity > 0.5f && relativeElevation > 1000.0f) {
            float mountainBoost = design.mountainDensity * 2000.0f;
            data.elevation.data[i] += mountainBoost * (relativeElevation / 1000.0f);
        }
        
        // Valley carving for realistic terrain
        if (relativeElevation > 500.0f && relativeElevation < 2000.0f) {
            // Add some valley systems in mid-elevation areas
            uint32_t x = i % data.elevation.width;
            uint32_t y = i / data.elevation.width;
            
            float valleyNoise = std::sin(x * 0.1f) * std::cos(y * 0.08f);
            if (valleyNoise > 0.7f) {
                data.elevation.data[i] -= 200.0f; // Create valleys
            }
        }
    }
    
    // Update min/max values after modification
    auto minMax = std::minmax_element(data.elevation.data.begin(), data.elevation.data.end());
    data.elevation.minValue = *minMax.first;
    data.elevation.maxValue = *minMax.second;
}

void TerrainOrchestrator::ApplyTerrainCoherence(
    PlanetaryData& data,
    const PlanetaryDesignTemplate& design,
    uint32_t resolution,
    const std::vector<PlanetGen::Generation::Physics::NoisePacket>& noisePackets) {
    
    if (!m_coherenceProcessor) {
        // Create coherence processor based on design template
        if (design.name.find("Mountain") != std::string::npos) {
            auto processorPtr = PlanetGen::Generation::Physics::TerrainCoherenceProcessor::CreateForMountainous();
            m_coherenceProcessor = processorPtr.release();
        } else if (design.name.find("Ocean") != std::string::npos) {
            auto processorPtr = PlanetGen::Generation::Physics::TerrainCoherenceProcessor::CreateForOceanic();
            m_coherenceProcessor = processorPtr.release();
        } else if (design.name.find("Desert") != std::string::npos) {
            auto processorPtr = PlanetGen::Generation::Physics::TerrainCoherenceProcessor::CreateForDesert();
            m_coherenceProcessor = processorPtr.release();
        } else {
            auto processorPtr = PlanetGen::Generation::Physics::TerrainCoherenceProcessor::CreateForEarthLike();
            m_coherenceProcessor = processorPtr.release();
        }
        // GPU initialization for coherence processor
        if (m_resourceManager && m_coherenceProcessor) {
            auto* resourceMgr = static_cast<IResourceManager*>(m_resourceManager);
            // Note: IResourceManager returns void* - need proper casting
            auto* vulkanBase = static_cast<Rendering::VulkanBase*>(resourceMgr->GetVulkanBase());
            auto* descriptorManager = static_cast<Rendering::DescriptorManager*>(resourceMgr->GetDescriptorManager());
            auto* pipelineManager = static_cast<Rendering::VulkanPipelineManager*>(resourceMgr->GetPipelineManager());
            auto* commandBufferManager = static_cast<Rendering::VulkanCommandBufferManager*>(resourceMgr->GetCommandBufferManager());
            auto* bufferManager = &PlanetGen::Rendering::BufferManagementSystem::Instance();
            m_coherenceProcessor->InitializeGPUProcessor(vulkanBase, descriptorManager, pipelineManager, bufferManager, commandBufferManager);
            
            // NOTE: InitializeMountainRangeGenerator removed - functionality integrated into unified GPU processor
        }
    }
    
    if (m_coherenceProcessor) {
        // Create coordinate pairs for the coherence processor
        std::vector<std::pair<float, float>> coordinates;
        coordinates.reserve(data.elevation.data.size());
        
        for (uint32_t y = 0; y < resolution; ++y) {
            for (uint32_t x = 0; x < resolution; ++x) {
                float lat = -90.0f + (180.0f * y) / (resolution - 1);
                float lon = -180.0f + (360.0f * x) / (resolution - 1);
                coordinates.emplace_back(lat, lon);
            }
        }
        
        // Create celestial body properties using actual planet data
        PlanetGen::Generation::Physics::CelestialBodyProperties bodyProps;
        bodyProps.mass = design.celestialBody.mass > 0 ? design.celestialBody.mass : 5.972e24f; // Use design or Earth mass
        
        // Use planetRadius as primary source, fall back to celestialBody.radius if needed
        float radiusToUse = design.planetRadius;
        if (radiusToUse <= 0.0f && design.celestialBody.radius > 0.0f) {
            radiusToUse = design.celestialBody.radius;
        }
        bodyProps.radius = radiusToUse > 0 ? radiusToUse : 6.371e6f; // Use design or Earth radius
        
        // Create physics simulation parameters
        PlanetGen::Generation::Physics::PhysicsSimulationParams physicsParams;
        physicsParams.settlingStrength = 1.0f + design.erosionRate;
        physicsParams.tectonicActivity = design.tectonicActivity;
        
        // Set NoisePackets for erosion processing
        m_coherenceProcessor->SetNoisePackets(noisePackets);
        
        // Validate elevation data before coherence processing
        size_t validCount = 0;
        float minElev = std::numeric_limits<float>::max();
        float maxElev = std::numeric_limits<float>::lowest();
        for (size_t i = 0; i < data.elevation.data.size(); ++i) {
            if (std::isfinite(data.elevation.data[i])) {
                validCount++;
                minElev = std::min(minElev, data.elevation.data[i]);
                maxElev = std::max(maxElev, data.elevation.data[i]);
            }
        }
        // valid here
        LOG_INFO("TerrainOrchestrator", "Pre-coherence validation: {} valid values out of {}, range: [{}, {}]",
                 validCount, data.elevation.data.size(), minElev, maxElev);
        
        // Add immediate re-validation to catch timing issues
        size_t revalidCount = 0;
        for (size_t i = 0; i < std::min(size_t(100), data.elevation.data.size()); ++i) {
            if (std::isfinite(data.elevation.data[i])) {
                revalidCount++;
            }
        }
        LOG_DEBUG("TerrainOrchestrator", "Immediate re-validation: {} valid out of 100", revalidCount);
        
        // Check for memory corruption - validate vector state
        LOG_DEBUG("TerrainOrchestrator", "Vector state check: size={}, capacity={}, ptr={}", 
                  data.elevation.data.size(), data.elevation.data.capacity(), 
                  static_cast<const void*>(data.elevation.data.data()));
        
        // Add a small delay to see if corruption is time-dependent ( did nothing )
        //std::this_thread::sleep_for(std::chrono::milliseconds(500));
        
        // IMMEDIATE pre-call validation - check data right before function call (data invalid)
        size_t preCallValid = 0;
        float preCallMin = std::numeric_limits<float>::max();
        float preCallMax = std::numeric_limits<float>::lowest();
        for (size_t i = 0; i < std::min(size_t(10), data.elevation.data.size()); ++i) {
            if (std::isfinite(data.elevation.data[i])) {
                preCallValid++;
                preCallMin = std::min(preCallMin, data.elevation.data[i]);
                preCallMax = std::max(preCallMax, data.elevation.data[i]);
            }
        }
        LOG_DEBUG("TerrainOrchestrator", "PRE-CALL validation: {} valid out of {}, range: [{}, {}], ptr: {}", 
                  preCallValid, std::min(size_t(10), data.elevation.data.size()), preCallMin, preCallMax, 
                  static_cast<const void*>(data.elevation.data.data()));
        
        // Apply terrain coherence processing
        auto coherenceResult = m_coherenceProcessor->ProcessTerrain(
            data.elevation.data, coordinates, bodyProps, physicsParams);
        
        // Use the processed elevation data
        data.elevation.data = std::move(coherenceResult.processedElevation);
        
        // Update min/max values after coherence processing
        auto minMax = std::minmax_element(data.elevation.data.begin(), data.elevation.data.end());
        data.elevation.minValue = *minMax.first;
        data.elevation.maxValue = *minMax.second;
    }
}

void TerrainOrchestrator::GenerateClimateZones(
    PlanetaryData& data,
    const PlanetaryDesignTemplate& design) {
    
    // Create temperature and precipitation modalities
    PlanetaryModality temperature, precipitation;
    temperature.name = "temperature";
    temperature.width = data.elevation.width;
    temperature.height = data.elevation.height;
    temperature.data.resize(data.elevation.data.size());
    
    precipitation.name = "precipitation";
    precipitation.width = data.elevation.width;
    precipitation.height = data.elevation.height;
    precipitation.data.resize(data.elevation.data.size());
    
    // Generate climate based on latitude and design parameters
    for (size_t i = 0; i < data.elevation.data.size(); ++i) {
        uint32_t x = i % data.elevation.width;
        uint32_t y = i / data.elevation.width;
        
        // Calculate latitude (normalized from -1 to 1)
        float lat = -1.0f + (2.0f * y) / (data.elevation.height - 1);
        float elevation = data.elevation.data[i];
        
        // Temperature calculation with elevation lapse rate
        float baseTemp = design.averageTemperature;
        float latitudeEffect = std::cos(lat * M_PI * 0.5f) * design.temperatureRange * 0.5f;
        float elevationEffect = std::max(0.0f, elevation) * -0.006f; // -6°C per km
        
        temperature.data[i] = baseTemp + latitudeEffect + elevationEffect;
        
        // Precipitation calculation
        float basePrecip = design.precipitationLevel * 1000.0f; // mm/year
        float latitudeEffect_precip = 1.0f;
        
        // Equatorial high precipitation, subtropical low, temperate moderate
        float absLat = std::abs(lat);
        if (absLat < 0.2f) {
            latitudeEffect_precip = 1.5f; // Equatorial high
        } else if (absLat < 0.5f) {
            latitudeEffect_precip = 0.3f; // Subtropical low (desert belts)
        } else {
            latitudeEffect_precip = 0.8f; // Temperate moderate
        }
        
        // Elevation effect on precipitation (orographic)
        float elevationEffect_precip = 1.0f + std::max(0.0f, elevation) * 0.0002f;
        
        precipitation.data[i] = basePrecip * latitudeEffect_precip * elevationEffect_precip;
    }
    
    // Calculate min/max values
    auto tempMinMax = std::minmax_element(temperature.data.begin(), temperature.data.end());
    temperature.minValue = *tempMinMax.first;
    temperature.maxValue = *tempMinMax.second;
    
    auto precipMinMax = std::minmax_element(precipitation.data.begin(), precipitation.data.end());
    precipitation.minValue = *precipMinMax.first;
    precipitation.maxValue = *precipMinMax.second;
    
    // Set planetary data modalities directly
    data.temperature = std::move(temperature);
    data.precipitation = std::move(precipitation);
}

void TerrainOrchestrator::ApplyCoordinatedPhysics(
    PlanetaryData& data,
    const PlanetaryDesignTemplate& design) {
    
    if (!m_physicsIntegrator) {
        // Create physics integrator based on design
        auto physicsIntegratorPtr = PhysicsIntegratorFactory::CreateForPlanetaryGeneration(static_cast<IResourceManager*>(m_resourceManager));
        m_physicsIntegrator = physicsIntegratorPtr.release(); // Transfer ownership to raw pointer
    }
    
    if (m_physicsIntegrator) {
        // Configure physics parameters based on design
        PlanetGen::Generation::Physics::PhysicsSimulationParams physicsParams;
        physicsParams.enableGravitationalSettling = m_enabledProcessors["gravitational_settling"];
        physicsParams.enableAdvancedErosion = m_enabledProcessors["hydraulic_erosion"];
        physicsParams.enableTectonics = m_enabledProcessors["tectonic_activity"];
        
        // Scale physics intensity based on design
        physicsParams.settlingStrength = 1.0f + design.erosionRate;
        physicsParams.tectonicActivity = design.tectonicActivity;
        physicsParams.simulationSteps = 50; // Moderate simulation
        physicsParams.timeStep = 5000.0f;   // 5000 years per step
        
        // Create a dummy preset for physics processing
        PlanetGen::Generation::Configuration::PlanetaryPreset dummyPreset;
        dummyPreset.name = "orchestrated_planet";
        dummyPreset.category = "Terrestrial";
        dummyPreset.physics.enabled = true;
        dummyPreset.physics.settlingStrength = physicsParams.settlingStrength;
        dummyPreset.physics.tectonicActivity = physicsParams.tectonicActivity;
        
        // Apply physics processing
        m_physicsIntegrator->ProcessPlanetaryData(data, dummyPreset, m_enableDetailedPhysicsReporting);
    }
}

void TerrainOrchestrator::GenerateBiomeLayout(
    PlanetaryData& data,
    const PlanetaryDesignTemplate& design) {
    
    // Analysis processor should already be created earlier for NoisePacket generation
    
    // Create coordinate pairs for analysis
    std::vector<std::pair<float, float>> coordinates;
    coordinates.reserve(data.elevation.data.size());
    
    for (uint32_t y = 0; y < data.elevation.height; ++y) {
        for (uint32_t x = 0; x < data.elevation.width; ++x) {
            float lat = -90.0f + (180.0f * y) / (data.elevation.height - 1);
            float lon = -180.0f + (360.0f * x) / (data.elevation.width - 1);
            coordinates.emplace_back(lat, lon);
        }
    }
    
    // Create dummy celestial body properties
    PlanetGen::Generation::Physics::CelestialBodyProperties bodyProps;
    bodyProps.mass = 5.972e24f; // Earth mass
    bodyProps.radius = 6.371e6f; // Earth radius
    
    // Create dummy physics params
    PlanetGen::Generation::Physics::PhysicsSimulationParams physicsParams;
    
    // Perform terrain analysis for biome classification
    auto analysisResult = m_analysisProcessor->ProcessTerrain(
        data.elevation.data, coordinates, bodyProps, physicsParams);
    
    // The analysis processor will have classified biomes and generated colors
    // This information is embedded in the analysis result
}

void TerrainOrchestrator::ValidateAndRefine(
    PlanetaryData& data,
    const PlanetaryDesignTemplate& design,
    OrchestrationResult& result) {
    
    // Calculate actual coverage percentages
    result.actualWaterCoverage = CalculateWaterCoverage(data);
    result.actualMountainCoverage = CalculateMountainCoverage(data);
    
    // Apply final adjustments if coverage is far from target
    float waterCoverageError = std::abs(result.actualWaterCoverage - design.waterCoverage);
    if (waterCoverageError > 0.1f) {
        // Adjust sea level to better match target water coverage
        std::vector<float> sortedElevations = data.elevation.data;
        std::sort(sortedElevations.begin(), sortedElevations.end());
        
        size_t targetIndex = static_cast<size_t>(design.waterCoverage * sortedElevations.size());
        if (targetIndex < sortedElevations.size()) {
            float targetSeaLevel = sortedElevations[targetIndex];
            
            // Shift all elevations to align sea level with target
            float currentSeaLevel = sortedElevations[static_cast<size_t>(result.actualWaterCoverage * sortedElevations.size())];
            float adjustment = targetSeaLevel - currentSeaLevel;
            
            for (float& elevation : data.elevation.data) {
                elevation += adjustment;
            }
            
            // Recalculate coverage
            result.actualWaterCoverage = CalculateWaterCoverage(data);
        }
    }
    
    // Update final min/max values
    auto minMax = std::minmax_element(data.elevation.data.begin(), data.elevation.data.end());
    data.elevation.minValue = *minMax.first;
    data.elevation.maxValue = *minMax.second;
}

float TerrainOrchestrator::CalculateWaterCoverage(const PlanetaryData& data) const {
    if (data.elevation.data.empty()) return 0.0f;
    
    size_t underwaterPoints = 0;
    for (float elevation : data.elevation.data) {
        if (elevation < 0.0f) {
            underwaterPoints++;
        }
    }
    
    return static_cast<float>(underwaterPoints) / data.elevation.data.size();
}

float TerrainOrchestrator::CalculateMountainCoverage(const PlanetaryData& data) const {
    if (data.elevation.data.empty()) return 0.0f;
    
    size_t mountainPoints = 0;
    const float mountainThreshold = 1000.0f; // 1km above sea level
    
    for (float elevation : data.elevation.data) {
        if (elevation > mountainThreshold) {
            mountainPoints++;
        }
    }
    
    return static_cast<float>(mountainPoints) / data.elevation.data.size();
}

std::vector<vec2> TerrainOrchestrator::GenerateContinentalCenters(
    const FeatureDistribution& distribution,
    uint32_t seed) const {
    
    std::vector<vec2> centers;
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> dist(0.1f, 0.9f);
    
    // Generate major continents
    for (uint32_t i = 0; i < distribution.majorContinents; ++i) {
        centers.emplace_back(dist(rng), dist(rng));
    }
    
    // Generate minor continents
    for (uint32_t i = 0; i < distribution.minorContinents; ++i) {
        centers.emplace_back(dist(rng), dist(rng));
    }
    
    return centers;
}

float TerrainOrchestrator::AnalyzeDesignMatch(
    const OrchestrationResult& result,
    const PlanetaryDesignTemplate& target) const {
    
    float score = 0.0f;
    float weight = 0.0f;
    
    // Water coverage match (high weight)
    float waterError = std::abs(result.actualWaterCoverage - target.waterCoverage);
    score += (1.0f - std::min(1.0f, waterError * 2.0f)) * 0.4f;
    weight += 0.4f;
    
    // Mountain coverage match
    float mountainError = std::abs(result.actualMountainCoverage - target.mountainDensity);
    score += (1.0f - std::min(1.0f, mountainError * 2.0f)) * 0.3f;
    weight += 0.3f;
    
    // Additional metrics would be added here for vegetation, climate, etc.
    
    return weight > 0.0f ? score / weight : 0.0f;
}

std::string TerrainOrchestrator::GenerateDetailedReport(const OrchestrationResult& result) const {
    std::ostringstream report;
    
    report << "=== Terrain Orchestration Report ===" << std::endl;
    report << "Design Match Score: " << (result.designMatchScore * 100.0f) << "%" << std::endl;
    report << "Water Coverage: " << (result.actualWaterCoverage * 100.0f) << "%" << std::endl;
    report << "Mountain Coverage: " << (result.actualMountainCoverage * 100.0f) << "%" << std::endl;
    report << std::endl;
    
    report << "Applied Processors:" << std::endl;
    for (const auto& processor : result.appliedProcessors) {
        report << "  - " << processor << std::endl;
    }
    
    return report.str();
}

// Template definitions
namespace Templates {
    const PlanetaryDesignTemplate EarthLike = {
        .name = "Earth-like",
        .description = "Balanced terrestrial world with oceans, continents, and diverse biomes",
        .waterCoverage = 0.71f,
        .mountainDensity = 0.3f,
        .vegetationCoverage = 0.6f,
        .volcanism = 0.1f,
        .glaciation = 0.1f,
        .temperatureRange = 60.0f,
        .averageTemperature = 15.0f,
        .precipitationLevel = 1.0f,
        .tectonicActivity = 0.5f,
        .erosionRate = 0.5f,
        .crustalAge = 0.5f,
        .atmosphereDensity = 1.0f,
        .greenhouseEffect = 1.0f,
        .planetRadius = 6.371e6,   // Earth radius in meters (sync with celestialBody.radius)
        .continentalVariation = 0.3f,
        .climateVariation = 0.2f,
        .randomSeed = 0,
        .celestialBody = {
            .mass = 5.972e24,  // Earth mass in kg
            .radius = 6.371e6, // Earth radius in meters
            .gravity = 9.81f,  // m/s²
            .rotationPeriod = 24.0f // hours
        }
    };
    
    const PlanetaryDesignTemplate OceanWorld = {
        .name = "Ocean World",
        .description = "Predominantly water-covered world with scattered islands",
        .waterCoverage = 0.9f,
        .mountainDensity = 0.2f,
        .vegetationCoverage = 0.7f,
        .volcanism = 0.3f, // Volcanic islands
        .glaciation = 0.05f,
        .temperatureRange = 40.0f,
        .averageTemperature = 20.0f,
        .precipitationLevel = 1.5f,
        .tectonicActivity = 0.6f,
        .erosionRate = 0.7f,
        .crustalAge = 0.3f,
        .atmosphereDensity = 1.2f,
        .greenhouseEffect = 1.1f,
        .planetRadius = 7.2e6,     // Slightly larger than Earth (sync with celestialBody.radius)
        .continentalVariation = 0.5f,
        .climateVariation = 0.3f,
        .randomSeed = 0,
        .celestialBody = {
            .mass = 7.5e24,    // 1.25x Earth mass
            .radius = 7.2e6,   // Slightly larger than Earth
            .gravity = 11.0f,  // Higher gravity
            .rotationPeriod = 20.0f // hours
        }
    };
    
    const PlanetaryDesignTemplate MountainWorld = {
        .name = "Mountain World",
        .description = "Highly mountainous terrain with dramatic elevation changes",
        .waterCoverage = 0.3f,
        .mountainDensity = 0.8f,
        .vegetationCoverage = 0.4f,
        .volcanism = 0.2f,
        .glaciation = 0.3f,
        .temperatureRange = 80.0f,
        .averageTemperature = 5.0f,
        .precipitationLevel = 0.8f,
        .tectonicActivity = 0.8f,
        .erosionRate = 0.3f,
        .crustalAge = 0.7f,
        .atmosphereDensity = 0.8f,
        .greenhouseEffect = 0.9f,
        .planetRadius = 4.5e6,     // Smaller planet (sync with celestialBody.radius)
        .continentalVariation = 0.4f,
        .climateVariation = 0.4f,
        .randomSeed = 0,
        .celestialBody = {
            .mass = 3.3e24,    // Mars-like mass
            .radius = 4.5e6,   // Smaller planet
            .gravity = 7.5f,   // Lower gravity
            .rotationPeriod = 26.0f // hours
        }
    };
    
    const PlanetaryDesignTemplate ForestWorld = {
        .name = "Forest World",
        .description = "Lush world with extensive vegetation coverage",
        .waterCoverage = 0.5f,
        .mountainDensity = 0.3f,
        .vegetationCoverage = 0.85f,
        .volcanism = 0.05f,
        .glaciation = 0.1f,
        .temperatureRange = 50.0f,
        .averageTemperature = 18.0f,
        .precipitationLevel = 1.8f,
        .tectonicActivity = 0.3f,
        .erosionRate = 0.4f,
        .crustalAge = 0.6f,
        .atmosphereDensity = 1.1f,
        .greenhouseEffect = 1.0f,
        .planetRadius = 6.1e6,     // Slightly smaller than Earth (sync with celestialBody.radius)
        .continentalVariation = 0.2f,
        .climateVariation = 0.2f,
        .randomSeed = 0,
        .celestialBody = {
            .mass = 5.5e24,    // Slightly less than Earth
            .radius = 6.1e6,   // Slightly smaller than Earth
            .gravity = 9.2f,   // m/s²
            .rotationPeriod = 22.0f // hours
        }
    };
    
    const PlanetaryDesignTemplate DesertWorld = {
        .name = "Desert World",
        .description = "Arid world with minimal water and vegetation",
        .waterCoverage = 0.1f,
        .mountainDensity = 0.4f,
        .vegetationCoverage = 0.1f,
        .volcanism = 0.1f,
        .glaciation = 0.0f,
        .temperatureRange = 80.0f,
        .averageTemperature = 35.0f,
        .precipitationLevel = 0.2f,
        .tectonicActivity = 0.2f,
        .erosionRate = 0.8f, // High wind erosion
        .crustalAge = 0.8f,
        .atmosphereDensity = 0.9f,
        .greenhouseEffect = 1.2f,
        .planetRadius = 3.4e6,     // Mars radius (sync with celestialBody.radius)
        .continentalVariation = 0.3f,
        .climateVariation = 0.1f,
        .randomSeed = 0,
        .celestialBody = {
            .mass = 6.4e23,    // Mars mass
            .radius = 3.4e6,   // Mars radius
            .gravity = 3.7f,   // Mars gravity
            .rotationPeriod = 24.6f // Mars day
        }
    };
    
    const PlanetaryDesignTemplate IceWorld = {
        .name = "Ice World",
        .description = "Frozen world with extensive glaciation",
        .waterCoverage = 0.6f, // Much of it frozen
        .mountainDensity = 0.2f,
        .vegetationCoverage = 0.05f,
        .volcanism = 0.05f,
        .glaciation = 0.8f,
        .temperatureRange = 30.0f,
        .averageTemperature = -20.0f,
        .precipitationLevel = 0.5f,
        .tectonicActivity = 0.1f,
        .erosionRate = 0.2f, // Slow erosion due to ice
        .crustalAge = 0.9f,
        .atmosphereDensity = 0.7f,
        .greenhouseEffect = 0.8f,
        .planetRadius = 1.6e6,     // Europa radius (sync with celestialBody.radius)
        .continentalVariation = 0.2f,
        .climateVariation = 0.1f,
        .randomSeed = 0,
        .celestialBody = {
            .mass = 1.5e23,    // Europa-like
            .radius = 1.6e6,   // Europa radius
            .gravity = 1.3f,   // Low gravity
            .rotationPeriod = 85.0f // Tidally locked, slow rotation
        }
    };
    
    const PlanetaryDesignTemplate VolcanicWorld = {
        .name = "Volcanic World",
        .description = "Geologically active world with high volcanism",
        .waterCoverage = 0.4f,
        .mountainDensity = 0.6f,
        .vegetationCoverage = 0.3f,
        .volcanism = 0.8f,
        .glaciation = 0.0f,
        .temperatureRange = 60.0f,
        .averageTemperature = 25.0f,
        .precipitationLevel = 1.2f,
        .tectonicActivity = 0.9f,
        .erosionRate = 0.6f,
        .crustalAge = 0.2f, // Young, active crust
        .atmosphereDensity = 1.3f,
        .greenhouseEffect = 1.2f,
        .planetRadius = 1.8e6,     // Io radius (sync with celestialBody.radius)
        .continentalVariation = 0.5f,
        .climateVariation = 0.3f,
        .randomSeed = 0,
        .celestialBody = {
            .mass = 8.9e22,    // Io-like
            .radius = 1.8e6,   // Io radius
            .gravity = 1.8f,   // Low gravity
            .rotationPeriod = 42.0f // hours
        }
    };
}

void TerrainOrchestrator::RegisterPlanetaryTemplate(const std::string& name, const PlanetaryDesignTemplate& template_data) {
    m_templates[name] = template_data;
}

PlanetaryDesignTemplate TerrainOrchestrator::GetTemplate(const std::string& name) const {
    auto it = m_templates.find(name);
    if (it != m_templates.end()) {
        return it->second;
    }
    return {}; // Return default template if not found
}

std::vector<std::string> TerrainOrchestrator::GetAvailableTemplates() const {
    std::vector<std::string> names;
    for (const auto& [name, template_data] : m_templates) {
        names.push_back(name);
    }
    return names;
}

void TerrainOrchestrator::LoadDefaultTemplates() {
    // Load all built-in templates
    RegisterPlanetaryTemplate("Earth-like", Templates::EarthLike);
    RegisterPlanetaryTemplate("Ocean World", Templates::OceanWorld);
    RegisterPlanetaryTemplate("Mountain World", Templates::MountainWorld);
    RegisterPlanetaryTemplate("Forest World", Templates::ForestWorld);
    RegisterPlanetaryTemplate("Desert World", Templates::DesertWorld);
    RegisterPlanetaryTemplate("Ice World", Templates::IceWorld);
    RegisterPlanetaryTemplate("Volcanic World", Templates::VolcanicWorld);
}

// Stub implementations for JSON-related methods (temporarily disabled)
void TerrainOrchestrator::LoadTemplatesFromDirectory(const std::string& directoryPath) {
    // Stub - JSON functionality temporarily disabled
}

bool TerrainOrchestrator::LoadTemplateFromFile(const std::string& filePath) {
    // Stub - JSON functionality temporarily disabled
    return false;
}

bool TerrainOrchestrator::SaveTemplateToFile(const std::string& name, const std::string& filePath) {
    // Stub - JSON functionality temporarily disabled
    return false;
}

void TerrainOrchestrator::SetTerraformingParameter(const std::string& templateName, const std::string& paramName, float value) {
    // Stub - JSON functionality temporarily disabled
}

float TerrainOrchestrator::GetTerraformingParameter(const std::string& templateName, const std::string& paramName) const {
    // Stub - JSON functionality temporarily disabled
    return 0.0f;
}

std::vector<TerraformingSlider> TerrainOrchestrator::GetTerraformingSliders(const std::string& templateName) const {
    // Stub - JSON functionality temporarily disabled
    return {};
}

void TerrainOrchestrator::SetQualityLevel(const std::string& quality) {
    m_qualityLevel = quality;
    
    // Adjust processing parameters based on quality level
    if (quality == "low") {
        // Disable expensive processors for low quality
        m_enabledProcessors["hydraulic_erosion"] = false;
        m_enabledProcessors["climate_generation"] = false;
        m_enabledProcessors["biome_classification"] = false;
    } else if (quality == "medium") {
        // Enable most processors for medium quality
        m_enabledProcessors["hydraulic_erosion"] = true;
        m_enabledProcessors["climate_generation"] = true;
        m_enabledProcessors["biome_classification"] = false; // Still expensive
    } else if (quality == "high" || quality == "ultra") {
        // Enable all processors for high quality
        m_enabledProcessors["continental_features"] = true;
        m_enabledProcessors["gravitational_settling"] = true;
        m_enabledProcessors["hydraulic_erosion"] = true;
        m_enabledProcessors["tectonic_activity"] = true;
        m_enabledProcessors["climate_generation"] = true;
        m_enabledProcessors["biome_classification"] = true;
        m_enabledProcessors["vegetation_placement"] = true;
    }
}

void TerrainOrchestrator::EnableProcessor(const std::string& processorName, bool enabled) {
    m_enabledProcessors[processorName] = enabled;
}

void TerrainOrchestrator::EnableDetailedPhysicsReporting(bool enabled) {
    m_enableDetailedPhysicsReporting = enabled;
}

void TerrainOrchestrator::SetGPUAccelerator(PlanetGen::Generation::IGPUNoiseAccelerator* accelerator) {
    m_gpuAccelerator = accelerator;
    m_gpuInitialized = (accelerator != nullptr);
    LOG_INFO("TerrainOrchestrator", "GPU accelerator {} ({})", 
             accelerator ? "set" : "cleared",
             accelerator ? "GPU mode enabled" : "CPU fallback mode");
}

std::vector<PlanetGen::Generation::Physics::NoisePacket> TerrainOrchestrator::BuildNoisePacketsForErosion(const PlanetaryData& data, PlanetGen::Generation::Analysis::TerrainAnalysisProcessor* analysisProcessor) {
    // Build coordinates
    std::vector<std::pair<float, float>> coordinates;
    coordinates.reserve(data.elevation.data.size());
    for (uint32_t y = 0; y < data.elevation.height; ++y) {
        for (uint32_t x = 0; x < data.elevation.width; ++x) {
            float lat = -90.0f + (180.0f * y) / (data.elevation.height - 1);
            float lon = -180.0f + (360.0f * x) / (data.elevation.width - 1);
            coordinates.emplace_back(lat, lon);
        }
    }
    // Use the analysis processor to build noise packets
    return analysisProcessor->BuildNoisePackets(data.elevation.data, coordinates, nullptr);
}

// ============================================================================
// TerrainOrchestratorFactory Implementation
// ============================================================================

std::unique_ptr<TerrainOrchestrator> TerrainOrchestratorFactory::CreateWithEarthLikeTemplates() {
    auto orchestrator = std::make_unique<TerrainOrchestrator>();
    
    // Load default Earth-like templates
    orchestrator->LoadDefaultTemplates();
    
    return orchestrator;
}

std::unique_ptr<TerrainOrchestrator> TerrainOrchestratorFactory::CreateWithExoplanetTemplates() {
    auto orchestrator = std::make_unique<TerrainOrchestrator>();
    
    // Load exotic planet templates 
    orchestrator->LoadDefaultTemplates();
    
    return orchestrator;
}

std::unique_ptr<TerrainOrchestrator> TerrainOrchestratorFactory::CreateWithCustomTemplates(const std::string& templatesDirectory) {
    auto orchestrator = std::make_unique<TerrainOrchestrator>();
    
    // Load default templates first
    orchestrator->LoadDefaultTemplates();
    
    // Then load custom templates from directory
    if (!templatesDirectory.empty()) {
        orchestrator->LoadTemplatesFromDirectory(templatesDirectory);
    }
    
    return orchestrator;
}

std::unique_ptr<TerrainOrchestrator> TerrainOrchestratorFactory::CreateMinimalOrchestrator() {
    auto orchestrator = std::make_unique<TerrainOrchestrator>();
    
    // Don't load default templates for minimal setup
    return orchestrator;
}

} // namespace PlanetGen::Rendering
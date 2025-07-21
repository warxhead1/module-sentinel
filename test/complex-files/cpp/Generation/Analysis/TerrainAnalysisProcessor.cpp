module;

#include <memory>
#include <vector>
#include <string>
#include <functional>
#include <chrono>
#include <algorithm>
#include <cmath>
#include <limits>
#include <thread>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

module TerrainAnalysisProcessor;

import GLMModule;
import TerrainAnalysisTypes;
import GenerationTypes;
import BiomeClassifier;
import Core.Threading.JobSystem;

namespace PlanetGen::Generation::Analysis {

TerrainAnalysisProcessor::TerrainAnalysisProcessor() 
    : m_biomeClassifier(BiomeClassifierFactory::CreateEarthLikeClassifier()) {
    m_params = TerrainAnalysisParams{};
}

TerrainAnalysisProcessor::TerrainAnalysisProcessor(const TerrainAnalysisParams& params)
    : m_params(params), m_biomeClassifier(BiomeClassifierFactory::CreateEarthLikeClassifier()) {
}

PlanetGen::Generation::Analysis::TerrainAnalysisResult TerrainAnalysisProcessor::ProcessTerrain(
    const std::vector<float>& elevationData,
    const std::vector<std::pair<float, float>>& coordinates,
    const PlanetGen::Generation::Analysis::TerrainAnalysisParams& params) {
    
    using namespace PlanetGen::Generation::Analysis;
    
    auto startTime = std::chrono::high_resolution_clock::now();
    m_diagnostics.clear();
    
    TerrainAnalysisResult result;
    result.analysisPoints.reserve(coordinates.size());
    
    UpdateDiagnostics("TerrainAnalysisProcessor: Starting terrain analysis for " + 
                     std::to_string(coordinates.size()) + " points");
    
    try {
        // Calculate dimensions (assume square grid for now)
        uint32_t width = static_cast<uint32_t>(std::sqrt(coordinates.size()));
        uint32_t height = width;
        
        // Perform comprehensive terrain analysis
        auto analysisResult = AnalyzeTerrainRegion(elevationData, coordinates, width, height, m_params);
        
        // Generate terrain colors and store them in the physics result
        std::vector<vec3> terrainColors;
        std::vector<vec3> terrainNormals;
        std::vector<float> materialProps;
        GenerateTerrainColors(analysisResult, terrainColors, terrainNormals, materialProps);
        
        // Store analysis results in the result structure
        result.analysisPoints = analysisResult.analysisPoints;
        result.biomeDistribution = analysisResult.biomeDistribution;
        result.climateDistribution = analysisResult.climateDistribution;
        result.averageElevation = analysisResult.averageElevation;
        result.averageTemperature = analysisResult.averageTemperature;
        result.averagePrecipitation = analysisResult.averagePrecipitation;
        result.habitabilityIndex = analysisResult.habitabilityIndex;
        result.biodiversityIndex = analysisResult.biodiversityIndex;
        result.fitness = analysisResult.fitness;
        result.metrics = analysisResult.metrics;
        
        // Store color and texture data that can be used by rendering system
        result.terrainColors = terrainColors;
        result.terrainNormals = terrainNormals;
        result.materialProperties = materialProps;
        
        result.processingReport = analysisResult.processingReport + 
                                 " | Biomes: " + std::to_string(analysisResult.biomeDistribution.size()) +
                                 " | Habitability: " + std::to_string(analysisResult.habitabilityIndex);
        result.analysisSuccessful = analysisResult.analysisSuccessful;
        result.pointsAnalyzed = analysisResult.pointsAnalyzed;
        result.processingTimeMs = analysisResult.processingTimeMs;
        
        auto endTime = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime);
        
        UpdateDiagnostics("Terrain analysis completed in " + std::to_string(duration.count()) + "ms");
        UpdateDiagnostics("Analyzed " + std::to_string(analysisResult.pointsAnalyzed) + " terrain points");
        UpdateDiagnostics("Biodiversity index: " + std::to_string(analysisResult.biodiversityIndex));
        UpdateDiagnostics("Average elevation: " + std::to_string(analysisResult.averageElevation) + "m");
        UpdateDiagnostics("Average temperature: " + std::to_string(analysisResult.averageTemperature) + "°C");
        
    } catch (const std::exception& e) {
        UpdateDiagnostics("ERROR: Terrain analysis failed - " + std::string(e.what()));
        result.processingReport = "Terrain analysis failed: " + std::string(e.what());
    }
    
    return result;
}

TerrainAnalysisResult TerrainAnalysisProcessor::AnalyzeTerrainRegion(
    const std::vector<float>& elevationData,
    const std::vector<std::pair<float, float>>& coordinates,
    uint32_t width, uint32_t height,
    const TerrainAnalysisParams& params) {
    
    if (m_enableParallelProcessing && elevationData.size() > m_chunkSize) {
        return AnalyzeTerrainParallel(elevationData, coordinates, width, height, params);
    }
    
    auto startTime = std::chrono::high_resolution_clock::now();
    
    TerrainAnalysisResult result;
    result.pointsAnalyzed = static_cast<uint32_t>(elevationData.size());
    
    if (!ValidateInputData(elevationData, coordinates)) {
        result.analysisSuccessful = false;
        result.processingReport = "Terrain analysis failed: Invalid input data";
        return result;
    }
    
    // Calculate slopes and aspects
    std::vector<float> slopes, aspects;
    CalculateSlopesAndAspects(elevationData, width, height, slopes, aspects);
    
    // Analyze each point
    result.analysisPoints.reserve(elevationData.size());
    for (size_t i = 0; i < elevationData.size(); ++i) {
        auto [lat, lon] = coordinates[i];
        float slope = (i < slopes.size()) ? slopes[i] : 0.0f;
        float aspect = (i < aspects.size()) ? aspects[i] : 0.0f;
        
        // Calculate climate for this point
        float temperature, precipitation, humidity;
        m_biomeClassifier->CalculateClimate(lat, lon, elevationData[i], params, 
                                          temperature, precipitation, humidity);
        
        // Perform detailed analysis
        auto analysisPoint = m_biomeClassifier->AnalyzePoint(
            elevationData[i], temperature, precipitation, slope, lat, lon, params);
        analysisPoint.aspect = aspect;
        
        result.analysisPoints.push_back(analysisPoint);
    }
    
    // Calculate statistics and distributions
    CalculateTerrainStatistics(result);
    AnalyzeBiomeDistribution(result);
    CalculateEcosystemIndices(result);
    
    auto endTime = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime);
    result.processingTimeMs = static_cast<float>(duration.count());
    result.analysisSuccessful = true;
    result.processingReport = "Sequential terrain analysis completed successfully";
    
    return result;
}

TerrainAnalysisResult TerrainAnalysisProcessor::AnalyzeTerrainParallel(
    const std::vector<float>& elevationData,
    const std::vector<std::pair<float, float>>& coordinates,
    uint32_t width, uint32_t height,
    const TerrainAnalysisParams& params) {
    
    auto startTime = std::chrono::high_resolution_clock::now();
    
    TerrainAnalysisResult result;
    result.pointsAnalyzed = static_cast<uint32_t>(elevationData.size());
    result.analysisPoints.resize(elevationData.size());
    
    UpdateDiagnostics("Starting parallel terrain analysis with " + std::to_string(m_chunkSize) + " points per chunk");
    
    // Calculate slopes and aspects first
    std::vector<float> slopes, aspects;
    CalculateSlopesAndAspects(elevationData, width, height, slopes, aspects);
    
    // Create chunks for parallel processing
    auto chunks = CreateAnalysisChunks(elevationData, coordinates, width, height, m_chunkSize);
    
    // Process chunks in parallel using JobSystem
    auto& jobSystem = PlanetGen::Core::Threading::JobSystem::Instance();
    std::vector<PlanetGen::Core::Threading::Job*> jobs;
    
    for (size_t chunkIdx = 0; chunkIdx < chunks.size(); ++chunkIdx) {
        auto job = jobSystem.CreateJob<void>([this, &chunks, chunkIdx, &slopes, &aspects, &params, &result]() {
            auto& chunk = chunks[chunkIdx];
            
            // Process each point in the chunk
            for (size_t i = 0; i < chunk.elevationData.size(); ++i) {
                size_t globalIdx = chunk.startY * chunk.width + chunk.startX + i;
                if (globalIdx >= result.analysisPoints.size()) continue;
                
                auto [lat, lon] = chunk.coordinates[i];
                float slope = (globalIdx < slopes.size()) ? slopes[globalIdx] : 0.0f;
                float aspect = (globalIdx < aspects.size()) ? aspects[globalIdx] : 0.0f;
                
                // Calculate climate
                float temperature, precipitation, humidity;
                m_biomeClassifier->CalculateClimate(lat, lon, chunk.elevationData[i], params, 
                                                  temperature, precipitation, humidity);
                
                // Perform analysis
                auto analysisPoint = m_biomeClassifier->AnalyzePoint(
                    chunk.elevationData[i], temperature, precipitation, slope, lat, lon, params);
                analysisPoint.aspect = aspect;
                
                result.analysisPoints[globalIdx] = analysisPoint;
            }
            
            chunk.processed = true;
        }, ("TerrainAnalysis_Chunk_" + std::to_string(chunkIdx)).c_str());
        
        jobs.push_back(job);
    }
    
    // Schedule and wait for all jobs
    auto handles = jobSystem.ScheduleBatch(jobs);
    for (auto& handle : handles) {
        handle.Wait();
    }
    
    // Clean up jobs
    for (auto* job : jobs) {
        delete job;
    }
    
    // Calculate final statistics
    CalculateTerrainStatistics(result);
    AnalyzeBiomeDistribution(result);
    CalculateEcosystemIndices(result);
    
    auto endTime = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime);
    result.processingTimeMs = static_cast<float>(duration.count());
    result.analysisSuccessful = true;
    result.processingReport = "Parallel terrain analysis completed with " + std::to_string(chunks.size()) + " chunks";
    
    UpdateDiagnostics("Parallel analysis completed in " + std::to_string(duration.count()) + "ms");
    
    return result;
}

void TerrainAnalysisProcessor::GenerateTerrainColors(
    const TerrainAnalysisResult& analysisResult,
    std::vector<vec3>& colors,
    std::vector<vec3>& normals,
    std::vector<float>& materialProperties) const {
    
    colors.clear();
    normals.clear();
    materialProperties.clear();
    
    colors.reserve(analysisResult.analysisPoints.size());
    normals.reserve(analysisResult.analysisPoints.size());
    materialProperties.reserve(analysisResult.analysisPoints.size() * 3); // roughness, metallic, specular
    
    for (const auto& point : analysisResult.analysisPoints) {
        // Store base color
        colors.push_back(point.color.baseColor);
        
        // Calculate normal based on slope and aspect
        float slopeRad = point.slope;
        float aspectRad = point.aspect * M_PI / 180.0f;
        
        vec3 normal;
        normal.x = std::sin(slopeRad) * std::cos(aspectRad);
        normal.y = std::cos(slopeRad);
        normal.z = std::sin(slopeRad) * std::sin(aspectRad);
        normals.push_back(normalize(normal));
        
        // Store material properties
        materialProperties.push_back(point.color.roughness);
        materialProperties.push_back(point.color.metallic);
        materialProperties.push_back(point.color.specular);
    }
    
    UpdateDiagnostics("Generated " + std::to_string(colors.size()) + " terrain colors and normals");
}

std::vector<TerrainChunk> TerrainAnalysisProcessor::CreateAnalysisChunks(
    const std::vector<float>& elevationData,
    const std::vector<std::pair<float, float>>& coordinates,
    uint32_t width, uint32_t height,
    uint32_t chunkSize) const {
    
    std::vector<TerrainChunk> chunks;
    
    uint32_t chunksPerRow = (width + chunkSize - 1) / chunkSize;
    uint32_t chunksPerCol = (height + chunkSize - 1) / chunkSize;
    
    for (uint32_t chunkY = 0; chunkY < chunksPerCol; ++chunkY) {
        for (uint32_t chunkX = 0; chunkX < chunksPerRow; ++chunkX) {
            TerrainChunk chunk;
            chunk.chunkId = chunkY * chunksPerRow + chunkX;
            chunk.startX = chunkX * chunkSize;
            chunk.startY = chunkY * chunkSize;
            chunk.width = std::min(chunkSize, width - chunk.startX);
            chunk.height = std::min(chunkSize, height - chunk.startY);
            chunk.analysisParams = m_params;
            
            // Copy relevant elevation data and coordinates
            chunk.elevationData.reserve(chunk.width * chunk.height);
            chunk.coordinates.reserve(chunk.width * chunk.height);
            
            for (uint32_t y = 0; y < chunk.height; ++y) {
                for (uint32_t x = 0; x < chunk.width; ++x) {
                    uint32_t globalIdx = (chunk.startY + y) * width + (chunk.startX + x);
                    if (globalIdx < elevationData.size()) {
                        chunk.elevationData.push_back(elevationData[globalIdx]);
                        chunk.coordinates.push_back(coordinates[globalIdx]);
                    }
                }
            }
            
            chunks.push_back(std::move(chunk));
        }
    }
    
    return chunks;
}

void TerrainAnalysisProcessor::CalculateSlopesAndAspects(
    const std::vector<float>& elevations,
    uint32_t width, uint32_t height,
    std::vector<float>& slopes,
    std::vector<float>& aspects) const {
    
    slopes.resize(elevations.size(), 0.0f);
    aspects.resize(elevations.size(), 0.0f);
    
    // Use Sobel operator for gradient calculation (from original TerrainAnalysis.cpp)
    for (uint32_t y = 1; y < height - 1; ++y) {
        for (uint32_t x = 1; x < width - 1; ++x) {
            uint32_t idx = y * width + x;
            
            // Calculate gradients using Sobel operator
            float dzdx = (elevations[idx + 1] - elevations[idx - 1]) / 2.0f;
            float dzdy = (elevations[(y + 1) * width + x] - elevations[(y - 1) * width + x]) / 2.0f;
            
            // Calculate slope magnitude
            slopes[idx] = std::sqrt(dzdx * dzdx + dzdy * dzdy);
            
            // Calculate aspect (direction of steepest descent)
            if (dzdx != 0.0f || dzdy != 0.0f) {
                float aspectValue = std::atan2(dzdy, -dzdx) * 180.0f / M_PI;
                if (aspectValue < 0.0f) aspectValue += 360.0f;
                aspects[idx] = aspectValue;
            }
        }
    }
}

void TerrainAnalysisProcessor::CalculateTerrainStatistics(TerrainAnalysisResult& result) const {
    if (result.analysisPoints.empty()) return;
    
    float totalElevation = 0.0f;
    float totalTemperature = 0.0f;
    float totalPrecipitation = 0.0f;
    float totalSlope = 0.0f;
    float minElevation = std::numeric_limits<float>::max();
    float maxElevation = std::numeric_limits<float>::lowest();
    float minTemp = std::numeric_limits<float>::max();
    float maxTemp = std::numeric_limits<float>::lowest();
    float minPrecip = std::numeric_limits<float>::max();
    float maxPrecip = std::numeric_limits<float>::lowest();
    float maxSlope = 0.0f;
    
    // First pass: calculate basic stats
    for (const auto& point : result.analysisPoints) {
        totalElevation += point.elevation;
        totalTemperature += point.temperature;
        totalPrecipitation += point.precipitation;
        totalSlope += point.slope;
        
        minElevation = std::min(minElevation, point.elevation);
        maxElevation = std::max(maxElevation, point.elevation);
        minTemp = std::min(minTemp, point.temperature);
        maxTemp = std::max(maxTemp, point.temperature);
        minPrecip = std::min(minPrecip, point.precipitation);
        maxPrecip = std::max(maxPrecip, point.precipitation);
        maxSlope = std::max(maxSlope, point.slope);
    }
    
    size_t numPoints = result.analysisPoints.size();
    result.averageElevation = totalElevation / numPoints;
    result.averageTemperature = totalTemperature / numPoints;
    result.averagePrecipitation = totalPrecipitation / numPoints;
    
    // Calculate detailed metrics
    result.metrics.elevationRange = maxElevation - minElevation;
    result.metrics.averageSlope = totalSlope / numPoints;
    result.metrics.maxSlope = maxSlope;
    result.metrics.temperatureRange = maxTemp - minTemp;
    result.metrics.precipitationRange = maxPrecip - minPrecip;
    
    // Second pass: calculate variance and advanced metrics
    float elevVariance = 0.0f;
    float slopeVariance = 0.0f;
    float humidityVariance = 0.0f;
    float elevSkewSum = 0.0f;
    float elevKurtSum = 0.0f;
    uint32_t waterCount = 0;
    uint32_t mountainCount = 0;
    uint32_t transitionCount = 0;
    
    for (const auto& point : result.analysisPoints) {
        // Variance calculations
        float elevDiff = point.elevation - result.averageElevation;
        elevVariance += elevDiff * elevDiff;
        elevSkewSum += elevDiff * elevDiff * elevDiff;
        elevKurtSum += elevDiff * elevDiff * elevDiff * elevDiff;
        
        float slopeDiff = point.slope - result.metrics.averageSlope;
        slopeVariance += slopeDiff * slopeDiff;
        
        humidityVariance += (point.humidity - 0.5f) * (point.humidity - 0.5f);
        
        // Feature counting
        if (point.elevation < 0.0f) waterCount++;
        if (point.primaryBiome == BiomeType::Mountain || point.primaryBiome == BiomeType::HighMountain) {
            mountainCount++;
        }
        if (point.biomeBlend > 0.1f) transitionCount++;
    }
    
    // Calculate final variance metrics
    result.metrics.elevationVariance = elevVariance / numPoints;
    result.metrics.slopeVariance = slopeVariance / numPoints;
    result.metrics.humidityVariance = humidityVariance / numPoints;
    
    // Calculate skewness and kurtosis
    float elevStdDev = std::sqrt(result.metrics.elevationVariance);
    if (elevStdDev > 0.0f) {
        result.metrics.elevationSkewness = (elevSkewSum / numPoints) / (elevStdDev * elevStdDev * elevStdDev);
        result.metrics.elevationKurtosis = (elevKurtSum / numPoints) / (elevStdDev * elevStdDev * elevStdDev * elevStdDev) - 3.0f;
    }
    
    // Calculate fitness components
    result.fitness.waterCoverage = static_cast<float>(waterCount) / numPoints;
    result.fitness.mountainCoverage = static_cast<float>(mountainCount) / numPoints;
    
    // Calculate biome variety (using Shannon entropy from biodiversity)
    float biomeEntropy = 0.0f;
    uint32_t uniqueBiomes = 0;
    for (uint32_t count : result.biomeDistribution) {
        if (count > 0) {
            uniqueBiomes++;
            float proportion = static_cast<float>(count) / numPoints;
            biomeEntropy -= proportion * std::log(proportion);
        }
    }
    result.fitness.biomeVariety = biomeEntropy / std::log(static_cast<float>(BiomeType::COUNT));
    
    // Calculate terrain realism based on elevation distribution
    float elevNormalizedKurtosis = std::abs(result.metrics.elevationKurtosis) / 10.0f;
    result.fitness.terrainRealism = 1.0f - std::min(1.0f, elevNormalizedKurtosis);
    
    // Calculate climate coherence
    float tempCoherence = 1.0f - std::min(1.0f, std::abs(result.averageTemperature - 15.0f) / 50.0f);
    float precipCoherence = 1.0f - std::min(1.0f, std::abs(result.averagePrecipitation - 1000.0f) / 3000.0f);
    result.fitness.climateCoherence = (tempCoherence + precipCoherence) * 0.5f;
    
    // Calculate geological accuracy (placeholder - enhance based on actual geology)
    result.fitness.geologicalAccuracy = 0.7f; // TODO: Implement based on slope/elevation relationships
    
    // Calculate transition smoothness
    result.metrics.totalTransitions = transitionCount;
    result.metrics.transitionDensity = static_cast<float>(transitionCount) / numPoints;
    result.fitness.transitionSmoothness = std::min(1.0f, result.metrics.transitionDensity * 10.0f);
    
    // Calculate feature distribution
    float waterTarget = 0.7f; // Earth-like
    float mountainTarget = 0.1f;
    float waterDiff = std::abs(result.fitness.waterCoverage - waterTarget);
    float mountainDiff = std::abs(result.fitness.mountainCoverage - mountainTarget);
    result.fitness.featureDistribution = 1.0f - (waterDiff + mountainDiff) * 0.5f;
    
    // Calculate overall fitness
    result.CalculateOverallFitness();
}

void TerrainAnalysisProcessor::AnalyzeBiomeDistribution(TerrainAnalysisResult& result) const {
    // Reset distribution counters
    std::fill(result.biomeDistribution.begin(), result.biomeDistribution.end(), 0);
    std::fill(result.climateDistribution.begin(), result.climateDistribution.end(), 0);
    
    for (const auto& point : result.analysisPoints) {
        uint32_t biomeIndex = static_cast<uint32_t>(point.primaryBiome);
        uint32_t climateIndex = static_cast<uint32_t>(point.climateZone);
        
        if (biomeIndex < result.biomeDistribution.size()) {
            result.biomeDistribution[biomeIndex]++;
        }
        if (climateIndex < result.climateDistribution.size()) {
            result.climateDistribution[climateIndex]++;
        }
    }
}

void TerrainAnalysisProcessor::CalculateEcosystemIndices(TerrainAnalysisResult& result) const {
    if (result.analysisPoints.empty()) return;
    
    // Calculate biodiversity index (Shannon diversity)
    float biodiversity = 0.0f;
    size_t totalPoints = result.analysisPoints.size();
    
    for (uint32_t count : result.biomeDistribution) {
        if (count > 0) {
            float proportion = static_cast<float>(count) / totalPoints;
            biodiversity -= proportion * std::log(proportion);
        }
    }
    result.biodiversityIndex = biodiversity / std::log(static_cast<float>(BiomeType::COUNT));
    
    // Calculate average habitability
    float totalHabitability = 0.0f;
    for (const auto& point : result.analysisPoints) {
        totalHabitability += point.habitability;
    }
    result.habitabilityIndex = totalHabitability / totalPoints;
}

bool TerrainAnalysisProcessor::ValidateInputData(
    const std::vector<float>& elevationData,
    const std::vector<std::pair<float, float>>& coordinates) const {
    
    if (elevationData.empty()) {
        UpdateDiagnostics("ERROR: Elevation data cannot be empty");
        return false;
    }
    
    if (elevationData.size() != coordinates.size()) {
        UpdateDiagnostics("ERROR: Elevation data and coordinates must have the same size");
        return false;
    }
    
    // Check for valid coordinate ranges
    for (const auto& [lat, lon] : coordinates) {
        if (lat < -90.0f || lat > 90.0f) {
            UpdateDiagnostics("ERROR: Invalid latitude: " + std::to_string(lat));
            return false;
        }
        if (lon < -180.0f || lon > 180.0f) {
            UpdateDiagnostics("ERROR: Invalid longitude: " + std::to_string(lon));
            return false;
        }
    }
    
    return true;
}

std::string TerrainAnalysisProcessor::GenerateAnalysisReport(const TerrainAnalysisResult& result) const {
    std::string report = "=== Terrain Analysis Report ===\n";
    report += "Points analyzed: " + std::to_string(result.pointsAnalyzed) + "\n";
    report += "Processing time: " + std::to_string(result.processingTimeMs) + " ms\n";
    report += "Average elevation: " + std::to_string(result.averageElevation) + " m\n";
    report += "Average temperature: " + std::to_string(result.averageTemperature) + " C\n";
    report += "Average precipitation: " + std::to_string(result.averagePrecipitation) + " mm/year\n";
    report += "Habitability index: " + std::to_string(result.habitabilityIndex) + "\n";
    report += "Biodiversity index: " + std::to_string(result.biodiversityIndex) + "\n";
    
    report += "\nBiome Distribution:\n";
    const char* biomeNames[] = {
        "Ocean", "Deep Ocean", "Shallow Sea", "Beach", "Desert", "Desert Oasis",
        "Grassland", "Savanna", "Temperate Forest", "Tropical Rainforest", "Boreal Forest",
        "Tundra", "Alpine Tundra", "Taiga", "Mountain", "High Mountain", "Glacier", "Ice Cap",
        "Wetland", "Marsh", "River Delta", "Volcanic Wasteland", "Lava Field"
    };
    
    for (size_t i = 0; i < result.biomeDistribution.size() && i < sizeof(biomeNames)/sizeof(biomeNames[0]); ++i) {
        if (result.biomeDistribution[i] > 0) {
            float percentage = 100.0f * result.biomeDistribution[i] / result.pointsAnalyzed;
            report += "  " + std::string(biomeNames[i]) + ": " + std::to_string(percentage) + "%\n";
        }
    }
    
    return report;
}

std::vector<PlanetGen::Generation::Physics::NoisePacket> TerrainAnalysisProcessor::BuildNoisePackets(
    const std::vector<float>& elevationData,
    const std::vector<std::pair<float, float>>& coordinates,
    const TerrainAnalysisResult* analysisResultPtr) const {
    // If analysisResultPtr is null, run analysis
    TerrainAnalysisResult analysisResult;
    if (analysisResultPtr) {
        analysisResult = *analysisResultPtr;
    } else {
        uint32_t width = static_cast<uint32_t>(std::sqrt(elevationData.size()));
        uint32_t height = width;
        analysisResult = const_cast<TerrainAnalysisProcessor*>(this)->AnalyzeTerrainRegion(elevationData, coordinates, width, height, m_params);
    }
    std::vector<PlanetGen::Generation::Physics::NoisePacket> packets;
    packets.reserve(elevationData.size());
    for (size_t i = 0; i < elevationData.size(); ++i) {
        PlanetGen::Generation::Physics::NoisePacket pkt;
        pkt.baseHeight = elevationData[i];
        // Map primaryBiome to terrainMask (must match shader enum)
        // OCEAN_DEEP = 0, OCEAN_SHALLOW = 1, COASTAL = 2, LOWLAND = 3, HIGHLAND = 4, MOUNTAIN = 5, PEAK = 6
        uint32_t terrainMask = 3; // Default to LOWLAND
        if (i < analysisResult.analysisPoints.size()) {
            auto biome = analysisResult.analysisPoints[i].primaryBiome;
            switch (biome) {
                case BiomeType::Ocean: terrainMask = 0; break;
                case BiomeType::DeepOcean: terrainMask = 0; break;
                case BiomeType::ShallowSea: terrainMask = 1; break;
                case BiomeType::Beach: terrainMask = 2; break;
                case BiomeType::Grassland:
                case BiomeType::Savanna:
                case BiomeType::TemperateForest:
                case BiomeType::TropicalRainforest:
                case BiomeType::BorealForest:
                case BiomeType::Wetland:
                case BiomeType::Marsh:
                case BiomeType::RiverDelta:
                case BiomeType::Desert:
                case BiomeType::DesertOasis:
                    terrainMask = 3; break; // LOWLAND
                case BiomeType::Taiga:
                case BiomeType::Tundra:
                case BiomeType::AlpineTundra:
                    terrainMask = 4; break; // HIGHLAND
                case BiomeType::Mountain:
                case BiomeType::HighMountain:
                    terrainMask = 5; break; // MOUNTAIN
                case BiomeType::Glacier:
                case BiomeType::IceCap:
                    terrainMask = 6; break; // PEAK (use for ice/glacier as well)
                case BiomeType::VolcanicWasteland:
                case BiomeType::LavaField:
                    terrainMask = 5; break; // MOUNTAIN (volcanic)
                default:
                    terrainMask = 3; // LOWLAND
            }
        }
        pkt.terrainMask = terrainMask;
        pkt.detailLevel = 0; // Not used yet
        pkt.featureFlags = 0; // Not used yet
        packets.push_back(pkt);
    }
    return packets;
}

// Factory implementations
std::unique_ptr<TerrainAnalysisProcessor> TerrainAnalysisProcessorFactory::CreateEarthLikeProcessor() {
    TerrainAnalysisParams params;
    params.seaLevel = 0.0f;
    params.equatorTemperature = 30.0f;
    params.poleTemperature = -40.0f;
    params.useRealisticColors = true;
    params.enableDetailedAnalysis = true;
    params.enableParallelProcessing = true;
    
    auto processor = std::make_unique<TerrainAnalysisProcessor>(params);
    processor->SetBiomeClassifier(BiomeClassifierFactory::CreateEarthLikeClassifier());
    return processor;
}

std::unique_ptr<TerrainAnalysisProcessor> TerrainAnalysisProcessorFactory::CreateMarsLikeProcessor() {
    TerrainAnalysisParams params;
    params.seaLevel = -2000.0f; // No sea level on Mars
    params.equatorTemperature = 20.0f;
    params.poleTemperature = -80.0f;
    params.useRealisticColors = true;
    params.enableDetailedAnalysis = true;
    params.enableParallelProcessing = true;
    
    auto processor = std::make_unique<TerrainAnalysisProcessor>(params);
    processor->SetBiomeClassifier(BiomeClassifierFactory::CreateMarsLikeClassifier());
    return processor;
}

std::unique_ptr<TerrainAnalysisProcessor> TerrainAnalysisProcessorFactory::CreateArcticProcessor() {
    TerrainAnalysisParams params;
    params.seaLevel = 0.0f;
    params.equatorTemperature = -10.0f;
    params.poleTemperature = -60.0f;
    params.useRealisticColors = true;
    params.enableDetailedAnalysis = true;
    params.enableParallelProcessing = true;
    
    auto processor = std::make_unique<TerrainAnalysisProcessor>(params);
    processor->SetBiomeClassifier(BiomeClassifierFactory::CreateArcticClassifier());
    return processor;
}

std::unique_ptr<TerrainAnalysisProcessor> TerrainAnalysisProcessorFactory::CreateDesertProcessor() {
    TerrainAnalysisParams params;
    params.seaLevel = -1000.0f; // Dry world
    params.equatorTemperature = 45.0f;
    params.poleTemperature = 10.0f;
    params.useRealisticColors = true;
    params.enableDetailedAnalysis = true;
    params.enableParallelProcessing = true;
    
    auto processor = std::make_unique<TerrainAnalysisProcessor>(params);
    processor->SetBiomeClassifier(BiomeClassifierFactory::CreateDesertClassifier());
    return processor;
}

std::unique_ptr<TerrainAnalysisProcessor> TerrainAnalysisProcessorFactory::CreateOceanWorldProcessor() {
    TerrainAnalysisParams params;
    params.seaLevel = 1000.0f; // High sea level
    params.equatorTemperature = 25.0f;
    params.poleTemperature = -5.0f;
    params.useRealisticColors = true;
    params.enableDetailedAnalysis = true;
    params.enableParallelProcessing = true;
    
    auto processor = std::make_unique<TerrainAnalysisProcessor>(params);
    processor->SetBiomeClassifier(BiomeClassifierFactory::CreateOceanWorldClassifier());
    return processor;
}

std::unique_ptr<TerrainAnalysisProcessor> TerrainAnalysisProcessorFactory::CreateVolcanicProcessor() {
    TerrainAnalysisParams params;
    params.seaLevel = 0.0f;
    params.equatorTemperature = 35.0f;
    params.poleTemperature = -20.0f;
    params.useRealisticColors = true;
    params.enableDetailedAnalysis = true;
    params.enableParallelProcessing = true;
    
    auto processor = std::make_unique<TerrainAnalysisProcessor>(params);
    processor->SetBiomeClassifier(BiomeClassifierFactory::CreateVolcanicClassifier());
    return processor;
}

std::unique_ptr<TerrainAnalysisProcessor> TerrainAnalysisProcessorFactory::CreateHighPerformanceProcessor() {
    TerrainAnalysisParams params;
    params.enableDetailedAnalysis = false; // Faster processing
    params.enableParallelProcessing = true;
    params.maxThreads = std::thread::hardware_concurrency();
    params.chunkSize = 2048; // Larger chunks for better parallelization
    
    auto processor = std::make_unique<TerrainAnalysisProcessor>(params);
    processor->SetMaxThreads(params.maxThreads);
    processor->SetChunkSize(params.chunkSize);
    return processor;
}

std::unique_ptr<TerrainAnalysisProcessor> TerrainAnalysisProcessorFactory::CreateCustomProcessor(
    const TerrainAnalysisParams& params,
    std::unique_ptr<BiomeClassifier> classifier) {
    
    auto processor = std::make_unique<TerrainAnalysisProcessor>(params);
    if (classifier) {
        processor->SetBiomeClassifier(std::move(classifier));
    }
    return processor;
}

// Additional factory methods would be implemented here for other planet types...

} // namespace PlanetGen::Generation::Analysis
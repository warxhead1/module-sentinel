module;

#include <memory>
#include <vector>
#include <unordered_map>
#include <algorithm>
#include <cmath>
#include <functional>
#include <queue>
#include <numeric>
#include <string>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

module MountainStructureAnalyzer;

import GLMModule;
import TerrainAnalysisTypes;
import GenerationTypes;

namespace PlanetGen::Generation::Analysis {

MountainStructureAnalyzer::MountainStructureAnalyzer() = default;

TectonicActivity MountainStructureAnalyzer::AnalyzeTectonicRealism(const PlanetaryData& data) {
    TectonicActivity activity;
    
    if (data.elevation.data.empty()) return activity;
    
    // Analyze mountain chain formation
    auto mountainChains = DetectMountainChains(data);
    activity.ridgeFormation = EvaluateRidgeFormation(mountainChains, data);
    
    // Analyze valley systems  
    activity.valleyCarving = EvaluateValleyCarving(data);
    
    // Analyze plateau formation
    activity.plateauFormation = EvaluatePlateauFormation(data);
    
    // Analyze coastline complexity
    activity.coastalComplexity = EvaluateCoastalComplexity(data);
    
    // Calculate overall tectonic realism
    activity.overallRealism = (activity.ridgeFormation * 0.3f + 
                             activity.valleyCarving * 0.25f +
                             activity.plateauFormation * 0.2f + 
                             activity.coastalComplexity * 0.25f);
    
    return activity;
}

ErosionAnalysis MountainStructureAnalyzer::AnalyzeErosionRealism(const PlanetaryData& data) {
    ErosionAnalysis erosion;
    
    if (data.elevation.data.empty()) return erosion;
    
    // Water erosion patterns (river valleys, drainage)
    erosion.waterErosionPattern = AnalyzeWaterErosionPatterns(data);
    
    // Wind erosion patterns (for arid regions)
    erosion.windErosionPattern = AnalyzeWindErosionPatterns(data);
    
    // Glacial erosion patterns (high elevation areas)
    erosion.glacialErosionPattern = AnalyzeGlacialErosionPatterns(data);
    
    // Overall erosion realism
    erosion.overallErosionRealism = (erosion.waterErosionPattern * 0.5f +
                                   erosion.windErosionPattern * 0.3f +
                                   erosion.glacialErosionPattern * 0.2f);
    
    return erosion;
}

std::unordered_map<std::string, float> MountainStructureAnalyzer::GetParameterRecommendations(
    const PlanetaryData& data, 
    const TectonicActivity& tectonic,
    const ErosionAnalysis& erosion) {
    
    std::unordered_map<std::string, float> recommendations;
    
    // Tectonic activity adjustments
    if (tectonic.ridgeFormation < 0.3f) {
        recommendations["tectonicActivity"] = std::min(1.0f, recommendations["tectonicActivity"] + 0.2f);
        recommendations["mountainDensity"] = std::min(1.0f, recommendations["mountainDensity"] + 0.15f);
    }
    
    // Erosion rate adjustments
    if (erosion.waterErosionPattern < 0.4f) {
        recommendations["erosionRate"] = std::min(1.0f, recommendations["erosionRate"] + 0.1f);
        recommendations["precipitationLevel"] = std::min(2.0f, recommendations["precipitationLevel"] + 0.3f);
    }
    
    // Valley formation adjustments
    if (tectonic.valleyCarving < 0.3f) {
        recommendations["hydraulicErosion"] = std::min(1.0f, recommendations["hydraulicErosion"] + 0.2f);
    }
    
    // Plateau formation adjustments  
    if (tectonic.plateauFormation < 0.2f) {
        recommendations["crustalAge"] = std::max(0.0f, recommendations["crustalAge"] - 0.1f); // Older crust = more plateaus
    }
    
    return recommendations;
}

std::vector<MountainChain> MountainStructureAnalyzer::DetectMountainChains(const PlanetaryData& data) {
    std::vector<MountainChain> chains;
    
    // Find peaks (local maxima above threshold)
    std::vector<size_t> peaks = FindPeaks(data);
    
    // Group peaks into chains using connectivity analysis
    chains = GroupPeaksIntoChains(peaks, data);
    
    return chains;
}

std::vector<size_t> MountainStructureAnalyzer::FindPeaks(const PlanetaryData& data) {
    std::vector<size_t> peaks;
    
    float elevationThreshold = data.seaLevel + 500.0f; // At least 500m above sea level
    
    // Use sampling for faster analysis - check every 4th pixel
    const uint32_t sampleStep = 4;
    
    for (uint32_t y = sampleStep; y < data.elevation.height - sampleStep; y += sampleStep) {
        for (uint32_t x = sampleStep; x < data.elevation.width - sampleStep; x += sampleStep) {
            size_t idx = y * data.elevation.width + x;
            float currentElevation = data.elevation.data[idx];
            
            if (currentElevation < elevationThreshold) continue;
            
            // Check if this is a local maximum
            bool isPeak = true;
            for (int dy = -1; dy <= 1 && isPeak; ++dy) {
                for (int dx = -1; dx <= 1 && isPeak; ++dx) {
                    if (dx == 0 && dy == 0) continue;
                    
                    int nx = static_cast<int>(x) + dx;
                    int ny = static_cast<int>(y) + dy;
                    
                    // Bounds check
                    if (nx < 0 || nx >= static_cast<int>(data.elevation.width) || 
                        ny < 0 || ny >= static_cast<int>(data.elevation.height)) {
                        continue;
                    }
                    
                    size_t neighborIdx = ny * data.elevation.width + nx;
                    if (data.elevation.data[neighborIdx] > currentElevation) {
                        isPeak = false;
                    }
                }
            }
            
            if (isPeak) {
                peaks.push_back(idx);
            }
        }
    }
    
    return peaks;
}

std::vector<MountainChain> MountainStructureAnalyzer::GroupPeaksIntoChains(const std::vector<size_t>& peaks, const PlanetaryData& data) {
    std::vector<MountainChain> chains;
    std::vector<bool> visited(peaks.size(), false);
    
    for (size_t i = 0; i < peaks.size(); ++i) {
        if (visited[i]) continue;
        
        MountainChain chain;
        std::queue<size_t> toProcess;
        toProcess.push(i);
        visited[i] = true;
        
        while (!toProcess.empty()) {
            size_t peakIdx = toProcess.front();
            toProcess.pop();
            chain.peakIndices.push_back(peaks[peakIdx]);
            
            // Find nearby peaks to add to this chain
            for (size_t j = 0; j < peaks.size(); ++j) {
                if (visited[j]) continue;
                
                float distance = CalculateDistance(peaks[peakIdx], peaks[j], data.elevation.width);
                if (distance < 10.0f) { // Within 10 grid cells
                    visited[j] = true;
                    toProcess.push(j);
                }
            }
        }
        
        if (chain.peakIndices.size() >= 3) { // Need at least 3 peaks for a chain
            chains.push_back(chain);
        }
    }
    
    return chains;
}

float MountainStructureAnalyzer::CalculateDistance(size_t idx1, size_t idx2, uint32_t width) {
    uint32_t x1 = idx1 % width;
    uint32_t y1 = idx1 / width;
    uint32_t x2 = idx2 % width;
    uint32_t y2 = idx2 / width;
    
    return std::sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
}

float MountainStructureAnalyzer::EvaluateRidgeFormation(const std::vector<MountainChain>& chains, const PlanetaryData& data) {
    if (chains.empty()) return 0.0f;
    
    float ridgeScore = 0.0f;
    int validChains = 0;
    
    for (const auto& chain : chains) {
        if (chain.peakIndices.size() < 5) continue; // Need sufficient length
        
        // Analyze if peaks form a linear ridge
        float linearity = CalculateChainLinearity(chain, data);
        float elevationConsistency = CalculateElevationConsistency(chain, data);
        
        float chainScore = (linearity + elevationConsistency) * 0.5f;
        ridgeScore += chainScore;
        validChains++;
    }
    
    return validChains > 0 ? ridgeScore / validChains : 0.0f;
}

float MountainStructureAnalyzer::CalculateChainLinearity(const MountainChain& chain, const PlanetaryData& data) {
    // Calculate how linear the mountain chain is (realistic mountain chains are often linear)
    if (chain.peakIndices.size() < 3) return 0.0f;
    
    // Simple linearity check using variance from best-fit line
    // More sophisticated implementation would use proper linear regression
    return 0.5f; // Placeholder - would implement proper linearity analysis
}

float MountainStructureAnalyzer::CalculateElevationConsistency(const MountainChain& chain, const PlanetaryData& data) {
    // Check if elevations within chain are reasonably consistent
    if (chain.peakIndices.empty()) return 0.0f;
    
    std::vector<float> elevations;
    for (size_t idx : chain.peakIndices) {
        elevations.push_back(data.elevation.data[idx]);
    }
    
    float mean = std::accumulate(elevations.begin(), elevations.end(), 0.0f) / elevations.size();
    float variance = 0.0f;
    for (float elev : elevations) {
        variance += (elev - mean) * (elev - mean);
    }
    variance /= elevations.size();
    
    // Lower variance = more consistent = better score
    float consistency = 1.0f / (1.0f + variance / (mean * mean)); // Normalized by mean
    return std::clamp(consistency, 0.0f, 1.0f);
}

float MountainStructureAnalyzer::EvaluateValleyCarving(const PlanetaryData& data) {
    // Analyze valley patterns - realistic terrain has valleys between mountains
    float valleyScore = 0.0f;
    int valleyCount = 0;
    
    // Use sampling for faster analysis
    const uint32_t sampleStep = 4;
    
    for (uint32_t y = sampleStep; y < data.elevation.height - sampleStep; y += sampleStep) {
        for (uint32_t x = sampleStep; x < data.elevation.width - sampleStep; x += sampleStep) {
            size_t idx = y * data.elevation.width + x;
            
            // Look for valley patterns (low points surrounded by higher elevation)
            if (IsValleyPoint(idx, data)) {
                valleyScore += AnalyzeValleyDepth(idx, data);
                valleyCount++;
            }
        }
    }
    
    return valleyCount > 0 ? valleyScore / valleyCount : 0.0f;
}

bool MountainStructureAnalyzer::IsValleyPoint(size_t idx, const PlanetaryData& data) {
    float currentElevation = data.elevation.data[idx];
    
    uint32_t x = idx % data.elevation.width;
    uint32_t y = idx / data.elevation.width;
    
    // Check if surrounded by higher elevations (simplified valley detection)
    for (int dy = -1; dy <= 1; ++dy) {
        for (int dx = -1; dx <= 1; ++dx) {
            if (dx == 0 && dy == 0) continue;
            
            int nx = static_cast<int>(x) + dx;
            int ny = static_cast<int>(y) + dy;
            
            // Bounds check
            if (nx < 0 || nx >= static_cast<int>(data.elevation.width) || 
                ny < 0 || ny >= static_cast<int>(data.elevation.height)) {
                continue;
            }
            
            size_t neighborIdx = ny * data.elevation.width + nx;
            if (data.elevation.data[neighborIdx] <= currentElevation) {
                return false; // Not a valley if any neighbor is lower
            }
        }
    }
    return true;
}

float MountainStructureAnalyzer::AnalyzeValleyDepth(size_t idx, const PlanetaryData& data) {
    // Analyze depth and shape of valley for realism
    float currentElevation = data.elevation.data[idx];
    float maxSurroundingElevation = currentElevation;
    
    uint32_t x = idx % data.elevation.width;
    uint32_t y = idx / data.elevation.width;
    
    // Find highest surrounding elevation
    for (int dy = -2; dy <= 2; ++dy) {
        for (int dx = -2; dx <= 2; ++dx) {
            int nx = static_cast<int>(x) + dx;
            int ny = static_cast<int>(y) + dy;
            
            if (nx < 0 || nx >= static_cast<int>(data.elevation.width) ||
                ny < 0 || ny >= static_cast<int>(data.elevation.height)) continue;
                
            size_t neighborIdx = ny * data.elevation.width + nx;
            maxSurroundingElevation = std::max(maxSurroundingElevation, data.elevation.data[neighborIdx]);
        }
    }
    
    float depth = maxSurroundingElevation - currentElevation;
    
    // Score based on realistic valley depth (100m - 2000m is typical)
    if (depth >= 100.0f && depth <= 2000.0f) {
        return 1.0f;
    } else if (depth > 50.0f && depth < 3000.0f) {
        return 0.5f;
    }
    return 0.0f;
}

float MountainStructureAnalyzer::EvaluatePlateauFormation(const PlanetaryData& data) {
    // Look for large flat elevated areas (plateaus)
    // Placeholder implementation
    return 0.3f; // Would implement proper plateau detection
}

float MountainStructureAnalyzer::EvaluateCoastalComplexity(const PlanetaryData& data) {
    // Analyze coastline fractal dimension and complexity
    // Placeholder implementation  
    return 0.4f; // Would implement proper coastline analysis
}

float MountainStructureAnalyzer::AnalyzeWaterErosionPatterns(const PlanetaryData& data) {
    // Look for river valley patterns and drainage networks
    // Placeholder implementation
    return 0.4f; // Would implement proper drainage analysis
}

float MountainStructureAnalyzer::AnalyzeWindErosionPatterns(const PlanetaryData& data) {
    // Look for wind erosion patterns in arid regions
    // Placeholder implementation
    return 0.3f; // Would implement proper wind erosion analysis
}

float MountainStructureAnalyzer::AnalyzeGlacialErosionPatterns(const PlanetaryData& data) {
    // Look for U-shaped valleys and cirques in high elevation areas
    // Placeholder implementation
    return 0.2f; // Would implement proper glacial analysis
}

std::unique_ptr<MountainStructureAnalyzer> MountainStructureAnalyzerFactory::CreateEarthLikeAnalyzer() {
    return std::make_unique<MountainStructureAnalyzer>();
}

std::unique_ptr<MountainStructureAnalyzer> MountainStructureAnalyzerFactory::CreateAlienAnalyzer() {
    return std::make_unique<MountainStructureAnalyzer>();
}

std::unique_ptr<MountainStructureAnalyzer> MountainStructureAnalyzerFactory::CreateCustomAnalyzer(
    const std::unordered_map<std::string, float>& parameters) {
    return std::make_unique<MountainStructureAnalyzer>();
}

} // namespace PlanetGen::Generation::Analysis
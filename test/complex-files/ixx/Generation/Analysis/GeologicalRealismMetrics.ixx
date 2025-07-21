module;

#include <vector>
#include <string>
#include <cmath>
#include <algorithm>
#include <numeric>
#include <map>
#include <unordered_map>
#include <limits>

#include <utility>
export module GeologicalRealismMetrics;

import ITerrainMetric;
import AnalysisTypes;

export namespace PlanetGen::Generation::Analysis {

/**
 * @brief Geological realism analysis for mass conservation and gradient validation
 * 
 * Analyzes terrain data for geological plausibility:
 * - Mass conservation during erosion/deposition
 * - Gradient reasonableness (no impossible cliffs)
 * - Elevation distribution realism 
 * - Hydrological consistency (water flow patterns)
 * - Tectonic plausibility (mountain formation patterns)
 */
class GeologicalRealismMetrics : public TerrainMetricBase {
public:
    GeologicalRealismMetrics() 
        : TerrainMetricBase("GeologicalRealism", 
                           "Analyzes geological plausibility including mass conservation and gradient validation") {
        SetThresholds(10.0f, 25.0f); // 10% and 25% mass loss as thresholds
    }
    
    bool CanAnalyzeTransition(const std::string& fromStage, const std::string& toStage) const override {
        // Primarily useful for physics and erosion stages
        return true;
    }
    
    TerrainMetricResult AnalyzeTransition(
        const TerrainDataSnapshot& beforeSnapshot,
        const TerrainDataSnapshot& afterSnapshot
    ) const override {
        if (!beforeSnapshot.HasElevationData() || !afterSnapshot.HasElevationData()) {
            TerrainMetricResult result{};
            result.metricName = GetMetricName();
            result.status = TerrainMetricResult::Status::Warning;
            result.interpretation = "Insufficient elevation data for geological analysis";
            return result;
        }
        
        const auto& beforeData = beforeSnapshot.GetElevationData();
        const auto& afterData = afterSnapshot.GetElevationData();
        
        if (beforeData.size() != afterData.size()) {
            TerrainMetricResult result{};
            result.metricName = GetMetricName();
            result.status = TerrainMetricResult::Status::Warning;
            result.interpretation = "Data size mismatch - cannot perform geological analysis";
            return result;
        }
        
        // Perform comprehensive geological analysis
        GeologicalAnalysis analysis = PerformGeologicalAnalysis(beforeData, afterData, 
                                                              beforeSnapshot.GetCoordinates());
        
        return CreateGeologicalResult(analysis, 
                                    beforeSnapshot.GetMetadata().stageName,
                                    afterSnapshot.GetMetadata().stageName);
    }
    
    std::vector<std::string> GetDependencies() const override {
        return {"elevation"};
    }
    
    // NEW: Comprehensive fitness evaluation for complete terrain
    struct FitnessComponents {
        // Physical realism scores (0-1)
        float massConservationFitness;
        float gradientPlausibilityFitness;
        float hydrologyFitness;
        float elevationDistributionFitness;
        
        // Perceptual realism scores (0-1)
        float multiScaleRoughnessFitness;
        float patternNaturalnessFitness;
        float terrainSignatureFitness;
        float geomorphologicalFitness;
        
        // Statistical properties for correlation analysis
        std::vector<float> roughnessSpectrum;
        std::vector<float> slopeDistribution;
        std::vector<float> curvatureDistribution;
        float fractalDimension;
        float lacunarity;
    };
    
    struct GeologicalFitnessResult {
        FitnessComponents components;
        float totalFitness;              // Weighted combination
        std::vector<float> featureVector; // For ML/parameter correlation
        
        // Raw measurements (no suggestions, just data)
        std::unordered_map<std::string, float> metrics;
    };
    
    // NEW: Evaluate complete terrain for fitness scoring
    GeologicalFitnessResult EvaluateCompleteTerrain(
        const std::vector<float>& elevationData,
        uint32_t width,
        uint32_t height,
        const std::string& targetTerrainType = "earth_like"
    ) const {
        GeologicalFitnessResult result;
        
        // Physical fitness components
        auto physicalAnalysis = AnalyzePhysicalCharacteristics(elevationData, width, height);
        result.components.massConservationFitness = 1.0f; // No before/after for complete terrain
        result.components.gradientPlausibilityFitness = CalculateGradientFitness(physicalAnalysis.gradients);
        result.components.hydrologyFitness = CalculateHydrologyFitness(physicalAnalysis.hydrology);
        result.components.elevationDistributionFitness = CalculateDistributionFitness(physicalAnalysis.distribution);
        
        // Perceptual fitness components
        auto perceptualAnalysis = AnalyzePerceptualCharacteristics(elevationData, width, height);
        result.components.multiScaleRoughnessFitness = perceptualAnalysis.roughnessFitness;
        result.components.patternNaturalnessFitness = perceptualAnalysis.patternFitness;
        result.components.terrainSignatureFitness = perceptualAnalysis.signatureFitness;
        result.components.geomorphologicalFitness = perceptualAnalysis.geomorphologyFitness;
        
        // Statistical properties
        result.components.roughnessSpectrum = perceptualAnalysis.roughnessSpectrum;
        result.components.slopeDistribution = physicalAnalysis.gradients.gradientDistribution;
        result.components.curvatureDistribution = perceptualAnalysis.curvatureDistribution;
        result.components.fractalDimension = perceptualAnalysis.fractalDimension;
        result.components.lacunarity = perceptualAnalysis.lacunarity;
        
        // Calculate total fitness
        result.totalFitness = CalculateTotalFitness(result.components);
        
        // Build feature vector for ML
        result.featureVector = BuildFeatureVector(result.components);
        
        // Collect raw metrics
        CollectRawMetrics(result, physicalAnalysis, perceptualAnalysis);
        
        return result;
    }

private:
    struct MassConservationAnalysis {
        float totalMassBefore;     // Total elevation mass
        float totalMassAfter;
        float massChange;          // Absolute mass change
        float massChangePercentage;
        float erosionVolume;       // Volume of material eroded
        float depositionVolume;    // Volume of material deposited
        float netVolumeChange;     // Net change in material
        bool massConserved;        // Within acceptable tolerance
        std::string conservationIssue;
    };
    
    struct GradientAnalysis {
        float maxGradientBefore;
        float maxGradientAfter;
        float averageGradientBefore;
        float averageGradientAfter;
        float impossibleGradientCount; // Gradients > physical limits
        float gradientVarianceBefore;
        float gradientVarianceAfter;
        std::vector<float> gradientDistribution; // Histogram of gradients
        bool hasUnrealisticCliffs;
        std::string gradientIssues;
    };
    
    struct ElevationDistributionAnalysis {
        float seaLevelPercentage;     // % below sea level
        float mountainPercentage;     // % above mountain threshold
        float plainsPercentage;       // % in plains range
        bool hasRealisticDistribution;
        float elevationBimodality;    // Ocean vs land separation
        float coastlineComplexity;    // Fractal dimension of coastline
        std::string distributionIssues;
    };
    
    struct HydrologyAnalysis {
        float drainageDensity;        // Drainage network density
        float watershedCount;         // Number of distinct watersheds
        float averageSlope;           // Average slope for water flow
        bool hasValidDrainage;        // Water can flow to sea
        float ponding;                // Areas with no outlet
        std::string hydrologyIssues;
    };
    
    struct GeologicalAnalysis {
        MassConservationAnalysis massConservation;
        GradientAnalysis gradients;
        ElevationDistributionAnalysis distribution;
        HydrologyAnalysis hydrology;
        float overallRealismScore;    // 0.0-1.0 overall score
        TerrainMetricResult::Status severity;
        std::vector<std::string> criticalIssues;
        std::vector<std::string> warnings;
    };
    
    // NEW: Perceptual analysis structures
    struct PerceptualAnalysis {
        float roughnessFitness;
        float patternFitness;
        float signatureFitness;
        float geomorphologyFitness;
        
        std::vector<float> roughnessSpectrum;
        std::vector<float> curvatureDistribution;
        float fractalDimension;
        float lacunarity;
        
        // Multi-scale roughness components
        float microRoughness;    // 1-10m scale
        float mesoRoughness;     // 10-100m scale
        float macroRoughness;    // 100m-1km scale
        float landscapeRoughness; // 1-10km scale
    };
    
    struct PhysicalCharacteristics {
        GradientAnalysis gradients;
        ElevationDistributionAnalysis distribution;
        HydrologyAnalysis hydrology;
    };
    
    GeologicalAnalysis PerformGeologicalAnalysis(
        const std::vector<float>& beforeData,
        const std::vector<float>& afterData,
        const std::vector<std::pair<float, float>>& coordinates
    ) const {
        GeologicalAnalysis analysis{};
        
        // Estimate grid dimensions
        uint32_t gridSize = static_cast<uint32_t>(std::sqrt(beforeData.size()));
        uint32_t width = gridSize;
        uint32_t height = gridSize;
        
        // Perform individual analyses
        analysis.massConservation = AnalyzeMassConservation(beforeData, afterData);
        analysis.gradients = AnalyzeGradients(beforeData, afterData, width, height);
        analysis.distribution = AnalyzeElevationDistribution(afterData);
        analysis.hydrology = AnalyzeHydrology(afterData, width, height);
        
        // Compute overall realism score
        analysis.overallRealismScore = ComputeRealismScore(analysis);
        
        // Determine severity and collect issues
        CollectIssues(analysis);
        
        return analysis;
    }
    
    MassConservationAnalysis AnalyzeMassConservation(
        const std::vector<float>& beforeData,
        const std::vector<float>& afterData
    ) const {
        MassConservationAnalysis analysis{};
        
        // Calculate total mass (sum of elevations)
        analysis.totalMassBefore = 0.0f;
        analysis.totalMassAfter = 0.0f;
        
        uint32_t validBefore = 0, validAfter = 0;
        
        for (size_t i = 0; i < beforeData.size() && i < afterData.size(); ++i) {
            if (std::isfinite(beforeData[i])) {
                analysis.totalMassBefore += beforeData[i];
                validBefore++;
            }
            if (std::isfinite(afterData[i])) {
                analysis.totalMassAfter += afterData[i];
                validAfter++;
            }
        }
        
        // Normalize by valid count
        if (validBefore > 0) analysis.totalMassBefore /= validBefore;
        if (validAfter > 0) analysis.totalMassAfter /= validAfter;
        
        analysis.massChange = analysis.totalMassAfter - analysis.totalMassBefore;
        analysis.massChangePercentage = analysis.totalMassBefore != 0.0f ?
            (analysis.massChange / analysis.totalMassBefore) * 100.0f : 0.0f;
        
        // Calculate erosion and deposition volumes
        analysis.erosionVolume = 0.0f;
        analysis.depositionVolume = 0.0f;
        
        for (size_t i = 0; i < beforeData.size() && i < afterData.size(); ++i) {
            if (std::isfinite(beforeData[i]) && std::isfinite(afterData[i])) {
                float change = afterData[i] - beforeData[i];
                if (change < 0) {
                    analysis.erosionVolume += std::abs(change);
                } else {
                    analysis.depositionVolume += change;
                }
            }
        }
        
        analysis.netVolumeChange = analysis.depositionVolume - analysis.erosionVolume;
        
        // Mass conservation check (allow small tolerance for numerical precision)
        float tolerance = 5.0f; // 5% tolerance
        analysis.massConserved = std::abs(analysis.massChangePercentage) <= tolerance;
        
        if (!analysis.massConserved) {
            if (analysis.massChangePercentage > tolerance) {
                analysis.conservationIssue = "Mass increase of " + 
                    std::to_string(analysis.massChangePercentage) + "% - material created from nothing";
            } else {
                analysis.conservationIssue = "Mass loss of " + 
                    std::to_string(std::abs(analysis.massChangePercentage)) + "% - material disappeared";
            }
        }
        
        return analysis;
    }
    
    GradientAnalysis AnalyzeGradients(const std::vector<float>& beforeData,
                                    const std::vector<float>& afterData,
                                    uint32_t width, uint32_t height) const {
        GradientAnalysis analysis{};
        
        auto gradientsBefore = ComputeGradients(beforeData, width, height);
        auto gradientsAfter = ComputeGradients(afterData, width, height);
        
        if (!gradientsBefore.empty()) {
            analysis.maxGradientBefore = *std::max_element(gradientsBefore.begin(), gradientsBefore.end());
            analysis.averageGradientBefore = std::accumulate(gradientsBefore.begin(), gradientsBefore.end(), 0.0f) / gradientsBefore.size();
            analysis.gradientVarianceBefore = ComputeVariance(gradientsBefore);
        }
        
        if (!gradientsAfter.empty()) {
            analysis.maxGradientAfter = *std::max_element(gradientsAfter.begin(), gradientsAfter.end());
            analysis.averageGradientAfter = std::accumulate(gradientsAfter.begin(), gradientsAfter.end(), 0.0f) / gradientsAfter.size();
            analysis.gradientVarianceAfter = ComputeVariance(gradientsAfter);
        }
        
        // Check for impossible gradients (assume 1m/pixel, so gradient > 1.0 = 45°+ slope)
        float maxReasonableGradient = 2.0f; // 63° slope - very steep but possible
        analysis.impossibleGradientCount = 0;
        
        for (float gradient : gradientsAfter) {
            if (gradient > maxReasonableGradient) {
                analysis.impossibleGradientCount++;
            }
        }
        
        analysis.hasUnrealisticCliffs = analysis.impossibleGradientCount > gradientsAfter.size() * 0.01f; // More than 1% impossible gradients
        
        if (analysis.hasUnrealisticCliffs) {
            analysis.gradientIssues = "Found " + std::to_string(static_cast<uint32_t>(analysis.impossibleGradientCount)) + 
                                    " impossible gradients (>" + std::to_string(maxReasonableGradient) + ")";
        }
        
        // Create gradient distribution histogram
        analysis.gradientDistribution = CreateGradientHistogram(gradientsAfter);
        
        return analysis;
    }
    
    std::vector<float> ComputeGradients(const std::vector<float>& data, uint32_t width, uint32_t height) const {
        std::vector<float> gradients;
        gradients.reserve(data.size());
        
        for (uint32_t y = 0; y < height; ++y) {
            for (uint32_t x = 0; x < width; ++x) {
                uint32_t idx = y * width + x;
                if (idx >= data.size() || !std::isfinite(data[idx])) {
                    gradients.push_back(0.0f);
                    continue;
                }
                
                float dx = 0.0f, dy = 0.0f;
                
                // Compute gradients using available neighbors
                if (x > 0 && x < width - 1) {
                    uint32_t leftIdx = y * width + (x - 1);
                    uint32_t rightIdx = y * width + (x + 1);
                    if (leftIdx < data.size() && rightIdx < data.size() &&
                        std::isfinite(data[leftIdx]) && std::isfinite(data[rightIdx])) {
                        dx = (data[rightIdx] - data[leftIdx]) / 2.0f;
                    }
                }
                
                if (y > 0 && y < height - 1) {
                    uint32_t upIdx = (y - 1) * width + x;
                    uint32_t downIdx = (y + 1) * width + x;
                    if (upIdx < data.size() && downIdx < data.size() &&
                        std::isfinite(data[upIdx]) && std::isfinite(data[downIdx])) {
                        dy = (data[downIdx] - data[upIdx]) / 2.0f;
                    }
                }
                
                float gradient = std::sqrt(dx * dx + dy * dy);
                gradients.push_back(gradient);
            }
        }
        
        return gradients;
    }
    
    float ComputeVariance(const std::vector<float>& data) const {
        if (data.empty()) return 0.0f;
        
        float mean = std::accumulate(data.begin(), data.end(), 0.0f) / data.size();
        float variance = 0.0f;
        
        for (float value : data) {
            float diff = value - mean;
            variance += diff * diff;
        }
        
        return variance / data.size();
    }
    
    std::vector<float> CreateGradientHistogram(const std::vector<float>& gradients) const {
        const size_t numBins = 20;
        std::vector<float> histogram(numBins, 0.0f);
        
        if (gradients.empty()) return histogram;
        
        float maxGradient = *std::max_element(gradients.begin(), gradients.end());
        if (maxGradient <= 0.0f) return histogram;
        
        float binSize = maxGradient / numBins;
        
        for (float gradient : gradients) {
            size_t bin = std::min(static_cast<size_t>(gradient / binSize), numBins - 1);
            histogram[bin] += 1.0f;
        }
        
        // Normalize
        float total = std::accumulate(histogram.begin(), histogram.end(), 0.0f);
        if (total > 0.0f) {
            for (float& bin : histogram) {
                bin /= total;
            }
        }
        
        return histogram;
    }
    
    ElevationDistributionAnalysis AnalyzeElevationDistribution(const std::vector<float>& data) const {
        ElevationDistributionAnalysis analysis{};
        
        if (data.empty()) return analysis;
        
        // Define thresholds (in meters, assuming data is in meters)
        float seaLevel = 0.0f;
        float mountainThreshold = 1000.0f; // 1km+ is mountainous
        
        uint32_t belowSeaLevel = 0;
        uint32_t aboveMountains = 0;
        uint32_t inPlains = 0;
        uint32_t validCount = 0;
        
        float minElevation = std::numeric_limits<float>::max();
        float maxElevation = std::numeric_limits<float>::lowest();
        
        for (float elevation : data) {
            if (std::isfinite(elevation)) {
                validCount++;
                minElevation = std::min(minElevation, elevation);
                maxElevation = std::max(maxElevation, elevation);
                
                if (elevation < seaLevel) {
                    belowSeaLevel++;
                } else if (elevation > mountainThreshold) {
                    aboveMountains++;
                } else {
                    inPlains++;
                }
            }
        }
        
        if (validCount > 0) {
            analysis.seaLevelPercentage = (static_cast<float>(belowSeaLevel) / validCount) * 100.0f;
            analysis.mountainPercentage = (static_cast<float>(aboveMountains) / validCount) * 100.0f;
            analysis.plainsPercentage = (static_cast<float>(inPlains) / validCount) * 100.0f;
        }
        
        // Check for realistic distribution (Earth-like: ~70% ocean, ~15% mountains)
        bool hasReasonableOceans = analysis.seaLevelPercentage >= 50.0f && analysis.seaLevelPercentage <= 85.0f;
        bool hasReasonableMountains = analysis.mountainPercentage >= 5.0f && analysis.mountainPercentage <= 30.0f;
        analysis.hasRealisticDistribution = hasReasonableOceans && hasReasonableMountains;
        
        if (!analysis.hasRealisticDistribution) {
            analysis.distributionIssues = "Unrealistic elevation distribution: " +
                std::to_string(analysis.seaLevelPercentage) + "% ocean, " +
                std::to_string(analysis.mountainPercentage) + "% mountains";
        }
        
        // Compute bimodality (separation between ocean and land)
        analysis.elevationBimodality = ComputeBimodality(data);
        
        // Coastline complexity (simplified)
        analysis.coastlineComplexity = EstimateCoastlineComplexity(data);
        
        return analysis;
    }
    
    float ComputeBimodality(const std::vector<float>& data) const {
        // Simplified bimodality coefficient
        if (data.size() < 10) return 0.0f;
        
        // Compute skewness and kurtosis
        float mean = std::accumulate(data.begin(), data.end(), 0.0f) / data.size();
        float variance = 0.0f;
        float skewnessSum = 0.0f;
        float kurtosisSum = 0.0f;
        
        for (float value : data) {
            if (std::isfinite(value)) {
                float diff = value - mean;
                variance += diff * diff;
                skewnessSum += diff * diff * diff;
                kurtosisSum += diff * diff * diff * diff;
            }
        }
        
        variance /= data.size();
        float stdDev = std::sqrt(variance);
        
        if (stdDev == 0.0f) return 0.0f;
        
        float skewness = skewnessSum / (data.size() * stdDev * stdDev * stdDev);
        float kurtosis = kurtosisSum / (data.size() * variance * variance);
        
        // Bimodality coefficient
        float bimodality = (skewness * skewness + 1.0f) / (kurtosis + 3.0f * (data.size() - 1.0f) * (data.size() - 1.0f) / ((data.size() - 2.0f) * (data.size() - 3.0f)));
        
        return bimodality;
    }
    
    float EstimateCoastlineComplexity(const std::vector<float>& data) const {
        // Simplified coastline complexity based on zero-crossings around sea level
        if (data.empty()) return 0.0f;
        
        float seaLevel = 0.0f;
        uint32_t crossings = 0;
        bool wasAboveSeaLevel = false;
        bool initialized = false;
        
        for (float elevation : data) {
            if (std::isfinite(elevation)) {
                bool isAboveSeaLevel = elevation >= seaLevel;
                
                if (initialized && isAboveSeaLevel != wasAboveSeaLevel) {
                    crossings++;
                }
                
                wasAboveSeaLevel = isAboveSeaLevel;
                initialized = true;
            }
        }
        
        return static_cast<float>(crossings) / data.size();
    }
    
    HydrologyAnalysis AnalyzeHydrology(const std::vector<float>& data, uint32_t width, uint32_t height) const {
        HydrologyAnalysis analysis{};
        
        // Simplified hydrology analysis
        auto gradients = ComputeGradients(data, width, height);
        
        if (!gradients.empty()) {
            analysis.averageSlope = std::accumulate(gradients.begin(), gradients.end(), 0.0f) / gradients.size();
            
            // Check for adequate drainage (average slope should be > 0.001 for drainage)
            analysis.hasValidDrainage = analysis.averageSlope > 0.001f;
            
            if (!analysis.hasValidDrainage) {
                analysis.hydrologyIssues = "Insufficient slope for natural drainage (avg slope: " +
                    std::to_string(analysis.averageSlope) + ")";
            }
        }
        
        // Count potential ponding areas (local minima)
        uint32_t localMinima = 0;
        for (uint32_t y = 1; y < height - 1; ++y) {
            for (uint32_t x = 1; x < width - 1; ++x) {
                uint32_t idx = y * width + x;
                if (idx >= data.size() || !std::isfinite(data[idx])) continue;
                
                bool isLocalMinimum = true;
                float centerValue = data[idx];
                
                // Check 8-neighborhood
                for (int dy = -1; dy <= 1 && isLocalMinimum; ++dy) {
                    for (int dx = -1; dx <= 1 && isLocalMinimum; ++dx) {
                        if (dx == 0 && dy == 0) continue;
                        
                        uint32_t nidx = (y + dy) * width + (x + dx);
                        if (nidx < data.size() && std::isfinite(data[nidx])) {
                            if (data[nidx] <= centerValue) {
                                isLocalMinimum = false;
                            }
                        }
                    }
                }
                
                if (isLocalMinimum) {
                    localMinima++;
                }
            }
        }
        
        analysis.ponding = static_cast<float>(localMinima) / (width * height);
        analysis.drainageDensity = 1.0f - analysis.ponding; // Simplified metric
        
        return analysis;
    }
    
    float ComputeRealismScore(const GeologicalAnalysis& analysis) const {
        float score = 1.0f;
        
        // Mass conservation penalty
        if (!analysis.massConservation.massConserved) {
            float penalty = std::min(1.0f, std::abs(analysis.massConservation.massChangePercentage) / 100.0f);
            score -= 0.3f * penalty;
        }
        
        // Gradient penalty
        if (analysis.gradients.hasUnrealisticCliffs) {
            score -= 0.3f;
        }
        
        // Distribution penalty
        if (!analysis.distribution.hasRealisticDistribution) {
            score -= 0.2f;
        }
        
        // Hydrology penalty
        if (!analysis.hydrology.hasValidDrainage) {
            score -= 0.2f;
        }
        
        return std::max(0.0f, score);
    }
    
    void CollectIssues(GeologicalAnalysis& analysis) const {
        // Determine severity based on realism score
        if (analysis.overallRealismScore < 0.3f) {
            analysis.severity = TerrainMetricResult::Status::Critical;
        } else if (analysis.overallRealismScore < 0.7f) {
            analysis.severity = TerrainMetricResult::Status::Warning;
        } else {
            analysis.severity = TerrainMetricResult::Status::Normal;
        }
        
        // Collect critical issues
        if (!analysis.massConservation.massConserved) {
            analysis.criticalIssues.push_back(analysis.massConservation.conservationIssue);
        }
        
        if (analysis.gradients.hasUnrealisticCliffs) {
            analysis.criticalIssues.push_back(analysis.gradients.gradientIssues);
        }
        
        // Collect warnings
        if (!analysis.distribution.hasRealisticDistribution) {
            analysis.warnings.push_back(analysis.distribution.distributionIssues);
        }
        
        if (!analysis.hydrology.hasValidDrainage) {
            analysis.warnings.push_back(analysis.hydrology.hydrologyIssues);
        }
    }
    
    TerrainMetricResult CreateGeologicalResult(const GeologicalAnalysis& analysis,
                                             const std::string& fromStage,
                                             const std::string& toStage) const {
        TerrainMetricResult result{};
        result.metricName = GetMetricName();
        result.status = analysis.severity;
        result.primaryValue = analysis.overallRealismScore;
        result.deltaPercentage = analysis.massConservation.massChangePercentage;
        
        // Add detailed metrics
        result.additionalValues.emplace_back("massChangePercentage", analysis.massConservation.massChangePercentage);
        result.additionalValues.emplace_back("erosionVolume", analysis.massConservation.erosionVolume);
        result.additionalValues.emplace_back("depositionVolume", analysis.massConservation.depositionVolume);
        result.additionalValues.emplace_back("maxGradientAfter", analysis.gradients.maxGradientAfter);
        result.additionalValues.emplace_back("impossibleGradientCount", analysis.gradients.impossibleGradientCount);
        result.additionalValues.emplace_back("seaLevelPercentage", analysis.distribution.seaLevelPercentage);
        result.additionalValues.emplace_back("mountainPercentage", analysis.distribution.mountainPercentage);
        result.additionalValues.emplace_back("drainageDensity", analysis.hydrology.drainageDensity);
        
        // Generate interpretation
        std::string interpretation = "Geological realism " + fromStage + " → " + toStage + ": ";
        
        if (result.status == TerrainMetricResult::Status::Critical) {
            interpretation += "CRITICAL - ";
        } else if (result.status == TerrainMetricResult::Status::Warning) {
            interpretation += "WARNING - ";
        }
        
        interpretation += "Realism score: " + std::to_string(analysis.overallRealismScore);
        
        // Add primary issues
        if (!analysis.criticalIssues.empty()) {
            interpretation += ". Critical: " + analysis.criticalIssues[0];
        } else if (!analysis.warnings.empty()) {
            interpretation += ". Warning: " + analysis.warnings[0];
        } else {
            interpretation += ". Geologically plausible";
        }
        
        result.interpretation = interpretation;
        
        // Add diagnostic messages
        for (const auto& issue : analysis.criticalIssues) {
            result.diagnosticMessages.push_back("CRITICAL: " + issue);
        }
        for (const auto& warning : analysis.warnings) {
            result.diagnosticMessages.push_back("WARNING: " + warning);
        }
        
        return result;
    }
    
    // NEW: Analyze physical characteristics for fitness evaluation
    PhysicalCharacteristics AnalyzePhysicalCharacteristics(
        const std::vector<float>& elevationData,
        uint32_t width,
        uint32_t height
    ) const {
        PhysicalCharacteristics characteristics;
        
        // Gradient analysis
        characteristics.gradients = AnalyzeGradients(elevationData, elevationData, width, height);
        
        // Elevation distribution
        characteristics.distribution = AnalyzeElevationDistribution(elevationData);
        
        // Hydrology
        characteristics.hydrology = AnalyzeHydrology(elevationData, width, height);
        
        return characteristics;
    }
    
    // NEW: Analyze perceptual characteristics using frequency analysis
    PerceptualAnalysis AnalyzePerceptualCharacteristics(
        const std::vector<float>& elevationData,
        uint32_t width,
        uint32_t height
    ) const {
        PerceptualAnalysis analysis{};
        
        // Compute power spectrum for roughness analysis
        auto powerSpectrum = ComputePowerSpectrum(elevationData, width, height);
        analysis.roughnessSpectrum = powerSpectrum;
        
        // Extract multi-scale roughness
        ExtractMultiScaleRoughness(powerSpectrum, analysis);
        
        // Compute fractal dimension from power spectrum
        analysis.fractalDimension = ComputeFractalDimension(powerSpectrum);
        
        // Compute lacunarity (gap/texture measure)
        analysis.lacunarity = ComputeLacunarity(elevationData, width, height);
        
        // Pattern analysis
        analysis.patternFitness = AnalyzeTerrainPatterns(elevationData, width, height);
        
        // Signature matching
        analysis.signatureFitness = MatchTerrainSignature(analysis);
        
        // Geomorphological fitness
        analysis.geomorphologyFitness = AnalyzeGeomorphology(elevationData, width, height);
        
        // Overall roughness fitness
        analysis.roughnessFitness = CalculateRoughnessFitness(analysis);
        
        // Curvature analysis
        analysis.curvatureDistribution = ComputeCurvatureDistribution(elevationData, width, height);
        
        return analysis;
    }
    
    // NEW: Compute 2D power spectrum using FFT (simplified version)
    std::vector<float> ComputePowerSpectrum(
        const std::vector<float>& elevationData,
        uint32_t width,
        uint32_t height
    ) const {
        // Simplified power spectrum calculation
        // In production, use proper 2D FFT library
        std::vector<float> spectrum;
        
        // Compute radial averaged power spectrum
        const uint32_t maxFreq = std::min(width, height) / 2;
        spectrum.resize(maxFreq);
        
        // For each frequency band
        for (uint32_t freq = 1; freq < maxFreq; ++freq) {
            float power = 0.0f;
            uint32_t count = 0;
            
            // Sample at this frequency
            for (uint32_t y = 0; y < height; y += freq) {
                for (uint32_t x = 0; x < width; x += freq) {
                    if (x + freq < width && y + freq < height) {
                        uint32_t idx1 = y * width + x;
                        uint32_t idx2 = y * width + (x + freq);
                        uint32_t idx3 = (y + freq) * width + x;
                        
                        float dx = elevationData[idx2] - elevationData[idx1];
                        float dy = elevationData[idx3] - elevationData[idx1];
                        
                        power += dx * dx + dy * dy;
                        count++;
                    }
                }
            }
            
            spectrum[freq] = count > 0 ? std::sqrt(power / count) : 0.0f;
        }
        
        return spectrum;
    }
    
    // NEW: Extract multi-scale roughness from power spectrum
    void ExtractMultiScaleRoughness(
        const std::vector<float>& powerSpectrum,
        PerceptualAnalysis& analysis
    ) const {
        if (powerSpectrum.size() < 8) return;
        
        // Integrate power in different frequency bands
        auto integrateBand = [&](size_t start, size_t end) {
            float sum = 0.0f;
            for (size_t i = start; i < std::min(end, powerSpectrum.size()); ++i) {
                sum += powerSpectrum[i];
            }
            return sum / (end - start);
        };
        
        // Map frequency bands to spatial scales
        analysis.microRoughness = integrateBand(powerSpectrum.size() / 2, powerSpectrum.size());
        analysis.mesoRoughness = integrateBand(powerSpectrum.size() / 4, powerSpectrum.size() / 2);
        analysis.macroRoughness = integrateBand(powerSpectrum.size() / 8, powerSpectrum.size() / 4);
        analysis.landscapeRoughness = integrateBand(1, powerSpectrum.size() / 8);
    }
    
    // NEW: Compute fractal dimension from power spectrum
    float ComputeFractalDimension(const std::vector<float>& powerSpectrum) const {
        if (powerSpectrum.size() < 10) return 2.0f; // Default fractal dimension
        
        // Fit power law: P(f) ~ f^(-β)
        // Fractal dimension D = (7 - β) / 2 for 2D surfaces
        
        float sumLogF = 0.0f;
        float sumLogP = 0.0f;
        float sumLogF2 = 0.0f;
        float sumLogFLogP = 0.0f;
        uint32_t count = 0;
        
        // Use middle frequencies for better fit
        for (size_t i = 5; i < powerSpectrum.size() - 5 && i < 50; ++i) {
            if (powerSpectrum[i] > 0.0f) {
                float logF = std::log(static_cast<float>(i));
                float logP = std::log(powerSpectrum[i]);
                
                sumLogF += logF;
                sumLogP += logP;
                sumLogF2 += logF * logF;
                sumLogFLogP += logF * logP;
                count++;
            }
        }
        
        if (count < 5) return 2.0f;
        
        // Linear regression for slope
        float beta = (count * sumLogFLogP - sumLogF * sumLogP) / 
                     (count * sumLogF2 - sumLogF * sumLogF);
        
        // Convert to fractal dimension
        float fractalDim = (7.0f + beta) / 2.0f;
        
        // Clamp to reasonable range
        return std::clamp(fractalDim, 1.0f, 3.0f);
    }
    
    // NEW: Compute lacunarity (texture/gap analysis)
    float ComputeLacunarity(
        const std::vector<float>& elevationData,
        uint32_t width,
        uint32_t height
    ) const {
        // Simplified box-counting lacunarity
        std::vector<float> boxVariances;
        
        // Try different box sizes
        for (uint32_t boxSize = 4; boxSize <= 32 && boxSize < width && boxSize < height; boxSize *= 2) {
            float sumVariance = 0.0f;
            uint32_t boxCount = 0;
            
            for (uint32_t y = 0; y + boxSize < height; y += boxSize / 2) {
                for (uint32_t x = 0; x + boxSize < width; x += boxSize / 2) {
                    // Compute variance within box
                    float sum = 0.0f;
                    float sum2 = 0.0f;
                    uint32_t count = 0;
                    
                    for (uint32_t by = 0; by < boxSize; ++by) {
                        for (uint32_t bx = 0; bx < boxSize; ++bx) {
                            uint32_t idx = (y + by) * width + (x + bx);
                            float val = elevationData[idx];
                            sum += val;
                            sum2 += val * val;
                            count++;
                        }
                    }
                    
                    float mean = sum / count;
                    float variance = (sum2 / count) - (mean * mean);
                    sumVariance += variance;
                    boxCount++;
                }
            }
            
            if (boxCount > 0) {
                boxVariances.push_back(sumVariance / boxCount);
            }
        }
        
        // Lacunarity is the variance of variances
        if (boxVariances.size() < 2) return 1.0f;
        
        float meanVar = std::accumulate(boxVariances.begin(), boxVariances.end(), 0.0f) / boxVariances.size();
        float lacunarity = 0.0f;
        
        for (float var : boxVariances) {
            lacunarity += (var - meanVar) * (var - meanVar);
        }
        
        return std::sqrt(lacunarity / boxVariances.size()) / meanVar;
    }
    
    // NEW: Analyze terrain patterns (ridges, valleys, etc.)
    float AnalyzeTerrainPatterns(
        const std::vector<float>& elevationData,
        uint32_t width,
        uint32_t height
    ) const {
        float patternScore = 0.0f;
        
        // Ridge detection using second derivatives
        auto ridgeScore = DetectRidgeOrganization(elevationData, width, height);
        
        // Valley network analysis
        auto valleyScore = AnalyzeValleyNetworks(elevationData, width, height);
        
        // Feature spacing regularity
        auto spacingScore = AnalyzeFeatureSpacing(elevationData, width, height);
        
        // Combine scores
        patternScore = (ridgeScore + valleyScore + spacingScore) / 3.0f;
        
        return patternScore;
    }
    
    // NEW: Detect ridge organization
    float DetectRidgeOrganization(
        const std::vector<float>& elevationData,
        uint32_t width,
        uint32_t height
    ) const {
        // Simplified ridge detection using local maxima
        std::vector<std::pair<uint32_t, uint32_t>> ridgePoints;
        
        for (uint32_t y = 2; y < height - 2; ++y) {
            for (uint32_t x = 2; x < width - 2; ++x) {
                uint32_t idx = y * width + x;
                float center = elevationData[idx];
                
                // Check if local maximum in cross pattern
                bool isRidge = true;
                for (int d = 1; d <= 2 && isRidge; ++d) {
                    if (elevationData[(y - d) * width + x] >= center ||
                        elevationData[(y + d) * width + x] >= center ||
                        elevationData[y * width + (x - d)] >= center ||
                        elevationData[y * width + (x + d)] >= center) {
                        isRidge = false;
                    }
                }
                
                if (isRidge) {
                    ridgePoints.push_back({x, y});
                }
            }
        }
        
        // Analyze ridge connectivity and organization
        if (ridgePoints.size() < 10) return 0.0f;
        
        // Simple organization metric: how well ridges align
        float alignmentScore = 0.0f;
        const float maxDist = 10.0f;
        
        for (size_t i = 0; i < ridgePoints.size(); ++i) {
            int alignedNeighbors = 0;
            
            for (size_t j = i + 1; j < ridgePoints.size(); ++j) {
                float dx = static_cast<float>(ridgePoints[j].first - ridgePoints[i].first);
                float dy = static_cast<float>(ridgePoints[j].second - ridgePoints[i].second);
                float dist = std::sqrt(dx * dx + dy * dy);
                
                if (dist < maxDist && dist > 0) {
                    // Check if aligned (similar to previous connections)
                    alignedNeighbors++;
                }
            }
            
            alignmentScore += std::min(3, alignedNeighbors) / 3.0f;
        }
        
        return alignmentScore / ridgePoints.size();
    }
    
    // NEW: Analyze valley networks
    float AnalyzeValleyNetworks(
        const std::vector<float>& elevationData,
        uint32_t width,
        uint32_t height
    ) const {
        // Flow accumulation analysis
        std::vector<uint32_t> flowAccumulation(elevationData.size(), 1);
        
        // Simple D8 flow routing
        for (uint32_t y = 1; y < height - 1; ++y) {
            for (uint32_t x = 1; x < width - 1; ++x) {
                uint32_t idx = y * width + x;
                float centerElev = elevationData[idx];
                
                // Find steepest descent
                float maxDrop = 0.0f;
                int flowX = 0, flowY = 0;
                
                for (int dy = -1; dy <= 1; ++dy) {
                    for (int dx = -1; dx <= 1; ++dx) {
                        if (dx == 0 && dy == 0) continue;
                        
                        uint32_t nIdx = (y + dy) * width + (x + dx);
                        float drop = centerElev - elevationData[nIdx];
                        
                        if (drop > maxDrop) {
                            maxDrop = drop;
                            flowX = dx;
                            flowY = dy;
                        }
                    }
                }
                
                // Accumulate flow
                if (maxDrop > 0) {
                    uint32_t downIdx = (y + flowY) * width + (x + flowX);
                    flowAccumulation[downIdx] += flowAccumulation[idx];
                }
            }
        }
        
        // Analyze valley network properties
        uint32_t valleyCount = 0;
        float avgBranchingRatio = 0.0f;
        
        for (uint32_t i = 0; i < flowAccumulation.size(); ++i) {
            if (flowAccumulation[i] > 10) { // Threshold for valley
                valleyCount++;
            }
        }
        
        // Simple valley network score
        float expectedValleys = (width * height) / 500.0f; // Empirical expectation
        float valleyScore = 1.0f - std::abs(valleyCount - expectedValleys) / expectedValleys;
        
        return std::clamp(valleyScore, 0.0f, 1.0f);
    }
    
    // NEW: Analyze feature spacing
    float AnalyzeFeatureSpacing(
        const std::vector<float>& elevationData,
        uint32_t width,
        uint32_t height
    ) const {
        // Find peaks and analyze their spacing
        std::vector<std::pair<uint32_t, uint32_t>> peaks;
        
        for (uint32_t y = 3; y < height - 3; ++y) {
            for (uint32_t x = 3; x < width - 3; ++x) {
                uint32_t idx = y * width + x;
                float center = elevationData[idx];
                
                // Check if peak (local maximum in 7x7 window)
                bool isPeak = true;
                for (int dy = -3; dy <= 3 && isPeak; ++dy) {
                    for (int dx = -3; dx <= 3 && isPeak; ++dx) {
                        if (dx == 0 && dy == 0) continue;
                        uint32_t nIdx = (y + dy) * width + (x + dx);
                        if (elevationData[nIdx] > center) {
                            isPeak = false;
                        }
                    }
                }
                
                if (isPeak && center > 500.0f) { // Only significant peaks
                    peaks.push_back({x, y});
                }
            }
        }
        
        if (peaks.size() < 3) return 0.5f; // Neutral score
        
        // Analyze nearest neighbor distances
        std::vector<float> distances;
        for (size_t i = 0; i < peaks.size(); ++i) {
            float minDist = std::numeric_limits<float>::max();
            
            for (size_t j = 0; j < peaks.size(); ++j) {
                if (i == j) continue;
                
                float dx = static_cast<float>(peaks[j].first - peaks[i].first);
                float dy = static_cast<float>(peaks[j].second - peaks[i].second);
                float dist = std::sqrt(dx * dx + dy * dy);
                
                minDist = std::min(minDist, dist);
            }
            
            distances.push_back(minDist);
        }
        
        // Calculate regularity of spacing
        float meanDist = std::accumulate(distances.begin(), distances.end(), 0.0f) / distances.size();
        float variance = 0.0f;
        
        for (float dist : distances) {
            variance += (dist - meanDist) * (dist - meanDist);
        }
        variance /= distances.size();
        
        // Lower variance = more regular spacing = higher score
        float cv = std::sqrt(variance) / meanDist; // Coefficient of variation
        float spacingScore = std::exp(-cv); // Exponential decay
        
        return spacingScore;
    }
    
    // NEW: Match terrain signature against known patterns
    float MatchTerrainSignature(const PerceptualAnalysis& analysis) const {
        // This would compare against real-world terrain signatures
        // For now, use heuristics based on known terrain characteristics
        
        float signatureScore = 0.0f;
        
        // Check if fractal dimension is realistic (typically 2.0-2.8 for terrain)
        if (analysis.fractalDimension >= 2.0f && analysis.fractalDimension <= 2.8f) {
            signatureScore += 0.3f;
        }
        
        // Check roughness spectrum follows power law
        if (!analysis.roughnessSpectrum.empty()) {
            float spectralSlope = ComputeSpectralSlope(analysis.roughnessSpectrum);
            if (spectralSlope >= -3.0f && spectralSlope <= -1.0f) {
                signatureScore += 0.3f;
            }
        }
        
        // Check multi-scale roughness ratios
        if (analysis.macroRoughness > 0 && analysis.mesoRoughness > 0) {
            float roughnessRatio = analysis.mesoRoughness / analysis.macroRoughness;
            if (roughnessRatio >= 0.3f && roughnessRatio <= 0.7f) {
                signatureScore += 0.2f;
            }
        }
        
        // Check lacunarity is in realistic range
        if (analysis.lacunarity >= 0.5f && analysis.lacunarity <= 2.0f) {
            signatureScore += 0.2f;
        }
        
        return signatureScore;
    }
    
    // NEW: Compute spectral slope
    float ComputeSpectralSlope(const std::vector<float>& spectrum) const {
        if (spectrum.size() < 10) return -2.0f; // Default
        
        // Linear regression in log-log space
        float sumLogF = 0.0f;
        float sumLogP = 0.0f;
        float sumLogF2 = 0.0f;
        float sumLogFLogP = 0.0f;
        uint32_t count = 0;
        
        for (size_t i = 2; i < spectrum.size() / 2; ++i) {
            if (spectrum[i] > 0) {
                float logF = std::log(static_cast<float>(i));
                float logP = std::log(spectrum[i]);
                
                sumLogF += logF;
                sumLogP += logP;
                sumLogF2 += logF * logF;
                sumLogFLogP += logF * logP;
                count++;
            }
        }
        
        if (count < 5) return -2.0f;
        
        return (count * sumLogFLogP - sumLogF * sumLogP) / 
               (count * sumLogF2 - sumLogF * sumLogF);
    }
    
    // NEW: Analyze geomorphological features
    float AnalyzeGeomorphology(
        const std::vector<float>& elevationData,
        uint32_t width,
        uint32_t height
    ) const {
        float geomorphScore = 0.0f;
        
        // Analyze slope-elevation relationship
        auto slopeElevScore = AnalyzeSlopeElevationRelationship(elevationData, width, height);
        
        // Analyze hypsometry (elevation distribution)
        auto hypsometryScore = AnalyzeHypsometry(elevationData);
        
        // Analyze relief ratio
        auto reliefScore = AnalyzeReliefRatio(elevationData, width, height);
        
        geomorphScore = (slopeElevScore + hypsometryScore + reliefScore) / 3.0f;
        
        return geomorphScore;
    }
    
    // NEW: Analyze slope-elevation relationship
    float AnalyzeSlopeElevationRelationship(
        const std::vector<float>& elevationData,
        uint32_t width,
        uint32_t height
    ) const {
        auto gradients = ComputeGradients(elevationData, width, height);
        
        // Bin elevations and compute average slope per bin
        const uint32_t numBins = 20;
        std::vector<float> slopeByElevation(numBins, 0.0f);
        std::vector<uint32_t> counts(numBins, 0);
        
        float minElev = *std::min_element(elevationData.begin(), elevationData.end());
        float maxElev = *std::max_element(elevationData.begin(), elevationData.end());
        float elevRange = maxElev - minElev;
        
        if (elevRange <= 0) return 0.5f;
        
        for (size_t i = 0; i < elevationData.size(); ++i) {
            float normElev = (elevationData[i] - minElev) / elevRange;
            uint32_t bin = std::min(static_cast<uint32_t>(normElev * numBins), numBins - 1);
            
            slopeByElevation[bin] += gradients[i];
            counts[bin]++;
        }
        
        // Normalize
        for (uint32_t i = 0; i < numBins; ++i) {
            if (counts[i] > 0) {
                slopeByElevation[i] /= counts[i];
            }
        }
        
        // Check for realistic relationship (slopes should generally increase with elevation)
        float correlation = 0.0f;
        for (uint32_t i = 1; i < numBins; ++i) {
            if (slopeByElevation[i] > slopeByElevation[i-1]) {
                correlation += 1.0f;
            }
        }
        
        return correlation / (numBins - 1);
    }
    
    // NEW: Analyze hypsometry
    float AnalyzeHypsometry(const std::vector<float>& elevationData) const {
        // Hypsometric curve analysis
        std::vector<float> sorted = elevationData;
        std::sort(sorted.begin(), sorted.end());
        
        // Compute hypsometric integral
        float minElev = sorted.front();
        float maxElev = sorted.back();
        float elevRange = maxElev - minElev;
        
        if (elevRange <= 0) return 0.5f;
        
        float integral = 0.0f;
        for (size_t i = 0; i < sorted.size(); ++i) {
            float normElev = (sorted[i] - minElev) / elevRange;
            float normArea = static_cast<float>(i) / sorted.size();
            integral += normElev * (1.0f / sorted.size());
        }
        
        // Ideal hypsometric integral for mature landscape is ~0.5
        float score = 1.0f - std::abs(integral - 0.5f) * 2.0f;
        
        return std::clamp(score, 0.0f, 1.0f);
    }
    
    // NEW: Analyze relief ratio
    float AnalyzeReliefRatio(
        const std::vector<float>& elevationData,
        uint32_t width,
        uint32_t height
    ) const {
        float minElev = *std::min_element(elevationData.begin(), elevationData.end());
        float maxElev = *std::max_element(elevationData.begin(), elevationData.end());
        float relief = maxElev - minElev;
        
        // Basin length approximation
        float basinLength = std::sqrt(static_cast<float>(width * width + height * height));
        
        // Relief ratio
        float reliefRatio = relief / basinLength;
        
        // Typical relief ratios: 0.01-0.1 for realistic terrain
        float score = 0.0f;
        if (reliefRatio >= 0.01f && reliefRatio <= 0.1f) {
            // Peak score at 0.05
            score = 1.0f - std::abs(reliefRatio - 0.05f) / 0.05f;
        }
        
        return std::clamp(score, 0.0f, 1.0f);
    }
    
    // NEW: Compute curvature distribution
    std::vector<float> ComputeCurvatureDistribution(
        const std::vector<float>& elevationData,
        uint32_t width,
        uint32_t height
    ) const {
        std::vector<float> curvatures;
        curvatures.reserve(elevationData.size());
        
        for (uint32_t y = 1; y < height - 1; ++y) {
            for (uint32_t x = 1; x < width - 1; ++x) {
                uint32_t idx = y * width + x;
                
                // Compute second derivatives
                float zxx = elevationData[idx - 1] - 2 * elevationData[idx] + elevationData[idx + 1];
                float zyy = elevationData[idx - width] - 2 * elevationData[idx] + elevationData[idx + width];
                
                // Mean curvature
                float curvature = (zxx + zyy) / 2.0f;
                curvatures.push_back(curvature);
            }
        }
        
        // Create histogram
        return CreateHistogram(curvatures, 20);
    }
    
    // NEW: Create histogram from data
    std::vector<float> CreateHistogram(const std::vector<float>& data, uint32_t numBins) const {
        if (data.empty()) return std::vector<float>(numBins, 0.0f);
        
        float minVal = *std::min_element(data.begin(), data.end());
        float maxVal = *std::max_element(data.begin(), data.end());
        float range = maxVal - minVal;
        
        if (range <= 0) return std::vector<float>(numBins, 1.0f / numBins);
        
        std::vector<float> histogram(numBins, 0.0f);
        
        for (float val : data) {
            uint32_t bin = std::min(static_cast<uint32_t>((val - minVal) / range * numBins), numBins - 1);
            histogram[bin] += 1.0f;
        }
        
        // Normalize
        float total = std::accumulate(histogram.begin(), histogram.end(), 0.0f);
        if (total > 0) {
            for (float& bin : histogram) {
                bin /= total;
            }
        }
        
        return histogram;
    }
    
    // NEW: Calculate fitness scores from analyses
    float CalculateGradientFitness(const GradientAnalysis& gradients) const {
        float fitness = 1.0f;
        
        // Penalize impossible gradients
        if (gradients.impossibleGradientCount > 0) {
            float ratio = gradients.impossibleGradientCount / 
                         (gradients.gradientDistribution.size() * 100.0f); // Rough total count
            fitness -= std::min(0.5f, ratio * 10.0f);
        }
        
        // Reward varied but reasonable gradients
        if (gradients.gradientVarianceAfter > 0) {
            float cv = std::sqrt(gradients.gradientVarianceAfter) / gradients.averageGradientAfter;
            if (cv >= 0.5f && cv <= 2.0f) {
                fitness += 0.2f;
            }
        }
        
        return std::clamp(fitness, 0.0f, 1.0f);
    }
    
    float CalculateHydrologyFitness(const HydrologyAnalysis& hydrology) const {
        float fitness = 0.0f;
        
        if (hydrology.hasValidDrainage) fitness += 0.4f;
        
        // Low ponding is good
        fitness += (1.0f - hydrology.ponding) * 0.3f;
        
        // Moderate drainage density is realistic
        if (hydrology.drainageDensity >= 0.7f && hydrology.drainageDensity <= 0.95f) {
            fitness += 0.3f;
        }
        
        return fitness;
    }
    
    float CalculateDistributionFitness(const ElevationDistributionAnalysis& distribution) const {
        float fitness = 0.0f;
        
        // Bimodality indicates ocean/land separation
        if (distribution.elevationBimodality > 0.5f) fitness += 0.3f;
        
        // Reasonable percentages
        if (distribution.seaLevelPercentage >= 30.0f && distribution.seaLevelPercentage <= 80.0f) {
            fitness += 0.2f;
        }
        
        if (distribution.mountainPercentage >= 5.0f && distribution.mountainPercentage <= 30.0f) {
            fitness += 0.2f;
        }
        
        // Complex coastline
        fitness += std::min(0.3f, distribution.coastlineComplexity * 10.0f);
        
        return fitness;
    }
    
    float CalculateRoughnessFitness(const PerceptualAnalysis& analysis) const {
        float fitness = 0.0f;
        
        // Multi-scale roughness should decrease with scale
        if (analysis.microRoughness > analysis.mesoRoughness &&
            analysis.mesoRoughness > analysis.macroRoughness) {
            fitness += 0.3f;
        }
        
        // But not too dramatically
        if (analysis.microRoughness > 0 && analysis.landscapeRoughness > 0) {
            float ratio = analysis.landscapeRoughness / analysis.microRoughness;
            if (ratio >= 0.1f && ratio <= 0.5f) {
                fitness += 0.3f;
            }
        }
        
        // Fractal dimension bonus
        if (analysis.fractalDimension >= 2.2f && analysis.fractalDimension <= 2.6f) {
            fitness += 0.4f;
        }
        
        return fitness;
    }
    
    float CalculateTotalFitness(const FitnessComponents& components) const {
        // Weighted combination of all fitness components
        float physicalWeight = 0.5f;
        float perceptualWeight = 0.5f;
        
        float physicalFitness = (
            components.massConservationFitness * 0.25f +
            components.gradientPlausibilityFitness * 0.25f +
            components.hydrologyFitness * 0.25f +
            components.elevationDistributionFitness * 0.25f
        );
        
        float perceptualFitness = (
            components.multiScaleRoughnessFitness * 0.25f +
            components.patternNaturalnessFitness * 0.25f +
            components.terrainSignatureFitness * 0.25f +
            components.geomorphologicalFitness * 0.25f
        );
        
        return physicalWeight * physicalFitness + perceptualWeight * perceptualFitness;
    }
    
    std::vector<float> BuildFeatureVector(const FitnessComponents& components) const {
        std::vector<float> features;
        
        // Fitness scores
        features.push_back(components.massConservationFitness);
        features.push_back(components.gradientPlausibilityFitness);
        features.push_back(components.hydrologyFitness);
        features.push_back(components.elevationDistributionFitness);
        features.push_back(components.multiScaleRoughnessFitness);
        features.push_back(components.patternNaturalnessFitness);
        features.push_back(components.terrainSignatureFitness);
        features.push_back(components.geomorphologicalFitness);
        
        // Statistical properties
        features.push_back(components.fractalDimension);
        features.push_back(components.lacunarity);
        
        // Add spectrum features (first 10 values)
        for (size_t i = 0; i < 10 && i < components.roughnessSpectrum.size(); ++i) {
            features.push_back(components.roughnessSpectrum[i]);
        }
        
        return features;
    }
    
    void CollectRawMetrics(
        GeologicalFitnessResult& result,
        const PhysicalCharacteristics& physical,
        const PerceptualAnalysis& perceptual
    ) const {
        // Physical metrics
        result.metrics["maxGradient"] = physical.gradients.maxGradientAfter;
        result.metrics["avgGradient"] = physical.gradients.averageGradientAfter;
        result.metrics["gradientVariance"] = physical.gradients.gradientVarianceAfter;
        result.metrics["seaLevelPercentage"] = physical.distribution.seaLevelPercentage;
        result.metrics["mountainPercentage"] = physical.distribution.mountainPercentage;
        result.metrics["coastlineComplexity"] = physical.distribution.coastlineComplexity;
        result.metrics["drainageDensity"] = physical.hydrology.drainageDensity;
        result.metrics["ponding"] = physical.hydrology.ponding;
        
        // Perceptual metrics
        result.metrics["fractalDimension"] = perceptual.fractalDimension;
        result.metrics["lacunarity"] = perceptual.lacunarity;
        result.metrics["microRoughness"] = perceptual.microRoughness;
        result.metrics["mesoRoughness"] = perceptual.mesoRoughness;
        result.metrics["macroRoughness"] = perceptual.macroRoughness;
        result.metrics["landscapeRoughness"] = perceptual.landscapeRoughness;
    }
};

} // namespace PlanetGen::Generation::Analysis
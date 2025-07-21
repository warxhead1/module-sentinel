module;

#include <vector>
#include <string>
#include <cmath>
#include <algorithm>
#include <numeric>
#include <chrono>

// Parallel execution policies are not fully supported in libc++
#if defined(__clang__) && defined(_LIBCPP_VERSION)
    #define NO_PARALLEL_EXECUTION
#else
    #include <execution>
#endif

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

module StatisticalContinuityMetrics;

import Core.Threading.JobSystem;
import AnalysisTypes;

namespace PlanetGen::Generation::Analysis {

using namespace PlanetGen::Core::Threading;

StatisticalContinuityMetrics::StatisticalContinuityMetrics() {
    m_metricName = "StatisticalContinuity";
    m_description = "Analyzes statistical properties and continuity of terrain data during pipeline transitions";
}

StatisticalContinuityMetrics::~StatisticalContinuityMetrics() = default;

std::string StatisticalContinuityMetrics::GetMetricName() const {
    return m_metricName;
}

std::string StatisticalContinuityMetrics::GetMetricDescription() const {
    return m_description;
}

std::string StatisticalContinuityMetrics::GetMetricVersion() const {
    return "1.0.0";
}

std::string StatisticalContinuityMetrics::GetDescription() const {
    return m_description;
}

std::string StatisticalContinuityMetrics::GetVersion() const {
    return "1.0.0";
}

bool StatisticalContinuityMetrics::CanAnalyzeTransition(const std::string& fromStage, const std::string& toStage) const {
    return true; // Can analyze any transition
}

bool StatisticalContinuityMetrics::RequiresHistoricalData() const {
    return false;
}

uint32_t StatisticalContinuityMetrics::GetMinimumDataPoints() const {
    return 100;
}

void StatisticalContinuityMetrics::SetThresholds(float warningThreshold, float criticalThreshold) {
    m_warningThreshold = warningThreshold;
    m_criticalThreshold = criticalThreshold;
}

std::pair<float, float> StatisticalContinuityMetrics::GetThresholds() const {
    return {m_warningThreshold, m_criticalThreshold};
}

bool StatisticalContinuityMetrics::SelfTest() const {
    return true;
}

std::vector<std::string> StatisticalContinuityMetrics::GetDependencies() const {
    return {};
}

TerrainMetricResult StatisticalContinuityMetrics::AnalyzeTransition(
    const TerrainDataSnapshot& beforeSnapshot,
    const TerrainDataSnapshot& afterSnapshot
) const {
    auto startTime = std::chrono::high_resolution_clock::now();
    
    TerrainMetricResult result;
    result.metricName = m_metricName;
    result.isSuccessful = false;
    
    try {
        // Validate data availability
        if (!beforeSnapshot.HasElevationData() || !afterSnapshot.HasElevationData()) {
            result.errorMessage = "Missing elevation data for analysis";
            return result;
        }
        
        const auto& beforeElevation = beforeSnapshot.GetElevationData();
        const auto& afterElevation = afterSnapshot.GetElevationData();
        
        if (beforeElevation.size() != afterElevation.size()) {
            result.errorMessage = "Elevation data size mismatch";
            return result;
        }
        
        if (beforeElevation.empty()) {
            result.errorMessage = "Empty elevation data";
            return result;
        }
        
        // Perform high-performance statistical analysis using JobSystem
        auto statisticalAnalysis = AnalyzeStatisticalProperties(beforeElevation, afterElevation);
        auto continuityAnalysis = AnalyzeContinuity(beforeElevation, afterElevation);
        auto distributionAnalysis = AnalyzeDistributionChanges(beforeElevation, afterElevation);
        
        // Compute overall score based on multiple factors
        float statisticalScore = ComputeStatisticalScore(statisticalAnalysis);
        float continuityScore = ComputeContinuityScore(continuityAnalysis);
        float distributionScore = ComputeDistributionScore(distributionAnalysis);
        
        // Weighted average of scores
        result.score = (statisticalScore * 0.4f + continuityScore * 0.4f + distributionScore * 0.2f);
        
        // Generate detailed message
        result.detailMessage = GenerateDetailedMessage(statisticalAnalysis, continuityAnalysis, distributionAnalysis);
        
        // Generate parameter suggestions if score is low
        if (result.score < 0.7f) {
            result.suggestions = GenerateParameterSuggestions(statisticalAnalysis, continuityAnalysis, distributionAnalysis);
        }
        
        result.isSuccessful = true;
        
        auto endTime = std::chrono::high_resolution_clock::now();
        result.analysisTimeMs = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime);
        
    } catch (const std::exception& e) {
        result.errorMessage = "Analysis failed: " + std::string(e.what());
    }
    
    return result;
}

StatisticalContinuityMetrics::StatisticalAnalysis StatisticalContinuityMetrics::AnalyzeStatisticalProperties(
    const std::vector<float>& beforeData,
    const std::vector<float>& afterData
) const {
    StatisticalAnalysis analysis;
    
    const size_t dataSize = beforeData.size();
    
    // Use parallel algorithms for better performance on large datasets
    if (dataSize > 10000) {
        // Parallel computation of statistics
        auto [beforeStats, afterStats] = ComputeStatisticsParallel(beforeData, afterData);
        analysis.beforeMean = beforeStats.mean;
        analysis.afterMean = afterStats.mean;
        analysis.beforeStdDev = beforeStats.stdDev;
        analysis.afterStdDev = afterStats.stdDev;
        analysis.beforeVariance = beforeStats.variance;
        analysis.afterVariance = afterStats.variance;
    } else {
        // Sequential computation for smaller datasets
        auto beforeStats = ComputeStatistics(beforeData);
        auto afterStats = ComputeStatistics(afterData);
        analysis.beforeMean = beforeStats.mean;
        analysis.afterMean = afterStats.mean;
        analysis.beforeStdDev = beforeStats.stdDev;
        analysis.afterStdDev = afterStats.stdDev;
        analysis.beforeVariance = beforeStats.variance;
        analysis.afterVariance = afterStats.variance;
    }
    
    // Compute changes
    analysis.meanChange = std::abs(analysis.afterMean - analysis.beforeMean);
    analysis.stdDevChange = std::abs(analysis.afterStdDev - analysis.beforeStdDev);
    analysis.varianceChange = std::abs(analysis.afterVariance - analysis.beforeVariance);
    
    return analysis;
}

StatisticalContinuityMetrics::ContinuityAnalysis StatisticalContinuityMetrics::AnalyzeContinuity(
    const std::vector<float>& beforeData,
    const std::vector<float>& afterData
) const {
    ContinuityAnalysis analysis;
    
    const size_t dataSize = beforeData.size();
    
    // Estimate grid dimensions (assume roughly square grid)
    uint32_t width = static_cast<uint32_t>(std::sqrt(dataSize));
    uint32_t height = (dataSize + width - 1) / width;
    
    if (width < 3 || height < 3) {
        // Grid too small for meaningful continuity analysis
        analysis.spatialContinuity = 1.0f;
        analysis.gradientContinuity = 1.0f;
        analysis.localVarianceChange = 0.0f;
        return analysis;
    }
    
    // Compute spatial continuity using parallel processing
    if (dataSize > 50000) {
        analysis = ComputeContinuityParallel(beforeData, afterData, width, height);
    } else {
        analysis = ComputeContinuitySequential(beforeData, afterData, width, height);
    }
    
    return analysis;
}

StatisticalContinuityMetrics::DistributionAnalysis StatisticalContinuityMetrics::AnalyzeDistributionChanges(
    const std::vector<float>& beforeData,
    const std::vector<float>& afterData
) const {
    DistributionAnalysis analysis;
    
    // Compute histograms for distribution comparison
    const int numBins = 64;
    auto beforeHist = ComputeHistogram(beforeData, numBins);
    auto afterHist = ComputeHistogram(afterData, numBins);
    
    // Compute Kolmogorov-Smirnov distance as distribution change measure
    analysis.distributionDistance = ComputeKSDistance(beforeHist, afterHist);
    
    // Compute entropy changes
    analysis.beforeEntropy = ComputeEntropy(beforeHist);
    analysis.afterEntropy = ComputeEntropy(afterHist);
    analysis.entropyChange = std::abs(analysis.afterEntropy - analysis.beforeEntropy);
    
    return analysis;
}

std::pair<StatisticalContinuityMetrics::BasicStats, StatisticalContinuityMetrics::BasicStats> 
StatisticalContinuityMetrics::ComputeStatisticsParallel(
    const std::vector<float>& beforeData,
    const std::vector<float>& afterData
) const {
    thread_local static bool inParallelExecution = false;
    if (inParallelExecution) {
        // Fallback to sequential to avoid deadlock
        return {ComputeStatistics(beforeData), ComputeStatistics(afterData)};
    }
    inParallelExecution = true;

    BasicStats beforeStats, afterStats;

    auto beforeJob = JobSystem::Instance().CreateJob<BasicStats>(
        [this, &beforeData]() -> BasicStats {
            return ComputeStatistics(beforeData);
        },
        "ComputeBeforeStats"
    );

    auto afterJob = JobSystem::Instance().CreateJob<BasicStats>(
        [this, &afterData]() -> BasicStats {
            return ComputeStatistics(afterData);
        },
        "ComputeAfterStats"
    );

    auto beforeHandle = JobSystem::Instance().Schedule(beforeJob);
    auto afterHandle = JobSystem::Instance().Schedule(afterJob);

    beforeStats = beforeJob->GetResult();
    afterStats = afterJob->GetResult();

    delete beforeJob;
    delete afterJob;

    inParallelExecution = false;
    return {beforeStats, afterStats};
}

StatisticalContinuityMetrics::BasicStats StatisticalContinuityMetrics::ComputeStatistics(
    const std::vector<float>& data
) const {
    BasicStats stats;
    
    if (data.empty()) return stats;
    
    // Use parallel algorithms where available
#ifdef NO_PARALLEL_EXECUTION
    // Sequential fallback for Clang/libc++
    stats.mean = std::reduce(data.begin(), data.end(), 0.0f) / data.size();
    
    // Compute variance
    float variance = std::transform_reduce(
        data.begin(), data.end(),
        0.0f,
        std::plus<>(),
        [mean = stats.mean](float value) {
            float diff = value - mean;
            return diff * diff;
        }
    ) / data.size();
#else
    // Parallel execution for MSVC and GCC with libstdc++
    stats.mean = std::reduce(std::execution::par_unseq, data.begin(), data.end(), 0.0f) / data.size();
    
    // Compute variance
    float variance = std::transform_reduce(
        std::execution::par_unseq,
        data.begin(), data.end(),
        0.0f,
        std::plus<>(),
        [mean = stats.mean](float value) {
            float diff = value - mean;
            return diff * diff;
        }
    ) / data.size();
#endif
    
    stats.variance = variance;
    stats.stdDev = std::sqrt(variance);
    
    return stats;
}

StatisticalContinuityMetrics::ContinuityAnalysis StatisticalContinuityMetrics::ComputeContinuityParallel(
    const std::vector<float>& beforeData,
    const std::vector<float>& afterData,
    uint32_t width,
    uint32_t height
) const {
    ContinuityAnalysis analysis;

    // Use standard parallel algorithms to accumulate results by row
    struct RowResult {
        float spatialSum = 0.0f;
        float gradientSum = 0.0f;
        size_t validCells = 0;
    };

    std::vector<RowResult> rowResults(height);

#ifdef NO_PARALLEL_EXECUTION
    // Sequential fallback for Clang/libc++
    for (size_t y = 0; y < height; ++y) {
        RowResult& row = rowResults[y];
        for (uint32_t x = 1; x < width - 1; ++x) {
            size_t idx = y * width + x;
            if (idx >= beforeData.size()) continue;

            float beforeVal = beforeData[idx];
            float afterVal = afterData[idx];
            float changeMag = std::abs(afterVal - beforeVal);
            row.spatialSum += changeMag;

            float beforeGrad = std::abs(beforeData[idx + 1] - beforeData[idx - 1]);
            float afterGrad = std::abs(afterData[idx + 1] - afterData[idx - 1]);
            row.gradientSum += std::abs(afterGrad - beforeGrad);

            row.validCells++;
        }
    }
#else
    // Parallel execution for MSVC and GCC
    std::vector<size_t> indices(height);
    std::iota(indices.begin(), indices.end(), 0);
    
    std::for_each(std::execution::par, indices.begin(), indices.end(), [&](size_t y) {
        RowResult& row = rowResults[y];
        for (uint32_t x = 1; x < width - 1; ++x) {
            size_t idx = y * width + x;
            if (idx >= beforeData.size()) continue;

            float beforeVal = beforeData[idx];
            float afterVal = afterData[idx];
            float changeMag = std::abs(afterVal - beforeVal);
            row.spatialSum += changeMag;

            float beforeGrad = std::abs(beforeData[idx + 1] - beforeData[idx - 1]);
            float afterGrad = std::abs(afterData[idx + 1] - afterData[idx - 1]);
            row.gradientSum += std::abs(afterGrad - beforeGrad);

            row.validCells++;
        }
    });
#endif

    float totalSpatial = 0.0f;
    float totalGradient = 0.0f;
    size_t totalValid = 0;

    for (const auto& row : rowResults) {
        totalSpatial += row.spatialSum;
        totalGradient += row.gradientSum;
        totalValid += row.validCells;
    }

    float avgSpatial = totalValid > 0 ? totalSpatial / totalValid : 0.0f;
    float avgGradient = totalValid > 0 ? totalGradient / totalValid : 0.0f;

    analysis.spatialContinuity = 1.0f / (1.0f + avgSpatial);
    analysis.gradientContinuity = 1.0f / (1.0f + avgGradient);
    analysis.localVarianceChange = avgSpatial; // Simplified

    return analysis;
}

StatisticalContinuityMetrics::ContinuityAnalysis StatisticalContinuityMetrics::ComputeContinuitySequential(
    const std::vector<float>& beforeData,
    const std::vector<float>& afterData,
    uint32_t width,
    uint32_t height
) const {
    ContinuityAnalysis analysis;
    
    float spatialSum = 0.0f;
    float gradientSum = 0.0f;
    size_t validCells = 0;
    
    for (uint32_t y = 1; y < height - 1; ++y) {
        for (uint32_t x = 1; x < width - 1; ++x) {
            uint32_t idx = y * width + x;
            if (idx >= beforeData.size()) continue;
            
            // Spatial continuity
            float beforeVal = beforeData[idx];
            float afterVal = afterData[idx];
            spatialSum += std::abs(afterVal - beforeVal);
            
            // Gradient continuity
            float beforeGradX = std::abs(beforeData[idx + 1] - beforeData[idx - 1]);
            float afterGradX = std::abs(afterData[idx + 1] - afterData[idx - 1]);
            gradientSum += std::abs(afterGradX - beforeGradX);
            
            validCells++;
        }
    }
    
    float avgSpatial = validCells > 0 ? spatialSum / validCells : 0.0f;
    float avgGradient = validCells > 0 ? gradientSum / validCells : 0.0f;
    
    analysis.spatialContinuity = 1.0f / (1.0f + avgSpatial);
    analysis.gradientContinuity = 1.0f / (1.0f + avgGradient);
    analysis.localVarianceChange = avgSpatial; // Simplified
    
    return analysis;
}

std::vector<float> StatisticalContinuityMetrics::ComputeHistogram(
    const std::vector<float>& data,
    int numBins
) const {
    if (data.empty()) return std::vector<float>(numBins, 0.0f);
    
    // Find min/max
    auto [minIt, maxIt] = std::minmax_element(data.begin(), data.end());
    float minVal = *minIt;
    float maxVal = *maxIt;
    float range = maxVal - minVal;
    
    if (range == 0.0f) {
        std::vector<float> hist(numBins, 0.0f);
        hist[0] = static_cast<float>(data.size());
        return hist;
    }
    
    std::vector<float> histogram(numBins, 0.0f);
    float binWidth = range / numBins;
    
    for (float value : data) {
        int binIndex = static_cast<int>((value - minVal) / binWidth);
        binIndex = std::clamp(binIndex, 0, numBins - 1);
        histogram[binIndex] += 1.0f;
    }
    
    // Normalize
    float totalCount = static_cast<float>(data.size());
    for (float& count : histogram) {
        count /= totalCount;
    }
    
    return histogram;
}

float StatisticalContinuityMetrics::ComputeKSDistance(
    const std::vector<float>& hist1,
    const std::vector<float>& hist2
) const {
    if (hist1.size() != hist2.size()) return 1.0f;
    
    float maxDiff = 0.0f;
    float cdf1 = 0.0f;
    float cdf2 = 0.0f;
    
    for (size_t i = 0; i < hist1.size(); ++i) {
        cdf1 += hist1[i];
        cdf2 += hist2[i];
        maxDiff = std::max(maxDiff, std::abs(cdf1 - cdf2));
    }
    
    return maxDiff;
}

float StatisticalContinuityMetrics::ComputeEntropy(const std::vector<float>& histogram) const {
    float entropy = 0.0f;
    
    for (float p : histogram) {
        if (p > 0.0f) {
            entropy -= p * std::log2(p);
        }
    }
    
    return entropy;
}

float StatisticalContinuityMetrics::ComputeStatisticalScore(const StatisticalAnalysis& analysis) const {
    // Lower changes = higher score
    float meanScore = 1.0f / (1.0f + analysis.meanChange / 1000.0f);
    float stdDevScore = 1.0f / (1.0f + analysis.stdDevChange / 500.0f);
    float varianceScore = 1.0f / (1.0f + analysis.varianceChange / 1000000.0f);
    
    return (meanScore + stdDevScore + varianceScore) / 3.0f;
}

float StatisticalContinuityMetrics::ComputeContinuityScore(const ContinuityAnalysis& analysis) const {
    return (analysis.spatialContinuity + analysis.gradientContinuity) / 2.0f;
}

float StatisticalContinuityMetrics::ComputeDistributionScore(const DistributionAnalysis& analysis) const {
    float distanceScore = 1.0f / (1.0f + analysis.distributionDistance * 10.0f);
    float entropyScore = 1.0f / (1.0f + analysis.entropyChange);
    
    return (distanceScore + entropyScore) / 2.0f;
}

std::string StatisticalContinuityMetrics::GenerateDetailedMessage(
    const StatisticalAnalysis& statistical,
    const ContinuityAnalysis& continuity,
    const DistributionAnalysis& distribution
) const {
    std::string message = "Statistical Analysis: ";
    message += "Mean change: " + std::to_string(statistical.meanChange) + "m, ";
    message += "StdDev change: " + std::to_string(statistical.stdDevChange) + "m | ";
    message += "Continuity: " + std::to_string(continuity.spatialContinuity * 100.0f) + "% spatial, ";
    message += std::to_string(continuity.gradientContinuity * 100.0f) + "% gradient | ";
    message += "Distribution distance: " + std::to_string(distribution.distributionDistance);
    
    return message;
}

std::vector<std::pair<std::string, float>> StatisticalContinuityMetrics::GenerateParameterSuggestions(
    const StatisticalAnalysis& statistical,
    const ContinuityAnalysis& continuity,
    const DistributionAnalysis& distribution
) const {
    std::vector<std::pair<std::string, float>> suggestions;
    
    // Suggest parameter adjustments based on analysis
    if (statistical.meanChange > 500.0f) {
        suggestions.emplace_back("noise_amplitude", 0.8f); // Reduce amplitude
    }
    
    if (continuity.spatialContinuity < 0.7f) {
        suggestions.emplace_back("smoothing_factor", 1.2f); // Increase smoothing
    }
    
    if (distribution.distributionDistance > 0.3f) {
        suggestions.emplace_back("processing_strength", 0.9f); // Reduce processing strength
    }
    
    return suggestions;
}

} // namespace PlanetGen::Generation::Analysis
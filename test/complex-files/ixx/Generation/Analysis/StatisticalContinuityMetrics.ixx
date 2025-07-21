module;

#include <vector>
#include <string>
#include <chrono>

#include <utility>
export module StatisticalContinuityMetrics;

import ITerrainMetric;
import AnalysisTypes;

export namespace PlanetGen::Generation::Analysis {

/**
 * @brief High-performance statistical continuity analysis metric
 * 
 * Analyzes statistical properties and spatial continuity of terrain data
 * during pipeline transitions using parallel processing for maximum efficiency.
 */
class StatisticalContinuityMetrics : public ITerrainMetric {
public:
    StatisticalContinuityMetrics();
    ~StatisticalContinuityMetrics() override;
    
    // ITerrainMetric interface implementation
    std::string GetMetricName() const override;
    std::string GetMetricDescription() const override;
    std::string GetMetricVersion() const override;
    std::string GetDescription() const;
    std::string GetVersion() const;
    
    bool CanAnalyzeTransition(const std::string& fromStage, const std::string& toStage) const override;
    
    bool RequiresHistoricalData() const override;
    uint32_t GetMinimumDataPoints() const override;
    
    TerrainMetricResult AnalyzeTransition(
        const TerrainDataSnapshot& beforeSnapshot,
        const TerrainDataSnapshot& afterSnapshot
    ) const override;
    
    // Configuration methods
    void SetThresholds(float warningThreshold, float criticalThreshold) override;
    
    std::pair<float, float> GetThresholds() const override;
    
    bool SelfTest() const override;
    std::vector<std::string> GetDependencies() const override;

private:
    std::string m_metricName;
    std::string m_description;
    float m_warningThreshold = 0.7f;
    float m_criticalThreshold = 0.3f;
    
    // Analysis structures for internal use
    struct StatisticalAnalysis {
        float beforeMean, afterMean, meanChange;
        float beforeStdDev, afterStdDev, stdDevChange;
        float beforeVariance, afterVariance, varianceChange;
    };
    
    struct ContinuityAnalysis {
        float spatialContinuity;
        float gradientContinuity;
        float localVarianceChange;
    };
    
    struct DistributionAnalysis {
        float distributionDistance;
        float beforeEntropy, afterEntropy, entropyChange;
    };
    
    struct BasicStats {
        float mean = 0.0f;
        float stdDev = 0.0f;
        float variance = 0.0f;
    };
    
    // Analysis methods
    StatisticalAnalysis AnalyzeStatisticalProperties(
        const std::vector<float>& beforeData,
        const std::vector<float>& afterData
    ) const;
    
    ContinuityAnalysis AnalyzeContinuity(
        const std::vector<float>& beforeData,
        const std::vector<float>& afterData
    ) const;
    
    DistributionAnalysis AnalyzeDistributionChanges(
        const std::vector<float>& beforeData,
        const std::vector<float>& afterData
    ) const;
    
    // High-performance parallel computation methods
    std::pair<BasicStats, BasicStats> ComputeStatisticsParallel(
        const std::vector<float>& beforeData,
        const std::vector<float>& afterData
    ) const;
    
    BasicStats ComputeStatistics(const std::vector<float>& data) const;
    
    ContinuityAnalysis ComputeContinuityParallel(
        const std::vector<float>& beforeData,
        const std::vector<float>& afterData,
        uint32_t width,
        uint32_t height
    ) const;
    
    ContinuityAnalysis ComputeContinuitySequential(
        const std::vector<float>& beforeData,
        const std::vector<float>& afterData,
        uint32_t width,
        uint32_t height
    ) const;
    
    // Utility methods
    std::vector<float> ComputeHistogram(const std::vector<float>& data, int numBins) const;
    float ComputeKSDistance(const std::vector<float>& hist1, const std::vector<float>& hist2) const;
    float ComputeEntropy(const std::vector<float>& histogram) const;
    
    // Score computation
    float ComputeStatisticalScore(const StatisticalAnalysis& analysis) const;
    float ComputeContinuityScore(const ContinuityAnalysis& analysis) const;
    float ComputeDistributionScore(const DistributionAnalysis& analysis) const;
    
    // Reporting
    std::string GenerateDetailedMessage(
        const StatisticalAnalysis& statistical,
        const ContinuityAnalysis& continuity,
        const DistributionAnalysis& distribution
    ) const;
    
    std::vector<std::pair<std::string, float>> GenerateParameterSuggestions(
        const StatisticalAnalysis& statistical,
        const ContinuityAnalysis& continuity,
        const DistributionAnalysis& distribution
    ) const;
};

} // namespace PlanetGen::Generation::Analysis
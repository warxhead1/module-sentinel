module;

#include <vector>
#include <string>
#include <memory>

#include <functional>
#include <utility>
export module ITerrainMetric;

import AnalysisTypes;
import TerrainDataSnapshot;

export namespace PlanetGen::Generation::Analysis {

/**
 * @brief Interface for terrain quality metrics
 * 
 * Extensible framework for implementing different types of terrain analysis metrics.
 * Each metric can analyze transitions between pipeline stages and detect specific
 * types of data degradation or improvement.
 */
class ITerrainMetric {
public:
    virtual ~ITerrainMetric() = default;
    
    // Metric identification
    virtual std::string GetMetricName() const = 0;
    virtual std::string GetMetricDescription() const = 0;
    virtual std::string GetMetricVersion() const = 0;
    
    // Analysis capabilities
    virtual bool CanAnalyzeTransition(const std::string& fromStage, const std::string& toStage) const = 0;
    virtual bool RequiresHistoricalData() const = 0;
    virtual uint32_t GetMinimumDataPoints() const = 0;
    
    // Main analysis method
    virtual TerrainMetricResult AnalyzeTransition(
        const TerrainDataSnapshot& beforeSnapshot,
        const TerrainDataSnapshot& afterSnapshot
    ) const = 0;
    
    // Historical analysis (for metrics that need trends)
    virtual TerrainMetricResult AnalyzeHistoricalTrend(
        const std::vector<std::reference_wrapper<const TerrainDataSnapshot>>& snapshots
    ) const {
        // Default implementation for metrics that don't need historical data
        if (snapshots.size() < 2) {
            TerrainMetricResult result{};
            result.metricName = GetMetricName();
            result.status = TerrainMetricResult::Status::Warning;
            result.interpretation = "Insufficient data for historical analysis";
            return result;
        }
        
        return AnalyzeTransition(snapshots.front().get(), snapshots.back().get());
    }
    
    // Configuration
    virtual void SetThresholds(float warningThreshold, float criticalThreshold) = 0;
    virtual std::pair<float, float> GetThresholds() const = 0;
    
    // Self-diagnostics
    virtual bool SelfTest() const = 0;
    virtual std::vector<std::string> GetDependencies() const = 0;
};

/**
 * @brief Base class for implementing terrain metrics
 * 
 * Provides common functionality and utilities for metric implementations.
 */
class TerrainMetricBase : public ITerrainMetric {
public:
    TerrainMetricBase(const std::string& name, const std::string& description)
        : m_metricName(name), m_metricDescription(description) {}
    
    std::string GetMetricName() const override { return m_metricName; }
    std::string GetMetricDescription() const override { return m_metricDescription; }
    std::string GetMetricVersion() const override { return "1.0.0"; }
    
    bool RequiresHistoricalData() const override { return false; }
    uint32_t GetMinimumDataPoints() const override { return 2; }
    
    void SetThresholds(float warningThreshold, float criticalThreshold) override {
        m_warningThreshold = warningThreshold;
        m_criticalThreshold = criticalThreshold;
    }
    
    std::pair<float, float> GetThresholds() const override {
        return {m_warningThreshold, m_criticalThreshold};
    }
    
    bool SelfTest() const override { return true; }
    std::vector<std::string> GetDependencies() const override { return {}; }

protected:
    std::string m_metricName;
    std::string m_metricDescription;
    float m_warningThreshold = 2.0f;   // 200% change = warning
    float m_criticalThreshold = 5.0f;  // 500% change = critical
    
    // Utility methods for common calculations
    static float CalculateVariance(const std::vector<float>& data);
    static float CalculateStandardDeviation(const std::vector<float>& data);
    static float CalculateMean(const std::vector<float>& data);
    static float CalculateRange(const std::vector<float>& data);
    static float CalculatePercentileValue(const std::vector<float>& data, float percentile);
    
    // Status determination based on delta percentage
    TerrainMetricResult::Status DetermineStatus(float deltaPercentage) const {
        float absDelta = std::abs(deltaPercentage);
        if (absDelta >= m_criticalThreshold) {
            return TerrainMetricResult::Status::Critical;
        } else if (absDelta >= m_warningThreshold) {
            return TerrainMetricResult::Status::Warning;
        }
        return TerrainMetricResult::Status::Normal;
    }
    
    // Create standardized result structure
    TerrainMetricResult CreateResult(
        float primaryValue, 
        float previousValue, 
        const std::string& baseInterpretation = ""
    ) const {
        TerrainMetricResult result{};
        result.metricName = m_metricName;
        result.primaryValue = primaryValue;
        result.deltaValue = primaryValue - previousValue;
        result.deltaPercentage = previousValue != 0.0f ? 
            (result.deltaValue / previousValue) * 100.0f : 0.0f;
        result.status = DetermineStatus(result.deltaPercentage);
        
        // Generate interpretation
        if (baseInterpretation.empty()) {
            result.interpretation = GenerateStandardInterpretation(result);
        } else {
            result.interpretation = baseInterpretation;
        }
        
        return result;
    }

private:
    std::string GenerateStandardInterpretation(const TerrainMetricResult& result) const {
        std::string interpretation = m_metricName + ": ";
        
        if (result.status == TerrainMetricResult::Status::Critical) {
            interpretation += "CRITICAL - ";
        } else if (result.status == TerrainMetricResult::Status::Warning) {
            interpretation += "WARNING - ";
        }
        
        if (result.deltaPercentage > 0) {
            interpretation += "Increased by " + std::to_string(result.deltaPercentage) + "%";
        } else if (result.deltaPercentage < 0) {
            interpretation += "Decreased by " + std::to_string(std::abs(result.deltaPercentage)) + "%";
        } else {
            interpretation += "No significant change";
        }
        
        return interpretation;
    }
};

} // namespace PlanetGen::Generation::Analysis
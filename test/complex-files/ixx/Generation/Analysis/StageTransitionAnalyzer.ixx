module;

#include <vector>
#include <memory>
#include <string>
#include <unordered_map>
#include <chrono>
#include <functional>
#include <mutex>

#include <utility>
export module StageTransitionAnalyzer;

import ITerrainMetric;
import TerrainDataSnapshot;

// Import the actual modules containing our pipeline components
// These should work since they're defined in VulkanModules
import PlanetaryGenerator;
import IPhysicsProcessor;
import AnalysisTypes;

export namespace PlanetGen::Generation::Analysis {

// ConcreteTerrainDataSnapshot is imported from TerrainDataSnapshot module

/**
 * @brief Core analyzer for computing deltas between pipeline stages
 * 
 * Orchestrates the application of multiple metrics to analyze transitions
 * between pipeline stages. Integrates with existing terrain generation
 * pipeline components like PlanetaryGenerator, PhysicsIntegrator, and
 * TerrainCoherenceProcessor.
 */
class StageTransitionAnalyzer {
public:
    StageTransitionAnalyzer();
    ~StageTransitionAnalyzer();
    
    // Initialization
    bool Initialize();
    void Shutdown();
    
    // Metric management
    bool RegisterMetric(std::unique_ptr<ITerrainMetric> metric);
    void UnregisterMetric(const std::string& metricName);
    void EnableMetric(const std::string& metricName, bool enabled);
    std::vector<std::string> GetAvailableMetrics() const;
    std::vector<std::string> GetEnabledMetrics() const;
    
    // Core analysis method
    PipelineAnalysisResult AnalyzeTransition(
        const TerrainDataSnapshot& beforeSnapshot,
        const TerrainDataSnapshot& afterSnapshot
    ) const;
    
    // Batch analysis for multiple metrics
    std::vector<TerrainMetricResult> RunAllEnabledMetrics(
        const TerrainDataSnapshot& beforeSnapshot,
        const TerrainDataSnapshot& afterSnapshot
    ) const;
    
    // Historical analysis (for metrics that need trends)
    PipelineAnalysisResult AnalyzeHistoricalTransition(
        const std::vector<std::reference_wrapper<const TerrainDataSnapshot>>& snapshots
    ) const;
    
    // Performance and configuration
    void SetParallelProcessing(bool enabled) { m_enableParallelProcessing = enabled; }
    bool IsParallelProcessingEnabled() const { return m_enableParallelProcessing; }
    
    void SetAnalysisTimeout(std::chrono::milliseconds timeout) { m_analysisTimeout = timeout; }
    std::chrono::milliseconds GetAnalysisTimeout() const { return m_analysisTimeout; }
    
    // Statistics
    struct AnalyzerStatistics {
        uint32_t totalTransitionsAnalyzed;
        uint32_t criticalIssuesDetected;
        uint32_t warningsIssued;
        std::chrono::milliseconds averageAnalysisTime;
        std::unordered_map<std::string, uint32_t> metricExecutionCounts;
        std::unordered_map<std::string, std::chrono::milliseconds> metricAverageTimes;
    };
    
    AnalyzerStatistics GetStatistics() const;
    void ResetStatistics();
    
private:
    // Metric storage and management
    std::unordered_map<std::string, std::unique_ptr<ITerrainMetric>> m_metrics;
    std::unordered_map<std::string, bool> m_metricEnabled;
    
    // Configuration
    bool m_enableParallelProcessing = true;
    std::chrono::milliseconds m_analysisTimeout{30000}; // 30 second timeout
    
    // Statistics tracking
    mutable AnalyzerStatistics m_statistics;
    mutable std::mutex m_statisticsMutex;
    
    // Working memory for high-performance analysis
    mutable std::vector<float> m_workingMemory;
    
    // Private methods
    std::vector<TerrainMetricResult> RunMetricsParallel(
        const std::vector<std::string>& metricNames,
        const TerrainDataSnapshot& beforeSnapshot,
        const TerrainDataSnapshot& afterSnapshot
    ) const;
    
    std::vector<TerrainMetricResult> RunMetricsSequential(
        const std::vector<std::string>& metricNames,
        const TerrainDataSnapshot& beforeSnapshot,
        const TerrainDataSnapshot& afterSnapshot
    ) const;
    void UpdateStatistics(const std::string& metricName, 
                         std::chrono::milliseconds executionTime) const;
    
    PipelineAnalysisResult::OverallHealth DetermineOverallHealth(
        const std::vector<TerrainMetricResult>& metricResults) const;
    
    std::string GenerateHealthSummary(
        const std::vector<TerrainMetricResult>& metricResults) const;
    
    std::vector<std::pair<std::string, float>> GenerateParameterAdjustments(
        const std::vector<TerrainMetricResult>& metricResults) const;
    
    bool ValidateSnapshots(const TerrainDataSnapshot& beforeSnapshot,
                          const TerrainDataSnapshot& afterSnapshot) const;
};

/**
 * @brief Factory for creating pre-configured stage transition analyzers
 */
class StageTransitionAnalyzerFactory {
public:
    // Create analyzer with all standard metrics enabled
    static std::unique_ptr<StageTransitionAnalyzer> CreateStandardAnalyzer();
    
    // Create analyzer optimized for real-time use (fast metrics only)
    static std::unique_ptr<StageTransitionAnalyzer> CreateRealTimeAnalyzer();
    
    // Create analyzer for detailed research analysis (all metrics, highest accuracy)
    static std::unique_ptr<StageTransitionAnalyzer> CreateResearchAnalyzer();
    
    // Create analyzer with specific metrics
    static std::unique_ptr<StageTransitionAnalyzer> CreateCustomAnalyzer(
        const std::vector<std::string>& enabledMetrics
    );
};

/**
 * @brief Pipeline stage adapter for existing terrain generation components - DISABLED
 * 
 * Complex pipeline analysis system removed for simplicity.
 */
/*
template<typename TProcessor>
class PipelineStageAdapter {
public:
    PipelineStageAdapter(std::shared_ptr<TProcessor> processor, 
                        const std::string& stageName,
                        uint32_t stageId)
        : m_processor(processor), m_stageName(stageName), m_stageId(stageId) {}
    
    // IPipelineStage implementation
    std::string GetStageName() const override { return m_stageName; }
    std::string GetStageVersion() const override { return "1.0.0"; }
    uint32_t GetStageId() const override { return m_stageId; }
    
    std::unique_ptr<TerrainDataSnapshot> CaptureInputSnapshot() const override {
        return m_inputSnapshot ? std::make_unique<ConcreteTerrainDataSnapshot>(*m_inputSnapshot) : nullptr;
    }
    
    std::unique_ptr<TerrainDataSnapshot> CaptureOutputSnapshot() const override {
        return m_outputSnapshot ? std::make_unique<ConcreteTerrainDataSnapshot>(*m_outputSnapshot) : nullptr;
    }
    
    std::chrono::milliseconds GetLastProcessingTime() const override {
        return m_lastProcessingTime;
    }
    
    bool IsProcessingStable() const override {
        return m_processingStable;
    }
    
    float GetProcessingConfidence() const override {
        return m_processingConfidence;
    }
    
    std::vector<std::pair<std::string, float>> GetCurrentParameters() const override {
        return m_currentParameters;
    }
    
    bool CanAutoTune() const override {
        return m_canAutoTune;
    }
    
    void ApplyParameterAdjustments(const std::vector<std::pair<std::string, float>>& adjustments) override {
        // Store adjustments for application to the wrapped processor
        m_pendingAdjustments = adjustments;
    }
    
    // Adapter-specific methods
    void SetInputSnapshot(std::unique_ptr<ConcreteTerrainDataSnapshot> snapshot) {
        m_inputSnapshot = std::move(snapshot);
    }
    
    void SetOutputSnapshot(std::unique_ptr<ConcreteTerrainDataSnapshot> snapshot) {
        m_outputSnapshot = std::move(snapshot);
    }
    
    void SetProcessingTime(std::chrono::milliseconds processingTime) {
        m_lastProcessingTime = processingTime;
    }
    
    void SetProcessingStable(bool stable) {
        m_processingStable = stable;
    }
    
    void SetProcessingConfidence(float confidence) {
        m_processingConfidence = confidence;
    }
    
    void SetCurrentParameters(const std::vector<std::pair<std::string, float>>& parameters) {
        m_currentParameters = parameters;
    }
    
    void SetCanAutoTune(bool canAutoTune) {
        m_canAutoTune = canAutoTune;
    }
    
    // Access to wrapped processor
    std::shared_ptr<TProcessor> GetProcessor() const { return m_processor; }
    
    // Get pending parameter adjustments
    const std::vector<std::pair<std::string, float>>& GetPendingAdjustments() const {
        return m_pendingAdjustments;
    }
    
    void ClearPendingAdjustments() {
        m_pendingAdjustments.clear();
    }

private:
    std::shared_ptr<TProcessor> m_processor;
    std::string m_stageName;
    uint32_t m_stageId;
    
    // Snapshot storage
    std::unique_ptr<ConcreteTerrainDataSnapshot> m_inputSnapshot;
    std::unique_ptr<ConcreteTerrainDataSnapshot> m_outputSnapshot;
    
    // Processing metrics
    std::chrono::milliseconds m_lastProcessingTime{0};
    bool m_processingStable = true;
    float m_processingConfidence = 1.0f;
    
    // Parameter management
    std::vector<std::pair<std::string, float>> m_currentParameters;
    std::vector<std::pair<std::string, float>> m_pendingAdjustments;
    bool m_canAutoTune = false;
};
*/

// Type aliases for specific adapters - DISABLED
// using PlanetaryGeneratorAdapter = PipelineStageAdapter<PlanetGen::Generation::PlanetaryGenerator>;

/**
 * @brief Adapter factory for creating pipeline stage adapters - DISABLED
 */
// class PipelineStageAdapterFactory {
// public:
//     // Create adapter for PlanetaryGenerator
//     static std::shared_ptr<PlanetaryGeneratorAdapter> CreatePlanetaryGeneratorAdapter(
//         std::shared_ptr<PlanetGen::Generation::PlanetaryGenerator> generator
//     );
//     
//     // TODO: PhysicsIntegrator factory method commented out because module doesn't exist
//     // static std::shared_ptr<PhysicsIntegratorAdapter> CreatePhysicsIntegratorAdapter(...)
//     
//     // Complex pipeline adapter system removed for simplicity
// };

} // namespace PlanetGen::Generation::Analysis
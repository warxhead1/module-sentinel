module;

#include <vector>
#include <memory>
#include <string>
#include <unordered_map>
#include <chrono>
#include <functional>
#include <mutex>
#include <thread>
#include <atomic>

export module DifferentialAnalysisSystem;

import IPipelineStage;
import ITerrainMetric;
import GLMModule;
import GenerationTypes;
import AnalysisTypes;

// Import StageTransitionAnalyzer instead of forward declaring it
import StageTransitionAnalyzer;

export namespace PlanetGen::Generation::Analysis {

/**
 * @brief Configuration for differential analysis system
 */

// PipelineAnalysisResult is now defined in AnalysisTypes.ixx

/**
 * @brief Central differential analysis system for terrain generation pipeline
 * 
 * Monitors data flow between pipeline stages, detects degradation patterns,
 * and provides adaptive optimization suggestions.
 */
class DifferentialAnalysisSystem {
public:
    DifferentialAnalysisSystem();
    explicit DifferentialAnalysisSystem(const DifferentialAnalysisConfig& config);
    ~DifferentialAnalysisSystem();
    
    // Configuration
    void SetConfiguration(const DifferentialAnalysisConfig& config);
    DifferentialAnalysisConfig GetConfiguration() const;
    
    // Pipeline stage registration
    bool RegisterPipelineStage(std::shared_ptr<IPipelineStage> stage);
    bool UnregisterPipelineStage(uint32_t stageId);
    void ClearPipelineStages();
    
    // Analysis execution
    PipelineAnalysisResult AnalyzePipelineTransition(
        uint32_t fromStageId, 
        uint32_t toStageId
    );
    
    std::vector<PipelineAnalysisResult> AnalyzeFullPipeline();
    
    // Real-time monitoring
    void StartRealTimeMonitoring();
    void StopRealTimeMonitoring();
    bool IsMonitoringActive() const;
    
    // Metric system
    bool RegisterMetric(std::unique_ptr<ITerrainMetric> metric);
    void EnableMetric(const std::string& metricName, bool enabled);
    std::vector<std::string> GetAvailableMetrics() const;
    std::vector<std::string> GetEnabledMetrics() const;
    
    // Results and history
    std::vector<PipelineAnalysisResult> GetRecentResults(
        uint32_t maxResults = 50
    ) const;
    
    PipelineAnalysisResult GetLastResultForTransition(
        uint32_t fromStageId, 
        uint32_t toStageId
    ) const;
    
    // Alert system
    using AlertCallback = std::function<void(const PipelineAnalysisResult&)>;
    void SetAlertCallback(AlertCallback callback);
    
    // Adaptive optimization
    void EnableAdaptiveOptimization(bool enable);
    bool IsAdaptiveOptimizationEnabled() const { return GetConfiguration().enableAdaptiveOptimization; }
    
    // Statistics and reporting
    struct SystemStatistics {
        uint32_t totalAnalysesPerformed = 0;
        uint32_t criticalIssuesDetected = 0;
        uint32_t warningsIssued = 0;
        uint32_t optimizationsApplied = 0;
        float averageAnalysisTimeMs = 0.0f;
        uint32_t activeMetricsCount = 0;
        float totalMemoryUsedMB = 0.0f;
        float cacheHitRate = 0.0f;
        float systemEfficiencyScore = 0.0f; // 0.0-1.0
    };
    
    SystemStatistics GetSystemStatistics() const;
    std::string GenerateAnalysisReport() const;
    
    // Thread safety
    void SetMaxConcurrentAnalyses(uint32_t maxConcurrent);
    
    // Private implementation methods
    std::vector<TerrainMetricResult> RunMetricsSequential(
        const std::vector<std::string>& metricNames,
        const TerrainDataSnapshot& beforeSnapshot,
        const TerrainDataSnapshot& afterSnapshot) const;
        
    std::vector<TerrainMetricResult> RunMetricsParallel(
        const std::vector<std::string>& metricNames,
        const TerrainDataSnapshot& beforeSnapshot,
        const TerrainDataSnapshot& afterSnapshot) const;
    
private:
    // Use pImpl idiom to hide implementation details
    class Impl;
    std::unique_ptr<Impl> m_pImpl;
};

/**
 * @brief Factory for creating pre-configured differential analysis systems
 */
class DifferentialAnalysisSystemFactory {
public:
    // Earth-like terrain analysis (balanced performance and accuracy)
    static std::unique_ptr<DifferentialAnalysisSystem> CreateEarthLikeAnalyzer();
    
    // High-performance analysis (minimal overhead, basic metrics)
    static std::unique_ptr<DifferentialAnalysisSystem> CreateHighPerformanceAnalyzer();
    
    // Research-grade analysis (maximum accuracy, all metrics)
    static std::unique_ptr<DifferentialAnalysisSystem> CreateResearchGradeAnalyzer();
    
    // Custom analysis system with specific configuration
    static std::unique_ptr<DifferentialAnalysisSystem> CreateCustomAnalyzer(
        const DifferentialAnalysisConfig& config
    );
};

} // namespace PlanetGen::Generation::Analysis
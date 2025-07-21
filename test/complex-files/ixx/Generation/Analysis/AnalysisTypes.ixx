module;

#include <vector>
#include <string>
#include <chrono>
#include <unordered_map>

#include <utility>
export module AnalysisTypes;

import GLMModule;

export namespace PlanetGen::Generation::Analysis {

/**
 * @brief Terrain data snapshot for differential analysis
 * 
 * Captures the state of terrain data at a specific pipeline stage.
 * Supports multi-modal data (elevation, temperature, etc.) and metadata.
 */
class TerrainDataSnapshot {
public:
    struct SnapshotMetadata {
        std::string stageName;
        uint32_t stageId;
        std::chrono::steady_clock::time_point timestamp;
        uint32_t dataResolution;
        uint32_t seed;
        std::string processingParameters;
    };
    
    TerrainDataSnapshot(const SnapshotMetadata& metadata) : m_metadata(metadata) {}
    virtual ~TerrainDataSnapshot() = default;
    
    // Metadata access
    const SnapshotMetadata& GetMetadata() const { return m_metadata; }
    
    // Data access - supports multiple modalities
    virtual bool HasElevationData() const = 0;
    virtual bool HasTemperatureData() const = 0;
    virtual bool HasPrecipitationData() const = 0;
    virtual bool HasVegetationData() const = 0;
    
    virtual const std::vector<float>& GetElevationData() const = 0;
    virtual const std::vector<float>& GetTemperatureData() const = 0;
    virtual const std::vector<float>& GetPrecipitationData() const = 0;
    virtual const std::vector<float>& GetVegetationData() const = 0;
    
    // Coordinate information
    virtual const std::vector<std::pair<float, float>>& GetCoordinates() const = 0;
    
    // Statistical summary (cached for performance)
    virtual float GetDataMin(const std::string& modalityType) const = 0;
    virtual float GetDataMax(const std::string& modalityType) const = 0;
    virtual float GetDataMean(const std::string& modalityType) const = 0;
    virtual float GetDataStdDev(const std::string& modalityType) const = 0;
    
    // Extensibility for custom data types
    virtual bool HasCustomData(const std::string& dataType) const { return false; }
    virtual const std::vector<float>& GetCustomData(const std::string& dataType) const {
        static std::vector<float> empty;
        return empty;
    }

private:
    SnapshotMetadata m_metadata;
};

/**
 * @brief Result from a terrain metric computation
 * 
 * Contains comprehensive analysis results including scores, timing, and suggestions.
 */
struct TerrainMetricResult {
    std::string metricName;
    float primaryValue = 0.0f;      // Main metric value
    float deltaValue = 0.0f;        // Change from previous measurement
    float deltaPercentage = 0.0f;   // Percentage change
    
    // Extended fields for comprehensive analysis
    bool isSuccessful = false;
    float score = 0.0f;             // Overall quality score (0-1)
    std::string detailMessage;      // Detailed analysis message
    std::string errorMessage;       // Error message if analysis failed
    std::chrono::milliseconds analysisTimeMs{0}; // Time taken for analysis
    
    enum class Status { Normal, Warning, Critical } status = Status::Normal;
    std::string interpretation;     // Human-readable explanation
    
    // Additional metric-specific data
    std::vector<std::pair<std::string, float>> additionalValues;
    std::vector<std::string> diagnosticMessages;
    std::vector<std::pair<std::string, float>> suggestions; // Parameter adjustment suggestions
};

/**
 * @brief Results from differential analysis between pipeline stages
 * 
 * Comprehensive analysis results including individual metrics, overall health,
 * and optimization suggestions.
 */
struct PipelineAnalysisResult {
    // Stage identification
    uint32_t fromStageId = 0;
    uint32_t toStageId = 0;
    std::string stageName;
    
    // Timing
    std::chrono::steady_clock::time_point analysisTimestamp;
    std::chrono::milliseconds analysisTime{0};
    
    // Delta analysis results (legacy format)
    struct DeltaAnalysis {
        std::string metricName;
        float deltaValue;
        float deltaPercentage;
        std::string interpretation;
        enum class Severity { Normal, Warning, Critical } severity;
    };
    
    std::vector<DeltaAnalysis> deltaResults;
    
    // Individual metric results (for detailed analysis)
    std::vector<TerrainMetricResult> metricResults;
    
    // Overall health assessment
    float overallHealthScore = 0.0f;
    enum class OverallHealth { Healthy, Degraded, Critical } overallHealth = OverallHealth::Healthy;
    std::string healthSummary;
    
    // Optimization suggestions
    std::vector<std::pair<std::string, float>> parameterAdjustments;
    
    // Analysis status
    bool analysisSuccessful = false;
};

/**
 * @brief Configuration for differential analysis system
 * 
 * Controls analysis behavior, performance settings, and feature enablement.
 */
struct DifferentialAnalysisConfig {
    // Analysis behavior
    bool enableRealTimeAnalysis = true;
    bool enableHistoricalTracking = true;
    bool enableAdaptiveOptimization = true;
    bool enableParallelAnalysis = true;
    
    // Performance settings
    uint32_t maxAnalysisThreads = 4;
    std::chrono::milliseconds analysisTimeout{30000}; // 30 seconds
    std::chrono::milliseconds realTimeAnalysisInterval{100}; // 100ms
    uint32_t maxHistoricalSnapshots = 100;
    
    // Quality settings
    float warningThreshold = 0.7f;     // Score below this triggers warnings
    float criticalThreshold = 0.3f;    // Score below this triggers critical alerts
    
    // Memory and cache settings
    uint32_t memoryBudgetMB = 256;
    uint32_t workingMemoryPoolSizeMB = 64;
    bool enableCaching = true;
    uint32_t cacheSize = 100;
    uint32_t parallelBatchSize = 16;
    
    // Memory management
    bool enableMemoryOptimization = true;
    
    // Metric configuration
    std::vector<std::string> enabledMetrics = {
        "FrequencyDomain", "StatisticalContinuity", "GeologicalRealism"
    };
    
    // Stage-specific settings
    std::unordered_map<std::string, bool> stageAnalysisEnabled;
};

/**
 * @brief System-wide analysis statistics
 * 
 * Tracks performance and health metrics for the entire analysis system.
 */
struct AnalysisSystemStatistics {
    uint32_t totalAnalysesPerformed = 0;
    uint32_t criticalIssuesDetected = 0;
    uint32_t warningsIssued = 0;
    uint32_t optimizationsApplied = 0;
    
    float systemEfficiencyScore = 1.0f;    // Overall system efficiency (0-1)
    std::chrono::milliseconds averageAnalysisTime{0};
    
    // Memory usage
    uint64_t currentMemoryUsageBytes = 0;
    uint64_t peakMemoryUsageBytes = 0;
    
    // Throughput metrics
    float analysesPerSecond = 0.0f;
    uint32_t queuedAnalyses = 0;
    uint32_t activeAnalyses = 0;
    
    // Per-metric statistics
    std::unordered_map<std::string, uint32_t> metricExecutionCounts;
    std::unordered_map<std::string, std::chrono::milliseconds> metricAverageTimes;
    std::unordered_map<std::string, float> metricSuccessRates;
};

/**
 * @brief Pipeline stage health assessment
 * 
 * Tracks health and performance of individual pipeline stages.
 */
struct StageHealthReport {
    std::string stageName;
    std::chrono::steady_clock::time_point lastAnalysis;
    
    // Health metrics
    PipelineAnalysisResult::OverallHealth currentHealth = PipelineAnalysisResult::OverallHealth::Healthy;
    float healthScore = 1.0f;           // 0-1 health score
    uint32_t consecutiveIssues = 0;     // Number of consecutive problematic analyses
    
    // Performance metrics
    std::chrono::milliseconds averageProcessingTime{0};
    float processingEfficiency = 1.0f;   // Ratio of expected vs actual processing time
    
    // Quality metrics
    float dataQualityScore = 1.0f;       // Quality of output data (0-1)
    float dataConsistencyScore = 1.0f;   // Consistency between runs (0-1)
    
    // Issue tracking
    std::vector<std::string> recentIssues;
    std::vector<std::pair<std::string, float>> appliedOptimizations;
};

/**
 * @brief Alert levels for analysis system notifications
 */
enum class AnalysisAlertLevel {
    Info,       // Informational notifications
    Warning,    // Issues that need attention but aren't critical
    Critical,   // Critical issues requiring immediate action
    Emergency   // System-wide failures or severe degradation
};

/**
 * @brief Analysis alert information
 */
struct AnalysisAlert {
    AnalysisAlertLevel level;
    std::string title;
    std::string description;
    std::string stageName;
    std::string metricName;
    std::chrono::steady_clock::time_point timestamp;
    
    // Context information
    float severity = 0.0f;              // 0-1 severity within the alert level
    std::vector<std::string> affectedComponents;
    std::vector<std::pair<std::string, float>> suggestedActions;
};

} // namespace PlanetGen::Generation::Analysis
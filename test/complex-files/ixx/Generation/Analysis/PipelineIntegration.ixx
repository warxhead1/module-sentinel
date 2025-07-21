module;

#include <memory>
#include <vector>
#include <string>
#include <unordered_map>
#include <functional>
#include <mutex>
#include <chrono>

#include <utility>
export module PipelineIntegration;

import DifferentialAnalysisSystem;
import StageTransitionAnalyzer;
import IPipelineStage;
import TerrainDataSnapshot;
import GenerationTypes;

// Import the actual modules containing our pipeline components
import PlanetaryGenerator;
import PlanetaryPhysicsIntegrator;
import TerrainOrchestrator;
import AnalysisTypes;

export namespace PlanetGen::Generation::Analysis {

/**
 * @brief Integration layer for connecting differential analysis to existing terrain pipeline
 * 
 * This class seamlessly integrates with SimplifiedEnhancedPlanetaryTerrainApp and provides
 * monitoring capabilities for the existing pipeline components without requiring 
 * significant changes to the current architecture.
 */
class TerrainPipelineMonitor {
public:
    TerrainPipelineMonitor();
    ~TerrainPipelineMonitor();
    
    // Initialization and configuration
    bool Initialize(const DifferentialAnalysisConfig& config = {});
    void Shutdown();
    
    // Pipeline component registration (matching SimplifiedEnhancedPlanetaryTerrainApp structure)
    void RegisterPlanetaryGenerator(std::shared_ptr<PlanetGen::Generation::PlanetaryGenerator> generator);
    void RegisterPhysicsIntegrator(std::shared_ptr<PlanetGen::Generation::Physics::PlanetaryPhysicsIntegrator> integrator);
    void RegisterTerrainOrchestrator(std::shared_ptr<PlanetGen::Rendering::TerrainOrchestrator> orchestrator);
    
    // Snapshot capture integration points (called from existing generation flow)
    void CapturePreGenerationSnapshot(const PlanetaryData& initialData, const std::string& preset);
    void CapturePostGenerationSnapshot(const PlanetaryData& generatedData);
    void CapturePrePhysicsSnapshot(const PlanetaryData& prePhysicsData);
    void CapturePostPhysicsSnapshot(const PlanetaryData& postPhysicsData);
    void CapturePreCoherenceSnapshot(const PlanetaryData& preCoherenceData);
    void CapturePostCoherenceSnapshot(const PlanetaryData& postCoherenceData);
    void CaptureFinalSnapshot(const PlanetaryData& finalData);
    
    // Analysis execution
    std::vector<PipelineAnalysisResult> AnalyzeFullPipeline();
    PipelineAnalysisResult AnalyzeLastTransition();
    
    // Real-time monitoring
    void EnableRealTimeMonitoring(bool enable = true);
    bool IsRealTimeMonitoringEnabled() const;
    
    // Alert system integration
    using AlertCallback = std::function<void(const PipelineAnalysisResult&, const std::string&)>;
    void SetAlertCallback(AlertCallback callback);
    
    // Parameter optimization integration
    std::vector<std::pair<std::string, float>> GetParameterSuggestions() const;
    void ApplyParameterOptimizations(); // Applies to registered components
    
    // Reporting for SimplifiedEnhancedPlanetaryTerrainApp
    std::string GetCurrentPipelineHealth() const;
    std::string GetDetailedAnalysisReport() const;
    void PrintAnalysisSummary() const;
    
    // Configuration
    void SetQualityLevel(const std::string& quality); // "fast", "medium", "detailed"
    void EnableMetric(const std::string& metricName, bool enabled);
    
    // Statistics for integration with existing performance monitoring
    struct PipelineStatistics {
        uint32_t totalGenerationsMonitored;
        uint32_t criticalIssuesDetected;
        uint32_t optimizationsApplied;
        float averageHealthScore; // 0.0-1.0
        std::chrono::milliseconds averageAnalysisTime;
    };
    
    PipelineStatistics GetStatistics() const;
    
private:
    // Core analysis system
    std::unique_ptr<DifferentialAnalysisSystem> m_analysisSystem;
    std::unique_ptr<StageTransitionAnalyzer> m_transitionAnalyzer;
    
    // Pipeline stage adapters
    std::shared_ptr<PipelineStageAdapter<PlanetGen::Generation::PlanetaryGenerator>> m_generatorAdapter;
    std::shared_ptr<PipelineStageAdapter<PlanetGen::Generation::Physics::PlanetaryPhysicsIntegrator>> m_physicsAdapter;
    std::shared_ptr<PipelineStageAdapter<PlanetGen::Rendering::TerrainOrchestrator>> m_orchestratorAdapter;
    
    // Snapshot storage
    std::vector<std::unique_ptr<ConcreteTerrainDataSnapshot>> m_snapshots;
    std::unordered_map<std::string, size_t> m_snapshotIndices; // stage name -> snapshot index
    
    // Configuration
    DifferentialAnalysisConfig m_config;
    std::string m_qualityLevel = "medium";
    bool m_realTimeMonitoring = false;
    
    // Alert system
    AlertCallback m_alertCallback;
    
    // Statistics
    PipelineStatistics m_statistics;
    
    // Internal methods
    std::unique_ptr<ConcreteTerrainDataSnapshot> CreateSnapshotFromPlanetaryData(
        const PlanetaryData& data,
        const std::string& stageName,
        uint32_t stageId
    );
    
    std::unique_ptr<ConcreteTerrainDataSnapshot> CopySnapshot(const ConcreteTerrainDataSnapshot& source);
    
    void EnsureDeviceSynchronization();
    void SafeCopyModalityData(const PlanetaryModality& modality, const std::string& modalityType, ConcreteTerrainDataSnapshot* snapshot);
    void SafeGenerateCoordinates(uint32_t resolution, ConcreteTerrainDataSnapshot* snapshot);
    void UpdateComponentSnapshots();
    void ProcessPipelineTransition(const std::string& fromStage, const std::string& toStage);
    void TriggerAlertsIfNeeded(const PipelineAnalysisResult& result);
    void UpdateStatistics(const PipelineAnalysisResult& result);
    std::string DetermineQualityConfiguration() const;
    
    // Thread safety
    mutable std::mutex m_snapshotMutex;
    mutable std::mutex m_statisticsMutex;
};

/**
 * @brief Helper class for easy integration into SimplifiedEnhancedPlanetaryTerrainApp
 * 
 * Provides a simple interface that can be easily added to the existing application
 * without major architectural changes.
 */
class TerrainAnalysisHelper {
public:
    // Simple integration methods for existing app
    static std::unique_ptr<TerrainPipelineMonitor> CreateForApp(
        const std::string& qualityLevel = "medium"
    );
    
    // Integration hooks for existing generation flow
    static void MonitorGenerationStep(
        TerrainPipelineMonitor* monitor,
        const std::string& stepName,
        const PlanetaryData& data
    );
    
    // Analysis reporting for existing logging
    static void PrintHealthStatus(const TerrainPipelineMonitor* monitor);
    static void PrintDetailedReport(const TerrainPipelineMonitor* monitor);
    
    // Parameter optimization helpers
    static bool ApplyOptimizations(
        TerrainPipelineMonitor* monitor,
        PlanetGen::Generation::PlanetaryGenerator* generator,
        PlanetGen::Generation::Physics::PlanetaryPhysicsIntegrator* physics
    );
};

/**
 * @brief Integration macros for easy adoption in existing code
 */
#define TERRAIN_MONITOR_INIT(monitor, quality) \
    auto monitor = TerrainAnalysisHelper::CreateForApp(quality)

#define TERRAIN_MONITOR_CAPTURE(monitor, stage, data) \
    if (monitor) TerrainAnalysisHelper::MonitorGenerationStep(monitor.get(), stage, data)

#define TERRAIN_MONITOR_REPORT(monitor) \
    if (monitor) TerrainAnalysisHelper::PrintHealthStatus(monitor.get())

#define TERRAIN_MONITOR_OPTIMIZE(monitor, generator, physics) \
    if (monitor) TerrainAnalysisHelper::ApplyOptimizations(monitor.get(), generator, physics)

/**
 * @brief Factory for creating configured monitors for different use cases
 */
class TerrainPipelineMonitorFactory {
public:
    // For SimplifiedEnhancedPlanetaryTerrainApp integration
    static std::unique_ptr<TerrainPipelineMonitor> CreateForTerrainApp();
    
    // For real-time applications (minimal overhead)
    static std::unique_ptr<TerrainPipelineMonitor> CreateRealTimeMonitor();
    
    // For research and detailed analysis
    static std::unique_ptr<TerrainPipelineMonitor> CreateResearchMonitor();
    
    // For integration testing
    static std::unique_ptr<TerrainPipelineMonitor> CreateTestingMonitor();
    
    // Custom configuration
    static std::unique_ptr<TerrainPipelineMonitor> CreateCustomMonitor(
        const DifferentialAnalysisConfig& config
    );
};

} // namespace PlanetGen::Generation::Analysis
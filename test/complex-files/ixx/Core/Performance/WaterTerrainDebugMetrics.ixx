module;

#include <memory>
#include <string>
#include <vector>
#include <chrono>
#include <functional>

export module WaterTerrainDebugMetrics;

import PerformanceMonitor;
import GLMModule;

export namespace PlanetGen::Core::Performance {

/**
 * @brief Specialized performance metrics for water vs terrain debug visualization
 * 
 * This class extends the base PerformanceMonitor with specific metrics for
 * water and terrain debugging, including coverage analysis, mesh validation,
 * and visualization performance.
 */
class WaterTerrainDebugMetrics {
public:
    /**
     * @brief Water/terrain analysis results
     */
    struct WaterTerrainAnalysis {
        // Basic statistics
        uint32_t totalVertices = 0;
        uint32_t waterVertices = 0;
        uint32_t terrainVertices = 0;
        float waterCoverage = 0.0f;        // Percentage (0-100)
        float terrainCoverage = 0.0f;      // Percentage (0-100)
        
        // Water depth analysis
        float avgWaterDepth = 0.0f;
        float maxWaterDepth = 0.0f;
        float minWaterDepth = 0.0f;
        
        // Boundary analysis
        uint32_t waterBoundaryVertices = 0;
        float boundaryComplexity = 0.0f;   // 0-1 scale
        
        // Mesh quality
        bool waterMeshValid = false;
        bool terrainMeshValid = false;
        float meshQualityScore = 0.0f;     // 0-1 scale
        
        // Performance metrics
        float lastAnalysisTime = 0.0f;     // Time in milliseconds
        float totalAnalysisTime = 0.0f;
        uint32_t analysisCount = 0;
        
        // Spatial bounds
        glm::vec2 waterBounds = glm::vec2(0.0f);     // Min/max height for water
        glm::vec2 terrainBounds = glm::vec2(0.0f);   // Min/max height for terrain
        
        // Timestamp
        std::chrono::steady_clock::time_point timestamp;
    };
    
    /**
     * @brief Visualization performance metrics
     */
    struct VisualizationMetrics {
        // Rendering performance
        float debugRenderTime = 0.0f;     // Time in milliseconds
        float normalRenderTime = 0.0f;
        float visualizationOverhead = 0.0f; // Percentage overhead
        
        // Shader statistics
        uint32_t debugShaderSwitches = 0;
        uint32_t wireframeDrawCalls = 0;
        uint32_t highlightingDrawCalls = 0;
        
        // Memory usage
        uint64_t debugBufferMemory = 0;    // Bytes
        uint64_t debugTextureMemory = 0;
        
        // Quality metrics
        float visualizationAccuracy = 0.0f; // 0-1 scale
        uint32_t visualizationErrors = 0;
        
        // Frame statistics
        uint32_t debugFramesRendered = 0;
        float avgDebugFrameTime = 0.0f;
        
        std::chrono::steady_clock::time_point timestamp;
    };
    
    /**
     * @brief Combined debug session metrics
     */
    struct DebugSessionMetrics {
        WaterTerrainAnalysis analysis;
        VisualizationMetrics visualization;
        
        // Session info
        std::string sessionName;
        std::chrono::steady_clock::time_point sessionStart;
        std::chrono::steady_clock::time_point sessionEnd;
        float sessionDuration = 0.0f;      // Seconds
        
        // Configuration
        std::string debugMode;
        std::string visualizationSettings;
        
        // Summary
        bool sessionValid = false;
        float overallQuality = 0.0f;       // 0-1 scale
        std::string summary;
    };
    
    /**
     * @brief Callback types for debug metrics
     */
    using AnalysisCallback = std::function<void(const WaterTerrainAnalysis&)>;
    using VisualizationCallback = std::function<void(const VisualizationMetrics&)>;
    using SessionCallback = std::function<void(const DebugSessionMetrics&)>;
    
    /**
     * @brief Constructor
     */
    explicit WaterTerrainDebugMetrics(PerformanceMonitor* baseMonitor = nullptr);
    virtual ~WaterTerrainDebugMetrics() = default;
    
    // Core lifecycle
    bool Initialize();
    void Shutdown();
    void Update(float deltaTime);
    
    // Analysis recording
    void RecordWaterTerrainAnalysis(const WaterTerrainAnalysis& analysis);
    void RecordVisualizationMetrics(const VisualizationMetrics& metrics);
    void RecordDebugRenderTime(float timeMs);
    void RecordWaterMeshValidation(bool isValid, float qualityScore);
    void RecordBoundaryComplexity(float complexity);
    
    // Session management
    void BeginDebugSession(const std::string& sessionName, const std::string& debugMode);
    void EndDebugSession();
    DebugSessionMetrics GetCurrentSession() const;
    
    // Metrics access
    WaterTerrainAnalysis GetLatestAnalysis() const { return m_latestAnalysis; }
    VisualizationMetrics GetLatestVisualization() const { return m_latestVisualization; }
    std::vector<WaterTerrainAnalysis> GetAnalysisHistory() const { return m_analysisHistory; }
    
    // Callbacks
    void SetAnalysisCallback(AnalysisCallback callback) { m_analysisCallback = callback; }
    void SetVisualizationCallback(VisualizationCallback callback) { m_visualizationCallback = callback; }
    void SetSessionCallback(SessionCallback callback) { m_sessionCallback = callback; }
    
    // Statistics
    float GetAverageWaterCoverage() const;
    float GetAverageVisualizationOverhead() const;
    uint32_t GetTotalAnalysisCount() const;
    
    // Validation
    bool ValidateWaterMesh(uint32_t waterVertices, uint32_t totalVertices) const;
    float CalculateMeshQuality(const WaterTerrainAnalysis& analysis) const;
    
    // Export
    bool ExportDebugReport(const std::string& filepath) const;
    bool ExportSessionCSV(const std::string& filepath) const;
    std::string GetDebugSummary() const;
    
    // Performance integration
    void IntegrateWithPerformanceMonitor(PerformanceMonitor* monitor);
    
private:
    // Base performance monitor (optional)
    PerformanceMonitor* m_baseMonitor;
    
    // Current data
    WaterTerrainAnalysis m_latestAnalysis;
    VisualizationMetrics m_latestVisualization;
    DebugSessionMetrics m_currentSession;
    
    // History
    std::vector<WaterTerrainAnalysis> m_analysisHistory;
    std::vector<VisualizationMetrics> m_visualizationHistory;
    std::vector<DebugSessionMetrics> m_sessionHistory;
    
    // Callbacks
    AnalysisCallback m_analysisCallback;
    VisualizationCallback m_visualizationCallback;
    SessionCallback m_sessionCallback;
    
    // Configuration
    uint32_t m_maxHistorySize = 1000;
    bool m_isSessionActive = false;
    
    // Statistics
    float m_totalAnalysisTime = 0.0f;
    uint32_t m_totalAnalysisCount = 0;
    
    // Helper methods
    void UpdateAnalysisStatistics(const WaterTerrainAnalysis& analysis);
    void UpdateVisualizationStatistics(const VisualizationMetrics& metrics);
    void TrimHistory();
    float CalculateSessionQuality() const;
    std::string GenerateSessionSummary() const;
};

/**
 * @brief Factory for creating debug metrics instances
 */
class WaterTerrainDebugMetricsFactory {
public:
    static std::unique_ptr<WaterTerrainDebugMetrics> CreateStandalone();
    static std::unique_ptr<WaterTerrainDebugMetrics> CreateWithMonitor(PerformanceMonitor* monitor);
    static std::unique_ptr<WaterTerrainDebugMetrics> CreateMinimal();
};

} // namespace PlanetGen::Core::Performance
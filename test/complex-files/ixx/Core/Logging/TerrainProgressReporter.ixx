module;

#include <string>
#include <sstream>
#include <iomanip>
#include <chrono>
#include <vector>
#include <unordered_map>
#include <Core/Logging/LoggerMacros.h>

export module Core.Logging.TerrainProgressReporter;

import Core.Logging.Logger;

export namespace PlanetGen::Core::Logging {

// Enum for different reporting verbosity levels
enum class ReportingLevel {
    SILENT = 0,     // No output
    SUMMARY = 1,    // Only final summary
    PROGRESS = 2,   // Progress updates
    DETAILED = 3,   // Detailed metrics
    DEBUG = 4       // All debug information
};

// Struct to hold stage timing information
struct StageTimingInfo {
    std::string name;
    int durationMs;
    std::string details;
};

// Struct to hold component metrics
struct ComponentMetrics {
    std::string name;
    std::unordered_map<std::string, float> metrics;
    int executionTimeMs;
};

// Central reporter for all terrain generation progress
class TerrainProgressReporter {
private:
    ReportingLevel m_level = ReportingLevel::PROGRESS;
    std::vector<StageTimingInfo> m_stageTimings;
    std::vector<ComponentMetrics> m_componentMetrics;
    std::chrono::high_resolution_clock::time_point m_pipelineStart;
    bool m_inPipeline = false;
    
    // Singleton instance
    static TerrainProgressReporter* s_instance;
    
    TerrainProgressReporter() = default;
    
public:
    static TerrainProgressReporter& Instance() {
        if (!s_instance) {
            s_instance = new TerrainProgressReporter();
        }
        return *s_instance;
    }
    
    void SetReportingLevel(ReportingLevel level) {
        m_level = level;
    }
    
    ReportingLevel GetReportingLevel() const {
        return m_level;
    }
    
    // Pipeline control
    void StartPipeline() {
        m_pipelineStart = std::chrono::high_resolution_clock::now();
        m_inPipeline = true;
        m_stageTimings.clear();
        m_componentMetrics.clear();
        
        if (m_level >= ReportingLevel::PROGRESS) {
            // Use rate-limited logging for pipeline starts (max 1 per second to reduce spam)
            LOG_RATE_LIMITED(::Core::Logging::LogLevel::INFO, "TerrainGeneration", 1, "Pipeline started...");
        }
    }
    
    void EndPipeline() {
        if (!m_inPipeline) return;
        
        auto pipelineEnd = std::chrono::high_resolution_clock::now();
        int totalTime = std::chrono::duration_cast<std::chrono::milliseconds>(pipelineEnd - m_pipelineStart).count();
        
        m_inPipeline = false;
        
        // Generate consolidated report based on verbosity level
        if (m_level >= ReportingLevel::SUMMARY) {
            PrintPipelineSummary(totalTime);
        }
    }
    
    // Stage reporting
    void ReportStage(const std::string& stageName, int durationMs, const std::string& details = "") {
        if (!m_inPipeline) return;
        
        m_stageTimings.push_back({stageName, durationMs, details});
        
        if (m_level >= ReportingLevel::PROGRESS) {
            if (!details.empty() && m_level >= ReportingLevel::DETAILED) {
                LOG_DEBUG("TerrainStage", "[Stage] {}: {}ms - {}", stageName, durationMs, details);
            } else {
                LOG_DEBUG("TerrainStage", "[Stage] {}: {}ms", stageName, durationMs);
            }
        }
    }
    
    // Component metrics reporting
    void ReportComponentMetrics(const std::string& componentName, 
                                const std::unordered_map<std::string, float>& metrics,
                                int executionTimeMs) {
        if (!m_inPipeline) return;
        
        m_componentMetrics.push_back({componentName, metrics, executionTimeMs});
        
        if (m_level >= ReportingLevel::DETAILED) {
            // Build metrics string
            std::string metricsStr;
            bool first = true;
            for (const auto& [key, value] : metrics) {
                if (first) {
                    metricsStr += " | ";
                    first = false;
                } else {
                    metricsStr += ", ";
                }
                metricsStr += key + ": " + std::to_string(value);
            }
            
            // Use rate-limited logging for component metrics (max 5 per second)
            LOG_RATE_LIMITED(::Core::Logging::LogLevel::DEBUG, componentName, 5, 
                           "[{}] {}ms{}", componentName, executionTimeMs, metricsStr);
        }
    }
    
    // Quick reporting methods for common patterns
    void ReportCoherence(int width, int height, int mountains, int oceans, int timeMs) {
        std::unordered_map<std::string, float> metrics;
        metrics["Mountains"] = static_cast<float>(mountains);
        metrics["Oceans"] = static_cast<float>(oceans);
        metrics["Resolution"] = static_cast<float>(width);
        
        ReportComponentMetrics("Coherence", metrics, timeMs);
    }
    
    void ReportFitness(float totalScore, float waterScore, float mountainScore, 
                      float biomeScore, float continentalScore) {
        if (m_level >= ReportingLevel::PROGRESS) {
            if (m_level >= ReportingLevel::DETAILED) {
                LOG_DEBUG("Fitness", "[Fitness] Total: {:.1f}% (Water: {:.1f}%, Mountain: {:.1f}%, Biome: {:.1f}%, Continental: {:.1f}%)",
                         totalScore * 100.0f, waterScore * 100.0f, mountainScore * 100.0f, 
                         biomeScore * 100.0f, continentalScore * 100.0f);
            } else {
                LOG_DEBUG("Fitness", "[Fitness] Total: {:.1f}%", totalScore * 100.0f);
            }
        }
    }
    
    // Direct output control (for components that need custom formatting)
    bool ShouldReport(ReportingLevel requiredLevel) const {
        return m_level >= requiredLevel;
    }
    
private:
    void PrintPipelineSummary(int totalTimeMs) {
        LOG_INFO("TerrainGeneration", "");
        LOG_INFO("TerrainGeneration", "================== Terrain Generation Summary ==================");
        
        // Stage summary
        if (!m_stageTimings.empty()) {
            LOG_INFO("TerrainGeneration", "Pipeline Stages:");
            int stageTotal = 0;
            for (const auto& stage : m_stageTimings) {
                if (!stage.details.empty() && m_level >= ReportingLevel::DETAILED) {
                    LOG_INFO("TerrainGeneration", "  {:30} {:6} ms ({})", stage.name, stage.durationMs, stage.details);
                } else {
                    LOG_INFO("TerrainGeneration", "  {:30} {:6} ms", stage.name, stage.durationMs);
                }
                stageTotal += stage.durationMs;
            }
            
            if (m_level >= ReportingLevel::DETAILED) {
                LOG_INFO("TerrainGeneration", "  {:30} {:6} ms", "Stage Total:", stageTotal);
            }
        }
        
        // Component metrics summary (only in detailed mode)
        if (!m_componentMetrics.empty() && m_level >= ReportingLevel::DETAILED) {
            LOG_DEBUG("TerrainGeneration", "");
            LOG_DEBUG("TerrainGeneration", "Component Performance:");
            for (const auto& comp : m_componentMetrics) {
                LOG_DEBUG("TerrainGeneration", "  {}: {} ms", comp.name, comp.executionTimeMs);
            }
        }
        
        LOG_INFO("TerrainGeneration", "");
        LOG_INFO("TerrainGeneration", "Total Pipeline Time: {} ms", totalTimeMs);
        LOG_INFO("TerrainGeneration", "================================================================");
    }
};

// Initialize static member
TerrainProgressReporter* TerrainProgressReporter::s_instance = nullptr;

} // namespace PlanetGen::Core::Logging
module;

#include <vector>
#include <string>
#include <memory>
#include <chrono>

#include <utility>
export module IPipelineStage;

import GLMModule;
import GenerationTypes;
import AnalysisTypes;

export namespace PlanetGen::Generation::Analysis {

// Forward declarations
class StageAnalysisResult;

/**
 * @brief Interface for terrain generation pipeline stages that can be monitored
 * 
 * This interface allows any terrain processing component to participate in
 * differential analysis by providing snapshots of its input/output data.
 * 
 * NOT related to VulkanPipelineManager - this is for terrain generation pipeline monitoring.
 */
class IPipelineStage {
public:
    virtual ~IPipelineStage() = default;
    
    // Stage identification
    virtual std::string GetStageName() const = 0;
    virtual std::string GetStageVersion() const = 0;
    virtual uint32_t GetStageId() const = 0;
    
    // Data capture for differential analysis
    virtual std::unique_ptr<TerrainDataSnapshot> CaptureInputSnapshot() const = 0;
    virtual std::unique_ptr<TerrainDataSnapshot> CaptureOutputSnapshot() const = 0;
    
    // Stage processing information
    virtual std::chrono::milliseconds GetLastProcessingTime() const = 0;
    virtual bool IsProcessingStable() const = 0;
    virtual float GetProcessingConfidence() const = 0; // 0.0-1.0
    
    // Configuration state for analysis
    virtual std::vector<std::pair<std::string, float>> GetCurrentParameters() const = 0;
    virtual bool CanAutoTune() const = 0;
    virtual void ApplyParameterAdjustments(const std::vector<std::pair<std::string, float>>& adjustments) = 0;
    
    // Optional: Stage-specific metrics
    virtual std::unique_ptr<StageAnalysisResult> PerformSelfAnalysis() const { return nullptr; }
    
    // Pipeline integration
    virtual void SetUpstreamStage(std::weak_ptr<IPipelineStage> upstream) { m_upstreamStage = upstream; }
    virtual void SetDownstreamStage(std::weak_ptr<IPipelineStage> downstream) { m_downstreamStage = downstream; }
    virtual std::weak_ptr<IPipelineStage> GetUpstreamStage() const { return m_upstreamStage; }
    virtual std::weak_ptr<IPipelineStage> GetDownstreamStage() const { return m_downstreamStage; }

protected:
    std::weak_ptr<IPipelineStage> m_upstreamStage;
    std::weak_ptr<IPipelineStage> m_downstreamStage;
};

/**
 * @brief Stage-specific analysis results
 * 
 * Allows pipeline stages to provide their own analysis insights
 * beyond what the differential analyzer can detect.
 */
class StageAnalysisResult {
public:
    virtual ~StageAnalysisResult() = default;
    
    virtual std::string GetStageName() const = 0;
    virtual std::vector<std::string> GetAnalysisMessages() const = 0;
    virtual std::vector<std::string> GetWarnings() const = 0;
    virtual std::vector<std::string> GetErrors() const = 0;
    
    // Numeric metrics
    virtual std::vector<std::pair<std::string, float>> GetMetrics() const = 0;
    
    // Suggested optimizations
    virtual std::vector<std::pair<std::string, float>> GetParameterSuggestions() const = 0;
};

} // namespace PlanetGen::Generation::Analysis
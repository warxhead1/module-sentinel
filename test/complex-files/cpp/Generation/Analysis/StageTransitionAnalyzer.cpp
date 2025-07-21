module;

#include <memory>
#include <vector>
#include <string>
#include <algorithm>
#include <numeric>
#include <execution>
#include <chrono>
#include <future>
#include <cmath>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

module StageTransitionAnalyzer;

import Core.Threading.JobSystem;
import GLMModule;
import StatisticalContinuityMetrics;
import AnalysisTypes;

namespace PlanetGen::Generation::Analysis {

using namespace PlanetGen::Core::Threading;

StageTransitionAnalyzer::StageTransitionAnalyzer() {
    m_statistics = {};
}

StageTransitionAnalyzer::~StageTransitionAnalyzer() {
    Shutdown();
}

bool StageTransitionAnalyzer::Initialize() {
    // Pre-allocate working memory for analysis
    m_workingMemory.reserve(1024 * 1024); // 1MB working space
    return true;
}

void StageTransitionAnalyzer::Shutdown() {
    // Wait for any pending analysis jobs
    JobSystem::Instance().WaitForAll();
    
    std::lock_guard<std::mutex> lock(m_statisticsMutex);
    m_metrics.clear();
    m_metricEnabled.clear();
    m_workingMemory.clear();
}

bool StageTransitionAnalyzer::RegisterMetric(std::unique_ptr<ITerrainMetric> metric) {
    if (!metric) return false;
    
    std::string metricName = metric->GetMetricName();
    
    std::lock_guard<std::mutex> lock(m_statisticsMutex);
    m_metrics[metricName] = std::move(metric);
    m_metricEnabled[metricName] = true;
    
    return true;
}

void StageTransitionAnalyzer::EnableMetric(const std::string& metricName, bool enabled) {
    std::lock_guard<std::mutex> lock(m_statisticsMutex);
    m_metricEnabled[metricName] = enabled;
}

std::vector<std::string> StageTransitionAnalyzer::GetEnabledMetrics() const {
    std::lock_guard<std::mutex> lock(m_statisticsMutex);
    
    std::vector<std::string> enabledMetrics;
    for (const auto& [name, enabled] : m_metricEnabled) {
        if (enabled && m_metrics.find(name) != m_metrics.end()) {
            enabledMetrics.push_back(name);
        }
    }
    
    return enabledMetrics;
}

PipelineAnalysisResult StageTransitionAnalyzer::AnalyzeTransition(
    const TerrainDataSnapshot& beforeSnapshot,
    const TerrainDataSnapshot& afterSnapshot
) const {
    auto startTime = std::chrono::high_resolution_clock::now();
    
    PipelineAnalysisResult result;
    result.stageName = beforeSnapshot.GetMetadata().stageName + " -> " + afterSnapshot.GetMetadata().stageName;
    result.analysisSuccessful = false;
    
    try {
        // Validate snapshots before analysis
        if (!ValidateSnapshots(beforeSnapshot, afterSnapshot)) {
            result.healthSummary = "Invalid snapshot data";
            result.overallHealth = PipelineAnalysisResult::OverallHealth::Critical;
            return result;
        }
        
        // Get enabled metrics
        auto enabledMetrics = GetEnabledMetrics();
        if (enabledMetrics.empty()) {
            result.healthSummary = "No metrics enabled";
            result.overallHealth = PipelineAnalysisResult::OverallHealth::Healthy;
            result.analysisSuccessful = true;
            return result;
        }
        
        // Execute metrics analysis with JobSystem for performance
        std::vector<TerrainMetricResult> metricResults;
        if (m_enableParallelProcessing && enabledMetrics.size() > 1) {
            metricResults = RunMetricsParallel(enabledMetrics, beforeSnapshot, afterSnapshot);
        } else {
            metricResults = RunMetricsSequential(enabledMetrics, beforeSnapshot, afterSnapshot);
        }
        
        // Process results
        result.metricResults = metricResults;
        result.overallHealth = DetermineOverallHealth(metricResults);
        result.healthSummary = GenerateHealthSummary(metricResults);
        result.parameterAdjustments = GenerateParameterAdjustments(metricResults);
        result.analysisSuccessful = true;
        
        // Update statistics
        auto endTime = std::chrono::high_resolution_clock::now();
        result.analysisTime = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime);
        
        UpdateStatistics("AnalyzeTransition", result.analysisTime);
        
    } catch (const std::exception& e) {
        result.healthSummary = "Analysis failed: " + std::string(e.what());
        result.overallHealth = PipelineAnalysisResult::OverallHealth::Critical;
    }
    
    return result;
}

std::vector<TerrainMetricResult> StageTransitionAnalyzer::RunMetricsParallel(
    const std::vector<std::string>& metricNames,
    const TerrainDataSnapshot& beforeSnapshot,
    const TerrainDataSnapshot& afterSnapshot
) const {
    
    // Pre-capture metrics outside of job execution to avoid deadlocks
    std::vector<ITerrainMetric*> metricsToRun;
    {
        std::lock_guard<std::mutex> lock(m_statisticsMutex);
        metricsToRun.reserve(metricNames.size());
        for (const auto& metricName : metricNames) {
            auto it = m_metrics.find(metricName);
            if (it != m_metrics.end()) {
                metricsToRun.push_back(it->second.get());
            } else {
                metricsToRun.push_back(nullptr);
            }
        }
    }
    
    std::vector<TerrainMetricResult> results(metricNames.size());
    std::vector<Job*> jobs;
    jobs.reserve(metricNames.size());
    
    // Create jobs for each metric - NO MUTEX USAGE INSIDE JOBS
    for (size_t i = 0; i < metricNames.size(); ++i) {
        const auto& metricName = metricNames[i];
        ITerrainMetric* metric = metricsToRun[i];
        
        auto job = JobSystem::Instance().CreateJob<TerrainMetricResult>(
            [metric, metricName, &beforeSnapshot, &afterSnapshot]() -> TerrainMetricResult {
                if (metric) {
                    auto startTime = std::chrono::high_resolution_clock::now();
                    auto result = metric->AnalyzeTransition(beforeSnapshot, afterSnapshot);
                    auto endTime = std::chrono::high_resolution_clock::now();
                    
                    // Store timing in the result instead of updating statistics here
                    result.analysisTimeMs = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime);
                    
                    return result;
                }
                
                TerrainMetricResult failedResult;
                failedResult.metricName = metricName;
                failedResult.isSuccessful = false;
                failedResult.errorMessage = "Metric not found";
                return failedResult;
            },
            ("Metric_" + metricName).c_str()
        );
        
        jobs.push_back(job);
    }
    
    // Schedule all jobs
    auto handles = JobSystem::Instance().ScheduleBatch(jobs);
    
    // Collect results and update statistics after job completion
    for (size_t i = 0; i < jobs.size(); ++i) {
        auto* typedJob = static_cast<TypedJob<TerrainMetricResult>*>(jobs[i]);
        results[i] = typedJob->GetResult();
        
        // Update statistics safely after job completion
        if (results[i].isSuccessful) {
            const_cast<StageTransitionAnalyzer*>(this)->UpdateStatistics(metricNames[i], results[i].analysisTimeMs);
        }
        
        delete jobs[i]; // Clean up job
    }
    
    return results;
}

std::vector<TerrainMetricResult> StageTransitionAnalyzer::RunMetricsSequential(
    const std::vector<std::string>& metricNames,
    const TerrainDataSnapshot& beforeSnapshot,
    const TerrainDataSnapshot& afterSnapshot
) const {
    
    // Pre-capture metrics outside of any mutex to avoid deadlocks
    std::vector<ITerrainMetric*> metricsToRun;
    {
        std::lock_guard<std::mutex> lock(m_statisticsMutex);
        metricsToRun.reserve(metricNames.size());
        for (const auto& metricName : metricNames) {
            auto it = m_metrics.find(metricName);
            if (it != m_metrics.end()) {
                metricsToRun.push_back(it->second.get());
            } else {
                metricsToRun.push_back(nullptr);
            }
        }
    } // Release mutex before running metrics
    
    std::vector<TerrainMetricResult> results;
    results.reserve(metricNames.size());
    
    // Run metrics without holding any mutex
    for (size_t i = 0; i < metricNames.size(); ++i) {
        const auto& metricName = metricNames[i];
        ITerrainMetric* metric = metricsToRun[i];
        
        if (metric) {
            auto startTime = std::chrono::high_resolution_clock::now();
            auto result = metric->AnalyzeTransition(beforeSnapshot, afterSnapshot);
            auto endTime = std::chrono::high_resolution_clock::now();
            
            auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime);
            
            // Update statistics safely after metric completion
            const_cast<StageTransitionAnalyzer*>(this)->UpdateStatistics(metricName, duration);
            
            results.push_back(result);
        }
    }
    
    return results;
}

PipelineAnalysisResult::OverallHealth StageTransitionAnalyzer::DetermineOverallHealth(
    const std::vector<TerrainMetricResult>& metricResults) const {
    
    if (metricResults.empty()) {
        return PipelineAnalysisResult::OverallHealth::Healthy;
    }
    
    int criticalCount = 0;
    int warningCount = 0;
    int successCount = 0;
    
    for (const auto& result : metricResults) {
        if (!result.isSuccessful) {
            criticalCount++;
        } else {
            // Analyze score to determine health level
            if (result.score < 0.3f) {
                criticalCount++;
            } else if (result.score < 0.7f) {
                warningCount++;
            } else {
                successCount++;
            }
        }
    }
    
    // Determine overall health based on distribution
    float totalResults = static_cast<float>(metricResults.size());
    float criticalRatio = criticalCount / totalResults;
    float warningRatio = warningCount / totalResults;
    
    if (criticalRatio > 0.3f) {
        return PipelineAnalysisResult::OverallHealth::Critical;
    } else if (criticalRatio > 0.0f || warningRatio > 0.5f) {
        return PipelineAnalysisResult::OverallHealth::Degraded;
    } else {
        return PipelineAnalysisResult::OverallHealth::Healthy;
    }
}

std::string StageTransitionAnalyzer::GenerateHealthSummary(
    const std::vector<TerrainMetricResult>& metricResults) const {
    
    if (metricResults.empty()) {
        return "No metrics analyzed";
    }
    
    int passedCount = 0;
    float averageScore = 0.0f;
    std::vector<std::string> issues;
    
    for (const auto& result : metricResults) {
        if (result.isSuccessful) {
            passedCount++;
            averageScore += result.score;
            
            if (result.score < 0.7f && !result.detailMessage.empty()) {
                issues.push_back(result.metricName + ": " + result.detailMessage);
            }
        } else {
            issues.push_back(result.metricName + ": " + result.errorMessage);
        }
    }
    
    if (passedCount > 0) {
        averageScore /= passedCount;
    }
    
    std::string summary = std::to_string(passedCount) + "/" + std::to_string(metricResults.size()) + 
                         " metrics passed (avg score: " + std::to_string(averageScore * 100.0f) + "%)";
    
    if (!issues.empty()) {
        summary += " | Issues: " + std::to_string(issues.size());
    }
    
    return summary;
}

std::vector<std::pair<std::string, float>> StageTransitionAnalyzer::GenerateParameterAdjustments(
    const std::vector<TerrainMetricResult>& metricResults) const {
    
    std::vector<std::pair<std::string, float>> adjustments;
    
    for (const auto& result : metricResults) {
        if (result.isSuccessful && !result.suggestions.empty()) {
            for (const auto& suggestion : result.suggestions) {
                adjustments.push_back(suggestion);
            }
        }
    }
    
    return adjustments;
}

bool StageTransitionAnalyzer::ValidateSnapshots(
    const TerrainDataSnapshot& beforeSnapshot,
    const TerrainDataSnapshot& afterSnapshot) const {
    
    // Check if both snapshots have elevation data (minimum requirement)
    if (!beforeSnapshot.HasElevationData() || !afterSnapshot.HasElevationData()) {
        return false;
    }
    
    // Check if data sizes match
    const auto& beforeElevation = beforeSnapshot.GetElevationData();
    const auto& afterElevation = afterSnapshot.GetElevationData();
    
    if (beforeElevation.size() != afterElevation.size()) {
        return false;
    }
    
    // Check for reasonable data ranges
    if (beforeElevation.empty() || afterElevation.empty()) {
        return false;
    }
    
    return true;
}

void StageTransitionAnalyzer::UpdateStatistics(const std::string& metricName, 
                                              std::chrono::milliseconds executionTime) const {
    std::lock_guard<std::mutex> lock(m_statisticsMutex);
    
    m_statistics.totalTransitionsAnalyzed++;
    
    // Update metric-specific statistics
    m_statistics.metricExecutionCounts[metricName]++;
    
    auto& metricTime = m_statistics.metricAverageTimes[metricName];
    uint32_t count = m_statistics.metricExecutionCounts[metricName];
    
    if (count == 1) {
        metricTime = executionTime;
    } else {
        auto totalTime = metricTime.count() * (count - 1) + executionTime.count();
        metricTime = std::chrono::milliseconds(totalTime / count);
    }
    
    // Update overall average
    auto totalTime = m_statistics.averageAnalysisTime.count() * (m_statistics.totalTransitionsAnalyzed - 1) + 
                    executionTime.count();
    m_statistics.averageAnalysisTime = std::chrono::milliseconds(totalTime / m_statistics.totalTransitionsAnalyzed);
}

StageTransitionAnalyzer::AnalyzerStatistics StageTransitionAnalyzer::GetStatistics() const {
    std::lock_guard<std::mutex> lock(m_statisticsMutex);
    return m_statistics;
}

void StageTransitionAnalyzer::ResetStatistics() {
    std::lock_guard<std::mutex> lock(m_statisticsMutex);
    m_statistics = {};
}

// Factory implementations

std::unique_ptr<StageTransitionAnalyzer> StageTransitionAnalyzerFactory::CreateStandardAnalyzer() {
    auto analyzer = std::make_unique<StageTransitionAnalyzer>();
    
    if (!analyzer->Initialize()) {
        return nullptr;
    }
    
    // Register standard metrics
    analyzer->RegisterMetric(std::make_unique<StatisticalContinuityMetrics>());
    // TODO: Register remaining metrics when implemented
    // analyzer->RegisterMetric(std::make_unique<FrequencyDomainMetrics>());
    // analyzer->RegisterMetric(std::make_unique<GeologicalRealismMetrics>());
    
    analyzer->SetParallelProcessing(true);
    
    return analyzer;
}

std::unique_ptr<StageTransitionAnalyzer> StageTransitionAnalyzerFactory::CreateRealTimeAnalyzer() {
    auto analyzer = std::make_unique<StageTransitionAnalyzer>();
    
    if (!analyzer->Initialize()) {
        return nullptr;
    }
    
    // Register fast metrics only
    analyzer->RegisterMetric(std::make_unique<StatisticalContinuityMetrics>());
    
    analyzer->SetParallelProcessing(true);
    analyzer->SetAnalysisTimeout(std::chrono::milliseconds(100)); // Fast timeout for real-time
    
    return analyzer;
}

std::unique_ptr<StageTransitionAnalyzer> StageTransitionAnalyzerFactory::CreateResearchAnalyzer() {
    auto analyzer = std::make_unique<StageTransitionAnalyzer>();
    
    if (!analyzer->Initialize()) {
        return nullptr;
    }
    
    // Register all metrics including expensive ones
    analyzer->RegisterMetric(std::make_unique<StatisticalContinuityMetrics>());
    // TODO: Register remaining expensive metrics when implemented
    // analyzer->RegisterMetric(std::make_unique<FrequencyDomainMetrics>());
    // analyzer->RegisterMetric(std::make_unique<GeologicalRealismMetrics>());
    
    analyzer->SetParallelProcessing(true);
    analyzer->SetAnalysisTimeout(std::chrono::milliseconds(5000)); // Longer timeout for detailed analysis
    
    return analyzer;
}

std::unique_ptr<StageTransitionAnalyzer> StageTransitionAnalyzerFactory::CreateCustomAnalyzer(
    const std::vector<std::string>& enabledMetrics) {
    
    auto analyzer = std::make_unique<StageTransitionAnalyzer>();
    
    if (!analyzer->Initialize()) {
        return nullptr;
    }
    
    // TODO: Register metrics based on enabledMetrics list
    
    analyzer->SetParallelProcessing(true);
    
    return analyzer;
}

} // namespace PlanetGen::Generation::Analysis
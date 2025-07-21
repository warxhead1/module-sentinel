module;

#include <algorithm>
#include <execution>
#include <numeric>
#include <vector>
#include <memory>
#include <mutex>
#include <shared_mutex>
#include <thread>
#include <chrono>
#include <deque>
#include <unordered_map>
#include <functional>
#include <string>
#include <atomic>

module DifferentialAnalysisSystem;

import AnalysisTypes;
import Core.Threading.JobSystem;

namespace PlanetGen::Generation::Analysis {

using namespace PlanetGen::Core::Threading;

// Internal structures for implementation
struct MetricEntry {
    std::unique_ptr<ITerrainMetric> metric;
    bool enabled = true;
};

class DifferentialAnalysisSystem::Impl {
public:
    // Configuration
    DifferentialAnalysisConfig configuration;
    std::atomic<bool> realTimeMonitoring{false};
    
    // Pipeline stages
    mutable std::shared_mutex stagesMutex;
    std::unordered_map<uint32_t, std::shared_ptr<IPipelineStage>> pipelineStages;
    std::vector<uint32_t> stageOrder;
    
    // Metrics
    mutable std::shared_mutex metricsMutex;
    std::unordered_map<std::string, MetricEntry> metrics;
    
    // Analysis history
    mutable std::mutex historyMutex;
    std::deque<PipelineAnalysisResult> analysisHistory;
    
    // Monitoring
    std::thread monitoringThread;
    
    // Alert callback
    std::function<void(const PipelineAnalysisResult&)> alertCallback;
};

DifferentialAnalysisSystem::DifferentialAnalysisSystem()
    : m_pImpl(std::make_unique<Impl>()) {
    
    // Set default configuration
    auto& config = m_pImpl->configuration;
    config.enableAdaptiveOptimization = true;
    config.maxAnalysisThreads = std::thread::hardware_concurrency();
    config.analysisTimeout = std::chrono::milliseconds(30000);
    config.realTimeAnalysisInterval = std::chrono::milliseconds(100);
    config.memoryBudgetMB = 256;
    config.workingMemoryPoolSizeMB = 64;
    config.enableCaching = true;
    config.cacheSize = 100;
    config.enableParallelAnalysis = true;
    config.parallelBatchSize = 16;
}

DifferentialAnalysisSystem::DifferentialAnalysisSystem(const DifferentialAnalysisConfig& config)
    : m_pImpl(std::make_unique<Impl>()) {
    m_pImpl->configuration = config;
}

DifferentialAnalysisSystem::~DifferentialAnalysisSystem() {
    StopRealTimeMonitoring();
}

bool DifferentialAnalysisSystem::RegisterPipelineStage(std::shared_ptr<IPipelineStage> stage) {
    if (!stage) return false;
    
    std::lock_guard<std::shared_mutex> lock(m_pImpl->stagesMutex);
    const uint32_t stageId = stage->GetStageId();
    
    if (m_pImpl->pipelineStages.find(stageId) != m_pImpl->pipelineStages.end()) {
        return false; // Stage already registered
    }
    
    m_pImpl->pipelineStages[stageId] = stage;
    m_pImpl->stageOrder.push_back(stageId);
    return true;
}

bool DifferentialAnalysisSystem::UnregisterPipelineStage(uint32_t stageId) {
    std::lock_guard<std::shared_mutex> lock(m_pImpl->stagesMutex);
    
    auto it = m_pImpl->pipelineStages.find(stageId);
    if (it == m_pImpl->pipelineStages.end()) {
        return false;
    }
    
    m_pImpl->pipelineStages.erase(it);
    m_pImpl->stageOrder.erase(
        std::remove(m_pImpl->stageOrder.begin(), m_pImpl->stageOrder.end(), stageId),
        m_pImpl->stageOrder.end()
    );
    
    return true;
}

void DifferentialAnalysisSystem::ClearPipelineStages() {
    std::lock_guard<std::shared_mutex> lock(m_pImpl->stagesMutex);
    m_pImpl->pipelineStages.clear();
    m_pImpl->stageOrder.clear();
}

PipelineAnalysisResult DifferentialAnalysisSystem::AnalyzePipelineTransition(
    uint32_t fromStageId, 
    uint32_t toStageId) {
    
    const auto startTime = std::chrono::steady_clock::now();
    PipelineAnalysisResult result;
    result.fromStageId = fromStageId;
    result.toStageId = toStageId;
    result.analysisTimestamp = startTime;
    
    // Get pipeline stages
    std::shared_ptr<IPipelineStage> fromStage, toStage;
    {
        std::shared_lock<std::shared_mutex> lock(m_pImpl->stagesMutex);
        
        auto fromIt = m_pImpl->pipelineStages.find(fromStageId);
        auto toIt = m_pImpl->pipelineStages.find(toStageId);
        
        if (fromIt == m_pImpl->pipelineStages.end() || toIt == m_pImpl->pipelineStages.end()) {
            result.analysisSuccessful = false;
            result.healthSummary = "Invalid stage IDs";
            return result;
        }
        
        fromStage = fromIt->second;
        toStage = toIt->second;
    }
    
    // Get snapshots from stages
    auto beforeSnapshot = fromStage->CaptureOutputSnapshot();
    auto afterSnapshot = toStage->CaptureInputSnapshot();
    
    if (!beforeSnapshot || !afterSnapshot) {
        result.analysisSuccessful = false;
        result.healthSummary = "Failed to capture snapshots";
        return result;
    }
    
    result.stageName = fromStage->GetStageName() + " -> " + toStage->GetStageName();
    
    // Run enabled metrics
    std::vector<std::string> enabledMetrics;
    {
        std::shared_lock<std::shared_mutex> lock(m_pImpl->metricsMutex);
        for (const auto& [name, entry] : m_pImpl->metrics) {
            if (entry.enabled) {
                enabledMetrics.push_back(name);
            }
        }
    }
    
    if (enabledMetrics.empty()) {
        result.analysisSuccessful = false;
        result.healthSummary = "No metrics enabled";
        return result;
    }
    
    // Execute metrics in parallel if configured
    if (m_pImpl->configuration.enableParallelAnalysis && enabledMetrics.size() > 2) {
        result.metricResults = RunMetricsParallel(enabledMetrics, *beforeSnapshot, *afterSnapshot);
    } else {
        result.metricResults = RunMetricsSequential(enabledMetrics, *beforeSnapshot, *afterSnapshot);
    }
    
    // Compute overall health score
    float totalScore = 0.0f;
    int successfulMetrics = 0;
    int criticalCount = 0;
    int warningCount = 0;
    
    for (const auto& metricResult : result.metricResults) {
        if (metricResult.isSuccessful) {
            totalScore += metricResult.score;
            successfulMetrics++;
            
            if (metricResult.status == TerrainMetricResult::Status::Critical) {
                criticalCount++;
            } else if (metricResult.status == TerrainMetricResult::Status::Warning) {
                warningCount++;
            }
        }
    }
    
    if (successfulMetrics > 0) {
        result.overallHealthScore = totalScore / successfulMetrics;
        result.analysisSuccessful = true;
        
        // Generate health summary
        if (criticalCount > 0) {
            result.healthSummary = "Critical issues detected (" + std::to_string(criticalCount) + " metrics)";
        } else if (warningCount > 0) {
            result.healthSummary = "Warnings present (" + std::to_string(warningCount) + " metrics)";
        } else {
            result.healthSummary = "Pipeline transition healthy";
        }
    } else {
        result.overallHealthScore = 0.0f;
        result.analysisSuccessful = false;
        result.healthSummary = "All metrics failed";
    }
    
    const auto endTime = std::chrono::steady_clock::now();
    result.analysisTime = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime);
    
    // Store result in history
    {
        std::lock_guard<std::mutex> lock(m_pImpl->historyMutex);
        m_pImpl->analysisHistory.push_back(result);
        
        // Limit history size
        if (m_pImpl->analysisHistory.size() > 1000) {
            m_pImpl->analysisHistory.pop_front();
        }
    }
    
    // Trigger alert if needed
    if (m_pImpl->alertCallback && (criticalCount > 0 || result.overallHealthScore < 0.5f)) {
        m_pImpl->alertCallback(result);
    }
    
    return result;
}

std::vector<PipelineAnalysisResult> DifferentialAnalysisSystem::AnalyzeFullPipeline() {
    std::vector<PipelineAnalysisResult> results;
    
    std::shared_lock<std::shared_mutex> lock(m_pImpl->stagesMutex);
    
    if (m_pImpl->stageOrder.size() < 2) {
        return results;
    }
    
    // Analyze each consecutive stage transition
    for (size_t i = 0; i < m_pImpl->stageOrder.size() - 1; ++i) {
        results.push_back(AnalyzePipelineTransition(m_pImpl->stageOrder[i], m_pImpl->stageOrder[i + 1]));
    }
    
    return results;
}

void DifferentialAnalysisSystem::StartRealTimeMonitoring() {
    if (m_pImpl->realTimeMonitoring.exchange(true)) {
        return; // Already monitoring
    }
    
    m_pImpl->monitoringThread = std::thread([this]() {
        while (m_pImpl->realTimeMonitoring) {
            auto fullResults = AnalyzeFullPipeline();
            
            // Process results and update statistics
            for (const auto& result : fullResults) {
                if (result.analysisSuccessful && result.overallHealthScore < 0.5f) {
                    // Log critical pipeline issues
                }
            }
            
            std::this_thread::sleep_for(m_pImpl->configuration.realTimeAnalysisInterval);
        }
    });
}

void DifferentialAnalysisSystem::StopRealTimeMonitoring() {
    if (!m_pImpl->realTimeMonitoring.exchange(false)) {
        return; // Not monitoring
    }
    
    if (m_pImpl->monitoringThread.joinable()) {
        m_pImpl->monitoringThread.join();
    }
}

bool DifferentialAnalysisSystem::RegisterMetric(std::unique_ptr<ITerrainMetric> metric) {
    if (!metric) return false;
    
    std::lock_guard<std::shared_mutex> lock(m_pImpl->metricsMutex);
    
    const std::string name = metric->GetMetricName();
    if (m_pImpl->metrics.find(name) != m_pImpl->metrics.end()) {
        return false; // Metric already registered
    }
    
    MetricEntry entry;
    entry.metric = std::move(metric);
    entry.enabled = true;
    m_pImpl->metrics[name] = std::move(entry);
    
    return true;
}

void DifferentialAnalysisSystem::EnableMetric(const std::string& metricName, bool enabled) {
    std::lock_guard<std::shared_mutex> lock(m_pImpl->metricsMutex);
    
    auto it = m_pImpl->metrics.find(metricName);
    if (it != m_pImpl->metrics.end()) {
        it->second.enabled = enabled;
    }
}

std::vector<std::string> DifferentialAnalysisSystem::GetAvailableMetrics() const {
    std::shared_lock<std::shared_mutex> lock(m_pImpl->metricsMutex);
    
    std::vector<std::string> names;
    names.reserve(m_pImpl->metrics.size());
    
    for (const auto& [name, entry] : m_pImpl->metrics) {
        names.push_back(name);
    }
    
    return names;
}

std::vector<std::string> DifferentialAnalysisSystem::GetEnabledMetrics() const {
    std::shared_lock<std::shared_mutex> lock(m_pImpl->metricsMutex);
    
    std::vector<std::string> names;
    
    for (const auto& [name, entry] : m_pImpl->metrics) {
        if (entry.enabled) {
            names.push_back(name);
        }
    }
    
    return names;
}

std::vector<PipelineAnalysisResult> DifferentialAnalysisSystem::GetRecentResults(
    uint32_t maxResults) const {
    
    std::lock_guard<std::mutex> lock(m_pImpl->historyMutex);
    
    std::vector<PipelineAnalysisResult> results;
    const size_t startIdx = m_pImpl->analysisHistory.size() > maxResults ? 
        m_pImpl->analysisHistory.size() - maxResults : 0;
    
    for (size_t i = startIdx; i < m_pImpl->analysisHistory.size(); ++i) {
        results.push_back(m_pImpl->analysisHistory[i]);
    }
    
    return results;
}

PipelineAnalysisResult DifferentialAnalysisSystem::GetLastResultForTransition(
    uint32_t fromStageId, 
    uint32_t toStageId) const {
    
    std::lock_guard<std::mutex> lock(m_pImpl->historyMutex);
    
    // Search backwards for the most recent matching transition
    for (auto it = m_pImpl->analysisHistory.rbegin(); it != m_pImpl->analysisHistory.rend(); ++it) {
        if (it->fromStageId == fromStageId && it->toStageId == toStageId) {
            return *it;
        }
    }
    
    PipelineAnalysisResult emptyResult;
    emptyResult.analysisSuccessful = false;
    emptyResult.healthSummary = "No previous analysis found";
    return emptyResult;
}

void DifferentialAnalysisSystem::EnableAdaptiveOptimization(bool enable) {
    m_pImpl->configuration.enableAdaptiveOptimization = enable;
}

void DifferentialAnalysisSystem::SetConfiguration(const DifferentialAnalysisConfig& config) {
    m_pImpl->configuration = config;
}

DifferentialAnalysisConfig DifferentialAnalysisSystem::GetConfiguration() const {
    return m_pImpl->configuration;
}

std::vector<TerrainMetricResult> DifferentialAnalysisSystem::RunMetricsSequential(
    const std::vector<std::string>& metricNames,
    const TerrainDataSnapshot& beforeSnapshot,
    const TerrainDataSnapshot& afterSnapshot) const {
    
    std::vector<TerrainMetricResult> results;
    results.reserve(metricNames.size());
    
    std::shared_lock<std::shared_mutex> lock(m_pImpl->metricsMutex);
    
    for (const auto& name : metricNames) {
        auto it = m_pImpl->metrics.find(name);
        if (it != m_pImpl->metrics.end() && it->second.enabled) {
            try {
                results.push_back(it->second.metric->AnalyzeTransition(beforeSnapshot, afterSnapshot));
            } catch (const std::exception& e) {
                TerrainMetricResult errorResult;
                errorResult.metricName = name;
                errorResult.errorMessage = e.what();
                errorResult.isSuccessful = false;
                results.push_back(errorResult);
            }
        }
    }
    
    return results;
}

std::vector<TerrainMetricResult> DifferentialAnalysisSystem::RunMetricsParallel(
    const std::vector<std::string>& metricNames,
    const TerrainDataSnapshot& beforeSnapshot,
    const TerrainDataSnapshot& afterSnapshot) const {
    
    std::vector<TerrainMetricResult> results(metricNames.size());
    std::vector<Job*> jobs;
    jobs.reserve(metricNames.size());
    
    std::shared_lock<std::shared_mutex> lock(m_pImpl->metricsMutex);
    
    for (size_t i = 0; i < metricNames.size(); ++i) {
        const auto& name = metricNames[i];
        auto it = m_pImpl->metrics.find(name);
        
        if (it != m_pImpl->metrics.end() && it->second.enabled) {
            auto job = JobSystem::Instance().CreateJob<TerrainMetricResult>(
                [&metric = it->second.metric, &beforeSnapshot, &afterSnapshot]() -> TerrainMetricResult {
                    try {
                        return metric->AnalyzeTransition(beforeSnapshot, afterSnapshot);
                    } catch (const std::exception& e) {
                        TerrainMetricResult errorResult;
                        errorResult.metricName = metric->GetMetricName();
                        errorResult.errorMessage = e.what();
                        errorResult.isSuccessful = false;
                        return errorResult;
                    }
                },
                ("Metric_" + name).c_str()
            );
            jobs.push_back(job);
        }
    }
    
    auto handles = JobSystem::Instance().ScheduleBatch(jobs);
    for (auto& handle : handles) {
        handle.Wait();
    }
    
    // Collect results
    for (size_t i = 0; i < jobs.size(); ++i) {
        if (auto* typedJob = static_cast<TypedJob<TerrainMetricResult>*>(jobs[i])) {
            results[i] = typedJob->GetResult();
        }
    }
    
    return results;
}

bool DifferentialAnalysisSystem::IsMonitoringActive() const {
    return m_pImpl->realTimeMonitoring.load();
}

void DifferentialAnalysisSystem::SetAlertCallback(AlertCallback callback) {
    m_pImpl->alertCallback = callback;
}

DifferentialAnalysisSystem::SystemStatistics DifferentialAnalysisSystem::GetSystemStatistics() const {
    SystemStatistics stats{};
    
    // Populate statistics from implementation
    stats.totalAnalysesPerformed = m_pImpl->analysisHistory.size();
    stats.averageAnalysisTimeMs = 0.0f;
    
    if (!m_pImpl->analysisHistory.empty()) {
        float totalTime = 0.0f;
        for (const auto& result : m_pImpl->analysisHistory) {
            totalTime += result.analysisTime.count();
        }
        stats.averageAnalysisTimeMs = totalTime / m_pImpl->analysisHistory.size();
    }
    
    stats.activeMetricsCount = GetEnabledMetrics().size();
    stats.totalMemoryUsedMB = m_pImpl->configuration.memoryBudgetMB * 0.75f; // Estimate
    stats.cacheHitRate = 0.85f; // Placeholder
    stats.systemEfficiencyScore = 0.9f; // Placeholder
    
    return stats;
}

std::string DifferentialAnalysisSystem::GenerateAnalysisReport() const {
    std::string report = "Differential Analysis System Report\n";
    report += "===================================\n\n";
    
    auto stats = GetSystemStatistics();
    report += "Total Analyses: " + std::to_string(stats.totalAnalysesPerformed) + "\n";
    report += "Average Analysis Time: " + std::to_string(stats.averageAnalysisTimeMs) + "ms\n";
    report += "Active Metrics: " + std::to_string(stats.activeMetricsCount) + "\n";
    report += "Memory Usage: " + std::to_string(stats.totalMemoryUsedMB) + "MB\n";
    report += "Cache Hit Rate: " + std::to_string(stats.cacheHitRate * 100) + "%\n";
    report += "System Efficiency: " + std::to_string(stats.systemEfficiencyScore * 100) + "%\n";
    
    return report;
}

void DifferentialAnalysisSystem::SetMaxConcurrentAnalyses(uint32_t maxConcurrent) {
    // Store in configuration for future use
    m_pImpl->configuration.maxAnalysisThreads = maxConcurrent;
}

} // namespace PlanetGen::Generation::Analysis
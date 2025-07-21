module;

#include <memory>
#include <vector>
#include <string>
#include <iostream>
#include <sstream>
#include <chrono>
#include <mutex>
#include <thread>

module PipelineIntegration;

import DifferentialAnalysisSystem;
import StageTransitionAnalyzer;
import TerrainDataSnapshot;
import VulkanManager;

namespace PlanetGen::Generation::Analysis {

TerrainPipelineMonitor::TerrainPipelineMonitor() {
    m_statistics = {};
}

TerrainPipelineMonitor::~TerrainPipelineMonitor() {
    Shutdown();
}

bool TerrainPipelineMonitor::Initialize(const DifferentialAnalysisConfig& config) {
    m_config = config;
    
    // Create analysis system
    m_analysisSystem = std::make_unique<DifferentialAnalysisSystem>(config);
    
    // Create transition analyzer with appropriate configuration
    if (m_qualityLevel == "fast") {
        m_transitionAnalyzer = StageTransitionAnalyzerFactory::CreateRealTimeAnalyzer();
    } else if (m_qualityLevel == "detailed") {
        m_transitionAnalyzer = StageTransitionAnalyzerFactory::CreateResearchAnalyzer();
    } else {
        m_transitionAnalyzer = StageTransitionAnalyzerFactory::CreateStandardAnalyzer();
    }
    
    if (!m_transitionAnalyzer) {
        return false;
    }
    
    return true;
}

void TerrainPipelineMonitor::Shutdown() {
    if (m_analysisSystem) {
        m_analysisSystem.reset();
    }
    
    m_transitionAnalyzer.reset();
    m_generatorAdapter.reset();
    m_physicsAdapter.reset();
    m_orchestratorAdapter.reset();
    
    std::lock_guard<std::mutex> lock(m_snapshotMutex);
    m_snapshots.clear();
    m_snapshotIndices.clear();
}

void TerrainPipelineMonitor::RegisterPlanetaryGenerator(std::shared_ptr<PlanetGen::Generation::PlanetaryGenerator> generator) {
    m_generatorAdapter = PipelineStageAdapterFactory::CreatePlanetaryGeneratorAdapter(generator);
    
    if (m_generatorAdapter && m_analysisSystem) {
        m_analysisSystem->RegisterPipelineStage(m_generatorAdapter);
        
        // Configure adapter parameters
        m_generatorAdapter->SetCanAutoTune(true);
        m_generatorAdapter->SetProcessingStable(true);
        m_generatorAdapter->SetProcessingConfidence(0.9f);
    }
}

void TerrainPipelineMonitor::RegisterPhysicsIntegrator(std::shared_ptr<PlanetGen::Generation::Physics::PlanetaryPhysicsIntegrator> integrator) {
    m_physicsAdapter = PipelineStageAdapterFactory::CreatePhysicsIntegratorAdapter(integrator);
    
    if (m_physicsAdapter && m_analysisSystem) {
        m_analysisSystem->RegisterPipelineStage(m_physicsAdapter);
        
        // Configure adapter parameters
        m_physicsAdapter->SetCanAutoTune(true);
        m_physicsAdapter->SetProcessingStable(true);
        m_physicsAdapter->SetProcessingConfidence(0.8f);
    }
}

void TerrainPipelineMonitor::RegisterTerrainOrchestrator(std::shared_ptr<PlanetGen::Rendering::TerrainOrchestrator> orchestrator) {
    m_orchestratorAdapter = PipelineStageAdapterFactory::CreateGenericAdapter(
        orchestrator, "TerrainOrchestrator", 4);
    
    if (m_orchestratorAdapter && m_analysisSystem) {
        m_analysisSystem->RegisterPipelineStage(m_orchestratorAdapter);
        
        // Configure adapter parameters
        m_orchestratorAdapter->SetCanAutoTune(false); // Orchestrator typically doesn't auto-tune
        m_orchestratorAdapter->SetProcessingStable(true);
        m_orchestratorAdapter->SetProcessingConfidence(0.95f);
    }
}

void TerrainPipelineMonitor::CapturePreGenerationSnapshot(const PlanetaryData& initialData, const std::string& preset) {
    auto snapshot = CreateSnapshotFromPlanetaryData(initialData, "PreGeneration", 0);
    
    std::lock_guard<std::mutex> lock(m_snapshotMutex);
    m_snapshotIndices["PreGeneration"] = m_snapshots.size();
    m_snapshots.push_back(std::move(snapshot));
}

void TerrainPipelineMonitor::CapturePostGenerationSnapshot(const PlanetaryData& generatedData) {
    // Ensure all GPU operations are complete before accessing planetary data
    EnsureDeviceSynchronization();
    
    auto snapshot = CreateSnapshotFromPlanetaryData(generatedData, "PostGeneration", 1);
    
    if (m_generatorAdapter) {
        m_generatorAdapter->SetOutputSnapshot(CopySnapshot(*snapshot));
    }
    
    bool hasPreGenerationSnapshot = false;
    {
        std::lock_guard<std::mutex> lock(m_snapshotMutex);
        m_snapshotIndices["PostGeneration"] = m_snapshots.size();
        m_snapshots.push_back(std::move(snapshot));
        
        // Check if we have pre-generation snapshot while we have the lock
        hasPreGenerationSnapshot = (m_snapshotIndices.find("PreGeneration") != m_snapshotIndices.end());
    } // Release lock before calling ProcessPipelineTransition
    
    // Analyze generation step if we have pre-generation data
    if (hasPreGenerationSnapshot) {
        ProcessPipelineTransition("PreGeneration", "PostGeneration");
    }
}

void TerrainPipelineMonitor::CapturePrePhysicsSnapshot(const PlanetaryData& prePhysicsData) {
    auto snapshot = CreateSnapshotFromPlanetaryData(prePhysicsData, "PrePhysics", 2);
    
    if (m_physicsAdapter) {
        m_physicsAdapter->SetInputSnapshot(CopySnapshot(*snapshot));
    }
    
    std::lock_guard<std::mutex> lock(m_snapshotMutex);
    m_snapshotIndices["PrePhysics"] = m_snapshots.size();
    m_snapshots.push_back(std::move(snapshot));
}

void TerrainPipelineMonitor::CapturePostPhysicsSnapshot(const PlanetaryData& postPhysicsData) {
    
    try {
        // Ensure all GPU operations are complete before accessing planetary data
        EnsureDeviceSynchronization();
        
        auto snapshot = CreateSnapshotFromPlanetaryData(postPhysicsData, "PostPhysics", 3);
        
        if (m_physicsAdapter) {
            m_physicsAdapter->SetOutputSnapshot(CopySnapshot(*snapshot));
        }
        
        bool hasPrePhysicsSnapshot = false;
        {
            std::lock_guard<std::mutex> lock(m_snapshotMutex);
            m_snapshotIndices["PostPhysics"] = m_snapshots.size();
            m_snapshots.push_back(std::move(snapshot));
            
            // Check if we have pre-physics snapshot while we have the lock
            hasPrePhysicsSnapshot = (m_snapshotIndices.find("PrePhysics") != m_snapshotIndices.end());
        } // Release lock before calling ProcessPipelineTransition
        
        // Analyze physics step
        if (hasPrePhysicsSnapshot) {
            ProcessPipelineTransition("PrePhysics", "PostPhysics");
        }
        
    } catch (const std::exception& e) {
        std::cerr << "[ERROR] Exception in CapturePostPhysicsSnapshot: " << e.what() << std::endl;
        throw;
    } catch (...) {
        std::cerr << "[ERROR] Unknown exception in CapturePostPhysicsSnapshot" << std::endl;
        throw;
    }
}

void TerrainPipelineMonitor::CapturePreCoherenceSnapshot(const PlanetaryData& preCoherenceData) {
    auto snapshot = CreateSnapshotFromPlanetaryData(preCoherenceData, "PreCoherence", 4);
    
    std::lock_guard<std::mutex> lock(m_snapshotMutex);
    m_snapshotIndices["PreCoherence"] = m_snapshots.size();
    m_snapshots.push_back(std::move(snapshot));
}

void TerrainPipelineMonitor::CapturePostCoherenceSnapshot(const PlanetaryData& postCoherenceData) {
    // Ensure all GPU operations are complete before accessing planetary data
    EnsureDeviceSynchronization();
    
    auto snapshot = CreateSnapshotFromPlanetaryData(postCoherenceData, "PostCoherence", 5);
    
    bool hasPreCoherenceSnapshot = false;
    {
        std::lock_guard<std::mutex> lock(m_snapshotMutex);
        m_snapshotIndices["PostCoherence"] = m_snapshots.size();
        m_snapshots.push_back(std::move(snapshot));
        
        // Check if we have pre-coherence snapshot while we have the lock
        hasPreCoherenceSnapshot = (m_snapshotIndices.find("PreCoherence") != m_snapshotIndices.end());
    } // Release lock before calling ProcessPipelineTransition
    
    // Analyze coherence step
    if (hasPreCoherenceSnapshot) {
        ProcessPipelineTransition("PreCoherence", "PostCoherence");
    }
}

void TerrainPipelineMonitor::CaptureFinalSnapshot(const PlanetaryData& finalData) {
    auto snapshot = CreateSnapshotFromPlanetaryData(finalData, "Final", 6);
    
    std::lock_guard<std::mutex> lock(m_snapshotMutex);
    m_snapshotIndices["Final"] = m_snapshots.size();
    m_snapshots.push_back(std::move(snapshot));
    
    // Update statistics
    std::lock_guard<std::mutex> statsLock(m_statisticsMutex);
    m_statistics.totalGenerationsMonitored++;
}

std::vector<PipelineAnalysisResult> TerrainPipelineMonitor::AnalyzeFullPipeline() {
    if (!m_analysisSystem) {
        return {};
    }
    
    // Since we're managing snapshots locally, perform direct analysis
    std::vector<PipelineAnalysisResult> results;
    
    // Define the pipeline stages in order
    std::vector<std::pair<std::string, std::string>> transitions = {
        {"PreGeneration", "PostGeneration"},
        {"PostGeneration", "PrePhysics"},
        {"PrePhysics", "PostPhysics"},
        {"PostPhysics", "PreCoherence"},
        {"PreCoherence", "PostCoherence"},
        {"PostCoherence", "Final"}
    };
    
    for (const auto& [from, to] : transitions) {
        std::lock_guard<std::mutex> lock(m_snapshotMutex);
        
        auto fromIt = m_snapshotIndices.find(from);
        auto toIt = m_snapshotIndices.find(to);
        
        if (fromIt != m_snapshotIndices.end() && toIt != m_snapshotIndices.end() &&
            fromIt->second < m_snapshots.size() && toIt->second < m_snapshots.size()) {
            
            const auto& beforeSnapshot = *m_snapshots[fromIt->second];
            const auto& afterSnapshot = *m_snapshots[toIt->second];
            
            // Use the analysis system to analyze this specific transition
            auto result = m_analysisSystem->AnalyzePipelineTransition(
                beforeSnapshot.GetMetadata().stageId,
                afterSnapshot.GetMetadata().stageId
            );
            
            // If that fails (no registered stages), use transition analyzer directly
            if (!result.analysisSuccessful && m_transitionAnalyzer) {
                result = m_transitionAnalyzer->AnalyzeTransition(beforeSnapshot, afterSnapshot);
                result.stageName = from + " -> " + to;
            }
            
            if (result.analysisSuccessful) {
                results.push_back(result);
            }
        }
    }
    
    return results;
}

PipelineAnalysisResult TerrainPipelineMonitor::AnalyzeLastTransition() {
    std::lock_guard<std::mutex> lock(m_snapshotMutex);
    
    if (m_snapshots.size() < 2) {
        PipelineAnalysisResult result;
        result.analysisSuccessful = false;
        result.healthSummary = "Insufficient snapshots for analysis";
        return result;
    }
    
    // Analyze the most recent transition
    const auto& beforeSnapshot = *m_snapshots[m_snapshots.size() - 2];
    const auto& afterSnapshot = *m_snapshots[m_snapshots.size() - 1];
    
    if (m_transitionAnalyzer) {
        return m_transitionAnalyzer->AnalyzeTransition(beforeSnapshot, afterSnapshot);
    }
    
    PipelineAnalysisResult result;
    result.analysisSuccessful = false;
    result.healthSummary = "No analyzer available";
    return result;
}

void TerrainPipelineMonitor::EnableRealTimeMonitoring(bool enable) {
    m_realTimeMonitoring = enable;
    
    if (m_analysisSystem) {
        if (enable) {
            m_analysisSystem->StartRealTimeMonitoring();
        } else {
            m_analysisSystem->StopRealTimeMonitoring();
        }
    }
}

bool TerrainPipelineMonitor::IsRealTimeMonitoringEnabled() const {
    return m_realTimeMonitoring && m_analysisSystem && m_analysisSystem->IsMonitoringActive();
}

void TerrainPipelineMonitor::SetAlertCallback(AlertCallback callback) {
    m_alertCallback = callback;
    
    if (m_analysisSystem) {
        m_analysisSystem->SetAlertCallback([this, callback](const PipelineAnalysisResult& result) {
            if (m_alertCallback) {
                m_alertCallback(result, "DifferentialAnalysis");
            }
        });
    }
}

std::vector<std::pair<std::string, float>> TerrainPipelineMonitor::GetParameterSuggestions() const {
    std::vector<std::pair<std::string, float>> allSuggestions;
    
    // Get suggestions from recent analysis results
    auto recentResults = m_analysisSystem ? m_analysisSystem->GetRecentResults(5) : std::vector<PipelineAnalysisResult>{};
    
    for (const auto& result : recentResults) {
        for (const auto& suggestion : result.parameterAdjustments) {
            allSuggestions.push_back(suggestion);
        }
    }
    
    return allSuggestions;
}

void TerrainPipelineMonitor::ApplyParameterOptimizations() {
    auto suggestions = GetParameterSuggestions();
    
    if (suggestions.empty()) return;
    
    // Apply suggestions to registered components
    if (m_generatorAdapter) {
        m_generatorAdapter->ApplyParameterAdjustments(suggestions);
    }
    
    if (m_physicsAdapter) {
        m_physicsAdapter->ApplyParameterAdjustments(suggestions);
    }
    
    // Update statistics
    std::lock_guard<std::mutex> lock(m_statisticsMutex);
    m_statistics.optimizationsApplied += static_cast<uint32_t>(suggestions.size());
}

std::string TerrainPipelineMonitor::GetCurrentPipelineHealth() const {
    // Use our local statistics instead of relying on analysis system
    std::lock_guard<std::mutex> lock(m_statisticsMutex);
    
    if (m_statistics.totalGenerationsMonitored == 0) {
        return "No data (0 generations monitored)";
    }
    
    std::string health;
    
    // Calculate health based on our statistics
    float healthScore = m_statistics.averageHealthScore;
    if (healthScore >= 0.8f) {
        health = "Healthy";
    } else if (healthScore >= 0.5f) {
        health = "Degraded";
    } else {
        health = "Critical";
    }
    
    health += " (Score: " + std::to_string(static_cast<int>(healthScore * 100)) + "%)";
    health += " | Generations: " + std::to_string(m_statistics.totalGenerationsMonitored);
    health += " | Issues: " + std::to_string(m_statistics.criticalIssuesDetected);
    
    return health;
}

std::string TerrainPipelineMonitor::GetDetailedAnalysisReport() const {
    if (!m_analysisSystem) {
        return "Analysis system not available";
    }
    
    std::ostringstream report;
    report << "\n=== TERRAIN PIPELINE ANALYSIS REPORT ===\n";
    
    // System statistics
    auto sysStats = m_analysisSystem->GetSystemStatistics();
    report << "Total Analyses: " << sysStats.totalAnalysesPerformed << "\n";
    report << "Critical Issues: " << sysStats.criticalIssuesDetected << "\n";
    report << "Warnings: " << sysStats.warningsIssued << "\n";
    report << "Optimizations Applied: " << sysStats.optimizationsApplied << "\n";
    report << "System Efficiency: " << (sysStats.systemEfficiencyScore * 100.0f) << "%\n";
    report << "Average Analysis Time: " << sysStats.averageAnalysisTimeMs << "ms\n\n";
    
    // Recent results
    auto recentResults = m_analysisSystem->GetRecentResults(3);
    report << "=== RECENT ANALYSIS RESULTS ===\n";
    
    for (const auto& result : recentResults) {
        report << "Transition: " << result.fromStageId << " → " << result.toStageId << "\n";
        report << "Health: ";
        switch (result.overallHealth) {
            case PipelineAnalysisResult::OverallHealth::Healthy:
                report << "Healthy";
                break;
            case PipelineAnalysisResult::OverallHealth::Degraded:
                report << "Degraded";
                break;
            case PipelineAnalysisResult::OverallHealth::Critical:
                report << "Critical";
                break;
        }
        report << "\n";
        report << "Summary: " << result.healthSummary << "\n";
        
        if (!result.parameterAdjustments.empty()) {
            report << "Suggestions: ";
            for (const auto& [param, value] : result.parameterAdjustments) {
                report << param << "=" << value << " ";
            }
            report << "\n";
        }
        report << "\n";
    }
    
    report << "========================================\n";
    
    return report.str();
}

void TerrainPipelineMonitor::PrintAnalysisSummary() const {
    std::cout << GetCurrentPipelineHealth() << std::endl;
    
    // Print key metrics
    std::lock_guard<std::mutex> lock(m_statisticsMutex);
    std::cout << "[Monitor] Generations: " << m_statistics.totalGenerationsMonitored
              << " | Issues: " << m_statistics.criticalIssuesDetected
              << " | Health: " << (m_statistics.averageHealthScore * 100.0f) << "%"
              << " | Avg Analysis: " << m_statistics.averageAnalysisTime.count() << "ms" << std::endl;
}

void TerrainPipelineMonitor::SetQualityLevel(const std::string& quality) {
    m_qualityLevel = quality;
    
    // Reconfigure analyzer if already initialized
    if (m_transitionAnalyzer) {
        if (quality == "fast") {
            m_transitionAnalyzer = StageTransitionAnalyzerFactory::CreateRealTimeAnalyzer();
        } else if (quality == "detailed") {
            m_transitionAnalyzer = StageTransitionAnalyzerFactory::CreateResearchAnalyzer();
        } else {
            m_transitionAnalyzer = StageTransitionAnalyzerFactory::CreateStandardAnalyzer();
        }
    }
}

void TerrainPipelineMonitor::EnableMetric(const std::string& metricName, bool enabled) {
    if (m_transitionAnalyzer) {
        m_transitionAnalyzer->EnableMetric(metricName, enabled);
    }
}

TerrainPipelineMonitor::PipelineStatistics TerrainPipelineMonitor::GetStatistics() const {
    std::lock_guard<std::mutex> lock(m_statisticsMutex);
    return m_statistics;
}

std::unique_ptr<ConcreteTerrainDataSnapshot> TerrainPipelineMonitor::CreateSnapshotFromPlanetaryData(
    const PlanetaryData& data,
    const std::string& stageName,
    uint32_t stageId
) {
    
    try {
        TerrainDataSnapshot::SnapshotMetadata metadata;
        metadata.stageName = stageName;
        metadata.stageId = stageId;
        metadata.timestamp = std::chrono::steady_clock::now();
        
        metadata.dataResolution = static_cast<uint32_t>(std::sqrt(data.elevation.data.size()));
        
        metadata.seed = 0; // TODO: Get seed from generation context
        metadata.processingParameters = ""; // Could be populated with actual parameters
        
        auto snapshot = std::make_unique<ConcreteTerrainDataSnapshot>(metadata);
        
        // Safely copy data from PlanetaryData using chunked copying to avoid deadlocks
        SafeCopyModalityData(data.elevation, "elevation", snapshot.get());
        SafeCopyModalityData(data.temperature, "temperature", snapshot.get());
        SafeCopyModalityData(data.precipitation, "precipitation", snapshot.get());
        SafeCopyModalityData(data.vegetation, "vegetation", snapshot.get());
        
        // Generate coordinates if we have elevation data
        if (!data.elevation.data.empty()) {
            SafeGenerateCoordinates(metadata.dataResolution, snapshot.get());
        }
        
        return snapshot;
    } catch (const std::exception& e) {
        std::cerr << "[ERROR] Exception in CreateSnapshotFromPlanetaryData: " << e.what() << std::endl;
        throw;
    } catch (...) {
        std::cerr << "[ERROR] Unknown exception in CreateSnapshotFromPlanetaryData" << std::endl;
        throw;
    }
}

std::unique_ptr<ConcreteTerrainDataSnapshot> TerrainPipelineMonitor::CopySnapshot(const ConcreteTerrainDataSnapshot& source) {
    // Create a new snapshot with the same metadata
    auto copy = std::make_unique<ConcreteTerrainDataSnapshot>(source.GetMetadata());
    
    // Copy the data manually to avoid copy constructor issues
    if (source.HasElevationData()) {
        copy->SetElevationData(source.GetElevationData());
    }
    if (source.HasTemperatureData()) {
        copy->SetTemperatureData(source.GetTemperatureData());
    }
    if (source.HasPrecipitationData()) {
        copy->SetPrecipitationData(source.GetPrecipitationData());
    }
    if (source.HasVegetationData()) {
        copy->SetVegetationData(source.GetVegetationData());
    }
    
    return copy;
}

void TerrainPipelineMonitor::EnsureDeviceSynchronization() {
    try {
        // Wait for all GPU operations to complete before capturing snapshots
        // This prevents resource deadlocks when accessing planetary data that might be GPU-resident
        auto& vulkanManager = PlanetGen::Rendering::VulkanManager::GetInstance();
        if (vulkanManager.IsInitialized()) {
            vulkanManager.WaitForDeviceIdle();
        }
    } catch (const std::exception& e) {
        std::cerr << "[WARNING] Device synchronization failed: " << e.what() << std::endl;
        // Continue anyway - the data might not be GPU-resident
    } catch (...) {
        std::cerr << "[WARNING] Unknown error during device synchronization" << std::endl;
        // Continue anyway - the data might not be GPU-resident
    }
}

void TerrainPipelineMonitor::SafeCopyModalityData(
    const PlanetaryModality& modality,
    const std::string& modalityType,
    ConcreteTerrainDataSnapshot* snapshot
) {
    if (modality.data.empty() || !snapshot) {
        return;
    }
    
    try {
        // Copy data in chunks to avoid large memory allocations that could cause deadlocks
        const size_t chunkSize = 1024 * 1024; // 1MB chunks
        const size_t totalSize = modality.data.size();
        
        std::vector<float> safeCopy;
        safeCopy.reserve(totalSize);
        
        // Copy in chunks with yield points to avoid blocking
        for (size_t offset = 0; offset < totalSize; offset += chunkSize) {
            size_t currentChunkSize = std::min(chunkSize, totalSize - offset);
            
            // Copy chunk
            auto beginIt = modality.data.begin() + offset;
            auto endIt = beginIt + currentChunkSize;
            
            safeCopy.insert(safeCopy.end(), beginIt, endIt);
            
            // Yield CPU to prevent blocking other threads
            if (offset + chunkSize < totalSize) {
                std::this_thread::yield();
            }
        }
        
        // Set the data on the snapshot
        if (modalityType == "elevation") {
            snapshot->SetElevationData(std::move(safeCopy));
        } else if (modalityType == "temperature") {
            snapshot->SetTemperatureData(std::move(safeCopy));
        } else if (modalityType == "precipitation") {
            snapshot->SetPrecipitationData(std::move(safeCopy));
        } else if (modalityType == "vegetation") {
            snapshot->SetVegetationData(std::move(safeCopy));
        }
        
    } catch (const std::exception& e) {
        std::cerr << "[WARNING] Failed to copy " << modalityType << " data safely: " << e.what() << std::endl;
        // Continue without this modality data rather than failing completely
    } catch (...) {
        std::cerr << "[WARNING] Unknown error copying " << modalityType << " data safely" << std::endl;
        // Continue without this modality data rather than failing completely
    }
}

void TerrainPipelineMonitor::SafeGenerateCoordinates(
    uint32_t resolution,
    ConcreteTerrainDataSnapshot* snapshot
) {
    if (!snapshot || resolution == 0) {
        return;
    }
    
    try {
        std::vector<std::pair<float, float>> coordinates;
        coordinates.reserve(resolution * resolution);
        
        // Generate coordinates in chunks to avoid large memory operations
        const uint32_t chunkRows = 64; // Process 64 rows at a time
        
        for (uint32_t yStart = 0; yStart < resolution; yStart += chunkRows) {
            uint32_t yEnd = std::min(yStart + chunkRows, resolution);
            
            for (uint32_t y = yStart; y < yEnd; ++y) {
                for (uint32_t x = 0; x < resolution; ++x) {
                    float lat = (static_cast<float>(y) / (resolution - 1)) * 180.0f - 90.0f;
                    float lon = (static_cast<float>(x) / (resolution - 1)) * 360.0f - 180.0f;
                    coordinates.emplace_back(lat, lon);
                }
            }
            
            // Yield CPU between chunks
            if (yEnd < resolution) {
                std::this_thread::yield();
            }
        }
        
        snapshot->SetCoordinates(std::move(coordinates));
        
    } catch (const std::exception& e) {
        std::cerr << "[WARNING] Failed to generate coordinates safely: " << e.what() << std::endl;
        // Continue without coordinates rather than failing completely
    } catch (...) {
        std::cerr << "[WARNING] Unknown error generating coordinates safely" << std::endl;
        // Continue without coordinates rather than failing completely
    }
}

void TerrainPipelineMonitor::ProcessPipelineTransition(const std::string& fromStage, const std::string& toStage) {
    if (!m_transitionAnalyzer || !m_realTimeMonitoring) {
        return;
    }
    
    try {
        std::lock_guard<std::mutex> lock(m_snapshotMutex);
        
        auto fromIt = m_snapshotIndices.find(fromStage);
        auto toIt = m_snapshotIndices.find(toStage);
        
        if (fromIt != m_snapshotIndices.end() && toIt != m_snapshotIndices.end()) {
            const auto& beforeSnapshot = *m_snapshots[fromIt->second];
            const auto& afterSnapshot = *m_snapshots[toIt->second];
            
            // Temporarily disable parallel processing to avoid JobSystem deadlocks
            bool originalParallelSetting = m_transitionAnalyzer->IsParallelProcessingEnabled();
            m_transitionAnalyzer->SetParallelProcessing(false);
            
            // Perform analysis with sequential processing only
            auto result = m_transitionAnalyzer->AnalyzeTransition(beforeSnapshot, afterSnapshot);
            
            // Restore original parallel setting
            m_transitionAnalyzer->SetParallelProcessing(originalParallelSetting);
            
            TriggerAlertsIfNeeded(result);
            UpdateStatistics(result);
        } else {
            std::cout << "[DEBUG] ProcessPipelineTransition - Missing snapshots: from=" 
                      << (fromIt != m_snapshotIndices.end() ? "found" : "missing") 
                      << ", to=" << (toIt != m_snapshotIndices.end() ? "found" : "missing") << std::endl;
        }
        
    } catch (const std::exception& e) {
        std::cerr << "[CRITICAL ALERT] PipelineTransition: Analysis failed: " << e.what() << std::endl;
        
        // Update statistics to reflect the failure
        std::lock_guard<std::mutex> statsLock(m_statisticsMutex);
        m_statistics.criticalIssuesDetected++;
    } catch (...) {
        std::cerr << "[CRITICAL ALERT] PipelineTransition: Unknown analysis failure" << std::endl;
        
        // Update statistics to reflect the failure
        std::lock_guard<std::mutex> statsLock(m_statisticsMutex);
        m_statistics.criticalIssuesDetected++;
    }
    
    std::cout << "[DEBUG] ProcessPipelineTransition - Completed" << std::endl;
}

void TerrainPipelineMonitor::TriggerAlertsIfNeeded(const PipelineAnalysisResult& result) {
    if (m_alertCallback && result.overallHealth != PipelineAnalysisResult::OverallHealth::Healthy) {
        m_alertCallback(result, "PipelineTransition");
    }
}

void TerrainPipelineMonitor::UpdateStatistics(const PipelineAnalysisResult& result) {
    std::lock_guard<std::mutex> lock(m_statisticsMutex);
    
    if (result.overallHealth == PipelineAnalysisResult::OverallHealth::Critical) {
        m_statistics.criticalIssuesDetected++;
    }
    
    // Update average health score
    float healthScore = 1.0f;
    switch (result.overallHealth) {
        case PipelineAnalysisResult::OverallHealth::Healthy:
            healthScore = 1.0f;
            break;
        case PipelineAnalysisResult::OverallHealth::Degraded:
            healthScore = 0.5f;
            break;
        case PipelineAnalysisResult::OverallHealth::Critical:
            healthScore = 0.0f;
            break;
    }
    
    // Running average
    uint32_t totalAnalyses = m_statistics.totalGenerationsMonitored;
    if (totalAnalyses > 0) {
        m_statistics.averageHealthScore = 
            (m_statistics.averageHealthScore * totalAnalyses + healthScore) / (totalAnalyses + 1);
    } else {
        m_statistics.averageHealthScore = healthScore;
    }
    
    // Update average analysis time
    auto totalTime = m_statistics.averageAnalysisTime.count() * totalAnalyses + result.analysisTime.count();
    m_statistics.averageAnalysisTime = std::chrono::milliseconds(totalTime / (totalAnalyses + 1));
}

// Helper class implementations

std::unique_ptr<TerrainPipelineMonitor> TerrainAnalysisHelper::CreateForApp(const std::string& qualityLevel) {
    auto monitor = std::make_unique<TerrainPipelineMonitor>();
    
    DifferentialAnalysisConfig config;
    config.enableRealTimeAnalysis = true;
    config.enableHistoricalTracking = true;
    config.enableAdaptiveOptimization = (qualityLevel != "fast");
    config.enableParallelAnalysis = true;
    config.maxAnalysisThreads = (qualityLevel == "fast") ? 2 : 4;
    
    if (monitor->Initialize(config)) {
        monitor->SetQualityLevel(qualityLevel);
        return monitor;
    }
    
    return nullptr;
}

void TerrainAnalysisHelper::MonitorGenerationStep(
    TerrainPipelineMonitor* monitor,
    const std::string& stepName,
    const PlanetaryData& data
) {
    if (!monitor) return;
    
    if (stepName == "PreGeneration") {
        monitor->CapturePreGenerationSnapshot(data, "");
    } else if (stepName == "PostGeneration") {
        monitor->CapturePostGenerationSnapshot(data);
    } else if (stepName == "PrePhysics") {
        monitor->CapturePrePhysicsSnapshot(data);
    } else if (stepName == "PostPhysics") {
        monitor->CapturePostPhysicsSnapshot(data);
    } else if (stepName == "PreCoherence") {
        monitor->CapturePreCoherenceSnapshot(data);
    } else if (stepName == "PostCoherence") {
        monitor->CapturePostCoherenceSnapshot(data);
    } else if (stepName == "Final") {
        monitor->CaptureFinalSnapshot(data);
    }
}

void TerrainAnalysisHelper::PrintHealthStatus(const TerrainPipelineMonitor* monitor) {
    if (monitor) {
        monitor->PrintAnalysisSummary();
    }
}

void TerrainAnalysisHelper::PrintDetailedReport(const TerrainPipelineMonitor* monitor) {
    if (monitor) {
        std::cout << monitor->GetDetailedAnalysisReport() << std::endl;
    }
}

bool TerrainAnalysisHelper::ApplyOptimizations(
    TerrainPipelineMonitor* monitor,
    PlanetGen::Generation::PlanetaryGenerator* generator,
    PlanetGen::Generation::Physics::PlanetaryPhysicsIntegrator* physics
) {
    if (!monitor) return false;
    
    auto suggestions = monitor->GetParameterSuggestions();
    if (suggestions.empty()) return false;
    
    monitor->ApplyParameterOptimizations();
    return true;
}

// Factory implementations

std::unique_ptr<TerrainPipelineMonitor> TerrainPipelineMonitorFactory::CreateForTerrainApp() {
    return TerrainAnalysisHelper::CreateForApp("medium");
}

std::unique_ptr<TerrainPipelineMonitor> TerrainPipelineMonitorFactory::CreateRealTimeMonitor() {
    return TerrainAnalysisHelper::CreateForApp("fast");
}

std::unique_ptr<TerrainPipelineMonitor> TerrainPipelineMonitorFactory::CreateResearchMonitor() {
    return TerrainAnalysisHelper::CreateForApp("detailed");
}

std::unique_ptr<TerrainPipelineMonitor> TerrainPipelineMonitorFactory::CreateTestingMonitor() {
    auto monitor = std::make_unique<TerrainPipelineMonitor>();
    
    DifferentialAnalysisConfig config;
    config.enableRealTimeAnalysis = true;
    config.enableHistoricalTracking = false;
    config.enableAdaptiveOptimization = false;
    config.enableParallelAnalysis = false; // Sequential for testing
    
    if (monitor->Initialize(config)) {
        monitor->SetQualityLevel("medium");
        monitor->EnableRealTimeMonitoring(true);
        return monitor;
    }
    
    return nullptr;
}

std::unique_ptr<TerrainPipelineMonitor> TerrainPipelineMonitorFactory::CreateCustomMonitor(
    const DifferentialAnalysisConfig& config
) {
    auto monitor = std::make_unique<TerrainPipelineMonitor>();
    
    if (monitor->Initialize(config)) {
        return monitor;
    }
    
    return nullptr;
}

} // namespace PlanetGen::Generation::Analysis
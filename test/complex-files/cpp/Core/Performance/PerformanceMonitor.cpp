module;

#include <algorithm>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <chrono>
#include <thread>
#include <mutex>
#include <unordered_map>
#include <vector>

module PerformanceMonitor;

namespace PlanetGen::Core::Performance {

// Base PerformanceMonitor constructor implementations
PerformanceMonitor::PerformanceMonitor() = default;

PerformanceMonitor::PerformanceMonitor(const PerformanceConfig& config) : m_config(config) {}

// Default implementation of PerformanceMonitor
class DefaultPerformanceMonitor : public PerformanceMonitor {
public:
    DefaultPerformanceMonitor(const PerformanceConfig& config)
        : PerformanceMonitor()
    {
        m_config = config;
        ResetStatistics();
    }

    bool Initialize() override {
        std::lock_guard<std::mutex> lock(m_dataMutex);
        m_isActive = true;
        m_isPaused = false;
        
        m_frameStats.sessionStartTime = std::chrono::steady_clock::now();
        m_lastFrameTime = m_frameStats.sessionStartTime;
        m_lastStatsUpdate = m_frameStats.sessionStartTime;
        
        return true;
    }

    void Shutdown() override {
        std::lock_guard<std::mutex> lock(m_dataMutex);
        m_isActive = false;
        m_activeEvents.clear();
        m_eventHistory.clear();
        m_alerts.clear();
    }

    void Update(float deltaTime) override {
        if (!m_isActive || m_isPaused) return;

        std::lock_guard<std::mutex> lock(m_dataMutex);
        
        auto now = std::chrono::steady_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::duration<float>>(now - m_frameStats.sessionStartTime);
        m_frameStats.sessionDuration = elapsed.count();
        
        // Update rolling averages if enough time has passed
        auto timeSinceUpdate = std::chrono::duration_cast<std::chrono::duration<float>>(now - m_lastStatsUpdate);
        if (timeSinceUpdate.count() >= m_config.samplingWindowSeconds) {
            UpdateRollingAverages();
            CheckPerformanceAlerts();
            m_lastStatsUpdate = now;
        }
        
        // Clean up old data
        CleanupOldData();
    }

    void BeginFrame() override {
        if (!m_isActive || m_isPaused) return;

        std::lock_guard<std::mutex> lock(m_dataMutex);
        m_currentFrameStart = std::chrono::steady_clock::now();
    }

    void EndFrame() override {
        if (!m_isActive || m_isPaused) return;

        std::lock_guard<std::mutex> lock(m_dataMutex);
        auto frameEnd = std::chrono::steady_clock::now();
        
        // Calculate frame time
        auto frameDuration = std::chrono::duration_cast<std::chrono::microseconds>(frameEnd - m_currentFrameStart);
        float frameTimeMs = frameDuration.count() / 1000.0f;
        
        // Update frame statistics
        m_frameStats.currentFrameTime = frameTimeMs;
        m_frameStats.totalFrameCount++;
        
        // Add to history for rolling calculations
        m_frameTimeHistory.push_back(frameTimeMs);
        if (m_frameTimeHistory.size() > m_config.maxFrameHistory) {
            m_frameTimeHistory.erase(m_frameTimeHistory.begin());
        }
        
        // Calculate current FPS
        if (frameTimeMs > 0) {
            m_frameStats.currentFPS = 1000.0f / frameTimeMs;
        }
        
        // Check for dropped frames (assuming 60 FPS target)
        if (frameTimeMs > 16.67f) {
            m_frameStats.droppedFrameCount++;
        }
        
        // Update min/max
        if (m_frameStats.totalFrameCount == 1) {
            m_frameStats.minFrameTime = m_frameStats.maxFrameTime = frameTimeMs;
            m_frameStats.minFPS = m_frameStats.maxFPS = m_frameStats.currentFPS;
        } else {
            m_frameStats.minFrameTime = std::min(m_frameStats.minFrameTime, frameTimeMs);
            m_frameStats.maxFrameTime = std::max(m_frameStats.maxFrameTime, frameTimeMs);
            m_frameStats.minFPS = std::min(m_frameStats.minFPS, m_frameStats.currentFPS);
            m_frameStats.maxFPS = std::max(m_frameStats.maxFPS, m_frameStats.currentFPS);
        }
        
        m_lastFrameTime = frameEnd;
        
        // Notify callback if set
        if (m_frameStatsCallback) {
            m_frameStatsCallback(m_frameStats);
        }
    }

    const FrameStatistics& GetFrameStatistics() const override {
        return m_frameStats;
    }

    void RecordGPUTime(const std::string& label, float timeMs) override {
        if (!m_isActive || m_isPaused) return;

        std::lock_guard<std::mutex> lock(m_dataMutex);
        
        if (label == "compute") {
            m_gpuStats.computeTime += timeMs;
        } else if (label == "render") {
            m_gpuStats.renderTime += timeMs;
        }
        
        m_gpuStats.totalGPUTime += timeMs;
    }

    void RecordGPUMemoryUsage(uint64_t used, uint64_t total) override {
        if (!m_isActive || m_isPaused) return;

        std::lock_guard<std::mutex> lock(m_dataMutex);
        m_gpuStats.memoryUsed = used;
        m_gpuStats.memoryTotal = total;
        m_gpuStats.memoryUsagePercent = total > 0 ? (float(used) / float(total)) * 100.0f : 0.0f;
    }

    void RecordDrawCall(uint32_t triangles) override {
        if (!m_isActive || m_isPaused) return;

        std::lock_guard<std::mutex> lock(m_dataMutex);
        m_gpuStats.drawCalls++;
        m_gpuStats.triangleCount += triangles;
    }

    void RecordComputeDispatch() override {
        if (!m_isActive || m_isPaused) return;

        std::lock_guard<std::mutex> lock(m_dataMutex);
        m_gpuStats.computeDispatches++;
    }

    const GPUStatistics& GetGPUStatistics() const override {
        return m_gpuStats;
    }

    void RecordCPUTime(const std::string& label, float timeMs) override {
        if (!m_isActive || m_isPaused) return;

        std::lock_guard<std::mutex> lock(m_dataMutex);
        
        if (label == "update") {
            m_cpuStats.updateTime += timeMs;
        } else if (label == "system") {
            m_cpuStats.systemTime += timeMs;
        }
        
        m_cpuStats.totalCPUTime += timeMs;
    }

    void RecordCPUMemoryUsage(uint64_t used) override {
        if (!m_isActive || m_isPaused) return;

        std::lock_guard<std::mutex> lock(m_dataMutex);
        m_cpuStats.memoryUsed = used;
        // Note: Getting total system memory would require platform-specific code
        m_cpuStats.memoryUsagePercent = 0.0f; // TODO: Implement proper calculation
    }

    void RecordJobExecution(uint32_t jobCount) override {
        if (!m_isActive || m_isPaused) return;

        std::lock_guard<std::mutex> lock(m_dataMutex);
        m_cpuStats.jobsExecuted += jobCount;
        m_cpuStats.activeThreads = std::thread::hardware_concurrency(); // Approximation
    }

    const CPUStatistics& GetCPUStatistics() const override {
        return m_cpuStats;
    }

    void BeginEvent(const std::string& name, const std::string& category) override {
        if (!m_isActive || m_isPaused || !m_config.enableEventTracking) return;

        std::lock_guard<std::mutex> lock(m_dataMutex);
        
        PerformanceEvent event;
        event.name = name;
        event.category = category;
        event.startTime = std::chrono::steady_clock::now();
        
        m_activeEvents[name] = event;
    }

    void EndEvent(const std::string& name) override {
        if (!m_isActive || m_isPaused || !m_config.enableEventTracking) return;

        std::lock_guard<std::mutex> lock(m_dataMutex);
        
        auto it = m_activeEvents.find(name);
        if (it != m_activeEvents.end()) {
            it->second.endTime = std::chrono::steady_clock::now();
            auto duration = std::chrono::duration_cast<std::chrono::microseconds>(
                it->second.endTime - it->second.startTime);
            it->second.duration = duration.count() / 1000.0f; // Convert to milliseconds
            
            m_eventHistory.push_back(it->second);
            m_activeEvents.erase(it);
            
            // Limit history size
            if (m_eventHistory.size() > m_config.maxEventHistory) {
                m_eventHistory.erase(m_eventHistory.begin());
            }
        }
    }

    void RecordInstantEvent(const std::string& name, const std::string& category) override {
        if (!m_isActive || m_isPaused || !m_config.enableEventTracking) return;

        std::lock_guard<std::mutex> lock(m_dataMutex);
        
        PerformanceEvent event;
        event.name = name;
        event.category = category;
        event.startTime = event.endTime = std::chrono::steady_clock::now();
        event.duration = 0.0f;
        
        m_eventHistory.push_back(event);
        
        if (m_eventHistory.size() > m_config.maxEventHistory) {
            m_eventHistory.erase(m_eventHistory.begin());
        }
    }

    const std::vector<PerformanceEvent>& GetEventHistory() const override {
        return m_eventHistory;
    }

    void SetAlertCallback(PerformanceAlertCallback callback) override {
        std::lock_guard<std::mutex> lock(m_dataMutex);
        m_alertCallback = callback;
    }

    void SetFrameStatsCallback(FrameStatsCallback callback) override {
        std::lock_guard<std::mutex> lock(m_dataMutex);
        m_frameStatsCallback = callback;
    }

    const std::vector<PerformanceAlert>& GetRecentAlerts() const override {
        return m_alerts;
    }

    void UpdateConfig(const PerformanceConfig& config) override {
        std::lock_guard<std::mutex> lock(m_dataMutex);
        m_config = config;
    }

    const PerformanceConfig& GetConfig() const override {
        return m_config;
    }

    bool ExportToJSON(const std::string& filepath) const override {
        std::lock_guard<std::mutex> lock(m_dataMutex);
        
        std::ofstream file(filepath);
        if (!file.is_open()) return false;
        
        file << "{\n";
        file << "  \"frameStats\": {\n";
        file << "    \"currentFPS\": " << m_frameStats.currentFPS << ",\n";
        file << "    \"averageFPS\": " << m_frameStats.averageFPS << ",\n";
        file << "    \"totalFrames\": " << m_frameStats.totalFrameCount << ",\n";
        file << "    \"droppedFrames\": " << m_frameStats.droppedFrameCount << ",\n";
        file << "    \"sessionDuration\": " << m_frameStats.sessionDuration << "\n";
        file << "  },\n";
        file << "  \"gpuStats\": {\n";
        file << "    \"totalGPUTime\": " << m_gpuStats.totalGPUTime << ",\n";
        file << "    \"memoryUsedMB\": " << (m_gpuStats.memoryUsed / (1024 * 1024)) << ",\n";
        file << "    \"drawCalls\": " << m_gpuStats.drawCalls << ",\n";
        file << "    \"computeDispatches\": " << m_gpuStats.computeDispatches << "\n";
        file << "  }\n";
        file << "}\n";
        
        return true;
    }

    bool ExportToCSV(const std::string& filepath) const override {
        std::lock_guard<std::mutex> lock(m_dataMutex);
        
        std::ofstream file(filepath);
        if (!file.is_open()) return false;
        
        file << "Type,Metric,Value\n";
        file << "Frame,CurrentFPS," << m_frameStats.currentFPS << "\n";
        file << "Frame,AverageFPS," << m_frameStats.averageFPS << "\n";
        file << "Frame,TotalFrames," << m_frameStats.totalFrameCount << "\n";
        file << "GPU,TotalTime," << m_gpuStats.totalGPUTime << "\n";
        file << "GPU,MemoryUsedMB," << (m_gpuStats.memoryUsed / (1024 * 1024)) << "\n";
        file << "CPU,TotalTime," << m_cpuStats.totalCPUTime << "\n";
        
        return true;
    }

    std::string GetSummaryReport() const override {
        std::lock_guard<std::mutex> lock(m_dataMutex);
        
        std::stringstream ss;
        ss << std::fixed << std::setprecision(2);
        ss << "Runtime: " << m_frameStats.sessionDuration << "s | ";
        ss << "Frames: " << m_frameStats.totalFrameCount << " | ";
        ss << "Avg FPS: " << m_frameStats.averageFPS << " | ";
        ss << "Frame Time: " << m_frameStats.currentFrameTime << "ms | ";
        ss << "GPU Memory: " << (m_gpuStats.memoryUsed / (1024 * 1024)) << "MB | ";
        ss << "Draw Calls: " << m_gpuStats.drawCalls << " | ";
        ss << "Compute: " << m_gpuStats.computeDispatches;
        if (m_frameStats.droppedFrameCount > 0) {
            ss << " | Dropped: " << m_frameStats.droppedFrameCount;
        }
        
        return ss.str();
    }

    bool IsMonitoringActive() const override {
        return m_isActive && !m_isPaused;
    }

    void ResetStatistics() override {
        std::lock_guard<std::mutex> lock(m_dataMutex);
        
        m_frameStats = {};
        m_gpuStats = {};
        m_cpuStats = {};
        m_frameTimeHistory.clear();
        m_eventHistory.clear();
        m_alerts.clear();
        m_activeEvents.clear();
        
        m_frameStats.sessionStartTime = std::chrono::steady_clock::now();
    }

    void PauseMonitoring() override {
        m_isPaused = true;
    }

    void ResumeMonitoring() override {
        m_isPaused = false;
    }

private:
    // Frame statistics
    FrameStatistics m_frameStats{};
    GPUStatistics m_gpuStats{};
    CPUStatistics m_cpuStats{};
    
    // Timing
    std::chrono::steady_clock::time_point m_currentFrameStart;
    std::chrono::steady_clock::time_point m_lastFrameTime;
    std::chrono::steady_clock::time_point m_lastStatsUpdate;
    
    // Data storage
    std::vector<float> m_frameTimeHistory;
    std::vector<PerformanceEvent> m_eventHistory;
    std::vector<PerformanceAlert> m_alerts;
    std::unordered_map<std::string, PerformanceEvent> m_activeEvents;
    
    // Callbacks
    PerformanceAlertCallback m_alertCallback;
    FrameStatsCallback m_frameStatsCallback;
    
    void UpdateRollingAverages() {
        if (!m_frameTimeHistory.empty()) {
            float sum = 0.0f;
            for (float time : m_frameTimeHistory) {
                sum += time;
            }
            m_frameStats.averageFrameTime = sum / m_frameTimeHistory.size();
            m_frameStats.averageFPS = m_frameStats.averageFrameTime > 0 ? 1000.0f / m_frameStats.averageFrameTime : 0.0f;
        }
    }
    
    void CheckPerformanceAlerts() {
        if (!m_config.enablePerformanceAlerts) return;
        
        // Check FPS drop
        if (m_frameStats.currentFPS < m_config.fpsAlertThreshold) {
            PerformanceAlert alert;
            alert.type = PerformanceAlertType::FPSDrop;
            alert.message = "FPS dropped below threshold";
            alert.timestamp = std::chrono::steady_clock::now();
            alert.severity = 1.0f - (m_frameStats.currentFPS / m_config.fpsAlertThreshold);
            alert.data["currentFPS"] = std::to_string(m_frameStats.currentFPS);
            alert.data["threshold"] = std::to_string(m_config.fpsAlertThreshold);
            
            m_alerts.push_back(alert);
            
            if (m_alertCallback) {
                m_alertCallback(alert);
            }
        }
        
        // Check frame time
        if (m_frameStats.currentFrameTime > m_config.frameTimeAlertThreshold) {
            PerformanceAlert alert;
            alert.type = PerformanceAlertType::HighFrameTime;
            alert.message = "Frame time exceeded threshold";
            alert.timestamp = std::chrono::steady_clock::now();
            alert.severity = m_frameStats.currentFrameTime / m_config.frameTimeAlertThreshold - 1.0f;
            alert.data["currentFrameTime"] = std::to_string(m_frameStats.currentFrameTime);
            alert.data["threshold"] = std::to_string(m_config.frameTimeAlertThreshold);
            
            m_alerts.push_back(alert);
            
            if (m_alertCallback) {
                m_alertCallback(alert);
            }
        }
    }
    
    void CleanupOldData() {
        // Remove old alerts (keep last 100)
        if (m_alerts.size() > 100) {
            m_alerts.erase(m_alerts.begin(), m_alerts.begin() + (m_alerts.size() - 100));
        }
    }
};

// Factory implementations
std::unique_ptr<PerformanceMonitor> PerformanceMonitorFactory::CreateDefaultMonitor() {
    PerformanceConfig config;
    return std::make_unique<DefaultPerformanceMonitor>(config);
}

std::unique_ptr<PerformanceMonitor> PerformanceMonitorFactory::CreateMinimalMonitor() {
    PerformanceConfig config;
    config.enableGPUStats = false;
    config.enableCPUStats = false;
    config.enableEventTracking = false;
    config.enablePerformanceAlerts = false;
    return std::make_unique<DefaultPerformanceMonitor>(config);
}

std::unique_ptr<PerformanceMonitor> PerformanceMonitorFactory::CreateDetailedMonitor() {
    PerformanceConfig config;
    config.enableFrameStats = true;
    config.enableGPUStats = true;
    config.enableCPUStats = true;
    config.enableEventTracking = true;
    config.enableRealTimeLogging = true;
    config.enablePerformanceAlerts = true;
    config.maxEventHistory = 2000;
    config.maxFrameHistory = 600;
    return std::make_unique<DefaultPerformanceMonitor>(config);
}

std::unique_ptr<PerformanceMonitor> PerformanceMonitorFactory::CreateCustomMonitor(const PerformanceConfig& config) {
    return std::make_unique<DefaultPerformanceMonitor>(config);
}

// ScopedPerformanceEvent implementation
ScopedPerformanceEvent::ScopedPerformanceEvent(PerformanceMonitor* monitor, const std::string& name, const std::string& category)
    : m_monitor(monitor), m_eventName(name) {
    if (m_monitor) {
        m_monitor->BeginEvent(name, category);
    }
}

ScopedPerformanceEvent::~ScopedPerformanceEvent() {
    if (m_monitor) {
        m_monitor->EndEvent(m_eventName);
    }
}

} // namespace PlanetGen::Core::Performance
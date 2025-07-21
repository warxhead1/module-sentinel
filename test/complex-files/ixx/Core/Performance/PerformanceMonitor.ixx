module;

#include <chrono>
#include <memory>
#include <string>
#include <vector>
#include <unordered_map>
#include <atomic>
#include <mutex>
#include <functional>

export module PerformanceMonitor;

export namespace PlanetGen::Core::Performance {

// Core performance data structures
struct FrameStatistics {
    float currentFPS = 0.0f;
    float averageFPS = 0.0f;
    float minFPS = 0.0f;
    float maxFPS = 0.0f;
    
    float currentFrameTime = 0.0f; // milliseconds
    float averageFrameTime = 0.0f;
    float minFrameTime = 0.0f;
    float maxFrameTime = 0.0f;
    
    uint64_t totalFrameCount = 0;
    uint64_t droppedFrameCount = 0;
    
    std::chrono::steady_clock::time_point sessionStartTime;
    float sessionDuration = 0.0f; // seconds
};

struct GPUStatistics {
    float computeTime = 0.0f; // milliseconds
    float renderTime = 0.0f;
    float totalGPUTime = 0.0f;
    
    uint64_t memoryUsed = 0; // bytes
    uint64_t memoryTotal = 0;
    float memoryUsagePercent = 0.0f;
    
    uint32_t drawCalls = 0;
    uint32_t computeDispatches = 0;
    uint32_t triangleCount = 0;
};

struct CPUStatistics {
    float updateTime = 0.0f; // milliseconds
    float systemTime = 0.0f;
    float totalCPUTime = 0.0f;
    
    uint64_t memoryUsed = 0; // bytes
    float memoryUsagePercent = 0.0f;
    
    uint32_t activeThreads = 0;
    uint32_t jobsExecuted = 0;
};

struct PerformanceEvent {
    std::string name;
    std::chrono::steady_clock::time_point startTime;
    std::chrono::steady_clock::time_point endTime;
    float duration = 0.0f; // milliseconds
    std::string category;
    std::unordered_map<std::string, std::string> metadata;
};

// Configuration for performance monitoring
struct PerformanceConfig {
    bool enableFrameStats = true;
    bool enableGPUStats = true;
    bool enableCPUStats = true;
    bool enableEventTracking = true;
    
    float samplingWindowSeconds = 1.0f; // Window for averaging calculations
    uint32_t maxEventHistory = 1000; // Maximum events to keep in history
    uint32_t maxFrameHistory = 300; // Maximum frame data points to keep
    
    bool enableRealTimeLogging = false;
    bool enablePerformanceAlerts = true;
    float fpsAlertThreshold = 30.0f; // Alert if FPS drops below this
    float frameTimeAlertThreshold = 33.3f; // Alert if frame time exceeds this (ms)
};

// Performance alert system
enum class PerformanceAlertType {
    FPSDrop,
    HighFrameTime,
    MemorySpike,
    GPUStall,
    CPUSpike,
    CustomAlert
};

struct PerformanceAlert {
    PerformanceAlertType type;
    std::string message;
    std::chrono::steady_clock::time_point timestamp;
    float severity; // 0.0 - 1.0
    std::unordered_map<std::string, std::string> data;
};

// Callback types for performance events
using PerformanceAlertCallback = std::function<void(const PerformanceAlert&)>;
using FrameStatsCallback = std::function<void(const FrameStatistics&)>;

// Main PerformanceMonitor interface
class PerformanceMonitor {
public:
    PerformanceMonitor();
    explicit PerformanceMonitor(const PerformanceConfig& config);
    virtual ~PerformanceMonitor() = default;

    // Core lifecycle
    virtual bool Initialize() = 0;
    virtual void Shutdown() = 0;
    virtual void Update(float deltaTime) = 0;

    // Frame statistics
    virtual void BeginFrame() = 0;
    virtual void EndFrame() = 0;
    virtual const FrameStatistics& GetFrameStatistics() const = 0;
    
    // GPU statistics
    virtual void RecordGPUTime(const std::string& label, float timeMs) = 0;
    virtual void RecordGPUMemoryUsage(uint64_t used, uint64_t total) = 0;
    virtual void RecordDrawCall(uint32_t triangles = 0) = 0;
    virtual void RecordComputeDispatch() = 0;
    virtual const GPUStatistics& GetGPUStatistics() const = 0;
    
    // CPU statistics
    virtual void RecordCPUTime(const std::string& label, float timeMs) = 0;
    virtual void RecordCPUMemoryUsage(uint64_t used) = 0;
    virtual void RecordJobExecution(uint32_t jobCount = 1) = 0;
    virtual const CPUStatistics& GetCPUStatistics() const = 0;
    
    // Event tracking
    virtual void BeginEvent(const std::string& name, const std::string& category = "") = 0;
    virtual void EndEvent(const std::string& name) = 0;
    virtual void RecordInstantEvent(const std::string& name, const std::string& category = "") = 0;
    virtual const std::vector<PerformanceEvent>& GetEventHistory() const = 0;
    
    // Performance alerts
    virtual void SetAlertCallback(PerformanceAlertCallback callback) = 0;
    virtual void SetFrameStatsCallback(FrameStatsCallback callback) = 0;
    virtual const std::vector<PerformanceAlert>& GetRecentAlerts() const = 0;
    
    // Configuration
    virtual void UpdateConfig(const PerformanceConfig& config) = 0;
    virtual const PerformanceConfig& GetConfig() const = 0;
    
    // Data export
    virtual bool ExportToJSON(const std::string& filepath) const = 0;
    virtual bool ExportToCSV(const std::string& filepath) const = 0;
    virtual std::string GetSummaryReport() const = 0;
    
    // Real-time access
    virtual bool IsMonitoringActive() const = 0;
    virtual void ResetStatistics() = 0;
    virtual void PauseMonitoring() = 0;
    virtual void ResumeMonitoring() = 0;

protected:
    PerformanceConfig m_config;
    std::atomic<bool> m_isActive{false};
    std::atomic<bool> m_isPaused{false};
    mutable std::mutex m_dataMutex;
};

// Factory for creating performance monitors
class PerformanceMonitorFactory {
public:
    static std::unique_ptr<PerformanceMonitor> CreateDefaultMonitor();
    static std::unique_ptr<PerformanceMonitor> CreateMinimalMonitor(); // Lightweight version
    static std::unique_ptr<PerformanceMonitor> CreateDetailedMonitor(); // Full featured version
    static std::unique_ptr<PerformanceMonitor> CreateCustomMonitor(const PerformanceConfig& config);
};

// RAII helper for automatic event timing
class ScopedPerformanceEvent {
public:
    ScopedPerformanceEvent(PerformanceMonitor* monitor, const std::string& name, const std::string& category = "");
    ~ScopedPerformanceEvent();
    
    ScopedPerformanceEvent(const ScopedPerformanceEvent&) = delete;
    ScopedPerformanceEvent& operator=(const ScopedPerformanceEvent&) = delete;

private:
    PerformanceMonitor* m_monitor;
    std::string m_eventName;
};

// Convenience macros for performance monitoring
#define PERFORMANCE_EVENT(monitor, name) ScopedPerformanceEvent _perf_event(monitor, name)
#define PERFORMANCE_EVENT_CATEGORY(monitor, name, category) ScopedPerformanceEvent _perf_event(monitor, name, category)

} // namespace PlanetGen::Core::Performance
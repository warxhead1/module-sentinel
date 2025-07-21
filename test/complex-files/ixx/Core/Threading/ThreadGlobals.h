#pragma once
#include <thread>
#include <atomic>
#include <mutex>
#include <stdexcept>
#include <string>
#include <iostream>

namespace PlanetGen::Threading {

/**
 * Thread context checker for operations that require specific threading context
 * More flexible than rigid main-thread-only requirements
 */
class ThreadContextChecker {
private:
    static std::atomic<std::thread::id>& GetUIThreadIdRef() {
        static std::atomic<std::thread::id> s_uiThreadId{std::thread::id{}};
        return s_uiThreadId;
    }

public:
    // Explicitly set the UI/main thread - called during application startup
    static void SetUIThread(std::thread::id threadId = std::this_thread::get_id()) {
        GetUIThreadIdRef().store(threadId);
    }
    
    static bool IsUIThread() {
        auto uiThreadId = GetUIThreadIdRef().load();
        return uiThreadId != std::thread::id{} && std::this_thread::get_id() == uiThreadId;
    }
    
    static std::thread::id GetUIThreadId() {
        return GetUIThreadIdRef().load();
    }
    
    // Only assert UI thread for operations that truly require it (like window operations)
    static void AssertUIThread(const char* operation) {
        if (!IsUIThread()) {
            throw std::runtime_error(
                std::string("Operation '") + operation + 
                "' must be called from the UI thread for window system compatibility. " +
                "Current thread: " + std::to_string(std::hash<std::thread::id>{}(std::this_thread::get_id())) +
                ", UI thread: " + std::to_string(std::hash<std::thread::id>{}(GetUIThreadId()))
            );
        }
    }
    
    // Soft warning for operations that are preferred on UI thread but not required
    static void PreferUIThread(const char* operation) {
        if (!IsUIThread()) {
            std::cerr << "[THREADING WARNING] Operation '" << operation 
                     << "' is preferred on UI thread but proceeding anyway." << std::endl;
        }
    }
};

// Backward compatibility alias
using MainThreadChecker = ThreadContextChecker;

} // namespace PlanetGen::Threading

// Backward compatibility (but deprecated)
[[deprecated("Use MainThreadChecker::GetMainThreadId() instead")]]
inline std::thread::id mainThreadId;
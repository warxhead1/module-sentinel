module;

#include <string>
#include <string_view>
#include <format>
#include <iostream>
#include <fstream>
#include <sstream>
#include <chrono>
#include <mutex>
#include <atomic>
#include <unordered_map>
#include <unordered_set>
#include <memory>
#include <source_location>
#include <csignal>
#include <cstdio>

export module Core.Logging.Logger;

export namespace Core::Logging {

    enum class LogLevel {
        TRACE = 0,
        DEBUG = 1,
        INFO = 2,
        WARN = 3,
        ERROR = 4,
        CRITICAL = 5,
        OFF = 6
    };

    struct LogContext {
        std::string_view component;
        std::string_view category;
        std::source_location location;
    };

    class Logger {
    public:
        static Logger& getInstance() {
            static Logger instance;
            return instance;
        }
        
        ~Logger() {
            // Ensure file is properly closed and flushed
            std::lock_guard lock(m_fileMutex);
            if (m_fileStream) {
                m_fileStream->flush();
                m_fileStream->close();
            }
        }

        // Set global log level (affects both console and file)
        void setLevel(LogLevel level) {
            m_globalLevel.store(level);
        }

        // Set console-specific log level
        void setConsoleLevel(LogLevel level) {
            m_consoleLevel.store(level);
        }

        // Set file-specific log level
        void setFileLevel(LogLevel level) {
            m_fileLevel.store(level);
        }

        // Set component-specific log level
        void setComponentLevel(std::string_view component, LogLevel level) {
            std::lock_guard lock(m_componentLevelsMutex);
            m_componentLevels[std::string(component)] = level;
        }

        // Enable/disable console output
        void setConsoleEnabled(bool enabled) {
            m_consoleEnabled.store(enabled);
        }

        // Enable/disable file output
        void setFileOutput(const std::string& filename) {
            std::lock_guard lock(m_fileMutex);
            if (!filename.empty()) {
                m_fileStream = std::make_unique<std::ofstream>(filename, std::ios::app);
                if (m_fileStream && m_fileStream->is_open()) {
                    // Set unbuffered mode for immediate writes
                    m_fileStream->rdbuf()->pubsetbuf(nullptr, 0);
                    m_fileEnabled = true;
                } else {
                    m_fileStream.reset();
                    m_fileEnabled = false;
                }
            } else {
                m_fileStream.reset();
                m_fileEnabled = false;
            }
        }

        // Smart logging: log a message only once
        template<typename... Args>
        void logOnce(LogLevel level, const LogContext& context, std::string_view format, Args&&... args) {
            std::string key = std::string(context.component) + ":" + 
                std::string(context.location.file_name()) + ":" + 
                std::to_string(context.location.line());
            
            std::lock_guard lock(m_onceMutex);
            if (m_onceMessages.find(key) != m_onceMessages.end()) {
                return; // Already logged
            }
            m_onceMessages.insert(key);
            
            log(level, context, format, std::forward<Args>(args)...);
        }

        // Rate-limited logging: log at most N times per second
        template<typename... Args>
        void logRateLimited(LogLevel level, const LogContext& context, int maxPerSecond, std::string_view format, Args&&... args) {
            std::string key = std::string(context.component) + ":" + 
                std::string(context.location.file_name()) + ":" + 
                std::to_string(context.location.line());
            auto now = std::chrono::steady_clock::now();
            
            std::lock_guard lock(m_rateLimitMutex);
            auto& rateInfo = m_rateLimitInfo[key];
            
            // Reset counter if second has passed
            if (now - rateInfo.lastReset >= std::chrono::seconds(1)) {
                rateInfo.count = 0;
                rateInfo.suppressedCount = 0;
                rateInfo.lastReset = now;
            }
            
            if (rateInfo.count < maxPerSecond) {
                rateInfo.count++;
                if (rateInfo.suppressedCount > 0) {
                    // Include suppressed count in message
                    std::string extendedFormat = std::string(format) + " [suppressed " + std::to_string(rateInfo.suppressedCount) + " similar messages]";
                    log(level, context, extendedFormat, std::forward<Args>(args)...);
                    rateInfo.suppressedCount = 0;
                } else {
                    log(level, context, format, std::forward<Args>(args)...);
                }
            } else {
                rateInfo.suppressedCount++;
            }
        }

        // Standard logging
        template<typename... Args>
        void log(LogLevel level, const LogContext& context, std::string_view format, Args&&... args) {
            if (!shouldLog(level, context.component)) {
                return;
            }

            std::string message;
            if constexpr (sizeof...(args) > 0) {
                /* MSVC C++20/23 FORMAT STRATEGIES TRIED:
                 * 
                 * 1. ORIGINAL APPROACH (worked with C++20):
                 *    message = std::vformat(format, std::make_format_args(args...));
                 *    ISSUE: C++23 causes ambiguous call to std::_Format_to_it
                 * 
                 * 2. FORMAT_TO WITH BACK_INSERTER:
                 *    std::string result;
                 *    std::format_to(std::back_inserter(result), std::string(format), args...);
                 *    ISSUE: Still causes ambiguous call in MSVC C++23
                 * 
                 * 3. EXPLICIT STRING CONVERSION:
                 *    std::string fmt_str(format);
                 *    auto fmt_args = std::make_format_args(std::forward<Args>(args)...);
                 *    message = std::vformat(fmt_str, fmt_args);
                 *    ISSUE: Cannot convert rvalue to lvalue reference in make_format_args
                 * 
                 * 4. PREPROCESSOR WORKAROUND:
                 *    #if USE_FORMAT_WORKAROUND
                 *    std::ostringstream oss; ((oss << ... << args), ...);
                 *    ISSUE: Invalid fold expression syntax
                 * 
                 * 5. CMAKE CHANGES:
                 *    - Set CMAKE_CXX_STANDARD to 23 (caused the initial issue)
                 *    - Reverted to CMAKE_CXX_STANDARD 20 (didn't fix mixed module versions)
                 *    - Clean builds with --clean flag (build cache not fully cleaned)
                 *    - Manual rm -rf build directory (still mixed versions)
                 * 
                 * ROOT CAUSE: Mixed C++20 and C++23 compiled modules due to:
                 *    - Some modules compiled with "202002" (C++20)
                 *    - Others compiled with "202400" (C++23)
                 *    - MSVC's std::format implementation has breaking changes between versions
                 *    - The P2286R8 proposal introduces std::__p2286 namespace causing ambiguity
                 */
                
                // Cross-compiler C++23 compatible formatting
#if defined(__clang__) || (defined(_MSC_VER) && _MSC_VER >= 1940)
                // Modern compilers with stable std::format support (raised MSVC threshold)
                try {
                    message = std::vformat(format, std::make_format_args(args...));
                } catch (const std::format_error&) {
                    // Fallback if format string is invalid - convert string_view to string first
                    message = std::string(format) + " [format error with " + std::to_string(sizeof...(args)) + " args]";
                }
#else
                // Fallback for older compilers or problematic MSVC versions
                // Convert string_view to string to avoid operator<< issues
                message = std::string(format);
                if constexpr (sizeof...(args) > 0) {
                    message += " [args: " + std::to_string(sizeof...(args)) + "]";
                }
#endif
            } else {
                message = std::string(format);
            }
            
            auto timestamp = getCurrentTimestamp();
            auto levelStr = getLevelString(level);
            
            // Format the final message - use runtime format to avoid C++23 compile-time checks
            std::string formattedMessage;
            formattedMessage.reserve(256); // Pre-allocate for performance
            formattedMessage = "[" + timestamp + "] [" + levelStr + "] [" + std::string(context.component) + "] " + message;

            // Add location info for debug and trace levels
            if (level <= LogLevel::DEBUG) {
                formattedMessage += " (" + std::string(context.location.file_name()) + ":" + 
                    std::to_string(context.location.line()) + ")";
            }

            output(formattedMessage, level);
        }

        // Convenience methods
        template<typename... Args>
        void trace(const LogContext& context, std::string_view format, Args&&... args) {
            log(LogLevel::TRACE, context, format, std::forward<Args>(args)...);
        }

        template<typename... Args>
        void debug(const LogContext& context, std::string_view format, Args&&... args) {
            log(LogLevel::DEBUG, context, format, std::forward<Args>(args)...);
        }

        template<typename... Args>
        void info(const LogContext& context, std::string_view format, Args&&... args) {
            log(LogLevel::INFO, context, format, std::forward<Args>(args)...);
        }

        template<typename... Args>
        void warn(const LogContext& context, std::string_view format, Args&&... args) {
            log(LogLevel::WARN, context, format, std::forward<Args>(args)...);
        }

        template<typename... Args>
        void error(const LogContext& context, std::string_view format, Args&&... args) {
            log(LogLevel::ERROR, context, format, std::forward<Args>(args)...);
        }

        template<typename... Args>
        void critical(const LogContext& context, std::string_view format, Args&&... args) {
            log(LogLevel::CRITICAL, context, format, std::forward<Args>(args)...);
        }

    private:
        Logger() : m_globalLevel(LogLevel::INFO), m_consoleLevel(LogLevel::INFO), m_fileLevel(LogLevel::DEBUG), m_consoleEnabled(true), m_fileEnabled(false) {
            // Install signal handlers for crash safety
            installCrashHandlers();
        }
        
        void installCrashHandlers() {
            #ifdef _WIN32
                // Windows signal handling
                signal(SIGINT, Logger::signalHandler);
                signal(SIGTERM, Logger::signalHandler);
                signal(SIGABRT, Logger::signalHandler);
            #else
                // POSIX signal handling
                signal(SIGINT, Logger::signalHandler);
                signal(SIGTERM, Logger::signalHandler);
                signal(SIGQUIT, Logger::signalHandler);
                signal(SIGABRT, Logger::signalHandler);
                signal(SIGSEGV, Logger::signalHandler);
            #endif
        }
        
        static void signalHandler(int signal) {
            auto& logger = getInstance();
            std::lock_guard lock(logger.m_fileMutex);
            if (logger.m_fileStream) {
                logger.m_fileStream->flush();
            }
            // Re-raise the signal for default handling
            std::signal(signal, SIG_DFL);
            std::raise(signal);
        }

        bool shouldLog(LogLevel level, std::string_view component) const {
            // Check component-specific level first
            {
                std::lock_guard lock(m_componentLevelsMutex);
                auto it = m_componentLevels.find(std::string(component));
                if (it != m_componentLevels.end()) {
                    return level >= it->second;
                }
            }
            
            // Check if message should be logged for console OR file
            // (message is loggable if it meets either threshold)
            bool consoleLoggable = m_consoleEnabled.load() && level >= m_consoleLevel.load();
            bool fileLoggable = m_fileEnabled && level >= m_fileLevel.load();
            
            // If separate levels are set, use them; otherwise fall back to global level
            if (consoleLoggable || fileLoggable) {
                return true;
            }
            
            // Fall back to global level for backward compatibility
            return level >= m_globalLevel.load();
        }

        std::string getCurrentTimestamp() const {
            auto now = std::chrono::system_clock::now();
            auto time_t_val = std::chrono::system_clock::to_time_t(now);
            auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                now.time_since_epoch()) % 1000;
            
            std::tm tm{};
            #ifdef _WIN32
                // Windows: localtime_s(tm*, time_t*)
                localtime_s(&tm, &time_t_val);
            #else
                // POSIX: localtime_r(time_t*, tm*)
                localtime_r(&time_t_val, &tm);
            #endif
            
            char buffer[64];
            std::snprintf(buffer, sizeof(buffer), "%04d-%02d-%02d %02d:%02d:%02d.%03d",
                tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday,
                tm.tm_hour, tm.tm_min, tm.tm_sec, static_cast<int>(ms.count()));
            return std::string(buffer);
        }

        const char* getLevelString(LogLevel level) const {
            switch (level) {
                case LogLevel::TRACE: return "TRACE";
                case LogLevel::DEBUG: return "DEBUG";
                case LogLevel::INFO:  return "INFO ";
                case LogLevel::WARN:  return "WARN ";
                case LogLevel::ERROR: return "ERROR";
                case LogLevel::CRITICAL: return "CRIT ";
                default: return "UNKNOWN";
            }
        }

        void output(const std::string& message, LogLevel level) {
            // Console output with separate level check
            if (m_consoleEnabled.load() && level >= m_consoleLevel.load()) {
                std::lock_guard lock(m_consoleMutex);
                if (level >= LogLevel::ERROR) {
                    std::cerr << message << std::endl;
                    std::cerr.flush(); // Force flush for error messages
                } else {
                    std::cout << message << std::endl;
                    std::cout.flush(); // Force flush for all messages
                }
            }

            // File output with separate level check
            if (m_fileEnabled && m_fileStream && level >= m_fileLevel.load()) {
                std::lock_guard lock(m_fileMutex);
                *m_fileStream << message << std::endl;
                // Force immediate flush for crash safety
                m_fileStream->flush();
            }
        }

        // Thread-safe members
        std::atomic<LogLevel> m_globalLevel;
        std::atomic<LogLevel> m_consoleLevel;
        std::atomic<LogLevel> m_fileLevel;
        std::atomic<bool> m_consoleEnabled;
        
        mutable std::mutex m_componentLevelsMutex;
        std::unordered_map<std::string, LogLevel> m_componentLevels;
        
        std::mutex m_consoleMutex;
        std::mutex m_fileMutex;
        bool m_fileEnabled;
        std::unique_ptr<std::ofstream> m_fileStream;
        
        // Smart logging state
        std::mutex m_onceMutex;
        std::unordered_set<std::string> m_onceMessages;
        
        struct RateLimitInfo {
            int count = 0;
            int suppressedCount = 0;
            std::chrono::steady_clock::time_point lastReset = std::chrono::steady_clock::now();
        };
        
        std::mutex m_rateLimitMutex;
        std::unordered_map<std::string, RateLimitInfo> m_rateLimitInfo;
    };

} // namespace Core::Logging
#pragma once

// Convenience macros for the Logger module
// These must be in a header file as macros cannot be exported from modules

#include <source_location>

#define LOG_CONTEXT(component) ::Core::Logging::LogContext{component, "", std::source_location::current()}

#define LOG_TRACE(component, ...) ::Core::Logging::Logger::getInstance().trace(LOG_CONTEXT(component), __VA_ARGS__)
#define LOG_DEBUG(component, ...) ::Core::Logging::Logger::getInstance().debug(LOG_CONTEXT(component), __VA_ARGS__)
#define LOG_INFO(component, ...) ::Core::Logging::Logger::getInstance().info(LOG_CONTEXT(component), __VA_ARGS__)
#define LOG_WARN(component, ...) ::Core::Logging::Logger::getInstance().warn(LOG_CONTEXT(component), __VA_ARGS__)
#define LOG_WARNING(component, ...) ::Core::Logging::Logger::getInstance().warn(LOG_CONTEXT(component), __VA_ARGS__)  // Alias for LOG_WARN
#define LOG_ERROR(component, ...) ::Core::Logging::Logger::getInstance().error(LOG_CONTEXT(component), __VA_ARGS__)
#define LOG_CRITICAL(component, ...) ::Core::Logging::Logger::getInstance().critical(LOG_CONTEXT(component), __VA_ARGS__)

#define LOG_ONCE(level, component, ...) ::Core::Logging::Logger::getInstance().logOnce(level, LOG_CONTEXT(component), __VA_ARGS__)
#define LOG_RATE_LIMITED(level, component, rate, ...) ::Core::Logging::Logger::getInstance().logRateLimited(level, LOG_CONTEXT(component), rate, __VA_ARGS__)

// Add a macro for critical errors that ensures immediate output
#define LOG_FATAL(component, ...) do { \
    ::Core::Logging::Logger::getInstance().critical(LOG_CONTEXT(component), __VA_ARGS__); \
    std::cerr.flush(); \
    std::cout.flush(); \
} while(0)
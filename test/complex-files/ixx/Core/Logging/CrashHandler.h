#pragma once

#include <iostream>
#include <exception>
#include <csignal>
#include <cstdlib>
#include <Core/Logging/LoggerMacros.h>

namespace Core::Logging {

class CrashHandler {
public:
    static void Install() {
        // Install terminate handler
        std::set_terminate([]() {
            std::cerr << "\n=== FATAL: std::terminate called ===" << std::endl;
            std::cerr << "This usually means an uncaught exception or failed assertion" << std::endl;
            
            // Try to get current exception info
            if (auto ex = std::current_exception()) {
                try {
                    std::rethrow_exception(ex);
                } catch (const std::exception& e) {
                    std::cerr << "Exception: " << e.what() << std::endl;
                } catch (...) {
                    std::cerr << "Unknown exception type" << std::endl;
                }
            }
            
            std::cerr.flush();
            std::cout.flush();
            std::abort();
        });

        // Install signal handlers for common crash signals
        std::signal(SIGSEGV, [](int sig) {
            std::cerr << "\n=== FATAL: Segmentation fault (SIGSEGV) ===" << std::endl;
            std::cerr << "The application attempted to access invalid memory" << std::endl;
            std::cerr.flush();
            std::cout.flush();
            std::abort();
        });

        std::signal(SIGABRT, [](int sig) {
            std::cerr << "\n=== FATAL: Abort signal (SIGABRT) ===" << std::endl;
            std::cerr << "The application called abort() or assertion failed" << std::endl;
            std::cerr.flush();
            std::cout.flush();
            // Don't call abort again, just exit
            std::_Exit(1);
        });

        #ifdef _WIN32
        // Windows-specific structured exception handling
        _set_se_translator([](unsigned int code, EXCEPTION_POINTERS* pExp) {
            std::cerr << "\n=== FATAL: Windows structured exception ===" << std::endl;
            std::cerr << "Exception code: 0x" << std::hex << code << std::dec << std::endl;
            
            switch(code) {
                case EXCEPTION_ACCESS_VIOLATION:
                    std::cerr << "Access violation - attempted to read/write protected memory" << std::endl;
                    break;
                case EXCEPTION_STACK_OVERFLOW:
                    std::cerr << "Stack overflow" << std::endl;
                    break;
                case EXCEPTION_INT_DIVIDE_BY_ZERO:
                    std::cerr << "Integer division by zero" << std::endl;
                    break;
                default:
                    std::cerr << "Unknown structured exception" << std::endl;
            }
            
            std::cerr.flush();
            std::cout.flush();
            throw std::runtime_error("Windows structured exception");
        });
        #endif
    }

    // RAII wrapper to ensure error output on scope exit
    class ErrorGuard {
    private:
        std::string m_operation;
        bool m_success = false;

    public:
        explicit ErrorGuard(const std::string& operation) : m_operation(operation) {
            LOG_DEBUG("ErrorGuard", "Starting: {}", operation);
        }

        void markSuccess() { m_success = true; }

        ~ErrorGuard() {
            if (!m_success) {
                LOG_FATAL("ErrorGuard", "Operation failed: {}", m_operation);
                std::cerr << "=== CRASH POINT: " << m_operation << " ===" << std::endl;
                std::cerr.flush();
            }
        }
    };
};

// Macro for easy error guard usage
#define ERROR_GUARD(operation) Core::Logging::CrashHandler::ErrorGuard _error_guard(operation)
#define ERROR_GUARD_SUCCESS() _error_guard.markSuccess()

} // namespace Core::Logging
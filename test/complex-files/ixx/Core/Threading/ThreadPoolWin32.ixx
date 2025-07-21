// ThreadPoolWin32.ixx - Windows-specific thread pool using Win32 APIs
module;

// Use only Win32 APIs, no std::thread which causes pthread issues
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <functional>
#include <memory>
#include <optional>
#include <queue>
#include <stdexcept>
#include <type_traits>
#include <vector>

#include <string>
export module ThreadPoolWin32;

export namespace PlanetGen::Core::Threading
{
    class ThreadPoolWin32 
    {
    private:
        struct Task {
            std::function<void()> function;
            std::string name;
            
            Task(std::function<void()> f, std::string n) 
                : function(std::move(f)), name(std::move(n)) {}
        };

        std::queue<std::unique_ptr<Task>> m_tasks;
        std::vector<HANDLE> m_threads;
        std::atomic<bool> m_stop;
        std::atomic<size_t> m_activeJobs;
        
        // Win32 synchronization primitives
        CRITICAL_SECTION m_queueMutex;
        HANDLE m_conditionVariable;
        HANDLE m_allJobsComplete;

        static DWORD WINAPI WorkerThread(LPVOID param) {
            auto* pool = static_cast<ThreadPoolWin32*>(param);
            pool->WorkerLoop();
            return 0;
        }

        void WorkerLoop() {
            while (!m_stop.load(std::memory_order_acquire)) {
                std::unique_ptr<Task> task;
                
                // Get task from queue
                {
                    EnterCriticalSection(&m_queueMutex);
                    if (!m_tasks.empty()) {
                        task = std::move(m_tasks.front());
                        m_tasks.pop();
                    }
                    LeaveCriticalSection(&m_queueMutex);
                }
                
                if (task) {
                    // Execute task
                    m_activeJobs.fetch_add(1, std::memory_order_acq_rel);
                    try {
                        task->function();
                    } catch (...) {
                        // Ignore exceptions in worker threads
                    }
                    m_activeJobs.fetch_sub(1, std::memory_order_acq_rel);
                    
                    // Signal if all jobs complete
                    if (m_activeJobs.load(std::memory_order_acquire) == 0 && 
                        m_tasks.empty()) {
                        SetEvent(m_allJobsComplete);
                    }
                } else {
                    // No work available, wait for signal
                    WaitForSingleObject(m_conditionVariable, 100); // 100ms timeout
                }
            }
        }

    public:
        explicit ThreadPoolWin32(size_t numThreads = 0) 
            : m_stop(false), m_activeJobs(0) {
            
            if (numThreads == 0) {
                SYSTEM_INFO sysInfo;
                GetSystemInfo(&sysInfo);
                if (sysInfo.dwNumberOfProcessors > 0) {
                    numThreads = static_cast<size_t>(sysInfo.dwNumberOfProcessors);
                } else {
                    numThreads = 1;
                }
            }
            
            if (numThreads < 1) {
                numThreads = 1;
            }
            
            // Initialize Win32 synchronization objects
            InitializeCriticalSection(&m_queueMutex);
            m_conditionVariable = CreateEvent(NULL, FALSE, FALSE, NULL);
            m_allJobsComplete = CreateEvent(NULL, TRUE, TRUE, NULL);
            
            if (!m_conditionVariable || !m_allJobsComplete) {
                throw std::runtime_error("Failed to create Win32 synchronization objects");
            }
            
            // Create worker threads
            m_threads.reserve(numThreads);
            for (size_t i = 0; i < numThreads; ++i) {
                HANDLE thread = CreateThread(
                    NULL,                   // default security attributes
                    0,                      // default stack size
                    WorkerThread,           // thread function
                    this,                   // parameter to thread function
                    0,                      // default creation flags
                    NULL                    // thread identifier
                );
                
                if (thread == NULL) {
                    throw std::runtime_error("Failed to create worker thread");
                }
                
                m_threads.push_back(thread);
            }
        }

        ~ThreadPoolWin32() {
            // Signal all threads to stop
            m_stop.store(true, std::memory_order_release);
            
            // Wake up all threads
            for (size_t i = 0; i < m_threads.size(); ++i) {
                SetEvent(m_conditionVariable);
            }
            
            // Wait for all threads to finish
            if (!m_threads.empty()) {
                WaitForMultipleObjects(
                    static_cast<DWORD>(m_threads.size()),
                    m_threads.data(),
                    TRUE,  // wait for all
                    5000   // 5 second timeout
                );
            }
            
            // Close thread handles
            for (HANDLE thread : m_threads) {
                CloseHandle(thread);
            }
            
            // Cleanup synchronization objects
            CloseHandle(m_conditionVariable);
            CloseHandle(m_allJobsComplete);
            DeleteCriticalSection(&m_queueMutex);
        }

        template<typename F>
        void Submit(F&& f, const char* taskName = "Task") {
            auto task = std::make_unique<Task>(
                std::forward<F>(f), 
                taskName ? taskName : "UnnamedTask"
            );
            
            {
                EnterCriticalSection(&m_queueMutex);
                m_tasks.push(std::move(task));
                LeaveCriticalSection(&m_queueMutex);
            }
            
            // Reset completion event and signal worker
            ResetEvent(m_allJobsComplete);
            SetEvent(m_conditionVariable);
        }

        void WaitForAll() {
            // Wait until all jobs are complete
            while (m_activeJobs.load(std::memory_order_acquire) > 0 || !m_tasks.empty()) {
                WaitForSingleObject(m_allJobsComplete, 100);
            }
        }

        bool WaitForAll(std::chrono::milliseconds timeout) {
            auto start = std::chrono::steady_clock::now();
            
            while (m_activeJobs.load(std::memory_order_acquire) > 0 || !m_tasks.empty()) {
                if (std::chrono::steady_clock::now() - start > timeout) {
                    return false;
                }
                WaitForSingleObject(m_allJobsComplete, 10);
            }
            return true;
        }

        size_t GetWorkerCount() const {
            return m_threads.size();
        }

        size_t GetQueueSize() const {
            EnterCriticalSection(const_cast<CRITICAL_SECTION*>(&m_queueMutex));
            size_t size = m_tasks.size();
            LeaveCriticalSection(const_cast<CRITICAL_SECTION*>(&m_queueMutex));
            return size;
        }

        size_t GetActiveJobCount() const {
            return m_activeJobs.load(std::memory_order_acquire);
        }
    };
}
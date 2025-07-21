// ThreadPool.ixx - Cross-platform C++20 implementation
module;

#include <algorithm>
#include <atomic>
#include <chrono>
#include <functional>
#include <future>
#include <iostream>
#include <memory>
#include <queue>
#include <stdexcept>
#include <thread>
#include <type_traits>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#else
#include <semaphore>  // C++20 std::counting_semaphore
#include <mutex>      // std::mutex
#include <pthread.h>  // pthread_setname_np
#include <exception>
#include <string>
#endif

export module ThreadPool;

export namespace PlanetGen::Core::Threading {

// Cross-platform synchronization primitives
namespace detail {
#ifdef _WIN32
    class WindowsSemaphore {
    private:
        HANDLE m_semaphore;
    public:
        explicit WindowsSemaphore(long initial_count = 0) {
            m_semaphore = CreateSemaphoreA(nullptr, initial_count, LONG_MAX, nullptr);
            if (!m_semaphore) {
                throw std::runtime_error("Failed to create semaphore");
            }
        }
        
        ~WindowsSemaphore() {
            if (m_semaphore) {
                CloseHandle(m_semaphore);
            }
        }
        
        void release() {
            ReleaseSemaphore(m_semaphore, 1, nullptr);
        }
        
        void acquire() {
            WaitForSingleObject(m_semaphore, INFINITE);
        }
        
        bool try_acquire_for(std::chrono::milliseconds timeout) {
            DWORD result = WaitForSingleObject(m_semaphore, static_cast<DWORD>(timeout.count()));
            return result == WAIT_OBJECT_0;
        }
    };
#else
    class LinuxSemaphore {
    private:
        std::counting_semaphore<0x7FFFFFFF> m_semaphore;  // 2147483647 - max value GCC supports
    public:
        explicit LinuxSemaphore(long initial_count = 0) : m_semaphore(initial_count) {}
        
        ~LinuxSemaphore() = default;
        
        void release() {
            m_semaphore.release();
        }
        
        void acquire() {
            m_semaphore.acquire();
        }
        
        bool try_acquire_for(std::chrono::milliseconds timeout) {
            return m_semaphore.try_acquire_for(timeout);
        }
    };
#endif
    
#ifdef _WIN32
    class WindowsMutex {
    private:
        CRITICAL_SECTION m_cs;
    public:
        WindowsMutex() {
            InitializeCriticalSection(&m_cs);
        }
        
        ~WindowsMutex() {
            DeleteCriticalSection(&m_cs);
        }
        
        void lock() {
            EnterCriticalSection(&m_cs);
        }
        
        void unlock() {
            LeaveCriticalSection(&m_cs);
        }
        
        bool try_lock() {
            return TryEnterCriticalSection(&m_cs) != 0;
        }
    };
#else
    class LinuxMutex {
    private:
        std::mutex m_mutex;
    public:
        LinuxMutex() = default;
        ~LinuxMutex() = default;
        
        void lock() {
            m_mutex.lock();
        }
        
        void unlock() {
            m_mutex.unlock();
        }
        
        bool try_lock() {
            return m_mutex.try_lock();
        }
    };
#endif
    
    template<typename Mutex>
    class lock_guard {
    private:
        Mutex& m_mutex;
    public:
        explicit lock_guard(Mutex& mutex) : m_mutex(mutex) {
            m_mutex.lock();
        }
        
        ~lock_guard() {
            m_mutex.unlock();
        }
        
        // Non-copyable, non-movable
        lock_guard(const lock_guard&) = delete;
        lock_guard& operator=(const lock_guard&) = delete;
    };
    
    // Platform-specific type aliases for cross-platform compatibility
#ifdef _WIN32
    using PlatformSemaphore = WindowsSemaphore;
    using PlatformMutex = WindowsMutex;
#else
    using PlatformSemaphore = LinuxSemaphore;
    using PlatformMutex = LinuxMutex;
#endif
}

class ThreadPool {
 public:
  explicit ThreadPool(size_t numThreads = std::thread::hardware_concurrency())
      : m_activeJobs(0), m_shutdown(false), m_taskSemaphore(0) {
    // Ensure at least one thread
    if (numThreads < 1) {
      numThreads = 1;
    }

    // Reserve space to avoid reallocation
    m_workers.reserve(numThreads);

    for (size_t i = 0; i < numThreads; ++i) {
      m_workers.emplace_back([this, i] { 
        WorkerThread(i); 
      });
    }
  }

  ~ThreadPool() { 
    Shutdown(); 
  }

  // Delete copy constructor and assignment operator
  ThreadPool(const ThreadPool&) = delete;
  ThreadPool& operator=(const ThreadPool&) = delete;

  // Move constructor and assignment operator
  ThreadPool(ThreadPool&&) = delete;
  ThreadPool& operator=(ThreadPool&&) = delete;

  template <class F, class... Args>
  auto Enqueue(F&& f, Args&&... args)
      -> std::future<std::invoke_result_t<F, Args...>> {
    using return_type = std::invoke_result_t<F, Args...>;

    // Create packaged task
    auto task = std::make_shared<std::packaged_task<return_type()>>(
        [f = std::forward<F>(f),
         ... args = std::forward<Args>(args)]() mutable {
          return std::invoke(std::move(f), std::move(args)...);
        });

    std::future<return_type> res = task->get_future();

    // Add to queue
    {
      detail::lock_guard lock(m_queueMutex);

      // Don't allow enqueueing after stopping
      if (IsShuttingDown()) {
        throw std::runtime_error("Enqueue on stopped ThreadPool");
      }

      m_tasks.emplace([task = std::move(task)]() { (*task)(); });
      m_activeJobs.fetch_add(1, std::memory_order_release);
    }

    // Signal a worker thread
    m_taskSemaphore.release();
    return res;
  }

  // Submit a job without waiting for result
  void Submit(std::function<void()> f) {
    {
      detail::lock_guard lock(m_queueMutex);

      if (IsShuttingDown()) {
        throw std::runtime_error("Submit on stopped ThreadPool");
      }

      m_tasks.emplace(std::move(f));
      m_activeJobs.fetch_add(1, std::memory_order_release);
    }

    // Signal a worker thread
    m_taskSemaphore.release();
  }

  // Wait for all current jobs to complete
  void WaitForAll() {
    // Efficient polling approach
    while (m_activeJobs.load(std::memory_order_acquire) > 0) {
      std::this_thread::yield();
    }
  }

  // Wait for all jobs with timeout
  bool WaitForAll(std::chrono::milliseconds timeout) {
    auto start = std::chrono::steady_clock::now();
    while (m_activeJobs.load(std::memory_order_acquire) > 0) {
      auto now = std::chrono::steady_clock::now();
      if (now - start > timeout) {
        return false;  // Timeout
      }
      std::this_thread::yield();
    }
    return true;  // All jobs completed
  }

  size_t GetWorkerCount() const { 
    return m_workers.size(); 
  }

  size_t GetQueueSize() const {
    detail::lock_guard lock(m_queueMutex);
    return m_tasks.size();
  }

  size_t GetActiveJobCount() const {
    return m_activeJobs.load(std::memory_order_acquire);
  }

  bool IsShuttingDown() const { 
    return m_shutdown.load(std::memory_order_acquire);
  }

  // Request graceful shutdown
  void RequestStop() {
    m_shutdown.store(true, std::memory_order_release);
    
    // Wake up all waiting workers
    for (size_t i = 0; i < m_workers.size(); ++i) {
      m_taskSemaphore.release();
    }
  }

 private:
  void WorkerThread(size_t threadId) {
#ifdef _WIN32
    // Set thread name for debugging (Windows)
    SetThreadDescription(
        GetCurrentThread(),
        (L"PlanetGen Worker " + std::to_wstring(threadId)).c_str());
#else
    // Set thread name for debugging (Linux)
    std::string threadName = "PlanetGen Worker " + std::to_string(threadId);
    pthread_setname_np(pthread_self(), threadName.c_str());
#endif

    while (!m_shutdown.load(std::memory_order_acquire)) {
      // Wait for task or shutdown
      if (!m_taskSemaphore.try_acquire_for(std::chrono::milliseconds(100))) {
        continue; // Timeout, check shutdown flag again
      }

      // Check shutdown after acquiring semaphore
      if (m_shutdown.load(std::memory_order_acquire)) {
        break;
      }

      std::function<void()> task;

      // Get task from queue
      {
        detail::lock_guard lock(m_queueMutex);
        if (!m_tasks.empty()) {
          task = std::move(m_tasks.front());
          m_tasks.pop();
        }
      }

      // Execute task outside of lock
      if (task) {
        try {
          task();
        } catch (const std::exception& e) {
#ifdef _DEBUG
          std::cerr << "Worker thread " << threadId
                    << " caught exception: " << e.what() << std::endl;
#endif
        } catch (...) {
#ifdef _DEBUG
          std::cerr << "Worker thread " << threadId
                    << " caught unknown exception" << std::endl;
#endif
        }

        // Decrement active jobs
        m_activeJobs.fetch_sub(1, std::memory_order_release);
      }
    }
  }

  void Shutdown() {
    // Request stop for all threads
    RequestStop();

    // Wait for all threads to finish
    for (auto& worker : m_workers) {
      if (worker.joinable()) {
        worker.join();
      }
    }

    // Clear any remaining tasks
    {
      detail::lock_guard lock(m_queueMutex);
      std::queue<std::function<void()>> empty;
      std::swap(m_tasks, empty);
    }
  }

 private:
  // Workers using regular std::thread
  std::vector<std::thread> m_workers;

  // Task queue
  std::queue<std::function<void()>> m_tasks;
  mutable detail::PlatformMutex m_queueMutex;

  // Cross-platform synchronization
  detail::PlatformSemaphore m_taskSemaphore;

  // Job completion tracking
  std::atomic<size_t> m_activeJobs;
  
  // Shutdown flag
  std::atomic<bool> m_shutdown;
};

}  // namespace PlanetGen::Core::Threading

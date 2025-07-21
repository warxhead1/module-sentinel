// JobSystem.ixx
module;

#pragma message("DEBUG: Compiling JobSystem.ixx module")

// Standard library includes in global module fragment
#include <string>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <functional>
#include <iostream>
#include <memory>
#include <mutex>
#include <optional>
#include <thread>
#include <type_traits>
#include <vector>
#include <cstring>
#include <algorithm>
#include <iterator>

#include <utility>
export module Core.Threading.JobSystem;

import ThreadPool;

export namespace PlanetGen::Core::Threading
{

  // Forward declarations
  class Job;
  template <typename T>
  class TypedJob;
  class JobHandle;

  // Job dependency management using raw pointers to avoid shared_ptr issues
  class JobDependency
  {
  public:
    void AddDependency(Job *job)
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      m_dependencies.push_back(job);
    }

    bool AreAllComplete() const;
    void WaitForAll();

  private:
    mutable std::mutex m_mutex;
    std::vector<Job *> m_dependencies;
  };

  // Base Job class
  class Job
  {
  public:
    Job(const char *name = "unnamed")
        : m_completed(false), m_started(false), m_name(name)
    {
      // Store the name safely to prevent memory corruption
      if (name && strlen(name) > 0)
      {
        m_nameStorage = std::string(name);
        m_name = m_nameStorage.c_str();
      }
      else
      {
        m_nameStorage = "unnamed";
        m_name = m_nameStorage.c_str();
      }
    }
    virtual ~Job() = default;

    // Execute the job
    void ExecuteInternal()
    {
      // Check if already started
      bool expected = false;
      if (!m_started.compare_exchange_strong(expected, true,
                                             std::memory_order_acq_rel,
                                             std::memory_order_acquire))
      {
        return; // Already started or completed
      }

      try
      {
        Execute();
        MarkComplete(true);
      }
      catch (...)
      {
        m_exception = std::current_exception();
        MarkComplete(false);
        std::cout << "DEBUG: Failed job '" << m_name << "'" << std::endl;
        throw;
      }
    }

    // Check if complete
    bool IsComplete() const
    {
      return m_completed.load(std::memory_order_acquire);
    }

    // Wait for completion
    void Wait()
    {
      std::unique_lock<std::mutex> lock(m_mutex);
      // Check if already completed before waiting
      if (m_completed.load(std::memory_order_acquire))
      {
        // Re-throw any exception that occurred during execution
        if (m_exception)
        {
          std::rethrow_exception(m_exception);
        }
        return;
      }

      m_condition.wait(
          lock, [this]
          { return m_completed.load(std::memory_order_acquire); });

      // Re-throw any exception that occurred during execution
      if (m_exception)
      {
        std::rethrow_exception(m_exception);
      }
    }

    // Wait with timeout
    bool WaitFor(std::chrono::milliseconds timeout)
    {
      std::unique_lock<std::mutex> lock(m_mutex);
      bool result = m_condition.wait_for(lock, timeout, [this]
                                         { return m_completed.load(std::memory_order_acquire); });

      if (result && m_exception)
      {
        std::rethrow_exception(m_exception);
      }

      return result;
    }

    // Add dependency
    void DependsOn(Job *other)
    {
      if (other && other != this)
      {
        m_dependencies.AddDependency(other);
      }
    }

    // Check if ready to run
    bool IsReady() const
    {
      return !m_started.load(std::memory_order_acquire) &&
             m_dependencies.AreAllComplete();
    }

    const char *GetName() const { return m_name; }

  protected:
    virtual void Execute() = 0;

    void MarkComplete(bool success)
    {
      {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_completed.store(true, std::memory_order_release);
        m_success = success;
      }
      m_condition.notify_all();
    }

  private:
    std::atomic<bool> m_completed;
    std::atomic<bool> m_started;
    bool m_success = false;
    mutable std::mutex m_mutex;
    mutable std::condition_variable m_condition;
    std::exception_ptr m_exception;
    JobDependency m_dependencies;
    const char *m_name;
    std::string m_nameStorage; // Store the name to prevent memory corruption
  };

  // Implementation of JobDependency methods
  inline bool JobDependency::AreAllComplete() const
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    for (const auto *job : m_dependencies)
    {
      // Use atomic load to check completion safely
      if (job && !job->IsComplete())
      {
        return false;
      }
    }
    return true;
  }

  inline void JobDependency::WaitForAll()
  {
    std::vector<Job *> jobs;
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      jobs = m_dependencies;
    }
    for (auto *job : jobs)
    {
      if (job)
      {
        job->Wait();
      }
    }
  }

  // Typed job with result
  template <typename T>
  class TypedJob : public Job
  {
  public:
    explicit TypedJob(std::function<T()> func, const char *name = "unnamed")
        : Job(name), m_function(std::move(func)) {}

    T GetResult()
    {
      Wait();
      if constexpr (!std::is_void_v<T>)
      {
        return std::move(m_result.value());
      }
    }

    // Get result with timeout
    std::optional<T> GetResultTimeout(std::chrono::milliseconds timeout)
    {
      if (WaitFor(timeout))
      {
        if constexpr (!std::is_void_v<T>)
        {
          return std::move(m_result.value());
        }
        else
        {
          return std::nullopt;
        }
      }
      return std::nullopt;
    }

  protected:
    void Execute() override
    {
      if constexpr (std::is_void_v<T>)
      {
        m_function();
      }
      else
      {
        m_result = m_function();
      }
    }

  private:
    std::function<T()> m_function;
    std::conditional_t<std::is_void_v<T>, std::monostate, std::optional<T>>
        m_result;
  };

  // Specialization for void
  template <>
  class TypedJob<void> : public Job
  {
  public:
    explicit TypedJob(std::function<void()> func, const char *name = "unnamed")
        : Job(name), m_function(std::move(func)) {}

    void GetResult() { Wait(); }

    bool GetResultTimeout(std::chrono::milliseconds timeout)
    {
      return WaitFor(timeout);
    }

  protected:
    void Execute() override { m_function(); }

  private:
    std::function<void()> m_function;
  };

  // Job handle for easier management
  class JobHandle
  {
  public:
    JobHandle() = default;
    explicit JobHandle(Job *job) : m_job(job) {}

    bool IsValid() const { return m_job != nullptr; }
    bool IsComplete() const { return m_job && m_job->IsComplete(); }
    void Wait()
    {
      if (m_job)
        m_job->Wait();
    }
    bool WaitFor(std::chrono::milliseconds timeout)
    {
      return m_job ? m_job->WaitFor(timeout) : true;
    }

    Job *GetJob() const { return m_job; }

  private:
    Job *m_job;
  };

  // Job system
  class JobSystem
  {
  public:
    static JobSystem &Instance()
    {
      static JobSystem instance;
      return instance;
    }

    // Create a job with required name
    template <typename T>
    TypedJob<T> *CreateJob(std::function<T()> func, const char *name)
    {
      if (!name || strlen(name) == 0)
      {
        throw std::invalid_argument("Job name cannot be empty");
      }
      return new TypedJob<T>(std::move(func), name);
    }

    // Schedule a job
    JobHandle Schedule(Job *job)
    {
      if (!job)
      {
        return JobHandle();
      }

      if (!job->GetName() || strlen(job->GetName()) == 0)
      {
        throw std::invalid_argument("Cannot schedule job without a name");
      }

      // Store job name before scheduling to avoid race condition
      std::string jobName = job->GetName();

      // Track active jobs
      {
        std::lock_guard<std::mutex> lock(m_activeJobsMutex);
        m_activeJobNames.push_back(jobName);
      }

      // Wait for dependencies before scheduling
      m_threadPool.Submit([this, job, jobName]()
                          {
      // Wait until the job is ready (dependencies complete)
      int spinCount = 0;
      while (!job->IsReady()) {
        if (spinCount < 1000) {
          spinCount++;
          continue;
        }
        spinCount = 0;
        std::this_thread::yield();
      }

      try {
        job->ExecuteInternal();
      } catch (...) {
        // Remove from active jobs even if job fails
        std::lock_guard<std::mutex> lock(m_activeJobsMutex);
        auto it = std::find(m_activeJobNames.begin(), m_activeJobNames.end(), jobName);
        if (it != m_activeJobNames.end()) {
          m_activeJobNames.erase(it);
        }
        throw;
      }

      // Remove from active jobs after completion
      std::lock_guard<std::mutex> lock(m_activeJobsMutex);
      auto it = std::find(m_activeJobNames.begin(), m_activeJobNames.end(), jobName);
      if (it != m_activeJobNames.end()) {
        m_activeJobNames.erase(it);
      } });

      return JobHandle(job);
    }

    // Create and schedule a job
    template <typename T>
    std::pair<TypedJob<T> *, JobHandle> CreateAndSchedule(
        std::function<T()> func, const char *name = "unnamed")
    {
      auto *job = CreateJob<T>(std::move(func), name);
      auto handle = Schedule(job);
      return {job, handle};
    }

    // Batch job execution
    template <typename T>
    std::vector<TypedJob<T> *> CreateBatch(
        const std::vector<std::function<T()>> &funcs)
    {
      std::vector<TypedJob<T> *> jobs;
      jobs.reserve(funcs.size());

      // Store job names to prevent memory corruption
      std::vector<std::string> jobNames;
      jobNames.reserve(funcs.size());

      for (size_t i = 0; i < funcs.size(); ++i)
      {
        jobNames.emplace_back("BatchJob_" + std::to_string(i));
        jobs.push_back(CreateJob<T>(funcs[i], jobNames.back().c_str()));
      }

      return jobs;
    }

    // Schedule batch
    std::vector<JobHandle> ScheduleBatch(const std::vector<Job *> &jobs)
    {
      std::vector<JobHandle> handles;
      handles.reserve(jobs.size());

      for (const auto &job : jobs)
      {
        handles.push_back(Schedule(job));
      }

      return handles;
    }

    // Parallel for loop
    template <typename Func>
    void ParallelFor(size_t start, size_t end, size_t chunkSize, Func func)
    {
      if (start >= end)
        return;

      // Check for re-entrance - if we're already in a parallel execution, use sequential
      thread_local static bool inParallelExecution = false;
      if (inParallelExecution) {
        std::cout << "DEBUG: ParallelFor re-entrance detected, using sequential execution" << std::endl;
        // Sequential execution to prevent deadlock
        for (size_t i = start; i < end; ++i) {
          func(i);
        }
        return;
      }
      
      // Set main thread flag
      inParallelExecution = true;

      std::vector<Job *> jobs;
      size_t chunkIndex = 0;

      // Store job names to prevent memory corruption
      std::vector<std::string> jobNames;

      for (size_t i = start; i < end; i += chunkSize)
      {
        size_t chunkEnd = std::min(i + chunkSize, end);
        size_t currentChunk = chunkIndex++;

        jobNames.emplace_back("ParallelFor::Chunk_" +
                              std::to_string(currentChunk));

        auto *job = CreateJob<void>(
            [func, i, chunkEnd]()
            {
              // Set re-entrance flag for this thread
              thread_local static bool inParallelExecution = false;
              inParallelExecution = true;
              
              for (size_t j = i; j < chunkEnd; ++j)
              {
                func(j);
              }
              
              inParallelExecution = false;
            },
            jobNames.back().c_str());

        jobs.push_back(job);
      }

      auto handles = ScheduleBatch(jobs);

      // Wait for all to complete
      for (auto &handle : handles)
      {
        handle.Wait();
      }

      // Clean up jobs
      for (auto *job : jobs)
      {
        delete job;
      }
      
      // Clear main thread flag
      inParallelExecution = false;
    }

    // Wait for all jobs
    void WaitForAll()
    {

      // Get list of active jobs
      {
        std::lock_guard<std::mutex> lock(m_activeJobsMutex);
        if (!m_activeJobNames.empty())
        {
          std::cout << "DEBUG: Active job names:" << std::endl;
          for (const auto &name : m_activeJobNames)
          {
            std::cout << "  - " << name << std::endl;
          }
        }
      }

      m_threadPool.WaitForAll();

      // Verify no jobs are left
      {
        std::lock_guard<std::mutex> lock(m_activeJobsMutex);
        if (!m_activeJobNames.empty())
        {
          std::cout << "WARNING: Jobs still active after WaitForAll:"
                    << std::endl;
          for (const auto &name : m_activeJobNames)
          {
            std::cout << "  - " << name << std::endl;
          }
        }
      }
    }

    bool WaitForAll(std::chrono::milliseconds timeout)
    {
      return m_threadPool.WaitForAll(timeout);
    }

    size_t GetWorkerCount() const { return m_threadPool.GetWorkerCount(); }

    size_t GetPendingJobCount() const
    {
      return m_threadPool.GetQueueSize() + m_threadPool.GetActiveJobCount();
    }

  private:
    JobSystem() : m_threadPool(std::thread::hardware_concurrency()) {}
    ~JobSystem() = default;

    // Delete copy and move
    JobSystem(const JobSystem &) = delete;
    JobSystem &operator=(const JobSystem &) = delete;
    JobSystem(JobSystem &&) = delete;
    JobSystem &operator=(JobSystem &&) = delete;

    ThreadPool m_threadPool;
    std::mutex m_activeJobsMutex;
    std::vector<std::string> m_activeJobNames; // Track active job names
  };

  // Helper functions for common patterns
  template <typename T>
  TypedJob<T> *MakeJob(std::function<T()> func, const char *name = "unnamed")
  {
    return JobSystem::Instance().CreateJob<T>(std::move(func), name);
  }

  template <typename T>
  auto ScheduleJob(std::function<T()> func, const char *name = "unnamed")
  {
    return JobSystem::Instance().CreateAndSchedule<T>(std::move(func), name);
  }

  // Specialized job for command buffer execution
  class CommandBufferExecutionJob : public Job
  {
  public:
    explicit CommandBufferExecutionJob(
        std::function<void()> execFunc,
        std::function<void(std::chrono::nanoseconds)> completionCallback = nullptr,
        const char *name = "CommandBufferExecution")
        : Job(name),
          m_execFunc(std::move(execFunc)),
          m_completionCallback(std::move(completionCallback)) {}

  protected:
    void Execute() override
    {
      auto start = std::chrono::high_resolution_clock::now();

      // Execute the command buffer
      m_execFunc();

      auto end = std::chrono::high_resolution_clock::now();
      auto duration = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start);

      // Call the completion callback with execution duration
      if (m_completionCallback)
      {
        m_completionCallback(duration);
      }
    }

  private:
    std::function<void()> m_execFunc;
    std::function<void(std::chrono::nanoseconds)> m_completionCallback;
  };

  // Specialized batch job type for planet generation
  class PlanetGenBatchJob : public Job
  {
  public:
    struct PlanetChunkParams
    {
      int chunkX;
      int chunkY;
      float planetRadius;
      int resolution;
      uint32_t seed;
      // Add other parameters as needed
    };

    explicit PlanetGenBatchJob(
        std::vector<PlanetChunkParams> chunks,
        std::function<void(const PlanetChunkParams &)> processFunc,
        const char *name = "PlanetGenBatch")
        : Job(name),
          m_chunks(std::move(chunks)),
          m_processFunc(std::move(processFunc)) {}

  protected:
    void Execute() override
    {
      for (const auto &chunk : m_chunks)
      {
        m_processFunc(chunk);
      }
    }

  private:
    std::vector<PlanetChunkParams> m_chunks;
    std::function<void(const PlanetChunkParams &)> m_processFunc;
  };

  // Job chain builder for complex dependencies
  class JobChain
  {
  public:
    JobChain &Then(Job *job)
    {
      if (!m_jobs.empty())
      {
        job->DependsOn(m_jobs.back());
      }
      m_jobs.push_back(job);
      return *this;
    }

    template <typename T>
    JobChain &Then(std::function<T()> func)
    {
      auto *job = MakeJob<T>(std::move(func));
      return Then(job);
    }

    std::vector<JobHandle> Schedule()
    {
      std::vector<JobHandle> handles;
      for (auto *job : m_jobs)
      {
        handles.push_back(JobSystem::Instance().Schedule(job));
      }
      return handles;
    }

  private:
    std::vector<Job *> m_jobs;
  };

  // Helper functions for specialized jobs
  inline CommandBufferExecutionJob *CreateCommandBufferJob(
      std::function<void()> execFunc,
      std::function<void(std::chrono::nanoseconds)> completionCallback = nullptr,
      const char *name = "CommandBufferExecution")
  {
    return new CommandBufferExecutionJob(
        std::move(execFunc),
        std::move(completionCallback),
        name);
  }

  inline PlanetGenBatchJob *CreatePlanetGenBatchJob(
      std::vector<PlanetGenBatchJob::PlanetChunkParams> chunks,
      std::function<void(const PlanetGenBatchJob::PlanetChunkParams &)> processFunc,
      const char *name = "PlanetGenBatch")
  {
    return new PlanetGenBatchJob(
        std::move(chunks),
        std::move(processFunc),
        name);
  }

  inline std::pair<CommandBufferExecutionJob *, JobHandle> ScheduleCommandBufferExecution(
      std::function<void()> execFunc,
      std::function<void(std::chrono::nanoseconds)> completionCallback = nullptr,
      const char *name = "CommandBufferExecution")
  {
    auto *job = CreateCommandBufferJob(
        std::move(execFunc),
        std::move(completionCallback),
        name);
    auto handle = JobSystem::Instance().Schedule(job);
    return {job, handle};
  }

  inline std::pair<PlanetGenBatchJob *, JobHandle> SchedulePlanetGenBatch(
      std::vector<PlanetGenBatchJob::PlanetChunkParams> chunks,
      std::function<void(const PlanetGenBatchJob::PlanetChunkParams &)> processFunc,
      const char *name = "PlanetGenBatch")
  {
    auto *job = CreatePlanetGenBatchJob(
        std::move(chunks),
        std::move(processFunc),
        name);
    auto handle = JobSystem::Instance().Schedule(job);
    return {job, handle};
  }

} // namespace PlanetGen::Core::Threading

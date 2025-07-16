module;

#include <vulkan/vulkan.h>

#include <iostream>
#include <memory>
#include <mutex>
#include <functional>

#include <exception>
#include <string>
export module VulkanManager;

import VulkanBase;
import VulkanTypes;
import Core.Threading.JobSystem;
import ShaderManager;
import BufferManagement;
import VulkanCommandBufferManager;
import CommandBufferCore;
import TimelineSynchronization;
import Core.Threading.ThreadContextChecker;

export namespace PlanetGen::Rendering {

class VulkanManager {
 public:
  static VulkanManager& GetInstance() {
    static VulkanManager instance;
    return instance;
  }
  VulkanManager(const VulkanManager&) = delete;
  VulkanManager& operator=(const VulkanManager&) = delete;
  VulkanManager(VulkanManager&&) = delete;
  VulkanManager& operator=(VulkanManager&&) = delete;
  // NOTE: The job system or any background threads MUST NOT be started until after
  // VulkanManager, VulkanRenderSystem, and all resource/descriptor managers are fully initialized.
  // This is required to avoid cross-thread static/module initialization bugs.
  bool Initialize() {
    // Note: Vulkan initialization can happen on any thread, but UI operations need UI thread
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_vulkanBase) {
      return m_initializationSuccess;
    }

    // THREADING FIX: Initialize synchronously to avoid cross-thread context issues
    try {
      std::cout << "[VulkanManager] Initializing VulkanBase synchronously..." << std::endl;
      m_vulkanBase = std::make_unique<VulkanBase>();
      m_vulkanBase->SetDebugCallback([](const std::string& message) {
        std::cerr << "[VulkanBase] " << message << std::endl;
      });
      
      m_initializationSuccess = m_vulkanBase->InitializeCore();
      if (m_initializationSuccess && m_pendingSurface != VK_NULL_HANDLE) {
        m_vulkanBase->SetSurface(m_pendingSurface);
      }
      
      if (!m_initializationSuccess) {
        m_vulkanBase.reset();
      }
      
      std::cout << "[VulkanManager] VulkanBase initialization " 
                << (m_initializationSuccess ? "succeeded" : "failed") << std::endl;
      return m_initializationSuccess;
    } catch (const std::exception& e) {
      std::cerr << "Vulkan initialization failed: " << e.what() << std::endl;
      m_vulkanBase.reset();
      m_initializationSuccess = false;
      return false;
    }
  }
  bool IsInitializationComplete() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_vulkanBase != nullptr;
  }
  bool WaitForInitialization() {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_vulkanBase != nullptr && m_initializationSuccess;
  }
  void Cleanup() {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_vulkanBase) {
      return;
    }
    
    // Ensure all command buffers are properly cleaned up before destroying managers
    std::cout << "[VulkanManager] Shutting down command buffer management..." << std::endl;
    // New modular command buffer system cleans up automatically via ThreadLocalCommandPools
    
    std::cout << "[VulkanManager] Shutting down buffer management..." << std::endl;
    BufferManagementSystem::Instance().Shutdown();
    
    std::cout << "[VulkanManager] Shutting down shader manager..." << std::endl;
    ShaderManager::GetInstance().Cleanup();
    
    std::cout << "[VulkanManager] Shutting down Vulkan core..." << std::endl;
    m_vulkanBase->CleanupCore();
    m_vulkanBase.reset();
    m_initializationSuccess = false;
  }
  VulkanBase* GetVulkanBase() {
    std::lock_guard<std::mutex> lock(m_mutex);
    // Return external VulkanBase if set, otherwise return internal one
    return m_externalVulkanBase ? m_externalVulkanBase : m_vulkanBase.get();
  }
  VkDevice GetDevice() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_vulkanBase ? m_vulkanBase->GetDevice() : VK_NULL_HANDLE;
  }
  bool IsInitialized() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_vulkanBase && m_vulkanBase->IsInitialized() && m_initializationSuccess;
  }
  void WaitForDeviceIdle() {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_vulkanBase) {
      vkDeviceWaitIdle(m_vulkanBase->GetDevice());
    }
  }

  void WaitForGraphicsQueue() {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_vulkanBase) {
      // Use TimelineSemaphoreManager for thread-safe queue operations
      auto& timelineManager = TimelineSemaphoreManager::Instance();
      auto currentValue = timelineManager.GetCurrentTimelineValue(CommandBufferCategory::Graphics);
      timelineManager.WaitForTimelineValue(CommandBufferCategory::Graphics, currentValue);
    }
  }

  void WaitForComputeQueue() {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_vulkanBase) {
      // Use TimelineSemaphoreManager for thread-safe queue operations
      auto& timelineManager = TimelineSemaphoreManager::Instance();
      auto currentValue = timelineManager.GetCurrentTimelineValue(CommandBufferCategory::Compute);
      timelineManager.WaitForTimelineValue(CommandBufferCategory::Compute, currentValue);
    }
  }
  void Shutdown() {
    auto device = GetDevice();
    if (device != VK_NULL_HANDLE) {
      std::cout << "[VulkanManager] Waiting for JobSystem to complete..." << std::endl;
      
      // Wait for jobs with timeout to prevent hangs
      auto& jobSystem = Core::Threading::JobSystem::Instance();
      bool completed = jobSystem.WaitForAll(std::chrono::milliseconds(5000)); // 5 second timeout
      
      if (!completed) {
        std::cout << "[VulkanManager] WARNING: JobSystem did not complete within 5 seconds, forcing shutdown" << std::endl;
        std::cout << "[VulkanManager] Pending jobs: " << jobSystem.GetPendingJobCount() << std::endl;
      } else {
        std::cout << "[VulkanManager] JobSystem completed successfully" << std::endl;
      }
      
      Cleanup();
    }
  }

  // NOTE: ExecuteOnVulkanThread methods removed since we now use synchronous initialization
  // All operations now happen on the main thread, eliminating cross-thread context issues

  void SetSurface(VkSurfaceKHR surface) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_pendingSurface = surface;
    if (m_vulkanBase) {
      // Note: This assumes VulkanBase has a SetSurface method or we store it in m_surface
    }
  }
  
  // Set an externally created VulkanBase instance
  // This must be called before any other components try to use VulkanManager
  void SetExternalVulkanBase(VulkanBase* vulkanBase) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_vulkanBase) {
      std::cerr << "[VulkanManager] Warning: Replacing existing VulkanBase instance" << std::endl;
    }
    m_externalVulkanBase = vulkanBase;
    m_initializationSuccess = (vulkanBase != nullptr);
  }

 private:
  VulkanManager() = default;
  ~VulkanManager() { Cleanup(); }

  std::unique_ptr<VulkanBase> m_vulkanBase;
  VulkanBase* m_externalVulkanBase = nullptr; // Non-owning pointer to external VulkanBase
  mutable std::mutex m_mutex;
  bool m_initializationSuccess = false;
  VkSurfaceKHR m_pendingSurface = VK_NULL_HANDLE;
};

}  // namespace PlanetGen::Rendering

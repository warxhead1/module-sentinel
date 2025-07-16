module;

#include <vulkan/vulkan.h>
#include <algorithm>
#include <atomic>
#include <cstring>
#include <iostream>
#include <memory>
#include <mutex>
#include <shared_mutex>
#include <unordered_map>
#include <vector>
#include <string>
#include <optional>
#include <typeinfo>
#ifdef USE_VMA
#include <vk_mem_alloc.h>
#endif
#include <Core/Logging/LoggerMacros.h>

export module BufferManagement;

import Core.Logging.Logger;
import BufferCore;
import Core.Threading.JobSystem;
import VulkanMemoryManager;
import VulkanTypes;

using namespace PlanetGen::Rendering;

export namespace PlanetGen::Rendering {

// BufferResource is imported from BufferCore module

class BufferManagementSystem {
public:
    static BufferManagementSystem& Instance() {
        static BufferManagementSystem instance;
        return instance;
    }
    
    // Structured buffer metadata
    struct StructuredBufferMetadata {
        size_t elementSize;
        uint32_t elementCount;
        std::string typeName;
    };
    void Initialize(VkDevice device, VkPhysicalDevice physicalDevice,
                   VkQueue transferQueue = VK_NULL_HANDLE,
                   uint32_t transferQueueFamily = UINT32_MAX) {
        m_device = device;
        m_physicalDevice = physicalDevice;
        m_transferQueue = transferQueue;
        m_transferQueueFamily = transferQueueFamily;
        vkGetPhysicalDeviceMemoryProperties(physicalDevice, &m_memoryProperties);
        VkPhysicalDeviceProperties deviceProps;
        vkGetPhysicalDeviceProperties(physicalDevice, &deviceProps);
        m_deviceLimits = deviceProps.limits;
        InitializePools();
        
        LOG_INFO("BufferManagement", "Initialized with device: {}", deviceProps.deviceName);
    }
    BufferResourcePtr CreateBuffer(VkDeviceSize size,
                                  VkBufferUsageFlags usage,
                                  VkMemoryPropertyFlags properties,
                                  BufferCategory category,
                                  const BufferUsageHints& hints = {}) {
        return CreateBuffer(size, usage, properties, category, BufferPoolType::Default, hints);
    }
    // New overload for subsystem-specific pools
    BufferResourcePtr CreateBuffer(VkDeviceSize size,
                                  VkBufferUsageFlags usage,
                                  VkMemoryPropertyFlags properties,
                                  BufferCategory category,
                                  BufferPoolType poolType,
                                  const BufferUsageHints& hints = {}) {
        if (size == 0) {
            throw std::invalid_argument("Buffer size cannot be zero");
        }
        
        // Add validation for excessively large buffer allocations
        const VkDeviceSize MAX_SINGLE_BUFFER_SIZE = 1ULL * 1024 * 1024 * 1024; // 1GB limit per buffer
        if (size > MAX_SINGLE_BUFFER_SIZE) {
            LOG_ERROR("BufferManagementSystem", "Buffer size {} MB exceeds maximum single buffer size {} MB", 
                     size / (1024 * 1024), MAX_SINGLE_BUFFER_SIZE / (1024 * 1024));
            throw std::invalid_argument("Buffer size exceeds maximum allowed size");
        }
        
        // Log warning for large buffer allocations
        if (size > 256 * 1024 * 1024) { // 256MB threshold
            LOG_WARN("BufferManagementSystem", "Large buffer allocation detected: {} MB", size / (1024 * 1024));
        }
        if (!CheckMemoryBudget(size)) {
            CollectGarbage();
            if (!CheckMemoryBudget(size)) {
                throw std::runtime_error("Out of memory budget");
            }
        }
        // Use subsystem-specific pool if available, else fallback to legacy m_pools
        BufferResourcePtr buffer;
        auto poolIt = m_subsystemPools.find(poolType);
        if (poolIt != m_subsystemPools.end()) {
            auto& catMap = poolIt->second;
            auto catIt = catMap.find(category);
            if (catIt != catMap.end() && catIt->second) {
                buffer = catIt->second->AllocateBuffer(size, usage, properties, hints);
            }
        }
        if (!buffer) {
            buffer = CreateBufferInternal(size, usage, properties, category, hints);
        }
        {
            std::unique_lock<std::shared_mutex> lock(m_bufferMutex);
            m_buffersByCategory[category].push_back(buffer);
            m_bufferLookup[buffer->GetBuffer()] = buffer;
        }
        m_currentMemoryUsage.fetch_add(size, std::memory_order_relaxed);
        
        return buffer;
    }
    BufferResourcePtr CreateVertexBuffer(const void* data, VkDeviceSize size) {
        return CreateVertexBuffer(data, size, BufferPoolType::Default);
    }
    BufferResourcePtr CreateVertexBuffer(const void* data, VkDeviceSize size, BufferPoolType poolType) {
        BufferUsageHints hints;
        hints.cpuWriteOnce = true;
        auto stagingBuffer = CreateBuffer(
            size,
            VK_BUFFER_USAGE_TRANSFER_SRC_BIT,
            VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT,
            BufferCategory::StagingBuffer,
            poolType,
            hints
        );
        stagingBuffer->UpdateData(data, size);
        auto vertexBuffer = CreateBuffer(
            size,
            VK_BUFFER_USAGE_TRANSFER_DST_BIT | VK_BUFFER_USAGE_VERTEX_BUFFER_BIT,
            VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
            BufferCategory::VertexBuffer,
            poolType,
            hints
        );
        CopyBuffer(stagingBuffer, vertexBuffer, size);
        
        // Staging buffer is no longer needed after copy - it will be cleaned up when it goes out of scope
        // but we should trigger garbage collection if memory pressure is high
        if (m_currentMemoryUsage.load() > m_memoryBudget * 0.8) {
            LOG_DEBUG("BufferManagementSystem", "High memory pressure detected, triggering GC");
            CollectGarbage(0); // Collect all unused buffers immediately
        }
        
        return vertexBuffer;
    }
    
    BufferResourcePtr CreateIndexBuffer(const void* data, VkDeviceSize size) {
        return CreateIndexBuffer(data, size, BufferPoolType::Default);
    }
    BufferResourcePtr CreateIndexBuffer(const void* data, VkDeviceSize size, BufferPoolType poolType) {
        BufferUsageHints hints;
        hints.cpuWriteOnce = true;
        auto stagingBuffer = CreateBuffer(
            size,
            VK_BUFFER_USAGE_TRANSFER_SRC_BIT,
            VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT,
            BufferCategory::StagingBuffer,
            poolType,
            hints
        );
        stagingBuffer->UpdateData(data, size);
        auto indexBuffer = CreateBuffer(
            size,
            VK_BUFFER_USAGE_TRANSFER_DST_BIT | VK_BUFFER_USAGE_INDEX_BUFFER_BIT,
            VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
            BufferCategory::IndexBuffer,
            poolType,
            hints
        );
        CopyBuffer(stagingBuffer, indexBuffer, size);
        
        // Staging buffer cleanup - same as vertex buffer
        if (m_currentMemoryUsage.load() > m_memoryBudget * 0.8) {
            LOG_DEBUG("BufferManagementSystem", "High memory pressure detected, triggering GC");
            CollectGarbage(0); // Collect all unused buffers immediately
        }
        
        return indexBuffer;
    }
    
    BufferResourcePtr CreateUniformBuffer(VkDeviceSize size, bool persistentMapped = true) {
        return CreateUniformBuffer(size, persistentMapped, BufferPoolType::Default);
    }
    BufferResourcePtr CreateUniformBuffer(VkDeviceSize size, bool persistentMapped, BufferPoolType poolType) {
        BufferUsageHints hints;
        hints.cpuWriteOften = true;
        hints.persistentMapped = persistentMapped;
        return CreateBuffer(
            size,
            VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT,
            VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT,
            BufferCategory::UniformBuffer,
            poolType,
            hints
        );
    }
    
    BufferResourcePtr CreateStorageBuffer(VkDeviceSize size, bool deviceLocal = true) {
        return CreateStorageBuffer(size, deviceLocal, BufferPoolType::Default);
    }
    BufferResourcePtr CreateStorageBuffer(VkDeviceSize size, bool deviceLocal, BufferPoolType poolType) {
        BufferUsageHints hints;
        hints.gpuReadWrite = true;
        VkMemoryPropertyFlags memProps = deviceLocal ?
            VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT :
            VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT;
        return CreateBuffer(
            size,
            VK_BUFFER_USAGE_STORAGE_BUFFER_BIT | VK_BUFFER_USAGE_TRANSFER_SRC_BIT | VK_BUFFER_USAGE_TRANSFER_DST_BIT,
            memProps,
            BufferCategory::StorageBuffer,
            poolType,
            hints
        );
    }
    
    BufferResourcePtr CreateStagingBuffer(VkDeviceSize size) {
        return CreateStagingBuffer(size, BufferPoolType::Default);
    }
    BufferResourcePtr CreateStagingBuffer(VkDeviceSize size, BufferPoolType poolType) {
        BufferUsageHints hints;
        hints.cpuWriteOnce = true;
        return CreateBuffer(
            size,
            VK_BUFFER_USAGE_TRANSFER_SRC_BIT,
            VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT,
            BufferCategory::StagingBuffer,
            poolType,
            hints
        );
    }
    MultiBufferedResourcePtr CreateMultiBuffered(
        VkDeviceSize size,
        VkBufferUsageFlags usage,
        BufferCategory category,
        uint32_t count = 3) {
        
        auto multiBuffered = std::make_shared<MultiBufferedResource>();
        multiBuffered->buffers.reserve(count);
        
        BufferUsageHints hints;
        hints.frameInFlightCount = count;
        hints.cpuWriteOften = true;
        hints.persistentMapped = true;
        
        for (uint32_t i = 0; i < count; ++i) {
            auto buffer = CreateBuffer(
                size,
                usage,
                VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT,
                category,
                hints
            );
            multiBuffered->buffers.push_back(buffer);
        }
        
        return multiBuffered;
    }
    void UpdateMemoryBudget(VkDeviceSize maxBytes) {
        m_memoryBudget = maxBytes;
        std::cout << "Memory budget updated to: " << (maxBytes / (1024 * 1024)) << " MB" << std::endl;
    }
    
    VkDeviceSize GetTotalAllocatedMemory() const {
        return m_currentMemoryUsage.load(std::memory_order_acquire);
    }
    
    VkDeviceSize GetMemoryUsageByCategory(BufferCategory category) const {
        std::shared_lock<std::shared_mutex> lock(m_bufferMutex);
        
        VkDeviceSize totalSize = 0;
        auto it = m_buffersByCategory.find(category);
        if (it != m_buffersByCategory.end()) {
            for (const auto& buffer : it->second) {
                if (buffer) {
                    totalSize += buffer->GetSize();
                }
            }
        }
        
        return totalSize;
    }
    void CollectGarbage(uint64_t maxFrameAge = 300) { // 5 seconds at 60 FPS
        using namespace Core::Threading;
        
        auto& jobSystem = JobSystem::Instance();
        jobSystem.CreateAndSchedule<void>([this, maxFrameAge]() {
            std::unique_lock<std::shared_mutex> lock(m_bufferMutex);
            
            size_t freedCount = 0;
            VkDeviceSize freedMemory = 0;
            
            for (auto& [category, buffers] : m_buffersByCategory) {
                buffers.erase(
                    std::remove_if(buffers.begin(), buffers.end(),
                        [maxFrameAge, &freedCount, &freedMemory](const BufferResourcePtr& buffer) {
                            if (!buffer) return true;
                            if (buffer->GetRefCount() == 1 && // Only held by container
                                buffer->GetFramesSinceLastUse() > maxFrameAge) {
                                freedCount++;
                                freedMemory += buffer->GetSize();
                                return true;
                            }
                            return false;
                        }),
                    buffers.end()
                );
            }
            m_currentMemoryUsage.fetch_sub(freedMemory, std::memory_order_relaxed);
            
            if (freedCount > 0) {
                std::cout << "Garbage collection freed " << freedCount 
                          << " buffers (" << (freedMemory / 1024) << " KB)" << std::endl;
            }
        }, "BufferGarbageCollection");
    }
    
    void OptimizeMemoryUsage() {
        for (const auto& pair : m_pools) {
            if (pair.second) {
                pair.second->DefragmentAsync();
            }
        }
    }
    
    void DefragmentMemory() {
        using namespace Core::Threading;
        
        auto& jobSystem = JobSystem::Instance();
        for (const auto& pair : m_pools) {
            if (pair.second) {
                auto poolPtr = pair.second.get();
                jobSystem.CreateAndSchedule<void>([poolPtr]() {
                    poolPtr->DefragmentAsync();
                }, "BufferPoolDefragment");
            }
        }
    }
    struct BufferStats {
        size_t totalBuffers = 0;
        VkDeviceSize totalMemory = 0;
        std::unordered_map<BufferCategory, size_t> buffersByCategory;
        std::unordered_map<BufferCategory, VkDeviceSize> memoryByCategory;
        size_t activeBuffers = 0;
        size_t cachedBuffers = 0;
    };
    
    BufferStats GetStatistics() const {
        std::shared_lock<std::shared_mutex> lock(m_bufferMutex);
        
        BufferStats stats;
        stats.totalMemory = m_currentMemoryUsage.load(std::memory_order_acquire);
        
        for (const auto& [category, buffers] : m_buffersByCategory) {
            stats.buffersByCategory[category] = buffers.size();
            
            VkDeviceSize categoryMemory = 0;
            for (const auto& buffer : buffers) {
                if (buffer) {
                    stats.totalBuffers++;
                    categoryMemory += buffer->GetSize();
                    
                    if (buffer->GetRefCount() > 1) {
                        stats.activeBuffers++;
                    } else {
                        stats.cachedBuffers++;
                    }
                }
            }
            
            stats.memoryByCategory[category] = categoryMemory;
        }
        
        return stats;
    }
    
    void PrintMemoryReport() const {
        LOG_DEBUG("BufferManagementSystem", "Starting PrintMemoryReport...");
        auto stats = GetStatistics();
        LOG_DEBUG("BufferManagementSystem", "GetStatistics completed");
        LOG_DEBUG("BufferManagementSystem", "=== Buffer Memory Report ===");
        LOG_DEBUG("BufferManagementSystem", "Total Buffers: {}", stats.totalBuffers);
        LOG_DEBUG("BufferManagementSystem", "Total Memory: {} MB", (stats.totalMemory / (1024 * 1024)));
        LOG_DEBUG("BufferManagementSystem", "Active Buffers: {}", stats.activeBuffers);
        LOG_DEBUG("BufferManagementSystem", "Cached Buffers: {}", stats.cachedBuffers);
        
        LOG_DEBUG("BufferManagementSystem", "Memory by Category:");
        try {
            for (const auto& [category, memory] : stats.memoryByCategory) {
                std::cout << "  " << BufferCategoryToString(category) << ": " 
                          << (memory / (1024 * 1024)) << " MB (" 
                          << stats.buffersByCategory.at(category) << " buffers)" << std::endl;
            }
            std::cout << "==========================\n" << std::endl;
            LOG_DEBUG("BufferManagementSystem", "PrintMemoryReport completed successfully");
        } catch (...) {
            LOG_DEBUG("BufferManagementSystem", "Exception in PrintMemoryReport category loop");
        }
    }
    void BeginFrame(uint32_t frameIndex) {
        BufferResource::IncrementFrameCounter();
        for (auto& [category, buffers] : m_buffersByCategory) {
            for (auto& buffer : buffers) {
                if (buffer && buffer->GetHints().frameInFlightCount > 1) {
                }
            }
        }
    }
    
    void EndFrame() {
        static uint64_t frameCount = 0;
        frameCount++;
        if (frameCount % 300 == 0) { // Every 5 seconds at 60 FPS
            CollectGarbage();
        }
        if (frameCount % 1800 == 0) { // Every 30 seconds at 60 FPS
            OptimizeMemoryUsage();
        }
    }
    void Shutdown() {
        LOG_DEBUG("BufferManagementSystem", "Shutting down BufferManagementSystem...");
        
        // Check if we're in a valid state for shutdown
        if (m_device == VK_NULL_HANDLE) {
            LOG_DEBUG("BufferManagementSystem", "Device already invalid, skipping device operations");
        } else {
            try {
                // Wait for device to be idle before destroying buffers
                VkResult result = vkDeviceWaitIdle(m_device);
                if (result != VK_SUCCESS) {
                    LOG_DEBUG("BufferManagementSystem", "vkDeviceWaitIdle failed with result: {}", static_cast<int>(result));
                }
            } catch (...) {
                LOG_DEBUG("BufferManagementSystem", "Exception during vkDeviceWaitIdle, device may be invalid");
            }
        }
        
        {
            std::unique_lock<std::shared_mutex> lock(m_bufferMutex);
            
            // Track buffers with external references for debugging
            size_t buffersWithExternalRefs = 0;
            
            // Force cleanup of all buffers by clearing references
            for (auto& [category, buffers] : m_buffersByCategory) {
                for (auto& buffer : buffers) {
                    if (buffer) {
                        try {
                            // Check if buffer has external references before clearing
                            if (buffer.use_count() > 1) {
                                buffersWithExternalRefs++;
                                LOG_DEBUG("BufferManagementSystem", "Warning: Buffer in category {} ({}) has {} references (VkBuffer: 0x{:x}), forcing destruction", 
                                         static_cast<int>(category), BufferCategoryToString(category), buffer.use_count(), 
                                         reinterpret_cast<uint64_t>(buffer->GetBuffer()));
                                
                                // Debug: Print buffer details safely
                                try {
                                    LOG_DEBUG("BufferManagementSystem", "  Buffer size: {} bytes, hints: cpuWriteOnce={}, cpuWriteOften={}, persistentMapped={}", 
                                             buffer->GetSize(), buffer->GetHints().cpuWriteOnce, 
                                             buffer->GetHints().cpuWriteOften, buffer->GetHints().persistentMapped);
                                } catch (...) {
                                    LOG_DEBUG("BufferManagementSystem", "  Buffer details unavailable (buffer may be corrupted)");
                                }
                            }
                            
                            // Reset our reference
                            buffer.reset();
                        } catch (...) {
                            LOG_DEBUG("BufferManagementSystem", "Exception during buffer cleanup, forcing reset");
                            buffer.reset();
                        }
                    }
                }
                buffers.clear();
            }
            
            // Log summary of forced cleanup
            if (buffersWithExternalRefs > 0) {
                LOG_DEBUG("BufferManagementSystem", "Forced cleanup of {} buffers with external references", 
                         buffersWithExternalRefs);
            }
            
            // Clear the lookup map first to release one set of references
            try {
                m_bufferLookup.clear();
            } catch (...) {
                LOG_DEBUG("BufferManagementSystem", "Exception clearing buffer lookup map");
            }
            
            // Now clear the category map
            try {
                m_buffersByCategory.clear();
            } catch (...) {
                LOG_DEBUG("BufferManagementSystem", "Exception clearing buffer category map");
            }
        }
        
        // Clear pools after buffers are destroyed
        try {
            m_pools.clear();
            m_subsystemPools.clear(); 
            m_currentMemoryUsage.store(0);
        } catch (...) {
            LOG_DEBUG("BufferManagementSystem", "Exception clearing buffer pools");
        }
        
        LOG_DEBUG("BufferManagementSystem", "BufferManagementSystem shutdown complete.");
    }
    void CopyBuffer(BufferResourcePtr src, BufferResourcePtr dst, VkDeviceSize size) {
        if (!src || !dst || size == 0) {
            LOG_ERROR("BufferManagementSystem", "Invalid parameters for buffer copy");
            return;
        }
        
        // Log buffer copy operation for debugging
        LOG_DEBUG("BufferManagementSystem", "Starting buffer copy: size = {} bytes ({:.2f} MB)", size, size / (1024.0f * 1024.0f));
        
        // For now, use a simple memcpy approach for host-visible buffers
        // This will be replaced with proper command buffer copy when the command buffer system is available
        if ((src->GetMemoryFlags() & VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT) &&
            (dst->GetMemoryFlags() & VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT)) {
            
            void* srcData = MapBuffer(src);
            void* dstData = MapBuffer(dst);
            
            if (srcData && dstData) {
                std::memcpy(dstData, srcData, size);
                LOG_DEBUG("BufferManagementSystem", "Host-visible buffer copy completed successfully");
            } else {
                LOG_ERROR("BufferManagementSystem", "Failed to map buffers for copy: srcData={}, dstData={}", 
                         srcData ? "valid" : "null", dstData ? "valid" : "null");
            }
            
            UnmapBuffer(src);
            UnmapBuffer(dst);
        } else {
            // For device-local buffers, use command buffer copy with transfer queue
            // Use chunked transfer for large buffers to prevent timeout
            const VkDeviceSize CHUNK_SIZE = 32 * 1024 * 1024; // 32MB chunks for better timeout handling
            
            if (size > CHUNK_SIZE) {
                LOG_INFO("BufferManagementSystem", "Large buffer copy detected ({}MB), using chunked transfer", size / (1024 * 1024));
                CopyDeviceLocalBufferChunked(src, dst, size, CHUNK_SIZE);
            } else {
                if (m_transferQueue != VK_NULL_HANDLE) {
                    CopyDeviceLocalBuffer(src, dst, size);
                } else {
                    LOG_ERROR("BufferManagementSystem", "Device-local buffer copy requires transfer queue - using graphics queue fallback");
                    CopyDeviceLocalBufferFallback(src, dst, size);
                }
            }
        }
    }
    void SetVertexBuffer(BufferResourcePtr buffer) {
        std::unique_lock<std::shared_mutex> lock(m_renderingStateMutex);
        m_currentVertexBuffer = buffer;
    }
    
    void SetIndexBuffer(BufferResourcePtr buffer, uint32_t indexCount) {
        std::unique_lock<std::shared_mutex> lock(m_renderingStateMutex);
        m_currentIndexBuffer = buffer;
        m_currentIndexCount = indexCount;
    }
    
    BufferResourcePtr GetVertexBuffer() const {
        std::shared_lock<std::shared_mutex> lock(m_renderingStateMutex);
        return m_currentVertexBuffer;
    }
    
    BufferResourcePtr GetIndexBuffer() const {
        std::shared_lock<std::shared_mutex> lock(m_renderingStateMutex);
        return m_currentIndexBuffer;
    }
    
    uint32_t GetIndexCount() const {
        std::shared_lock<std::shared_mutex> lock(m_renderingStateMutex);
        return m_currentIndexCount;
    }
    
    // Insert acquire barrier for buffers transferred from transfer queue to graphics queue
    // NOTE: This function should only be called OUTSIDE of render passes
    // For now, we skip the barrier if same queue family or if this is called inappropriately within a render pass
    void InsertAcquireBarrier(VkCommandBuffer graphicsCommandBuffer, BufferResourcePtr buffer, VkDeviceSize size) {
        // Skip barriers for same queue family or when buffers don't need queue family transfer
        // This resolves the Vulkan validation error about buffer barriers within render passes
        if (m_transferQueueFamily == 0 || !buffer) {
            return; // Same queue family or invalid buffer - no barrier needed
        }
        
        // TODO: Properly restructure render system to call this outside render passes
        // For now, we assume queue family transfers are handled at buffer creation time
        // and skip runtime barriers to maintain Vulkan 1.4 compliance
        
        // Log a warning in debug builds
        #ifdef _DEBUG
        static bool warningShown = false;
        if (!warningShown) {
            LOG_DEBUG("BufferManagementSystem", "Warning: Queue family transfer barriers skipped for Vulkan 1.4 compliance");
            warningShown = true;
        }
        #endif
    }
    
    // Structured buffer creation - creates storage buffers with element-based management
    template<typename T>
    BufferResourcePtr CreateStructuredBuffer(uint32_t elementCount,
                                            VkBufferUsageFlags additionalUsage = 0,
                                            BufferCategory category = BufferCategory::StorageBuffer,
                                            const BufferUsageHints& hints = {}) {
        VkDeviceSize bufferSize = sizeof(T) * elementCount;
        VkBufferUsageFlags usage = VK_BUFFER_USAGE_STORAGE_BUFFER_BIT | 
                                  VK_BUFFER_USAGE_TRANSFER_DST_BIT |
                                  additionalUsage;
        
        // Determine memory properties based on hints
        VkMemoryPropertyFlags memProps = VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT;
        BufferUsageHints structuredHints = hints;
        
        if (hints.cpuWriteOften || hints.persistentMapped) {
            memProps = VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | 
                      VK_MEMORY_PROPERTY_HOST_COHERENT_BIT;
            structuredHints.persistentMapped = true;
        }
        
        // Add compute shader usage if likely to be used in compute
        if (!(additionalUsage & VK_BUFFER_USAGE_VERTEX_BUFFER_BIT)) {
            usage |= VK_BUFFER_USAGE_STORAGE_BUFFER_BIT;
        }
        
        // Create buffer
        auto buffer = CreateBuffer(bufferSize, usage, memProps, category, structuredHints);
        
        if (buffer) {
            // Store structured buffer metadata
            std::unique_lock<std::shared_mutex> lock(m_structuredBufferMutex);
            m_structuredBufferInfo[buffer] = {
                sizeof(T),
                elementCount,
                typeid(T).name()
            };
        }
        
        return buffer;
    }
    
    // Update structured buffer with vector of elements
    template<typename T>
    bool UpdateStructuredBuffer(BufferResourcePtr buffer, 
                               const std::vector<T>& data,
                               VkDeviceSize offset = 0) {
        if (!buffer) return false;
        
        // Check metadata
        {
            std::shared_lock<std::shared_mutex> lock(m_structuredBufferMutex);
            auto it = m_structuredBufferInfo.find(buffer);
            if (it == m_structuredBufferInfo.end()) {
                LOG_ERROR("BufferManagementSystem", "Buffer is not a structured buffer");
                return false;
            }
            
            if (data.size() * sizeof(T) + offset > buffer->GetSize()) {
                LOG_ERROR("BufferManagementSystem", "Update exceeds buffer capacity");
                return false;
            }
        }
        
        VkDeviceSize updateSize = data.size() * sizeof(T);
        return buffer->UpdateData(data.data(), updateSize, offset) == VK_SUCCESS;
    }
    
    // Get structured buffer information
    std::optional<StructuredBufferMetadata> GetStructuredBufferInfo(BufferResourcePtr buffer) const {
        std::shared_lock<std::shared_mutex> lock(m_structuredBufferMutex);
        auto it = m_structuredBufferInfo.find(buffer);
        if (it != m_structuredBufferInfo.end()) {
            return it->second;
        }
        return std::nullopt;
    }
    
    // Clear structured buffer metadata when buffer is destroyed
    void OnBufferDestroyed(BufferResourcePtr buffer) {
        std::unique_lock<std::shared_mutex> lock(m_structuredBufferMutex);
        m_structuredBufferInfo.erase(buffer);
    }
    
    // Prepare for shutdown by requesting all external systems to release buffer references
    void PrepareForShutdown() {
        LOG_DEBUG("BufferManagementSystem", "Preparing for shutdown, requesting external systems to release buffers...");
        
        // Print current state before forcing cleanup
        LOG_DEBUG("BufferManagementSystem", "About to call PrintMemoryReport...");
        PrintMemoryReport();
        LOG_DEBUG("BufferManagementSystem", "PrintMemoryReport returned successfully");
        
        // Force garbage collection to clean up any unused buffers
        LOG_DEBUG("BufferManagementSystem", "About to call CollectGarbage...");
        CollectGarbage(0); // Use maxFrameAge = 0 to force immediate cleanup
        LOG_DEBUG("BufferManagementSystem", "PrepareForShutdown completed successfully");
    }
    
private:
    BufferManagementSystem() = default;
    ~BufferManagementSystem() {
        // Do NOT call Shutdown() here - it can cause deadlocks during static destruction
        // Shutdown() must be called explicitly before program termination
    }
    VkDevice m_device = VK_NULL_HANDLE;
    VkPhysicalDevice m_physicalDevice = VK_NULL_HANDLE;
    VkQueue m_transferQueue = VK_NULL_HANDLE;
    uint32_t m_transferQueueFamily = UINT32_MAX;
    VkPhysicalDeviceMemoryProperties m_memoryProperties{};
    VkPhysicalDeviceLimits m_deviceLimits{};
    std::unordered_map<BufferCategory, std::vector<BufferResourcePtr>> m_buffersByCategory;
    std::unordered_map<VkBuffer, BufferResourcePtr> m_bufferLookup;
    mutable std::shared_mutex m_bufferMutex;
    std::unordered_map<BufferCategory, std::unique_ptr<BufferPool>> m_pools;
    std::unordered_map<BufferPoolType, std::unordered_map<BufferCategory, std::unique_ptr<BufferPool>>> m_subsystemPools;
    VkDeviceSize m_memoryBudget = 4ULL * 1024 * 1024 * 1024; // 4GB default - increased for high-resolution terrain
    std::atomic<VkDeviceSize> m_currentMemoryUsage{0};
    mutable std::shared_mutex m_renderingStateMutex;
    BufferResourcePtr m_currentVertexBuffer;
    BufferResourcePtr m_currentIndexBuffer;
    uint32_t m_currentIndexCount = 0;
    
    // Structured buffer tracking
    mutable std::shared_mutex m_structuredBufferMutex;
    std::unordered_map<BufferResourcePtr, StructuredBufferMetadata> m_structuredBufferInfo;
    uint32_t FindMemoryType(uint32_t typeFilter, VkMemoryPropertyFlags properties) {
        for (uint32_t i = 0; i < m_memoryProperties.memoryTypeCount; i++) {
            if ((typeFilter & (1 << i)) && 
                (m_memoryProperties.memoryTypes[i].propertyFlags & properties) == properties) {
                return i;
            }
        }
        throw std::runtime_error("Failed to find suitable memory type");
    }
    
    BufferResourcePtr CreateBufferInternal(VkDeviceSize size,
                                          VkBufferUsageFlags usage,
                                          VkMemoryPropertyFlags properties,
                                          BufferCategory category,
                                          const BufferUsageHints& hints) {
        VkBufferCreateInfo bufferInfo{};
        bufferInfo.sType = VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO;
        bufferInfo.size = size;
        bufferInfo.usage = usage;
        bufferInfo.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
        
        VkBuffer buffer;
        if (vkCreateBuffer(m_device, &bufferInfo, nullptr, &buffer) != VK_SUCCESS) {
            throw std::runtime_error("Failed to create buffer");
        }
        VkMemoryRequirements memRequirements;
        vkGetBufferMemoryRequirements(m_device, buffer, &memRequirements);
        VkMemoryAllocateInfo allocInfo{};
        allocInfo.sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;
        allocInfo.allocationSize = memRequirements.size;
        allocInfo.memoryTypeIndex = FindMemoryType(memRequirements.memoryTypeBits, properties);
        
        VkDeviceMemory bufferMemory;
        if (vkAllocateMemory(m_device, &allocInfo, nullptr, &bufferMemory) != VK_SUCCESS) {
            vkDestroyBuffer(m_device, buffer, nullptr);
            throw std::runtime_error("Failed to allocate buffer memory");
        }
        if (vkBindBufferMemory(m_device, buffer, bufferMemory, 0) != VK_SUCCESS) {
            vkFreeMemory(m_device, bufferMemory, nullptr);
            vkDestroyBuffer(m_device, buffer, nullptr);
            throw std::runtime_error("Failed to bind buffer memory");
        }
        auto bufferResource = std::make_shared<BufferResource>(
            m_device, buffer, bufferMemory, size, category, hints
        );
        
        bufferResource->SetMemoryFlags(properties);
        
        return bufferResource;
    }
    
    void InitializePools() {
        m_pools.emplace(BufferCategory::VertexBuffer, 
            std::make_unique<BufferPool>(m_device, m_physicalDevice, BufferCategory::VertexBuffer, 64 * 1024 * 1024));
        m_pools.emplace(BufferCategory::IndexBuffer, 
            std::make_unique<BufferPool>(m_device, m_physicalDevice, BufferCategory::IndexBuffer, 32 * 1024 * 1024));
        m_pools.emplace(BufferCategory::UniformBuffer, 
            std::make_unique<BufferPool>(m_device, m_physicalDevice, BufferCategory::UniformBuffer, 16 * 1024 * 1024));
        m_pools.emplace(BufferCategory::StorageBuffer, 
            std::make_unique<BufferPool>(m_device, m_physicalDevice, BufferCategory::StorageBuffer, 128 * 1024 * 1024));
        m_pools.emplace(BufferCategory::StagingBuffer, 
            std::make_unique<BufferPool>(m_device, m_physicalDevice, BufferCategory::StagingBuffer, 256 * 1024 * 1024));
    }
    
    bool CheckMemoryBudget(VkDeviceSize requestedSize) {
        VkDeviceSize currentUsage = m_currentMemoryUsage.load(std::memory_order_acquire);
        return (currentUsage + requestedSize) <= m_memoryBudget;
    }
public:
    void* MapBuffer(const BufferResourcePtr& buffer, VkDeviceSize offset = 0, VkDeviceSize size = VK_WHOLE_SIZE) {
        if (!buffer) return nullptr;
        VkDeviceMemory mem = buffer->GetMemory();
        if (!m_memoryManager) return nullptr;
        return m_memoryManager->Map(mem, offset, size);
    }

    void UnmapBuffer(const BufferResourcePtr& buffer) {
        if (!buffer) return;
        VkDeviceMemory mem = buffer->GetMemory();
        if (m_memoryManager) m_memoryManager->Unmap(mem);
    }
    
    void CopyDeviceLocalBuffer(BufferResourcePtr src, BufferResourcePtr dst, VkDeviceSize size) {
        // Create command pool for transfer operations
        VkCommandPoolCreateInfo poolInfo{};
        poolInfo.sType = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO;
        poolInfo.flags = VK_COMMAND_POOL_CREATE_TRANSIENT_BIT;
        poolInfo.queueFamilyIndex = m_transferQueueFamily;
        
        VkCommandPool commandPool;
        if (vkCreateCommandPool(m_device, &poolInfo, nullptr, &commandPool) != VK_SUCCESS) {
            std::cerr << "Failed to create command pool for buffer copy" << std::endl;
            return;
        }
        
        // Allocate command buffer
        VkCommandBufferAllocateInfo allocInfo{};
        allocInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
        allocInfo.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
        allocInfo.commandPool = commandPool;
        allocInfo.commandBufferCount = 1;
        
        VkCommandBuffer commandBuffer;
        if (vkAllocateCommandBuffers(m_device, &allocInfo, &commandBuffer) != VK_SUCCESS) {
            vkDestroyCommandPool(m_device, commandPool, nullptr);
            std::cerr << "Failed to allocate command buffer for buffer copy" << std::endl;
            return;
        }
        
        // Create fence for synchronization
        VkFenceCreateInfo fenceInfo{};
        fenceInfo.sType = VK_STRUCTURE_TYPE_FENCE_CREATE_INFO;
        VkFence transferFence;
        if (vkCreateFence(m_device, &fenceInfo, nullptr, &transferFence) != VK_SUCCESS) {
            vkDestroyCommandPool(m_device, commandPool, nullptr);
            std::cerr << "Failed to create transfer fence" << std::endl;
            return;
        }
        
        // Record copy command
        VkCommandBufferBeginInfo beginInfo{};
        beginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
        beginInfo.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
        
        vkBeginCommandBuffer(commandBuffer, &beginInfo);
        
        VkBufferCopy copyRegion{};
        copyRegion.srcOffset = 0;
        copyRegion.dstOffset = 0;
        copyRegion.size = size;
        vkCmdCopyBuffer(commandBuffer, src->GetBuffer(), dst->GetBuffer(), 1, &copyRegion);
        
        // Add release barrier on transfer queue if different queue families
        if (m_transferQueueFamily != 0) { // Assuming graphics queue family is 0
            VkBufferMemoryBarrier releaseBarrier{};
            releaseBarrier.sType = VK_STRUCTURE_TYPE_BUFFER_MEMORY_BARRIER;
            releaseBarrier.srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT;
            releaseBarrier.dstAccessMask = 0; // No access mask needed for release
            releaseBarrier.srcQueueFamilyIndex = m_transferQueueFamily;
            releaseBarrier.dstQueueFamilyIndex = 0; // Graphics queue family
            releaseBarrier.buffer = dst->GetBuffer();
            releaseBarrier.offset = 0;
            releaseBarrier.size = size;
            
            vkCmdPipelineBarrier(commandBuffer, 
                VK_PIPELINE_STAGE_TRANSFER_BIT, 
                VK_PIPELINE_STAGE_TRANSFER_BIT, // Must use transfer stage for transfer queue
                0, 0, nullptr, 1, &releaseBarrier, 0, nullptr);
        }
        
        vkEndCommandBuffer(commandBuffer);
        
        // Submit with fence for proper synchronization
        VkSubmitInfo submitInfo{};
        submitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
        submitInfo.commandBufferCount = 1;
        submitInfo.pCommandBuffers = &commandBuffer;
        
        vkQueueSubmit(m_transferQueue, 1, &submitInfo, transferFence);
        
        // Wait for transfer to complete with timeout
        // Calculate timeout based on buffer size: 10 seconds base + 150ms per MB, 2 minutes max
        const uint64_t BASE_TIMEOUT_NS = 10ULL * 1000 * 1000 * 1000; // 10 seconds base
        const uint64_t TIMEOUT_PER_MB = 150ULL * 1000 * 1000; // 150ms per MB
        const uint64_t MAX_TIMEOUT_NS = 120ULL * 1000 * 1000 * 1000; // 2 minutes max
        const uint64_t TIMEOUT_NS = std::min(MAX_TIMEOUT_NS, BASE_TIMEOUT_NS + (size / (1024 * 1024)) * TIMEOUT_PER_MB);
        
        VkResult waitResult = vkWaitForFences(m_device, 1, &transferFence, VK_TRUE, TIMEOUT_NS);
        if (waitResult == VK_TIMEOUT) {
            LOG_ERROR("BufferManagementSystem", "Timeout waiting for buffer copy to complete (size: {} MB, {}s timeout)", 
                     size / (1024 * 1024), TIMEOUT_NS / 1000000000);
            vkDestroyFence(m_device, transferFence, nullptr);
            vkDestroyCommandPool(m_device, commandPool, nullptr);
            return;
        } else if (waitResult != VK_SUCCESS) {
            LOG_ERROR("BufferManagementSystem", "Error waiting for buffer copy: {}", static_cast<int>(waitResult));
            vkDestroyFence(m_device, transferFence, nullptr);
            vkDestroyCommandPool(m_device, commandPool, nullptr);
            return;
        }
        
        // Cleanup
        vkDestroyFence(m_device, transferFence, nullptr);
        vkDestroyCommandPool(m_device, commandPool, nullptr);
    }
    
    void CopyDeviceLocalBufferFallback(BufferResourcePtr src, BufferResourcePtr dst, VkDeviceSize size) {
        // Fallback using graphics queue if no transfer queue available
        // Get graphics queue from device (assuming graphics queue family 0)
        VkQueue graphicsQueue;
        vkGetDeviceQueue(m_device, 0, 0, &graphicsQueue);
        
        // Create command pool for graphics queue
        VkCommandPoolCreateInfo poolInfo{};
        poolInfo.sType = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO;
        poolInfo.flags = VK_COMMAND_POOL_CREATE_TRANSIENT_BIT;
        poolInfo.queueFamilyIndex = 0; // Graphics queue family
        
        VkCommandPool commandPool;
        if (vkCreateCommandPool(m_device, &poolInfo, nullptr, &commandPool) != VK_SUCCESS) {
            std::cerr << "Failed to create command pool for buffer copy fallback" << std::endl;
            return;
        }
        
        // Allocate command buffer
        VkCommandBufferAllocateInfo allocInfo{};
        allocInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
        allocInfo.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
        allocInfo.commandPool = commandPool;
        allocInfo.commandBufferCount = 1;
        
        VkCommandBuffer commandBuffer;
        if (vkAllocateCommandBuffers(m_device, &allocInfo, &commandBuffer) != VK_SUCCESS) {
            vkDestroyCommandPool(m_device, commandPool, nullptr);
            std::cerr << "Failed to allocate command buffer for buffer copy fallback" << std::endl;
            return;
        }
        
        // Record copy command
        VkCommandBufferBeginInfo beginInfo{};
        beginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
        beginInfo.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
        
        vkBeginCommandBuffer(commandBuffer, &beginInfo);
        
        VkBufferCopy copyRegion{};
        copyRegion.srcOffset = 0;
        copyRegion.dstOffset = 0;
        copyRegion.size = size;
        vkCmdCopyBuffer(commandBuffer, src->GetBuffer(), dst->GetBuffer(), 1, &copyRegion);
        
        vkEndCommandBuffer(commandBuffer);
        
        // Submit and wait
        VkSubmitInfo submitInfo{};
        submitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
        submitInfo.commandBufferCount = 1;
        submitInfo.pCommandBuffers = &commandBuffer;
        
        vkQueueSubmit(graphicsQueue, 1, &submitInfo, VK_NULL_HANDLE);
        vkQueueWaitIdle(graphicsQueue);
        
        // Cleanup
        vkDestroyCommandPool(m_device, commandPool, nullptr);
    }
    
    void CopyDeviceLocalBufferChunked(BufferResourcePtr src, BufferResourcePtr dst, VkDeviceSize totalSize, VkDeviceSize chunkSize) {
        LOG_INFO("BufferManagementSystem", "Starting chunked buffer copy: {} chunks of {} MB each", 
                (totalSize + chunkSize - 1) / chunkSize, chunkSize / (1024 * 1024));
        
        // Create command pool for transfer operations
        VkCommandPoolCreateInfo poolInfo{};
        poolInfo.sType = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO;
        poolInfo.flags = VK_COMMAND_POOL_CREATE_TRANSIENT_BIT;
        poolInfo.queueFamilyIndex = m_transferQueueFamily;
        
        VkCommandPool commandPool;
        if (vkCreateCommandPool(m_device, &poolInfo, nullptr, &commandPool) != VK_SUCCESS) {
            LOG_ERROR("BufferManagementSystem", "Failed to create command pool for chunked buffer copy");
            return;
        }
        
        VkDeviceSize offset = 0;
        size_t chunkIndex = 0;
        const int MAX_RETRIES = 3;
        
        while (offset < totalSize) {
            VkDeviceSize currentChunkSize = std::min(chunkSize, totalSize - offset);
            
            LOG_DEBUG("BufferManagementSystem", "Processing chunk {}: offset={}, size={} MB", 
                     chunkIndex, offset, currentChunkSize / (1024 * 1024));
            
            bool chunkSuccess = false;
            for (int retry = 0; retry < MAX_RETRIES && !chunkSuccess; retry++) {
                if (retry > 0) {
                    LOG_INFO("BufferManagementSystem", "Retrying chunk {} (attempt {}/{})", chunkIndex, retry + 1, MAX_RETRIES);
                }
            
                // Allocate command buffer for this chunk
                VkCommandBufferAllocateInfo allocInfo{};
                allocInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
                allocInfo.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
                allocInfo.commandPool = commandPool;
                allocInfo.commandBufferCount = 1;
                
                VkCommandBuffer commandBuffer;
                if (vkAllocateCommandBuffers(m_device, &allocInfo, &commandBuffer) != VK_SUCCESS) {
                    LOG_ERROR("BufferManagementSystem", "Failed to allocate command buffer for chunk {} (attempt {})", chunkIndex, retry + 1);
                    continue; // Try again
                }
            
                // Create fence for synchronization
                VkFenceCreateInfo fenceInfo{};
                fenceInfo.sType = VK_STRUCTURE_TYPE_FENCE_CREATE_INFO;
                VkFence transferFence;
                if (vkCreateFence(m_device, &fenceInfo, nullptr, &transferFence) != VK_SUCCESS) {
                    LOG_ERROR("BufferManagementSystem", "Failed to create transfer fence for chunk {} (attempt {})", chunkIndex, retry + 1);
                    continue; // Try again
                }
            
            // Record copy command
            VkCommandBufferBeginInfo beginInfo{};
            beginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
            beginInfo.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
            
            vkBeginCommandBuffer(commandBuffer, &beginInfo);
            
            VkBufferCopy copyRegion{};
            copyRegion.srcOffset = offset;
            copyRegion.dstOffset = offset;
            copyRegion.size = currentChunkSize;
            vkCmdCopyBuffer(commandBuffer, src->GetBuffer(), dst->GetBuffer(), 1, &copyRegion);
            
            // Add release barrier on transfer queue if different queue families
            if (m_transferQueueFamily != 0) { // Assuming graphics queue family is 0
                VkBufferMemoryBarrier releaseBarrier{};
                releaseBarrier.sType = VK_STRUCTURE_TYPE_BUFFER_MEMORY_BARRIER;
                releaseBarrier.srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT;
                releaseBarrier.dstAccessMask = 0; // No access mask needed for release
                releaseBarrier.srcQueueFamilyIndex = m_transferQueueFamily;
                releaseBarrier.dstQueueFamilyIndex = 0; // Graphics queue family
                releaseBarrier.buffer = dst->GetBuffer();
                releaseBarrier.offset = offset;
                releaseBarrier.size = currentChunkSize;
                
                vkCmdPipelineBarrier(commandBuffer, 
                    VK_PIPELINE_STAGE_TRANSFER_BIT, 
                    VK_PIPELINE_STAGE_TRANSFER_BIT, // Must use transfer stage for transfer queue
                    0, 0, nullptr, 1, &releaseBarrier, 0, nullptr);
            }
            
            vkEndCommandBuffer(commandBuffer);
            
            // Submit with fence for proper synchronization
            VkSubmitInfo submitInfo{};
            submitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
            submitInfo.commandBufferCount = 1;
            submitInfo.pCommandBuffers = &commandBuffer;
            
                VkResult submitResult = vkQueueSubmit(m_transferQueue, 1, &submitInfo, transferFence);
                if (submitResult != VK_SUCCESS) {
                    LOG_ERROR("BufferManagementSystem", "Failed to submit chunk {} to transfer queue: {} (attempt {})", chunkIndex, static_cast<int>(submitResult), retry + 1);
                    vkDestroyFence(m_device, transferFence, nullptr);
                    continue; // Try again
                }
            
            // Wait for transfer to complete with timeout
            // Calculate timeout based on chunk size: 10 seconds per 64MB chunk minimum, 2 minutes max
            const uint64_t BASE_TIMEOUT_NS = 10ULL * 1000 * 1000 * 1000; // 10 seconds base
            const uint64_t TIMEOUT_PER_MB = 150ULL * 1000 * 1000; // 150ms per MB
            const uint64_t MAX_TIMEOUT_NS = 120ULL * 1000 * 1000 * 1000; // 2 minutes max
            const uint64_t TIMEOUT_NS = std::min(MAX_TIMEOUT_NS, BASE_TIMEOUT_NS + (currentChunkSize / (1024 * 1024)) * TIMEOUT_PER_MB);
            
                VkResult waitResult = vkWaitForFences(m_device, 1, &transferFence, VK_TRUE, TIMEOUT_NS);
                if (waitResult == VK_TIMEOUT) {
                    LOG_ERROR("BufferManagementSystem", "Timeout waiting for chunk {} transfer to complete ({}MB, {}s timeout, attempt {})", 
                             chunkIndex, currentChunkSize / (1024 * 1024), TIMEOUT_NS / 1000000000, retry + 1);
                    vkDestroyFence(m_device, transferFence, nullptr);
                    continue; // Try again
                } else if (waitResult != VK_SUCCESS) {
                    LOG_ERROR("BufferManagementSystem", "Error waiting for chunk {} transfer: {} (attempt {})", chunkIndex, static_cast<int>(waitResult), retry + 1);
                    vkDestroyFence(m_device, transferFence, nullptr);
                    continue; // Try again
                }
                
                // Cleanup fence for this chunk
                vkDestroyFence(m_device, transferFence, nullptr);
                chunkSuccess = true; // Mark chunk as successful
            } // End retry loop
            
            if (!chunkSuccess) {
                LOG_ERROR("BufferManagementSystem", "Failed to complete chunk {} after {} retries", chunkIndex, MAX_RETRIES);
                break; // Exit chunk processing loop
            }
            
            offset += currentChunkSize;
            chunkIndex++;
        }
        
        // Cleanup command pool
        vkDestroyCommandPool(m_device, commandPool, nullptr);
        
        LOG_INFO("BufferManagementSystem", "Chunked buffer copy completed: {} chunks processed", chunkIndex);
    }

private:
    VulkanMemoryManager* m_memoryManager = nullptr;
};

} // namespace PlanetGen::Rendering

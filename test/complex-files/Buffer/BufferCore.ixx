module;

#include <vulkan/vulkan.h>
#include <atomic>
#include <chrono>
#include <memory>
#include <mutex>
#include <shared_mutex>
#include <string>
#include <unordered_map>
#include <vector>
#include <algorithm>
#include <functional>

#include <utility>
export module BufferCore;

import RefCountedResource;
import Core.Threading.JobSystem;
import ThreadPool;

export namespace PlanetGen::Rendering {

enum class BufferCategory {
    VertexBuffer,
    IndexBuffer,
    UniformBuffer,
    StorageBuffer,
    IndirectBuffer,
    ComputeInput,
    ComputeOutput,
    StagingBuffer,
    TerrainHeightfield,
    WaterSimulation,
    AtmospherePrecomputed,
    VegetationInstances,
    ParticleBuffer
};
inline const char* BufferCategoryToString(BufferCategory category) {
    switch (category) {
        case BufferCategory::VertexBuffer: return "VertexBuffer";
        case BufferCategory::IndexBuffer: return "IndexBuffer";
        case BufferCategory::UniformBuffer: return "UniformBuffer";
        case BufferCategory::StorageBuffer: return "StorageBuffer";
        case BufferCategory::IndirectBuffer: return "IndirectBuffer";
        case BufferCategory::ComputeInput: return "ComputeInput";
        case BufferCategory::ComputeOutput: return "ComputeOutput";
        case BufferCategory::StagingBuffer: return "StagingBuffer";
        case BufferCategory::TerrainHeightfield: return "TerrainHeightfield";
        case BufferCategory::WaterSimulation: return "WaterSimulation";
        case BufferCategory::AtmospherePrecomputed: return "AtmospherePrecomputed";
        case BufferCategory::VegetationInstances: return "VegetationInstances";
        case BufferCategory::ParticleBuffer: return "ParticleBuffer";
        default: return "Unknown";
    }
}

struct BufferUsageHints {
    bool cpuWriteOnce = false;          // Written once from CPU, read many on GPU
    bool cpuWriteOften = false;         // Frequently updated from CPU
    bool gpuWriteOnly = false;          // Only written by GPU compute
    bool gpuReadWrite = false;          // Read and written by GPU
    bool sharedBetweenQueues = false;   // Used by multiple queue families
    bool persistentMapped = false;      // Keep mapped for frequent updates
    bool sparseBinding = false;         // Use sparse memory binding
    uint32_t frameInFlightCount = 3;    // Number of frames in flight
};

class BufferResource : public RefCountedResource {
public:
    BufferResource(VkDevice device, VkBuffer buffer, VkDeviceMemory memory,
                  VkDeviceSize size, BufferCategory category, BufferUsageHints hints)
        : m_device(device)
        , m_buffer(buffer)
        , m_memory(memory)
        , m_size(size)
        , m_category(category)
        , m_hints(hints)
        , m_memoryFlags(0)
        , m_mappedPtr(nullptr)
    {
        if (hints.persistentMapped) {
            VkResult result = vkMapMemory(device, memory, 0, size, 0, &m_mappedPtr);
            if (result != VK_SUCCESS) {
                m_mappedPtr = nullptr;
            }
        }
    }
    
    ~BufferResource() override {
        if (m_mappedPtr) {
            vkUnmapMemory(m_device, m_memory);
        }
        if (m_buffer != VK_NULL_HANDLE) {
            vkDestroyBuffer(m_device, m_buffer, nullptr);
        }
        if (m_memory != VK_NULL_HANDLE) {
            vkFreeMemory(m_device, m_memory, nullptr);
        }
    }
    VkBuffer GetBuffer() const { return m_buffer; }
    VkDeviceMemory GetMemory() const { return m_memory; }
    VkDeviceSize GetSize() const { return m_size; }
    BufferCategory GetCategory() const { return m_category; }
    void* GetMappedPtr() const { return m_mappedPtr; }
    const BufferUsageHints& GetHints() const { return m_hints; }

    VkDescriptorBufferInfo GetDescriptorInfo() const {
        VkDescriptorBufferInfo info{};
        info.buffer = m_buffer;
        info.offset = 0;
        info.range = m_size;
        return info;
    }

    VkResult Map(void** ppData) {
        if (m_mappedPtr) {
            *ppData = m_mappedPtr;
            return VK_SUCCESS;
        }
        
        std::lock_guard<std::mutex> lock(m_mapMutex);
        if (m_mappedPtr) {  // Double check after lock
            *ppData = m_mappedPtr;
            return VK_SUCCESS;
        }
        
        VkResult result = vkMapMemory(m_device, m_memory, 0, m_size, 0, &m_mappedPtr);
        if (result == VK_SUCCESS) {
            *ppData = m_mappedPtr;
        }
        return result;
    }
    
    void Unmap() {
        if (m_mappedPtr && !m_hints.persistentMapped) {
            std::lock_guard<std::mutex> lock(m_mapMutex);
            vkUnmapMemory(m_device, m_memory);
            m_mappedPtr = nullptr;
        }
    }
    VkResult UpdateData(const void* pData, VkDeviceSize size, VkDeviceSize offset = 0) {
        if (offset + size > m_size) {
            return VK_ERROR_OUT_OF_DEVICE_MEMORY;
        }
        
        void* mappedData = nullptr;
        VkResult result = Map(&mappedData);
        if (result != VK_SUCCESS) {
            return result;
        }
        
        memcpy(static_cast<uint8_t*>(mappedData) + offset, pData, size);
        if (!(m_memoryFlags & VK_MEMORY_PROPERTY_HOST_COHERENT_BIT)) {
            VkMappedMemoryRange range{};
            range.sType = VK_STRUCTURE_TYPE_MAPPED_MEMORY_RANGE;
            range.memory = m_memory;
            range.offset = offset;
            range.size = size;
            vkFlushMappedMemoryRanges(m_device, 1, &range);
        }
        
        if (!m_hints.persistentMapped) {
            Unmap();
        }
        
        UpdateLastAccess();
        return VK_SUCCESS;
    }
    void SetMemoryFlags(VkMemoryPropertyFlags flags) {
        m_memoryFlags = flags;
    }
    
    VkMemoryPropertyFlags GetMemoryFlags() const {
        return m_memoryFlags;
    }
    
    bool IsMappable() const {
        // A buffer is mappable if it has HOST_VISIBLE memory property
        return (m_memoryFlags & VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT) != 0;
    }
    
private:
    VkDevice m_device;
    VkBuffer m_buffer;
    VkDeviceMemory m_memory;
    VkDeviceSize m_size;
    BufferCategory m_category;
    BufferUsageHints m_hints;
    VkMemoryPropertyFlags m_memoryFlags;
    
    void* m_mappedPtr;
    mutable std::mutex m_mapMutex;
};

using BufferResourcePtr = std::shared_ptr<BufferResource>;

class BufferPool {
public:
    BufferPool(VkDevice device, VkPhysicalDevice physicalDevice, 
               BufferCategory category, VkDeviceSize blockSize = 16 * 1024 * 1024)
        : m_device(device)
        , m_physicalDevice(physicalDevice)
        , m_category(category)
        , m_blockSize(blockSize) {}
    
    struct Allocation {
        BufferResourcePtr buffer;
        VkDeviceSize offset;
        VkDeviceSize size;
        
        bool IsValid() const { return buffer != nullptr; }
    };
    
    Allocation Allocate(VkDeviceSize size, VkDeviceSize alignment = 256) {
        std::lock_guard<std::mutex> lock(m_mutex);
        size = (size + alignment - 1) & ~(alignment - 1);
        for (auto& block : m_blocks) {
            for (auto it = block.freeRanges.begin(); it != block.freeRanges.end(); ++it) {
                auto& range = *it;
                VkDeviceSize alignedOffset = (range.first + alignment - 1) & ~(alignment - 1);
                VkDeviceSize endOffset = alignedOffset + size;
                
                if (endOffset <= range.first + range.second) {
                    Allocation alloc;
                    alloc.buffer = block.buffer;
                    alloc.offset = alignedOffset;
                    alloc.size = size;
                    VkDeviceSize beforeSize = alignedOffset - range.first;
                    VkDeviceSize afterOffset = endOffset;
                    VkDeviceSize afterSize = (range.first + range.second) - endOffset;
                    it = block.freeRanges.erase(it);
                    if (beforeSize > 0) {
                        block.freeRanges.emplace_back(range.first, beforeSize);
                    }
                    if (afterSize > 0) {
                        block.freeRanges.emplace_back(afterOffset, afterSize);
                    }
                    
                    block.freeSpace -= size;
                    return alloc;
                }
            }
        }
        CreateNewBlock();
        return Allocate(size, alignment);
    }
    
    void Free(const Allocation& allocation) {
        if (!allocation.IsValid()) return;
        
        std::lock_guard<std::mutex> lock(m_mutex);
        for (auto& block : m_blocks) {
            if (block.buffer == allocation.buffer) {
                block.freeRanges.emplace_back(allocation.offset, allocation.size);
                block.freeSpace += allocation.size;
                MergeFreeRanges(block);
                if (block.freeSpace == m_blockSize && m_blocks.size() > 1) {
                    block.markedForRemoval = true;
                }
                
                break;
            }
        }
    }
    
    void DefragmentAsync() {
        auto& jobSystem = Core::Threading::JobSystem::Instance();
        
        jobSystem.CreateAndSchedule<void>([this]() {
            Defragment();
        }, "BufferPool::Defragment");
    }
    
    BufferResourcePtr AllocateBuffer(VkDeviceSize size, VkBufferUsageFlags usage, 
                                   VkMemoryPropertyFlags properties, const BufferUsageHints& hints) {
        // For now, create a dedicated buffer instead of suballocating from pool
        // This maintains compatibility with the existing BufferResource class
        // TODO: Implement proper suballocation support in BufferResource
        
        VkBufferCreateInfo bufferInfo{};
        bufferInfo.sType = VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO;
        bufferInfo.size = size;
        bufferInfo.usage = usage;
        bufferInfo.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
        
        VkBuffer buffer;
        if (vkCreateBuffer(m_device, &bufferInfo, nullptr, &buffer) != VK_SUCCESS) {
            return nullptr;
        }
        
        VkMemoryRequirements memRequirements;
        vkGetBufferMemoryRequirements(m_device, buffer, &memRequirements);
        
        VkPhysicalDeviceMemoryProperties memProps;
        vkGetPhysicalDeviceMemoryProperties(m_physicalDevice, &memProps);
        
        uint32_t memoryTypeIndex = UINT32_MAX;
        for (uint32_t i = 0; i < memProps.memoryTypeCount; i++) {
            if ((memRequirements.memoryTypeBits & (1 << i)) && 
                (memProps.memoryTypes[i].propertyFlags & properties) == properties) {
                memoryTypeIndex = i;
                break;
            }
        }
        
        if (memoryTypeIndex == UINT32_MAX) {
            vkDestroyBuffer(m_device, buffer, nullptr);
            return nullptr;
        }
        
        VkMemoryAllocateInfo allocInfo{};
        allocInfo.sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;
        allocInfo.allocationSize = memRequirements.size;
        allocInfo.memoryTypeIndex = memoryTypeIndex;
        
        VkDeviceMemory bufferMemory;
        if (vkAllocateMemory(m_device, &allocInfo, nullptr, &bufferMemory) != VK_SUCCESS) {
            vkDestroyBuffer(m_device, buffer, nullptr);
            return nullptr;
        }
        
        if (vkBindBufferMemory(m_device, buffer, bufferMemory, 0) != VK_SUCCESS) {
            vkFreeMemory(m_device, bufferMemory, nullptr);
            vkDestroyBuffer(m_device, buffer, nullptr);
            return nullptr;
        }
        
        auto bufferResource = std::make_shared<BufferResource>(
            m_device, buffer, bufferMemory, size, m_category, hints
        );
        bufferResource->SetMemoryFlags(properties);
        
        return bufferResource;
    }
    
    size_t GetBlockCount() const {
        std::lock_guard<std::mutex> lock(m_mutex);
        return m_blocks.size();
    }
    
    VkDeviceSize GetTotalMemory() const {
        std::lock_guard<std::mutex> lock(m_mutex);
        return m_blocks.size() * m_blockSize;
    }
    
    VkDeviceSize GetUsedMemory() const {
        std::lock_guard<std::mutex> lock(m_mutex);
        VkDeviceSize used = 0;
        for (const auto& block : m_blocks) {
            used += (m_blockSize - block.freeSpace);
        }
        return used;
    }
    
private:
    struct Block {
        BufferResourcePtr buffer;
        VkDeviceSize freeSpace;
        std::vector<std::pair<VkDeviceSize, VkDeviceSize>> freeRanges; // offset, size
        bool markedForRemoval = false;
    };
    
    VkDevice m_device;
    VkPhysicalDevice m_physicalDevice;
    BufferCategory m_category;
    VkDeviceSize m_blockSize;
    
    mutable std::mutex m_mutex;
    std::vector<Block> m_blocks;
    
    void CreateNewBlock() {
        VkBufferCreateInfo bufferInfo{};
        bufferInfo.sType = VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO;
        bufferInfo.size = m_blockSize;
        VkBufferUsageFlags usage = VK_BUFFER_USAGE_TRANSFER_DST_BIT | VK_BUFFER_USAGE_TRANSFER_SRC_BIT;
        VkMemoryPropertyFlags memProperties = VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT;
        
        switch (m_category) {
            case BufferCategory::VertexBuffer:
                usage |= VK_BUFFER_USAGE_VERTEX_BUFFER_BIT;
                break;
            case BufferCategory::IndexBuffer:
                usage |= VK_BUFFER_USAGE_INDEX_BUFFER_BIT;
                break;
            case BufferCategory::UniformBuffer:
                usage |= VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT;
                memProperties = VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT;
                break;
            case BufferCategory::StorageBuffer:
                usage |= VK_BUFFER_USAGE_STORAGE_BUFFER_BIT;
                break;
            case BufferCategory::StagingBuffer:
                usage = VK_BUFFER_USAGE_TRANSFER_SRC_BIT;
                memProperties = VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT;
                break;
            default:
                usage |= VK_BUFFER_USAGE_STORAGE_BUFFER_BIT; // Default to storage buffer
                break;
        }
        
        bufferInfo.usage = usage;
        bufferInfo.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
        
        VkBuffer buffer;
        if (vkCreateBuffer(m_device, &bufferInfo, nullptr, &buffer) != VK_SUCCESS) {
            throw std::runtime_error("Failed to create buffer pool block");
        }
        VkMemoryRequirements memRequirements;
        vkGetBufferMemoryRequirements(m_device, buffer, &memRequirements);
        VkPhysicalDeviceMemoryProperties memProps;
        vkGetPhysicalDeviceMemoryProperties(m_physicalDevice, &memProps);
        
        uint32_t memoryTypeIndex = UINT32_MAX;
        for (uint32_t i = 0; i < memProps.memoryTypeCount; i++) {
            if ((memRequirements.memoryTypeBits & (1 << i)) && 
                (memProps.memoryTypes[i].propertyFlags & memProperties) == memProperties) {
                memoryTypeIndex = i;
                break;
            }
        }
        
        if (memoryTypeIndex == UINT32_MAX) {
            vkDestroyBuffer(m_device, buffer, nullptr);
            throw std::runtime_error("Failed to find suitable memory type for buffer pool block");
        }
        VkMemoryAllocateInfo allocInfo{};
        allocInfo.sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;
        allocInfo.allocationSize = memRequirements.size;
        allocInfo.memoryTypeIndex = memoryTypeIndex;
        
        VkDeviceMemory bufferMemory;
        if (vkAllocateMemory(m_device, &allocInfo, nullptr, &bufferMemory) != VK_SUCCESS) {
            vkDestroyBuffer(m_device, buffer, nullptr);
            throw std::runtime_error("Failed to allocate memory for buffer pool block");
        }
        if (vkBindBufferMemory(m_device, buffer, bufferMemory, 0) != VK_SUCCESS) {
            vkFreeMemory(m_device, bufferMemory, nullptr);
            vkDestroyBuffer(m_device, buffer, nullptr);
            throw std::runtime_error("Failed to bind memory for buffer pool block");
        }
        BufferUsageHints hints;
        hints.persistentMapped = (memProperties & VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT) != 0;
        
        auto bufferResource = std::make_shared<BufferResource>(
            m_device, buffer, bufferMemory, m_blockSize, m_category, hints
        );
        bufferResource->SetMemoryFlags(memProperties);
        Block newBlock;
        newBlock.buffer = bufferResource;
        newBlock.freeSpace = m_blockSize;
        newBlock.freeRanges.emplace_back(0, m_blockSize); // Entire block is free initially
        newBlock.markedForRemoval = false;
        
        m_blocks.push_back(std::move(newBlock));
    }
    
    void MergeFreeRanges(Block& block) {
        if (block.freeRanges.size() < 2) return;
        std::sort(block.freeRanges.begin(), block.freeRanges.end());
        std::vector<std::pair<VkDeviceSize, VkDeviceSize>> merged;
        merged.push_back(block.freeRanges[0]);
        
        for (size_t i = 1; i < block.freeRanges.size(); ++i) {
            auto& last = merged.back();
            auto& current = block.freeRanges[i];
            
            if (last.first + last.second == current.first) {
                last.second += current.second;
            } else {
                merged.push_back(current);
            }
        }
        
        block.freeRanges = std::move(merged);
    }
    
    void Defragment() {
        std::lock_guard<std::mutex> lock(m_mutex);
        
        m_blocks.erase(
            std::remove_if(m_blocks.begin(), m_blocks.end(),
                          [](const Block& block) { return block.markedForRemoval; }),
            m_blocks.end()
        );
    }
};

struct MultiBufferedResource {
    std::vector<BufferResourcePtr> buffers;
    std::atomic<uint32_t> currentIndex{0};
    
    BufferResourcePtr GetCurrent() { 
        return buffers[currentIndex.load(std::memory_order_acquire)]; 
    }
    
    void NextFrame() { 
        uint32_t next = (currentIndex.load(std::memory_order_acquire) + 1) % buffers.size();
        currentIndex.store(next, std::memory_order_release);
    }
    
    size_t GetBufferCount() const { return buffers.size(); }
};

using MultiBufferedResourcePtr = std::shared_ptr<MultiBufferedResource>;

} // namespace PlanetGen::Rendering
namespace std {
    template<>
    struct hash<PlanetGen::Rendering::BufferCategory> {
        std::size_t operator()(const PlanetGen::Rendering::BufferCategory& category) const noexcept {
            return std::hash<int>{}(static_cast<int>(category));
        }
    };
}

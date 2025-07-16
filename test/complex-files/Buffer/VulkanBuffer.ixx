module;
#include <vulkan/vulkan.h>

#include <memory>

export module VulkanBuffer;

import VulkanTypes;

export namespace PlanetGen::Rendering {
class VulkanBuffer {
 public:
  VulkanBuffer() = default;
  VulkanBuffer(VkDevice device, BufferHandle buffer, MemoryHandle memory,
               VkDeviceSize size);
  ~VulkanBuffer();
  VulkanBuffer(VulkanBuffer&& other) noexcept;
  VulkanBuffer& operator=(VulkanBuffer&& other) noexcept;
  VulkanBuffer(const VulkanBuffer&) = delete;
  VulkanBuffer& operator=(const VulkanBuffer&) = delete;
  VkBuffer GetBuffer() const { return m_buffer.Get(); }
  VkDeviceMemory GetMemory() const { return m_memory.Get(); }
  VkDeviceSize GetSize() const { return m_size; }
  bool IsValid() const { return m_buffer.IsValid() && m_memory.IsValid(); }
  BufferHandle&& GetBufferHandle() { return std::move(m_buffer); }
  MemoryHandle&& GetMemoryHandle() { return std::move(m_memory); }

 private:
  VkDevice m_device = VK_NULL_HANDLE;
  BufferHandle m_buffer;
  MemoryHandle m_memory;
  VkDeviceSize m_size = 0;
};

}  // namespace PlanetGen::Rendering
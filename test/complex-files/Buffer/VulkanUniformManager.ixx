module;
#include <vulkan/vulkan.h>

#include <glm/glm.hpp>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

export module VulkanUniformManager;

import VulkanTypes;
import VulkanBase;
import VulkanCommandBuffer;
import BufferManagement;
import BufferCore;

export namespace PlanetGen::Rendering
{
  // BufferManagementSystem is available through import BufferManagement
  struct UniformBufferConfig
  {
    VkDeviceSize size = 0;
    VkBufferUsageFlags usage = VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT;
    VkMemoryPropertyFlags properties = VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT |
                                       VK_MEMORY_PROPERTY_HOST_COHERENT_BIT;
    bool dynamic = false;
    uint32_t minAlignment = 0;
  };
  struct PushConstantConfig
  {
    VkShaderStageFlags stageFlags = 0;
    uint32_t offset = 0;
    uint32_t size = 0;
  };
  struct UniformBuffer
  {
    VkDeviceSize size = 0;
    VkDeviceSize alignment = 0;
    bool dynamic = false;
    void *mappedData = nullptr;  // Cached pointer from BufferResource
    BufferResourcePtr bufferResource;  // Managed by BufferManagementSystem
    VkBuffer GetBuffer() const;
  };

  class VulkanUniformManager
  {
  public:
    explicit VulkanUniformManager(VulkanBase *base);
    ~VulkanUniformManager();
    VulkanUniformManager(const VulkanUniformManager &) = delete;
    VulkanUniformManager &operator=(const VulkanUniformManager &) = delete;
    VulkanUniformManager(VulkanUniformManager &&other) noexcept;
    VulkanUniformManager &operator=(VulkanUniformManager &&other) noexcept;
    bool Initialize();
    void Cleanup();
    bool CreateUniformBuffer(const std::string &name,
                             const UniformBufferConfig &config);
    bool CreateDynamicUniformBuffer(const std::string &name, VkDeviceSize size,
                                    uint32_t minAlignment);
    const UniformBuffer *GetUniformBuffer(const std::string &name) const;
    BufferResourcePtr GetUniformBufferResource(const std::string &name) const;
    bool UpdateUniformBuffer(const std::string &name, const void *data,
                             VkDeviceSize size, VkDeviceSize offset = 0);
    bool UpdateDynamicUniformBuffer(const std::string &name, const void *data,
                                    VkDeviceSize size, uint32_t currentFrame);
    bool UpdateDescriptorSets(const std::string &bufferName,
                              VkDescriptorSet descriptorSet, uint32_t binding,
                              VkDescriptorType descriptorType,
                              uint32_t currentFrame = 0);
    bool UpdatePushConstants(VulkanCommandBuffer *cmdBuffer,
                             VkPipelineLayout pipelineLayout,
                             const PushConstantConfig &config, const void *data);
  private:
    VulkanBase *m_base;
    std::unordered_map<std::string, UniformBuffer> m_uniformBuffers;
    VkDeviceSize GetAlignedSize(VkDeviceSize size, VkDeviceSize alignment) const;
  };

} // namespace PlanetGen::Rendering

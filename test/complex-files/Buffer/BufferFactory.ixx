module;

#include <vulkan/vulkan.h>
#include <string>
#include <vector>

export module BufferFactory;

export namespace PlanetGen::Rendering {

// Forward declarations
class VulkanUniformManager;
class BufferManagementSystem;

/**
 * BufferFactory - DRY utility for common buffer creation patterns
 * 
 * Follows DRY principle by extracting common buffer creation logic
 * into reusable static methods. Reduces code duplication across
 * different buffer initialization classes.
 */
class BufferFactory {
public:
    /**
     * Create a standard uniform buffer with common settings
     */
    static bool CreateStandardUniformBuffer(
        VulkanUniformManager& uniformManager,
        const std::string& name,
        size_t size,
        bool tripleBuffered = true);
    
    /**
     * Create a vertex buffer using BufferManagementSystem
     */
    static bool CreateVertexBuffer(
        BufferManagementSystem& bufferManager,
        const std::string& name,
        size_t size,
        const void* data = nullptr);
    
    /**
     * Create an index buffer using BufferManagementSystem
     */
    static bool CreateIndexBuffer(
        BufferManagementSystem& bufferManager,
        const std::string& name,
        size_t size,
        const void* data = nullptr);
    
    /**
     * Create a storage buffer for compute operations
     */
    static bool CreateStorageBuffer(
        BufferManagementSystem& bufferManager,
        const std::string& name,
        size_t size,
        bool hostVisible = false);
    
    /**
     * Common buffer specifications for different use cases
     */
    struct BufferSpec {
        std::string name;
        size_t size;
        VkBufferUsageFlags usage;
        VkMemoryPropertyFlags properties;
        bool tripleBuffered;
        
        static BufferSpec UniformBuffer(const std::string& name, size_t size, bool tripleBuffered = true) {
            return {name, size, VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT, 
                   VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT,
                   tripleBuffered};
        }
        
        static BufferSpec VertexBuffer(const std::string& name, size_t size) {
            return {name, size, VK_BUFFER_USAGE_VERTEX_BUFFER_BIT,
                   VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT, false};
        }
        
        static BufferSpec IndexBuffer(const std::string& name, size_t size) {
            return {name, size, VK_BUFFER_USAGE_INDEX_BUFFER_BIT,
                   VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT, false};
        }
        
        static BufferSpec StorageBuffer(const std::string& name, size_t size, bool hostVisible = false) {
            VkMemoryPropertyFlags props = VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT;
            if (hostVisible) {
                props |= VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT;
            }
            return {name, size, VK_BUFFER_USAGE_STORAGE_BUFFER_BIT, props, false};
        }
    };
    
    /**
     * Create multiple buffers from specifications
     */
    static std::vector<bool> CreateBuffers(
        VulkanUniformManager& uniformManager,
        const std::vector<BufferSpec>& specs);
};

} // namespace PlanetGen::Rendering
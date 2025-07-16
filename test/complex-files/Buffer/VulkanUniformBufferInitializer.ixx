module;

#include <vulkan/vulkan.h>
#include <string>
#include <vector>
#include <cstdint>

export module VulkanUniformBufferInitializer;

export namespace PlanetGen::Rendering {

// Forward declarations
class VulkanUniformManager;

/**
 * VulkanUniformBufferInitializer - Creates essential uniform buffers for rendering
 * 
 * Follows SOLID principles:
 * - Single Responsibility: Only creates initial uniform buffers
 * - Dependency Inversion: Depends on VulkanUniformManager interface
 * - Open/Closed: Extensible for different buffer types
 * 
 * Usage:
 * 1. Create initializer with VulkanUniformManager
 * 2. Call CreateStandardBuffers() to create common buffers
 * 3. Use ValidateCreation() to verify success
 */
class VulkanUniformBufferInitializer {
public:
    struct BufferSpec {
        std::string name;
        size_t size;
        bool tripleBuffered = true;
        
        BufferSpec(const std::string& n, size_t s, bool tb = true) 
            : name(n), size(s), tripleBuffered(tb) {}
    };
    
    explicit VulkanUniformBufferInitializer(VulkanUniformManager& uniformManager);
    
    /**
     * Create standard uniform buffers for terrain rendering:
     * - camera: Camera matrices and view parameters
     * - transform: Model transform matrices
     * - terrainParams: Terrain-specific parameters
     */
    bool CreateStandardBuffers();
    
    /**
     * Create custom uniform buffers from specifications
     */
    bool CreateBuffers(const std::vector<BufferSpec>& specs);
    
    /**
     * Create compute-specific uniform buffers
     */
    bool CreateComputeBuffers();
    
    /**
     * Validate that all requested buffers were created successfully
     */
    bool ValidateCreation() const;

private:
    VulkanUniformManager& m_uniformManager;
    std::vector<std::string> m_createdBuffers;
    
    bool CreateBuffer(const BufferSpec& spec);
};

} // namespace PlanetGen::Rendering
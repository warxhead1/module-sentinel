module;

#include <vulkan/vulkan.h>

#include <memory>
#include <string>
#include <array>
#include <vector>
#include <optional>
#include <limits>
#include <cassert>
#include <cstdint>

#include <algorithm>
#include <algorithm>
#include <functional>
/*

RenderingTypes is a module that defines the types used in the rendering system.
* VulkanRenderSystem
* RenderableObject
* RenderableMesh
* VulkanResourceUploader
* VulkanRenderingCore


*/

export module RenderingTypes;

import GLMModule;
import VulkanTypes;
import GenerationTypes;
import BufferCore;


export namespace PlanetGen::Rendering {

// =============================================================================
// UNIFIED RESOURCE TYPE SYSTEM
// =============================================================================

/**
 * Unified resource types for all rendering systems
 * Replaces both FrameGraphResourceType and GenericResourceType for consistency
 */
enum class ResourceSystemType {
    Buffer,
    Texture,
    RenderTarget,
    DepthStencil,
    SwapChainImage,
    TextureArray,      // For planet face textures
    StorageBuffer,     // For compute shaders
    IndirectBuffer,    // For GPU-driven rendering
    Image,             // Generic image
    ImageView,         // Image view
    Custom             // System-specific type
};

/**
 * Resource access patterns for synchronization
 */
enum class ResourceAccess {
    Read,
    Write,
    ReadWrite,
    ComputeRead,
    ComputeWrite,
    ComputeReadWrite,
    TransferSrc,
    TransferDst
};

/**
 * Queue types for resource usage
 */
enum class QueueType : uint32_t {
    Graphics = 1 << 0,
    Compute = 1 << 1,
    Transfer = 1 << 2,
    AsyncCompute = 1 << 3,
    Present = 1 << 4
};

inline QueueType operator|(QueueType a, QueueType b) {
    return static_cast<QueueType>(static_cast<uint32_t>(a) | static_cast<uint32_t>(b));
}

inline QueueType operator&(QueueType a, QueueType b) {
    return static_cast<QueueType>(static_cast<uint32_t>(a) & static_cast<uint32_t>(b));
}

/**
 * Generic resource handle for cross-system resource sharing
 * Used by VulkanResourceManager for centralized storage
 */
struct GenericResourceHandle {
    uint32_t id;
    std::string systemName;  // Which system owns this resource (e.g., "FrameGraph", "Pipeline", etc.)
    uint32_t version = 0;    // For temporal/versioned resources (useful for FrameGraph)
    std::string name;        // Resource name for debugging
    ResourceSystemType type = ResourceSystemType::Buffer;  // Unified resource type
    
    GenericResourceHandle() : id(0), systemName("Unknown") {}
    GenericResourceHandle(uint32_t resourceId, const std::string& system) : id(resourceId), systemName(system) {}
    GenericResourceHandle(uint32_t resourceId, const std::string& system, uint32_t ver, const std::string& resourceName, ResourceSystemType resourceType)
        : id(resourceId), systemName(system), version(ver), name(resourceName), type(resourceType) {}
    
    bool IsValid() const { return id != UINT32_MAX; }

    bool operator==(const GenericResourceHandle &other) const {
        return id == other.id && version == other.version && systemName == other.systemName;
    }

    bool operator!=(const GenericResourceHandle &other) const {
        return !(*this == other);
    }
    
    struct Hash {
        size_t operator()(const GenericResourceHandle& handle) const {
            return std::hash<uint64_t>{}((uint64_t(handle.id) << 32) | handle.version) ^
                   std::hash<std::string>{}(handle.systemName);
        }
    };
};

/**
 * Base resource descriptor for cross-system integration
 * This is the common interface all systems use when storing in VulkanResourceManager
 */
struct GenericResourceDesc {
    ResourceSystemType type;
    VkFormat format = VK_FORMAT_UNDEFINED;
    uint32_t width = 0;
    uint32_t height = 0;
    uint32_t depth = 1;
    uint32_t mipLevels = 1;
    uint32_t arrayLayers = 1;
    bool isTransient = false;
    bool isExternal = false;
    std::string customTypeInfo;  // For system-specific type information
};

/**
 * Extended resource descriptor with full Vulkan creation parameters
 * Used by FrameGraph and other systems requiring detailed resource control
 */
struct ResourceDesc : GenericResourceDesc {
    std::string name;
    VkDeviceSize size = 0;                                                   // Buffer size
    VkBufferUsageFlags bufferUsage = 0;                                      // Buffer usage flags
    VkImageUsageFlags imageUsage = 0;                                        // Image usage flags
    VkSampleCountFlagBits samples = VK_SAMPLE_COUNT_1_BIT;                   // MSAA samples
    VkMemoryPropertyFlags memoryProperties = VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT; // Memory properties
    bool isPersistent = false;                                               // Survives multiple frames
    bool isAliasable = true;                                                 // Can share memory with other transient resources
    QueueType queueUsage = QueueType::Graphics;                             // Queue family usage
    int32_t temporalLayer = -1;                                              // For temporal resources (-1 = no temporal layer)
    
    // Helper to convert to base GenericResourceDesc
    GenericResourceDesc ToGeneric() const {
        GenericResourceDesc generic;
        generic.type = type;
        generic.format = format;
        generic.width = width;
        generic.height = height;
        generic.depth = depth;
        generic.mipLevels = mipLevels;
        generic.arrayLayers = arrayLayers;
        generic.isTransient = isTransient;
        generic.isExternal = isExternal;
        generic.customTypeInfo = customTypeInfo;
        return generic;
    }
};

// =============================================================================
// SYSTEM-SPECIFIC TYPE ALIASES
// =============================================================================

/**
 * Simple handle type for FrameGraph system
 * Systems that just need a simple handle can use this or define their own
 */
struct FrameGraphResourceHandle {
    uint32_t id;
    
    FrameGraphResourceHandle() : id(0) {}
    FrameGraphResourceHandle(uint32_t resourceId) : id(resourceId) {}
    
    // Conversion to generic handle when integrating with VulkanResourceManager
    GenericResourceHandle ToGeneric(const std::string& name = "", ResourceSystemType type = ResourceSystemType::Buffer, uint32_t version = 0) const {
        return GenericResourceHandle(id, "FrameGraph", version, name, type);
    }
};
    

/**
 * Texture slot types for materials
 */
enum class TextureSlot {
    Diffuse = 0,
    Normal = 1,
    Roughness = 2,
    Metallic = 3,
    AmbientOcclusion = 4,
    Emissive = 5,
    Height = 6,
    Opacity = 7,
    DetailDiffuse = 8,
    DetailNormal = 9,
    SplatMap = 10,      // For terrain texture blending
    BiomeMap = 11,      // For biome-based coloring
    CloudMap = 12,      // For atmospheric effects
    NightLights = 13,   // City lights on dark side
    Max = 14
};
  struct TextureConfig
  {
    VkFormat format = VK_FORMAT_R8G8B8A8_UNORM;
    VkImageUsageFlags usage =
        VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT | VK_IMAGE_USAGE_TRANSFER_SRC_BIT;
    VkImageAspectFlags aspect = VK_IMAGE_ASPECT_COLOR_BIT;
    VkImageTiling tiling = VK_IMAGE_TILING_OPTIMAL;
    VkMemoryPropertyFlags properties = VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT;
    uint32_t mipLevels = 1;
    uint32_t arrayLayers = 1;
    VkSampleCountFlagBits samples = VK_SAMPLE_COUNT_1_BIT;
    bool generateMipmaps = false;
  };

  struct SamplerConfig
  {
    VkFilter magFilter = VK_FILTER_LINEAR;
    VkFilter minFilter = VK_FILTER_LINEAR;
    VkSamplerAddressMode addressModeU = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
    VkSamplerAddressMode addressModeV = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
    VkSamplerAddressMode addressModeW = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
    VkBool32 anisotropyEnable = VK_FALSE;  // Safer default - disable anisotropy for better compatibility
    float maxAnisotropy = 1.0f;            // Safe default when anisotropy is disabled
    VkBorderColor borderColor = VK_BORDER_COLOR_FLOAT_OPAQUE_BLACK;
    VkBool32 unnormalizedCoordinates = VK_FALSE;
    VkBool32 compareEnable = VK_FALSE;
    VkCompareOp compareOp = VK_COMPARE_OP_ALWAYS;
    VkSamplerMipmapMode mipmapMode = VK_SAMPLER_MIPMAP_MODE_LINEAR;
    float mipLodBias = 0.0f;
    float minLod = 0.0f;
    float maxLod = VK_LOD_CLAMP_NONE;
  };



  struct Texture
  {
    VkImage image = VK_NULL_HANDLE;
    VkDeviceMemory memory = VK_NULL_HANDLE;
    VkImageView view = VK_NULL_HANDLE;
    VkSampler sampler = VK_NULL_HANDLE;
    VkExtent3D extent{};
    VkFormat format = VK_FORMAT_UNDEFINED;
    uint32_t mipLevels = 1;
    VkDevice device = VK_NULL_HANDLE;  // Store device for cleanup
    
    // Default constructor
    Texture() = default;
    
    // Constructor with device
    explicit Texture(VkDevice dev) : device(dev) {}
    
    // Destructor - proper RAII cleanup
    ~Texture()
    {
      if (device != VK_NULL_HANDLE)
      {
        if (view != VK_NULL_HANDLE)
        {
          vkDestroyImageView(device, view, nullptr);
        }
        if (image != VK_NULL_HANDLE)
        {
          vkDestroyImage(device, image, nullptr);
        }
        if (memory != VK_NULL_HANDLE)
        {
          vkFreeMemory(device, memory, nullptr);
        }
        // Note: sampler is managed by VulkanSamplerManager, not destroyed here
      }
    }
    
    // Move constructor
    Texture(Texture&& other) noexcept
        : image(other.image), memory(other.memory), view(other.view),
          sampler(other.sampler), extent(other.extent), format(other.format),
          mipLevels(other.mipLevels), device(other.device)
    {
      other.image = VK_NULL_HANDLE;
      other.memory = VK_NULL_HANDLE;
      other.view = VK_NULL_HANDLE;
      other.sampler = VK_NULL_HANDLE;
      other.device = VK_NULL_HANDLE;
    }
    
    // Move assignment
    Texture& operator=(Texture&& other) noexcept
    {
      if (this != &other)
      {
        // Clean up existing resources
        if (device != VK_NULL_HANDLE)
        {
          if (view != VK_NULL_HANDLE)
          {
            vkDestroyImageView(device, view, nullptr);
          }
          if (image != VK_NULL_HANDLE)
          {
            vkDestroyImage(device, image, nullptr);
          }
          if (memory != VK_NULL_HANDLE)
          {
            vkFreeMemory(device, memory, nullptr);
          }
        }
        
        // Move resources
        image = other.image;
        memory = other.memory;
        view = other.view;
        sampler = other.sampler;
        extent = other.extent;
        format = other.format;
        mipLevels = other.mipLevels;
        device = other.device;
        
        // Clear source
        other.image = VK_NULL_HANDLE;
        other.memory = VK_NULL_HANDLE;
        other.view = VK_NULL_HANDLE;
        other.sampler = VK_NULL_HANDLE;
        other.device = VK_NULL_HANDLE;
      }
      return *this;
    }
    
    // Delete copy constructor and assignment to prevent resource duplication
    Texture(const Texture&) = delete;
    Texture& operator=(const Texture&) = delete;
    
    bool isValid() const
    {
      return image != VK_NULL_HANDLE && view != VK_NULL_HANDLE;
    }
  };

    struct TerrainUniforms
    {
        mat4 model;
        mat4 view;
        mat4 projection;
        vec3 sunDirection;
        float maxTessLevel;
        vec3 sunColor;
        float minTessLevel;
        vec3 atmosphereParams; // x: radius, y: rayleigh height, z: mie height
        float time;            // Time for animations
        
        // Dynamic planet parameters - these replace hardcoded values
        float planetRadius;       // Planet radius in meters
        float maxElevation;       // Maximum elevation in meters
        float heightScale;        // User-controlled height scaling
        float elevationExaggeration; // Visual exaggeration factor
    };
    struct CameraBlock
    {
        mat4 view;
        mat4 projection;
        mat4 viewProjection;
        vec4 cameraPosition;
    };

    struct TransformBlock
    {
        mat4 model;
        mat4 view;
        mat4 projection;
        mat4 modelView;
        mat4 modelViewProjection;
        mat4 normalMatrix;
    };

    struct TerrainBlock
    {
        float planetRadius;
        float maxHeight;
        float heightScale;
        float textureScale;
        vec4 padding; // Ensure 16-byte alignment
    };

    struct TessellationBlock
    {
        float maxTessLevel;
        float minTessLevel;
        float tessellationFactor;
        float distanceScale;
        vec4 padding; // Ensure 16-byte alignment
    };

    struct TerrainParams
    {
        vec3 sunDirection;
        float pad1;
        vec3 sunColor;
        float pad2;
        vec3 atmosphereParams;
        float time;
    };

  struct LightingUniforms
  {
    vec3 sunDirection;
    vec3 sunColor;
    float atmosphereRadius;
  };

  struct AtmosphereUniforms
  {
    vec3 rayleighScattering; // Default: (5.8e-6, 13.5e-6, 33.1e-6)
    float mieScattering;     // Default: 21e-6
    float rayleighHeight;    // Default: 8000.0
    float mieHeight;         // Default: 1200.0
    vec3 ozoneAbsorption;    // Ozone layer absorption
  };


/**
 * Material properties for physically-based rendering
 */
struct MaterialProperties {
    vec4 albedo = vec4(1.0f);
    float metallic = 0.0f;
    float roughness = 0.5f;
    float ao = 1.0f;
    float reflectance = 0.5f;  // For dielectrics (0.5 = 4% reflectance)
    vec3 emissive = vec3(0.0f);
    float emissiveStrength = 0.0f;
    float opacity = 1.0f;
    bool alphaTest = false;
    float alphaCutoff = 0.5f;
    float normalStrength = 1.0f;
    float heightScale = 0.05f;      // For parallax mapping
    float detailTiling = 16.0f;     // Detail texture tiling
    float atmosphereBlend = 0.0f;   // How much atmosphere affects this material
    float snowLevel = 0.7f;         // Height where snow appears
    float vegetationDensity = 0.0f; // For grass/tree placement
};

/**
 * Material blend modes
 */
enum class BlendMode {
    Opaque,
    AlphaTest,
    AlphaBlend,
    Additive,
    Multiply
};

/**
 * Material render states
 */
struct MaterialRenderState {
    BlendMode blendMode = BlendMode::Opaque;
    VkCullModeFlags cullMode = VK_CULL_MODE_BACK_BIT;
    bool depthWrite = true;
    bool depthTest = true;
    VkCompareOp depthCompareOp = VK_COMPARE_OP_LESS;
    bool castShadows = true;
    bool receiveShadows = true;
};

/**
 * Shader variant flags for material
 */
struct ShaderVariants {
    bool useNormalMapping = true;
    bool useParallaxMapping = false;
    bool useDetailTextures = false;
    bool useTessellation = false;
    bool useVertexColors = false;
    bool useInstancing = false;
    bool useAtmosphericScattering = false;
    bool usePlanetCurvature = false;  // For large-scale terrain
};

/**
 * Frame-specific rendering context for multi-scale planet rendering.
 * Tracks current view scale and active rendering features.
 */
struct RenderContext {
    float renderScale = 1.0f;      // 0.0 (surface) to 1.0 (galaxy)
    dvec3 viewPosition;             // Double precision for planetary scales
    mat4 viewMatrix;
    mat4 projMatrix;
    float nearPlane = 0.1f;
    float farPlane = 1000.0f;
    uint32_t frameIndex = 0;
    float time = 0.0f;              // Current time in seconds
    bool enableAtmosphere = true;
    bool enableClouds = true;
    bool enableOceans = true;
    bool enableTessellation = true;
    uint32_t maxLODLevel = 16;
    uint32_t drawCallCount = 0;
    uint32_t triangleCount = 0;
};

/**
 * Complete material definition
 */
struct Material {
    std::string name = "Default";
    MaterialProperties properties;
    MaterialRenderState renderState;
    ShaderVariants shaderVariants;
    std::array<VkImage, static_cast<size_t>(TextureSlot::Max)> textures = {VK_NULL_HANDLE};
    std::array<VkImageView, static_cast<size_t>(TextureSlot::Max)> textureViews = {VK_NULL_HANDLE};
    std::array<VkSampler, static_cast<size_t>(TextureSlot::Max)> samplers = {VK_NULL_HANDLE};
    VkDescriptorSet descriptorSet = VK_NULL_HANDLE;
    VkPipeline pipeline = VK_NULL_HANDLE;
    VkPipelineLayout pipelineLayout = VK_NULL_HANDLE;
    BufferResourcePtr uniformBuffer;
    void* uniformBufferMapped = nullptr;
    std::vector<uint8_t> uniformData;
    float lodBias = 0.0f;
    uint32_t maxMipLevel = 16;
    bool HasTexture(TextureSlot slot) const {
        return textures[static_cast<size_t>(slot)] != VK_NULL_HANDLE;
    }

    bool IsTransparent() const {
        return renderState.blendMode != BlendMode::Opaque;
    }

    bool RequiresSorting() const {
        return renderState.blendMode == BlendMode::AlphaBlend;
    }
};

/**
 * Vertex attributes for different mesh types
 */
struct VertexAttributes {
    vec3 position;
    vec3 normal;
    vec4 tangent;    // w component for handedness
    vec2 texCoord0;
    vec2 texCoord1;  // Secondary UV for detail/lightmap
    vec4 color;      // Vertex color
    vec4 boneWeights = vec4(0.0f);
    ivec4 boneIndices = ivec4(0);
};

/**
 * Simplified vertex for terrain/planet rendering
 */
struct TerrainVertex {
    vec3 position;
    vec3 normal;
    vec4 tangent;
    vec2 texCoord0;
    vec2 texCoord1;
    vec4 color;
    float height;
    float materialBlend;
};

/**
 * Extended terrain vertex attributes for advanced terrain rendering
 * Optimized for terrain without unnecessary data like bone weights
 */
struct TerrainVertexAttributes {
    vec3 position;          // World/local position (12 bytes)
    vec3 normal;            // Surface normal (12 bytes)
    vec4 tangent;
    vec2 texCoord0;
    vec2 texCoord1;
    vec4 color;
    float height;
    float materialBlend;
};

/**
 * Instance data for instanced rendering
 */
struct InstanceData {
    mat4 transform;
    vec4 color;
    vec4 custom;  // User-defined per-instance data
};

/**
 * Mesh primitive - a single draw call
 */
struct MeshPrimitive {
    uint32_t firstIndex = 0;
    uint32_t indexCount = 0;
    uint32_t vertexOffset = 0;
    uint32_t materialIndex = 0;
    vec3 boundingCenter;
    float boundingRadius;
    vec3 boundingMin;
    vec3 boundingMax;
};

/**
 * Level of Detail (LOD) for a mesh
 */
struct MeshLOD {
    std::vector<MeshPrimitive> primitives;
    float screenSizeThreshold;  // Switch LOD when object covers this % of screen
    uint32_t totalIndices = 0;
    uint32_t totalVertices = 0;
};

/**
 * Static mesh data (stored in GPU memory)
 */
struct MeshData {
    std::string name;
    std::vector<VertexAttributes> vertices;
    std::vector<uint32_t> indices;
    BufferResourcePtr vertexBuffer;
    BufferResourcePtr indexBuffer;
    BufferResourcePtr instanceBuffer;
    BufferResourcePtr terrainVertexBuffer;  // Additional buffer for terrain-specific vertex attributes
    std::vector<MeshLOD> lods;
    uint32_t vertexCount = 0;
    uint32_t indexCount = 0;
    uint32_t instanceCount = 0;
    VkIndexType indexType = VK_INDEX_TYPE_UINT32;
    vec3 boundingCenter;
    float boundingRadius;
    vec3 boundingMin;
    vec3 boundingMax;
    bool isUploaded = false;  // Track if buffers have been uploaded to GPU
    
    bool terrainVerticesConverted = false;
};

/**
 * Render flags for optimization
 */
struct RenderFlags {
    uint32_t castShadow : 1;
    uint32_t receiveShadow : 1;
    uint32_t isStatic : 1;        // Never moves
    uint32_t alwaysVisible : 1;   // Skip frustum culling
    uint32_t useInstancing : 1;
    uint32_t isTransparent : 1;
    uint32_t requiresDepthSort : 1;
    uint32_t isOccluder : 1;      // Can occlude other objects
    uint32_t useLOD : 1;
    uint32_t isTerrain : 1;       // Special terrain handling
    uint32_t isPlanet : 1;        // Planet-scale object
    uint32_t hasAtmosphere : 1;   // Requires atmosphere pass
};

/**
 * Complete renderable mesh
 */
struct RenderableMesh {
    std::shared_ptr<MeshData> mesh;
    std::shared_ptr<Material> material;
    mat4 worldTransform = mat4(1.0f);
    mat4 previousWorldTransform = mat4(1.0f);  // For motion blur
    RenderFlags flags = {};
    float renderPriority = 0.0f;  // Higher renders first for opaque
    uint32_t renderLayer = 0;     // For multi-pass rendering
    uint32_t currentLOD = 0;
    float lodDistance = 0.0f;
    std::vector<InstanceData> instanceData;
    bool instanceDataDirty = false;
    BoundingSphere worldBoundingSphere;
    vec3 worldBoundingMin;
    vec3 worldBoundingMax;
    bool isVisible = true;
    bool isFrustumCulled = false;
    bool isOccluded = false;
    uint32_t lastVisibleFrame = 0;
    struct PlanetData {
        float radius = 0.0f;
        float atmosphereRadius = 0.0f;
        vec3 centerWorldPos;
        float distanceToViewer = 0.0f;
        bool renderAsImpostor = false;  // Very distant planets
    } planetData;
    void UpdateWorldBounds() {
        if (mesh) {
            vec4 center = worldTransform * vec4(mesh->boundingCenter, 1.0f);
            worldBoundingSphere.center = vec3(center);
            worldBoundingSphere.radius = mesh->boundingRadius * GetMaxScale();
            vec4 corners[8];
            corners[0] = worldTransform * vec4(mesh->boundingMin, 1.0f);
            corners[1] = worldTransform * vec4(mesh->boundingMax, 1.0f);

            worldBoundingMin = vec3(corners[0]);
            worldBoundingMax = vec3(corners[0]);
            for (int i = 1; i < 8; ++i) {
                vec3 corner = vec3(corners[i]);
                worldBoundingMin.x = std::min(worldBoundingMin.x, corner.x);
                worldBoundingMin.y = std::min(worldBoundingMin.y, corner.y);
                worldBoundingMin.z = std::min(worldBoundingMin.z, corner.z);
                worldBoundingMax.x = std::max(worldBoundingMax.x, corner.x);
                worldBoundingMax.y = std::max(worldBoundingMax.y, corner.y);
                worldBoundingMax.z = std::max(worldBoundingMax.z, corner.z);
            }
        }
    }

    float GetMaxScale() const {
        vec3 scale;
        scale.x = length(vec3(worldTransform[0]));
        scale.y = length(vec3(worldTransform[1]));
        scale.z = length(vec3(worldTransform[2]));
        return std::max(scale.x, std::max(scale.y, scale.z));
    }

    bool ShouldRender(float currentFrame) const {
        return isVisible && !isFrustumCulled && !isOccluded;
    }

    uint32_t GetRenderKey() const {
        uint32_t key = 0;
        key |= (material ? (material->pipeline != VK_NULL_HANDLE ? 1 : 0) : 0) << 31;
        key |= (flags.isTransparent ? 1 : 0) << 30;
        key |= (material ? (reinterpret_cast<uintptr_t>(material.get()) & 0x3FFF) : 0) << 16;
        key |= (mesh ? (reinterpret_cast<uintptr_t>(mesh.get()) & 0xFFFF) : 0);
        return key;
    }

    // Note: RecordDrawCommands should be implemented in RenderableMesh.cpp to avoid importing BufferCore here
};

/**
 * Planet renderable with terrain patches
 */
struct RenderablePlanet : public RenderableMesh {
    std::shared_ptr<TerrainData> terrain;
    std::shared_ptr<Skybox> atmosphere;
    std::vector<RenderableMesh> terrainPatches;
    std::optional<RenderableMesh> oceanMesh;
    std::optional<RenderableMesh> cloudMesh;
    std::optional<RenderableMesh> ringMesh;
};

} // namespace PlanetGen::Rendering
module;
#include <vulkan/vulkan.h>
#include <array>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>
#include <functional>
#include <chrono>
#include <iostream>

#include <string_view>
export module VulkanTypes;
import GLMModule;
import NoiseTypes;
import GenerationTypes;
import BufferCore;
export using VkBuffer = ::VkBuffer;
export using VkDeviceMemory = ::VkDeviceMemory;
export using VkImage = ::VkImage;
export using VkImageView = ::VkImageView;
export using VkInstance = ::VkInstance;
export using VkPhysicalDevice = ::VkPhysicalDevice;
export using VkDevice = ::VkDevice;
export using VkQueue = ::VkQueue;
export using VkCommandBuffer = ::VkCommandBuffer;
export using VkCommandPool = ::VkCommandPool;
export using VkSurfaceKHR = ::VkSurfaceKHR;
export using VkSwapchainKHR = ::VkSwapchainKHR;
export using VkRenderPass = ::VkRenderPass;
export using VkFramebuffer = ::VkFramebuffer;
export using VkSampler = ::VkSampler;
export using VkDescriptorSet = ::VkDescriptorSet;
export using VkDescriptorPool = ::VkDescriptorPool;
export using VkDescriptorSetLayout = ::VkDescriptorSetLayout;
export using VkPipeline = ::VkPipeline;
export using VkPipelineLayout = ::VkPipelineLayout;
export using VkShaderModule = ::VkShaderModule;
export using VkSemaphore = ::VkSemaphore;
export using VkFence = ::VkFence;
export using VkEvent = ::VkEvent;
export using VkFormat = ::VkFormat;
export using VkImageLayout = ::VkImageLayout;
export using VkImageUsageFlags = ::VkImageUsageFlags;
export using VkImageAspectFlags = ::VkImageAspectFlags;
export using VkImageTiling = ::VkImageTiling;
export using VkFormatFeatureFlags = ::VkFormatFeatureFlags;
export using VkBufferUsageFlags = ::VkBufferUsageFlags;
export using VkMemoryPropertyFlags = ::VkMemoryPropertyFlags;
export using VkSharingMode = ::VkSharingMode;
export using VkSurfaceCapabilitiesKHR = ::VkSurfaceCapabilitiesKHR;
export using VkSurfaceFormatKHR = ::VkSurfaceFormatKHR;
export using VkPresentModeKHR = ::VkPresentModeKHR;
export using VkExtent2D = ::VkExtent2D;
export using VkExtent3D = ::VkExtent3D;
export using VkOffset3D = ::VkOffset3D;
export using VkImageSubresourceLayers = ::VkImageSubresourceLayers;
export using VkDeviceSize = ::VkDeviceSize;
export using VkResult = ::VkResult;
export using VkBool32 = ::VkBool32;
export using VkFlags = ::VkFlags;
export using VkSampleMask = ::VkSampleMask;
export using VkDebugUtilsMessageSeverityFlagBitsEXT =
    ::VkDebugUtilsMessageSeverityFlagBitsEXT;
export using VkDebugUtilsMessageTypeFlagsEXT =
    ::VkDebugUtilsMessageTypeFlagsEXT;
export using VkDebugUtilsMessengerCallbackDataEXT =
    ::VkDebugUtilsMessengerCallbackDataEXT;
export using VkDebugUtilsMessengerEXT = ::VkDebugUtilsMessengerEXT;
export using VkDebugUtilsMessengerCreateInfoEXT =
    ::VkDebugUtilsMessengerCreateInfoEXT;
export using VkPhysicalDeviceProperties = ::VkPhysicalDeviceProperties;
export using VkPhysicalDeviceFeatures = ::VkPhysicalDeviceFeatures;
export using VkQueueFamilyProperties = ::VkQueueFamilyProperties;
export using VkLayerProperties = ::VkLayerProperties;
export using VkExtensionProperties = ::VkExtensionProperties;
export using VkApplicationInfo = ::VkApplicationInfo;
export using VkInstanceCreateInfo = ::VkInstanceCreateInfo;
export using VkDeviceCreateInfo = ::VkDeviceCreateInfo;
export using VkDeviceQueueCreateInfo = ::VkDeviceQueueCreateInfo;
export using VkCommandPoolCreateInfo = ::VkCommandPoolCreateInfo;
export using VkSwapchainCreateInfoKHR = ::VkSwapchainCreateInfoKHR;
export using VkImageViewCreateInfo = ::VkImageViewCreateInfo;
export using VkImageCreateInfo = ::VkImageCreateInfo;
export using VkMemoryAllocateInfo = ::VkMemoryAllocateInfo;
export using VkBufferCreateInfo = ::VkBufferCreateInfo;
export using VkRenderPassCreateInfo = ::VkRenderPassCreateInfo;
export using VkFramebufferCreateInfo = ::VkFramebufferCreateInfo;
export using VkAttachmentDescription = ::VkAttachmentDescription;
export using VkAttachmentReference = ::VkAttachmentReference;
export using VkSubpassDescription = ::VkSubpassDescription;
export using VkSubpassDependency = ::VkSubpassDependency;
export using VkImageMemoryBarrier = ::VkImageMemoryBarrier;
export using VkBufferImageCopy = ::VkBufferImageCopy;
export using VkImageBlit = ::VkImageBlit;
export using VkPipelineStageFlags = ::VkPipelineStageFlags;
export using VkDescriptorImageInfo = ::VkDescriptorImageInfo;
export using VkWriteDescriptorSet = ::VkWriteDescriptorSet;
export struct BufferCreateInfo
{
  VkDeviceSize size = 0;
  VkBufferUsageFlags usage = 0;
  VkMemoryPropertyFlags memoryProperties = 0;
  VkSharingMode sharingMode = VK_SHARING_MODE_EXCLUSIVE;
};

export struct TempCmdBuffer {
    VkCommandBuffer buffer;
    VkCommandPool pool;
};
export namespace PlanetGen::Rendering
{
  // BufferResource is defined in BufferCore module
  // using BufferResourcePtr = std::shared_ptr<BufferResource>; // Moved to BufferCore
      // Compute-specific convenience methods (to replace VulkanComputeBase usage)
    struct ComputeDescriptorData {
        // Legacy fields for compatibility
        VkBuffer inputBuffer = VK_NULL_HANDLE;
        VkBuffer outputBuffer = VK_NULL_HANDLE;
        VkBuffer paramsBuffer = VK_NULL_HANDLE;
        VkImageView inputImage = VK_NULL_HANDLE;
        VkImageView outputImage = VK_NULL_HANDLE;
        VkSampler sampler = VK_NULL_HANDLE;
        
        // Extended fields for terrain processors
        // Buffer bindings with explicit binding indices
        std::unordered_map<uint32_t, VkBuffer> bufferBindings;
        
        // Uniform buffer bindings
        std::unordered_map<uint32_t, VkBuffer> uniformBindings;
        
        // Image bindings with layout and sampler info
        struct ImageBinding {
            VkImageView imageView = VK_NULL_HANDLE;
            VkSampler sampler = VK_NULL_HANDLE;
            VkImageLayout imageLayout = VK_IMAGE_LAYOUT_GENERAL;
        };
        std::unordered_map<uint32_t, ImageBinding> imageBindings;
        
        // Helper methods to add bindings
        void AddBufferBinding(uint32_t binding, VkBuffer buffer) {
            bufferBindings[binding] = buffer;
        }
        
        void AddUniformBinding(uint32_t binding, VkBuffer buffer) {
            uniformBindings[binding] = buffer;
        }
        
        void AddImageBinding(uint32_t binding, VkImageView imageView, 
                           VkSampler sampler = VK_NULL_HANDLE,
                           VkImageLayout layout = VK_IMAGE_LAYOUT_GENERAL) {
            imageBindings[binding] = {imageView, sampler, layout};
        }
    };


/**
 * Main terrain data structure for rendering
 */
  struct TerrainData {
    PlanetaryTerrainConfig config;
    std::vector<std::unique_ptr<TerrainPatch>> patches;
    TerrainPatch* rootPatch = nullptr;
    std::vector<BiomeData> biomes;
    std::vector<uint8_t> biomeMap;  // Per-vertex biome indices
    PlanetGen::Rendering::BufferResourcePtr vertexBuffer;
    PlanetGen::Rendering::BufferResourcePtr indexBuffer;
    PlanetGen::Rendering::BufferResourcePtr instanceBuffer;  // For instanced details
    struct TextureMaps {
        VkImage heightmap = VK_NULL_HANDLE;      // Full planet heightmap
        VkImage normalmap = VK_NULL_HANDLE;      // Precomputed normals
        VkImage biomemap = VK_NULL_HANDLE;       // Biome distribution
        VkImage detailmap = VK_NULL_HANDLE;      // Surface detail texture
        VkImage splatmap = VK_NULL_HANDLE;       // Texture blending weights
    } textures;
    vec3 viewerPosition;    // For LOD calculations
    float viewDistance;     // Current view distance
    uint32_t visiblePatches = 0;
    struct {
        std::vector<vec3> cityLocations;     // For city lights
        std::vector<vec3> volcanoLocations;  // Active volcanic spots
        std::vector<vec4> cloudCoverage;     // Dynamic cloud data
        float waterLevel = 0.0f;              // Can change for tidal effects
    } features;
    uint32_t totalVertices = 0;
    uint32_t totalTriangles = 0;
    float gpuMemoryUsageMB = 0.0f;
};

}

export namespace PlanetGen::Rendering
{

  
enum class BufferPoolType {
    Rendering,
    Compute,
    Generation,
    Descriptor,
    // Add more as needed
    Default = Rendering
};
  inline const char *vkResultToString(VkResult result)
  {
    switch (result)
    {
    case VK_SUCCESS:
      return "VK_SUCCESS";
    case VK_NOT_READY:
      return "VK_NOT_READY";
    case VK_TIMEOUT:
      return "VK_TIMEOUT";
    case VK_EVENT_SET:
      return "VK_EVENT_SET";
    case VK_EVENT_RESET:
      return "VK_EVENT_RESET";
    case VK_INCOMPLETE:
      return "VK_INCOMPLETE";
    case VK_ERROR_OUT_OF_HOST_MEMORY:
      return "VK_ERROR_OUT_OF_HOST_MEMORY";
    case VK_ERROR_OUT_OF_DEVICE_MEMORY:
      return "VK_ERROR_OUT_OF_DEVICE_MEMORY";
    case VK_ERROR_INITIALIZATION_FAILED:
      return "VK_ERROR_INITIALIZATION_FAILED";
    case VK_ERROR_DEVICE_LOST:
      return "VK_ERROR_DEVICE_LOST";
    case VK_ERROR_MEMORY_MAP_FAILED:
      return "VK_ERROR_MEMORY_MAP_FAILED";
    case VK_ERROR_LAYER_NOT_PRESENT:
      return "VK_ERROR_LAYER_NOT_PRESENT";
    case VK_ERROR_EXTENSION_NOT_PRESENT:
      return "VK_ERROR_EXTENSION_NOT_PRESENT";
    case VK_ERROR_FEATURE_NOT_PRESENT:
      return "VK_ERROR_FEATURE_NOT_PRESENT";
    case VK_ERROR_INCOMPATIBLE_DRIVER:
      return "VK_ERROR_INCOMPATIBLE_DRIVER";
    case VK_ERROR_TOO_MANY_OBJECTS:
      return "VK_ERROR_TOO_MANY_OBJECTS";
    case VK_ERROR_FORMAT_NOT_SUPPORTED:
      return "VK_ERROR_FORMAT_NOT_SUPPORTED";
    case VK_ERROR_FRAGMENTED_POOL:
      return "VK_ERROR_FRAGMENTED_POOL";
    case VK_ERROR_UNKNOWN:
      return "VK_ERROR_UNKNOWN";
    default:
      return "UNKNOWN_VK_RESULT";
    }
  }
  class RateLimitedLogger {
  private:
    std::chrono::steady_clock::time_point lastLogTime;
    int callInterval;        // Log once per X calls
    int intervalSeconds;     // Time-based interval
    int callCount;           // Current call count
    int messageCount;        // Messages logged in current time window
    int maxMessages;         // Max messages per time window
    std::string componentName;

  public:
    // name: component name for logging
    // callInterval: log once per X calls (0 = disabled, use time-based only)
    // maxMsg: max messages per time window
    // intervalSec: time window in seconds
    RateLimitedLogger(const std::string& name, int callInterval, int maxMsg = 3, int intervalSec = 5)
        : lastLogTime(std::chrono::steady_clock::now()),
          callInterval(callInterval),
          intervalSeconds(intervalSec),
          callCount(0),
          messageCount(0),
          maxMessages(maxMsg),
          componentName(name) {}

    // Legacy constructor for backward compatibility (old 3-param version)
    RateLimitedLogger(const std::string& name, int maxMsg = 3, int intervalSec = 5)
        : lastLogTime(std::chrono::steady_clock::now()),
          callInterval(0),  // Disabled, use time-based only
          intervalSeconds(intervalSec),
          callCount(0),
          messageCount(0),
          maxMessages(maxMsg),
          componentName(name) {}

    void log(const std::string& message) {
        callCount++;
        
        // Check call-based interval
        if (callInterval > 0 && (callCount % callInterval) != 0) {
            return;  // Skip this call
        }
        
        // Check time-based interval
        auto now = std::chrono::steady_clock::now();
        auto elapsedSeconds = std::chrono::duration_cast<std::chrono::seconds>(now - lastLogTime).count();
        if (elapsedSeconds >= intervalSeconds) {
            messageCount = 0;
            lastLogTime = now;
        }
        
        if (messageCount < maxMessages) {
            std::cout << "[" << componentName << "] " << message << std::endl;
            messageCount++;
        }
    }

    template<typename... Args>
    void log(Args&&... args) {
        callCount++;
        
        // Check call-based interval
        if (callInterval > 0 && (callCount % callInterval) != 0) {
            return;  // Skip this call
        }
        
        // Check time-based interval
        auto now = std::chrono::steady_clock::now();
        auto elapsedSeconds = std::chrono::duration_cast<std::chrono::seconds>(now - lastLogTime).count();
        if (elapsedSeconds >= intervalSeconds) {
            messageCount = 0;
            lastLogTime = now;
        }
        
        if (messageCount < maxMessages) {
            std::cout << "[" << componentName << "] ";
            ((std::cout << args), ...);
            std::cout << std::endl;
            messageCount++;
        }
    }
    
    // Reset counters (useful for testing or manual control)
    void reset() {
        callCount = 0;
        messageCount = 0;
        lastLogTime = std::chrono::steady_clock::now();
    }
  };
  using String = std::string;
  using StringView = std::string_view;
  using Vector2 = vec2;
  using Vector3 = vec3;
  using Vector4 = vec4;
  using Matrix4 = mat4;
  struct BasicPipelineConfig
  {
    VkPipelineLayout pipelineLayout;
    VkRenderPass renderPass;
    VkExtent2D extent;
    bool enableDepthTest;
    bool enableBlending;
    float lineWidth;
  };
  class BufferHandle
  {
  public:
    explicit BufferHandle(VkBuffer buffer = VK_NULL_HANDLE, bool own = true)
        : m_buffer(buffer), m_owned(own) {}
    BufferHandle(BufferHandle &&other) noexcept
        : m_buffer(other.m_buffer), m_owned(other.m_owned)
    {
      other.m_buffer = VK_NULL_HANDLE;
      other.m_owned = false;
    }
    BufferHandle &operator=(BufferHandle &&other) noexcept
    {
      if (this != &other)
      {
        Release(); // Release current handle if we own it
        m_buffer = other.m_buffer;
        m_owned = other.m_owned;
        other.m_buffer = VK_NULL_HANDLE;
        other.m_owned = false;
      }
      return *this;
    }
    ~BufferHandle() { Release(); }
    BufferHandle(const BufferHandle &) = delete;
    BufferHandle &operator=(const BufferHandle &) = delete;

    VkBuffer Get() const { return m_buffer; }
    bool IsValid() const { return m_buffer != VK_NULL_HANDLE; }
    bool IsOwned() const { return m_owned; }
    VkBuffer Release()
    {
      VkBuffer buffer = m_buffer;
      m_buffer = VK_NULL_HANDLE;
      m_owned = false;
      return buffer;
    }
    void Reset(VkBuffer buffer = VK_NULL_HANDLE)
    {
      Release();
      m_buffer = buffer;
      m_owned = true;
    }

  private:
    VkBuffer m_buffer;
    bool m_owned;
  };

  class MemoryHandle
  {
  public:
    explicit MemoryHandle(VkDeviceMemory memory = VK_NULL_HANDLE, bool own = true)
        : m_memory(memory), m_owned(own) {}
    MemoryHandle(MemoryHandle &&other) noexcept
        : m_memory(other.m_memory), m_owned(other.m_owned)
    {
      other.m_memory = VK_NULL_HANDLE;
      other.m_owned = false;
    }
    MemoryHandle &operator=(MemoryHandle &&other) noexcept
    {
      if (this != &other)
      {
        Release(); // Release current handle if we own it
        m_memory = other.m_memory;
        m_owned = other.m_owned;
        other.m_memory = VK_NULL_HANDLE;
        other.m_owned = false;
      }
      return *this;
    }
    ~MemoryHandle() { Release(); }
    MemoryHandle(const MemoryHandle &) = delete;
    MemoryHandle &operator=(const MemoryHandle &) = delete;

    VkDeviceMemory Get() const { return m_memory; }
    bool IsValid() const { return m_memory != VK_NULL_HANDLE; }
    bool IsOwned() const { return m_owned; }
    VkDeviceMemory Release()
    {
      VkDeviceMemory memory = m_memory;
      m_memory = VK_NULL_HANDLE;
      m_owned = false;
      return memory;
    }
    void Reset(VkDeviceMemory memory = VK_NULL_HANDLE)
    {
      Release();
      m_memory = memory;
      m_owned = true;
    }

  private:
    VkDeviceMemory m_memory;
    bool m_owned;
  };

  class ImageHandle
  {
  public:
    explicit ImageHandle(VkImage image = VK_NULL_HANDLE) : m_image(image) {}
    VkImage Get() const { return m_image; }
    bool IsValid() const { return m_image != VK_NULL_HANDLE; }

  private:
    VkImage m_image;
  };

  class PipelineHandle
  {
  public:
    explicit PipelineHandle(VkPipeline pipeline = VK_NULL_HANDLE)
        : m_pipeline(pipeline) {}
    VkPipeline Get() const { return m_pipeline; }
    bool IsValid() const { return m_pipeline != VK_NULL_HANDLE; }

  private:
    VkPipeline m_pipeline;
  };

  class PipelineLayoutHandle
  {
  public:
    explicit PipelineLayoutHandle(VkPipelineLayout layout = VK_NULL_HANDLE)
        : m_layout(layout) {}
    VkPipelineLayout Get() const { return m_layout; }
    bool IsValid() const { return m_layout != VK_NULL_HANDLE; }

  private:
    VkPipelineLayout m_layout;
  };

  class ShaderModuleHandle
  {
  public:
    explicit ShaderModuleHandle(VkShaderModule module = VK_NULL_HANDLE)
        : m_module(module) {}
    VkShaderModule Get() const { return m_module; }
    bool IsValid() const { return m_module != VK_NULL_HANDLE; }

  private:
    VkShaderModule m_module;
  };
  struct QueueFamilyIndices
  {
    std::optional<uint32_t> graphicsFamily;
    std::optional<uint32_t> computeFamily;
    std::optional<uint32_t> presentFamily;
    std::optional<uint32_t> transferFamily;

    bool IsComplete() const
    {
      return graphicsFamily.has_value() && computeFamily.has_value() && transferFamily.has_value();
    }
  };




  struct SwapChainSupportDetails
  {
    VkSurfaceCapabilitiesKHR capabilities;
    std::vector<VkSurfaceFormatKHR> formats;
    std::vector<VkPresentModeKHR> presentModes;
  };

/**
 * Skybox layer for multi-layer rendering
 */
struct SkyboxLayer {
    enum class Type {
        Atmosphere,      // Planetary atmosphere
        Clouds,          // Cloud layer
        Stars,           // Star field
        Nebula,          // Distant nebulae
        Galaxy,          // Milky way or other galaxies
        CosmicDust       // Foreground dust/particles
    };
    
    Type type;
    float opacity = 1.0f;
    float parallaxFactor = 0.0f;  // For depth effect
    bool animated = false;
    float animationSpeed = 0.0f;
};

/**
 * Atmospheric scattering parameters
 */
struct AtmosphereParams {
    vec3 rayleighCoefficients = vec3(5.8e-6f, 13.5e-6f, 33.1e-6f);
    float rayleighScaleHeight = 8000.0f;  // meters
    vec3 mieCoefficients = vec3(21e-6f);
    float mieScaleHeight = 1200.0f;
    float mieAnisotropy = 0.758f;  // Henyey-Greenstein phase function
    float planetRadius = 6371000.0f;      // meters
    float atmosphereRadius = 6471000.0f;  // meters
    vec3 sunDirection = normalize(vec3(0.0f, 0.7f, 0.7f));
    vec3 sunColor = vec3(20.0f);  // HDR intensity
    float sunAngularDiameter = 0.00935f;  // radians
};

struct FrameState {
    uint32_t currentFrame = 0;
    uint32_t currentImageIndex = 0;
    bool frameInProgress = false;
    uint32_t lastAcquiredSemaphoreIndex = 0; // Track which semaphore was used for image acquisition
    VkCommandBuffer frameCommandBuffer = VK_NULL_HANDLE; // Cache command buffer per frame
    VkCommandPool frameCommandPool = VK_NULL_HANDLE; // Cache command pool per frame
}; 

/**
 * Main skybox structure
 */
struct Skybox {
    enum class RenderMode {
        FromSurface,      // Standing on planet - full atmosphere
        FromOrbit,        // In orbit - thin atmosphere + space
        FromSpace,        // Deep space - stars only
        FromGalaxy        // Galactic view - simplified
    };
    
    RenderMode currentMode = RenderMode::FromSurface;
    std::vector<SkyboxLayer> layers;
    struct {
        VkImage starfield = VK_NULL_HANDLE;      // 4K star positions
        VkImage nebulae = VK_NULL_HANDLE;        // Colorful space clouds
        VkImage galaxies = VK_NULL_HANDLE;       // Distant galaxies
        VkImage sunTexture = VK_NULL_HANDLE;     // Sun with corona
        VkImage moonTexture = VK_NULL_HANDLE;    // Moon(s) texture
        VkImage cloudNoise = VK_NULL_HANDLE;     // For procedural clouds
        VkImage transmittanceLUT = VK_NULL_HANDLE;
        VkImage scatteringLUT = VK_NULL_HANDLE;
        VkImage irradianceLUT = VK_NULL_HANDLE;
    } textures;
    AtmosphereParams atmosphere;
    bool renderAtmosphere = true;
    float atmosphereExposure = 10.0f;
    struct CelestialBody {
        vec3 position;       // Relative to planet
        float radius;        // Visual radius
        vec3 color;
        float brightness;
        VkImage texture = VK_NULL_HANDLE;
    };
    
    std::vector<CelestialBody> celestialBodies;
    CelestialBody* sun = nullptr;
    std::vector<CelestialBody*> moons;
    struct TimeOfDay {
        float hours = 12.0f;  // 0-24
        float dayOfYear = 180.0f;  // 0-365
        float latitude = 0.0f;      // Observer latitude
        vec3 sunDirection;
        float sunIntensity;
        vec3 ambientColor;
    } timeOfDay;
    VkBuffer uniformBuffer = VK_NULL_HANDLE;
    VkDescriptorSet descriptorSet = VK_NULL_HANDLE;
    float viewAltitude = 0.0f;  // Height above surface
    mat4 viewMatrix;
    mat4 projMatrix;
    struct {
        bool enableAurora = false;
        float auroraIntensity = 0.5f;
        
        bool enableShootingStars = false;
        float shootingStarFrequency = 0.1f;
        
        bool enableLightPollution = false;
        std::vector<vec3> cityLightPositions;
    } effects;
};

/**
 * Scale-aware render data that adapts based on viewing distance
 */
struct UniverseRenderData {
    float renderScale;
    std::vector<TerrainData*> visiblePlanets;
    std::vector<Skybox*> activeSkyboxes;
    float scaleTransitionFactor;  // For smooth transitions
    bool isTransitioning;
    uint32_t maxLODLevel;
    float lodBias;
    bool useInstancedRendering;
    bool useImpostors;  // For very distant objects
};

/**
 * Planetary system data for rendering multiple bodies
 */
struct PlanetarySystem {
    struct Planet {
        std::unique_ptr<TerrainData> terrain;
        std::unique_ptr<Skybox> skybox;
        vec3 position;
        vec3 rotation;
        float orbitalRadius;
        float orbitalSpeed;
        float mass;
        float radius;
        bool hasRings;
        bool hasAtmosphere;
    };
    
    std::vector<std::unique_ptr<Planet>> planets;
    vec3 starPosition;
    float starRadius;
    vec3 starColor;
};



  struct WireframePushConstants
  {
    mat4 modelViewProjection;
    vec4 color;
    vec4 lineParams;
  };

  struct TerrainPushConstants
  {
    mat4 modelViewProjection;   // Combined MVP matrix (64 bytes)
    mat4 modelView;             // For normal transformation (64 bytes)
    vec4 cameraPos;             // Camera position in world space (16 bytes)
    vec4 sunDirection;          // Sun direction + time in w (16 bytes)
    vec4 sunColor;              // Sun color + tessellation min in w (16 bytes)
    vec4 atmosphereParams;      // Atmosphere params + tessellation max in w (16 bytes)
    // Total: 192 bytes (well under 256 byte limit)
  };

  struct AtmospherePushConstants
  {
    mat4 modelViewProjection;
    vec4 cameraPosition;
    vec4 planetCenter;
    vec4 atmosphereParams;
    vec4 scatteringParams;
  };

  enum class LODLevel : uint32_t {
    LOD0 = 0,  // Highest detail
    LOD1 = 1,
    LOD2 = 2,
    LOD3 = 3,
    LOD4 = 4,
    LOD5 = 5,
    LOD6 = 6,
    LOD7 = 7   // Lowest detail
  };

  enum class PipelineType
  {
    // Basic types
    Wireframe,
    Terrain,
    Standard,
    Compute,
    Atmosphere,
    
    // Planet scale
    PlanetSurface,
    PlanetImpostor,
    
    // System scale
    SystemMap,
    
    // Galaxy scale
    GalacticView,
    
    // Legacy compatibility
    PlanetSpace,
    SpaceScale,
    GalaxyScale,
    StarSystem,
    Galaxy
  };

/**
 * Dynamic state for pipeline updates.
 */
struct DynamicPipelineState {
    VkViewport viewport;
    VkRect2D scissor;
    float lineWidth = 1.0f;
    bool viewportDirty = true;
    bool scissorDirty = true;
    bool lineWidthDirty = false;
};
struct BoundingSphere {
    vec3 center;
    float radius;
};
  struct PlanetVertex
  {
    Vector3 position;    // Vertex position
    Vector2 texCoord;    // Texture coordinates
    Vector3 patchNormal; // Normal for the patch (used in tessellation)
  };
  struct PipelineConfig
  {
    PipelineConfig() {
      vertexInputInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO;
      inputAssembly.sType = VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO;
      rasterizer.sType = VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO;
      multisampling.sType = VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO;
      colorBlending.sType = VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO;
      depthStencil.sType = VK_STRUCTURE_TYPE_PIPELINE_DEPTH_STENCIL_STATE_CREATE_INFO;
      tessellationState.sType = VK_STRUCTURE_TYPE_PIPELINE_TESSELLATION_STATE_CREATE_INFO;
      tessellationState.patchControlPoints = 4; // Default for quad patches
      inputAssembly.topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST;
      inputAssembly.primitiveRestartEnable = VK_FALSE;
      
      rasterizer.depthClampEnable = VK_FALSE;
      rasterizer.rasterizerDiscardEnable = VK_FALSE;
      rasterizer.polygonMode = VK_POLYGON_MODE_FILL;
      rasterizer.lineWidth = 1.0f;
      rasterizer.cullMode = VK_CULL_MODE_BACK_BIT;
      rasterizer.frontFace = VK_FRONT_FACE_COUNTER_CLOCKWISE;
      rasterizer.depthBiasEnable = VK_FALSE;
      
      multisampling.sampleShadingEnable = VK_FALSE;
      multisampling.rasterizationSamples = VK_SAMPLE_COUNT_1_BIT;
      
      colorBlendAttachment.colorWriteMask = VK_COLOR_COMPONENT_R_BIT | VK_COLOR_COMPONENT_G_BIT |
                                           VK_COLOR_COMPONENT_B_BIT | VK_COLOR_COMPONENT_A_BIT;
      colorBlendAttachment.blendEnable = VK_FALSE;
      
      colorBlending.logicOpEnable = VK_FALSE;
      colorBlending.logicOp = VK_LOGIC_OP_COPY;
      colorBlending.attachmentCount = 1;
      colorBlending.pAttachments = &colorBlendAttachment;
      
      depthStencil.depthTestEnable = VK_TRUE;
      depthStencil.depthWriteEnable = VK_TRUE;
      depthStencil.depthCompareOp = VK_COMPARE_OP_LESS;
      depthStencil.depthBoundsTestEnable = VK_FALSE;
      depthStencil.stencilTestEnable = VK_FALSE;
    }
    VkPipelineLayout pipelineLayout = VK_NULL_HANDLE;
    VkRenderPass renderPass = VK_NULL_HANDLE;
    VkFormat colorFormat = VK_FORMAT_UNDEFINED;  // For dynamic rendering
    VkFormat depthFormat = VK_FORMAT_UNDEFINED;  // For dynamic rendering
    VkExtent2D extent = {0, 0};
    float lineWidth = 1.0f;
    std::string vertexShaderPath;
    std::string fragmentShaderPath;
    std::string geometryShaderPath;
    std::string tessellationControlShaderPath;
    std::string tessellationEvaluationShaderPath;
    std::string computeShaderPath;
    std::vector<VkVertexInputBindingDescription> vertexBindings;
    std::vector<VkVertexInputAttributeDescription> vertexAttributes;
    bool dynamicViewport = true;
    bool dynamicScissor = true;
    VkPolygonMode polygonMode = VK_POLYGON_MODE_FILL;
    VkCullModeFlags cullMode = VK_CULL_MODE_BACK_BIT;
    VkFrontFace frontFace = VK_FRONT_FACE_COUNTER_CLOCKWISE;
    bool depthTest = true;
    bool depthWrite = true;
    VkCompareOp depthCompareOp = VK_COMPARE_OP_LESS;
    VkSampleCountFlagBits samples = VK_SAMPLE_COUNT_1_BIT;
    bool blendEnable = false;
    bool enableBlending = false;  // Simplified blending flag
    bool enableTessellation = false;  // Tessellation enable flag
    VkBlendFactor srcColorBlendFactor = VK_BLEND_FACTOR_SRC_ALPHA;
    VkBlendFactor dstColorBlendFactor = VK_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA;
    VkBlendOp colorBlendOp = VK_BLEND_OP_ADD;
    VkBlendFactor srcAlphaBlendFactor = VK_BLEND_FACTOR_ONE;
    VkBlendFactor dstAlphaBlendFactor = VK_BLEND_FACTOR_ZERO;
    VkBlendOp alphaBlendOp = VK_BLEND_OP_ADD;
    std::vector<VkDynamicState> dynamicStates = {
        VK_DYNAMIC_STATE_VIEWPORT,
        VK_DYNAMIC_STATE_SCISSOR
    };
    uint32_t patchControlPoints = 0;  // 0 = no tessellation
    std::vector<VkSpecializationMapEntry> specializationEntries;
    std::vector<uint8_t> specializationData;
    VkPipelineVertexInputStateCreateInfo vertexInputInfo{};
    VkPipelineInputAssemblyStateCreateInfo inputAssembly{};
    VkPipelineRasterizationStateCreateInfo rasterizer{};
    VkPipelineMultisampleStateCreateInfo multisampling{};
    VkPipelineColorBlendAttachmentState colorBlendAttachment{};
    VkPipelineColorBlendStateCreateInfo colorBlending{};
    VkPipelineDepthStencilStateCreateInfo depthStencil{};
    VkPipelineTessellationStateCreateInfo
        tessellationState{}; // For terrain tessellation
    uint32_t subpass = 0;
  };

/**
 * Configuration for pipeline creation.
 */

/**
 * MeshData: Flexible mesh structure for Vulkan rendering
 */
struct Transform {
    vec3 position = vec3(0.0f);
    vec3 rotation = vec3(0.0f); // Euler angles (radians)
    vec3 scale = vec3(1.0f);
    mat4 GetModelMatrix() const {
        mat4 t = translate(mat4(1.0f), position);
        mat4 r = yawPitchRoll(rotation.y, rotation.x, rotation.z);
        mat4 s = GLMUtils::Scale(mat4(1.0f), this->scale);
        return t * r * s;
    }
};
} // namespace PlanetGen::Rendering
export namespace std {
    template<>
    struct hash<PlanetGen::Rendering::PipelineType> {
        size_t operator()(const PlanetGen::Rendering::PipelineType& type) const noexcept {
            return hash<int>()(static_cast<int>(type));
        }
    };
    
    template<>
    struct hash<PlanetGen::Rendering::LODLevel> {
        size_t operator()(const PlanetGen::Rendering::LODLevel& lod) const noexcept {
            return hash<uint32_t>()(static_cast<uint32_t>(lod));
        }
    };
}


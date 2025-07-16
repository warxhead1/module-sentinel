module;

#include <vulkan/vulkan.h>
#include <vector>
#include <string>
#include <array>

export module ComputeDescriptorService;

import DescriptorServiceTypes;
import BaseShaderDescriptorService;
import IShaderDescriptorService;
import DescriptorTypes;
import VulkanTypes;
import DescriptorManager;

export namespace PlanetGen::Rendering::Services {

// Import ComputeDescriptorData from VulkanTypes
using ComputeDescriptorData = PlanetGen::Rendering::ComputeDescriptorData;

/**
 * Specialized descriptor service for compute shaders
 * Optimized for GPU compute workloads with focus on buffer management
 */
class ComputeDescriptorService : public BaseShaderDescriptorService<ComputeDescriptorService> {
public:
    explicit ComputeDescriptorService(DescriptorManager* descriptorManager);

    // Compute-specific descriptor creation
    template<typename ComputeDataType>
    DescriptorSetId CreateComputeDescriptorSet(
        const std::string& computeType,
        const ComputeDataType& data,
        const std::string& debugName = "");

    // Specialized creation for common compute patterns
    PipelineDescriptorResult CreateNoiseGenerationPipeline(
        const std::string& noiseShaderPath,
        const std::array<uint32_t, 3>& workGroupSize = {16, 16, 1});

    PipelineDescriptorResult CreateBufferProcessingPipeline(
        const std::string& computeShaderPath,
        uint32_t inputBufferCount = 1,
        uint32_t outputBufferCount = 1);

    PipelineDescriptorResult CreateImageProcessingPipeline(
        const std::string& computeShaderPath,
        uint32_t inputImageCount = 1,
        uint32_t outputImageCount = 1);
    
    // Create layout from registry
    PipelineDescriptorResult CreateLayoutFromRegistry(
        const std::string& layoutName,
        const std::string& debugName);
        
    // NEW: Get descriptor set using layout from registry and bind data
    VkDescriptorSet GetDescriptorSet(
        const std::string& layoutName,
        const ComputeDescriptorData& bindData);
        
    // Helper method to update descriptor set with compute data
    bool UpdateDescriptorSet(
        DescriptorSetId setId,
        const ComputeDescriptorData& bindData);
        
    // Create standard terrain processor layouts
    [[deprecated("Use shader reflection instead of hardcoded layouts")]]
    static DescriptorSetLayoutConfig CreateErosionDescriptorLayout();
    [[deprecated("Use shader reflection instead of hardcoded layouts")]]
    static DescriptorSetLayoutConfig CreateOceanDescriptorLayout();
    
    // Initialize and register compute layouts with DescriptorManager
    static void RegisterComputeLayouts(DescriptorManager* descriptorManager);

    // CRTP implementation methods
    std::string GetCategoryImpl() const { return "Compute"; }
    
    std::vector<std::string> GetSupportedExtensionsImpl() const {
        return {".comp.spv"};
    }
    
    bool SupportsShaderTypeImpl(VkShaderStageFlagBits stage) const {
        return stage == VK_SHADER_STAGE_COMPUTE_BIT;
    }

    ServiceValidationResult ValidateCategorySpecificRequirementsImpl(
        const std::vector<ShaderBindingInfo>& bindings);

    DescriptorSetLayoutConfig CreateCategoryOptimizedLayoutImpl(
        const std::vector<ShaderBindingInfo>& bindings);

    std::vector<uint32_t> GetPreferredBindingSlotsImpl() const;
    uint32_t GetMaxBindingsForCategoryImpl() const { return 16; }
    
    // NEW ARCHITECTURE: Descriptor correction system implementations (PUBLIC for CRTP access)
    std::vector<ShaderBindingInfo> ApplyDescriptorTypeCorrectionsImpl(
        const std::vector<ShaderBindingInfo>& bindings,
        const std::vector<std::string>& shaderPaths);
    
    std::string GetCorrectionCacheKeyImpl(
        const std::vector<std::string>& shaderPaths,
        const std::string& baseName) const;
    
    bool RequiresCorrectionsImpl(
        const std::vector<ShaderBindingInfo>& bindings,
        const std::vector<std::string>& shaderPaths) const;

private:
    // Compute-specific binding organization
    struct ComputeBindingStrategy {
        static constexpr uint32_t INPUT_BUFFERS_START = 0;    // 0-3: Input storage buffers
        static constexpr uint32_t INPUT_BUFFERS_END = 3;
        
        static constexpr uint32_t OUTPUT_BUFFERS_START = 4;   // 4-7: Output storage buffers
        static constexpr uint32_t OUTPUT_BUFFERS_END = 7;
        
        static constexpr uint32_t UNIFORM_BUFFERS_START = 8;  // 8-9: Uniform buffers (params, etc.)
        static constexpr uint32_t UNIFORM_BUFFERS_END = 9;
        
        static constexpr uint32_t INPUT_IMAGES_START = 10;    // 10-12: Input images/samplers
        static constexpr uint32_t INPUT_IMAGES_END = 12;
        
        static constexpr uint32_t OUTPUT_IMAGES_START = 13;   // 13-15: Output storage images
        static constexpr uint32_t OUTPUT_IMAGES_END = 15;
    };

    enum class ComputeType {
        BufferProcessing,    // Input/output buffers only
        ImageProcessing,     // Input/output images only
        Mixed,              // Both buffers and images
        NoiseGeneration,    // Specialized for noise generation
        Simulation          // Physics/simulation workloads
    };

    // Layout creation methods
    [[deprecated("Use shader reflection instead of hardcoded layouts")]]
    DescriptorSetLayoutConfig CreateBufferProcessingLayout(const std::vector<ShaderBindingInfo>& bindings);
    [[deprecated("Use shader reflection instead of hardcoded layouts")]]
    DescriptorSetLayoutConfig CreateImageProcessingLayout(const std::vector<ShaderBindingInfo>& bindings);
    [[deprecated("Use shader reflection instead of hardcoded layouts")]]
    DescriptorSetLayoutConfig CreateMixedComputeLayout(const std::vector<ShaderBindingInfo>& bindings);
    [[deprecated("Use shader reflection instead of hardcoded layouts")]]
    DescriptorSetLayoutConfig CreateNoiseGenerationLayout(const std::vector<ShaderBindingInfo>& bindings);

    // Validation methods
    bool ValidateComputeWorkGroupRequirements(const std::vector<ShaderBindingInfo>& bindings);
    bool ValidateStorageBufferBindings(const std::vector<ShaderBindingInfo>& bindings);
    bool ValidateImageBindings(const std::vector<ShaderBindingInfo>& bindings);

    // Optimization methods
    ComputeType DetermineComputeType(const std::vector<ShaderBindingInfo>& bindings);
    std::vector<ShaderBindingInfo> OptimizeComputeBindings(const std::vector<ShaderBindingInfo>& bindings);
    void GroupBindingsByType(std::vector<ShaderBindingInfo>& bindings);
};

/**
 * Compute data structures for template-based descriptor creation
 */
struct BasicComputeData {
    VkBuffer inputBuffer = VK_NULL_HANDLE;
    VkBuffer outputBuffer = VK_NULL_HANDLE;
    VkBuffer uniformBuffer = VK_NULL_HANDLE;
};

struct ImageComputeData {
    VkImageView inputImage = VK_NULL_HANDLE;
    VkImageView outputImage = VK_NULL_HANDLE;
    VkSampler sampler = VK_NULL_HANDLE;
    VkBuffer paramsBuffer = VK_NULL_HANDLE;
};

struct NoiseGenerationData {
    VkBuffer outputBuffer = VK_NULL_HANDLE;
    VkBuffer noiseParamsBuffer = VK_NULL_HANDLE;
    VkImageView outputImage = VK_NULL_HANDLE; // Optional for texture generation
};

struct BufferProcessingData {
    std::vector<VkBuffer> inputBuffers;
    std::vector<VkBuffer> outputBuffers;
    VkBuffer parameterBuffer = VK_NULL_HANDLE;
    uint32_t workGroupSizeX = 64;
    uint32_t workGroupSizeY = 1;
    uint32_t workGroupSizeZ = 1;
};

struct MixedComputeData {
    // Buffers
    std::vector<VkBuffer> inputBuffers;
    std::vector<VkBuffer> outputBuffers;
    VkBuffer uniformBuffer = VK_NULL_HANDLE;
    
    // Images
    std::vector<VkImageView> inputImages;
    std::vector<VkImageView> outputImages;
    VkSampler sampler = VK_NULL_HANDLE;
    
    // Compute configuration
    std::array<uint32_t, 3> workGroupSize = {16, 16, 1};
};

// Template implementation for compute descriptor creation
template<typename ComputeDataType>
DescriptorSetId ComputeDescriptorService::CreateComputeDescriptorSet(
    const std::string& computeType,
    const ComputeDataType& data,
    const std::string& debugName) {
    
    // Create bindings based on data type
    std::vector<ShaderBindingInfo> bindings = CreateBindingsFromComputeData(data);
    
    // Create optimized layout
    auto layoutConfig = CreateCategoryOptimizedLayoutImpl(bindings);
    auto layoutId = GetDescriptorManager()->CreateLayout(layoutConfig);
    
    if (layoutId == INVALID_LAYOUT_ID) {
        return INVALID_SET_ID;
    }

    // Allocate descriptor set
    auto setId = GetDescriptorManager()->AllocateDescriptorSet(layoutId, debugName);
    if (setId == INVALID_SET_ID) {
        return INVALID_SET_ID;
    }

    // Update with compute data
    UpdateComputeDescriptorSet(setId, data);
    
    return setId;
}

} // namespace PlanetGen::Rendering::Services
module;

#include <vulkan/vulkan.h>
#include <vector>
#include <string>
#include <memory>
#include <expected>
#include <unordered_map>

export module VulkanPipelineCreator;

import PipelineTypes;
import VulkanTypes;
import SPIRVCore;
import VulkanBase;

export namespace PlanetGen::Rendering::Pipeline {

/**
 * @brief Core pipeline creation engine using full SPIR-V reflection
 * 
 * This class replaces the complex manual pipeline configuration system with
 * an intelligent, reflection-driven approach that automatically derives:
 * - Vertex input state from vertex shader reflection
 * - Descriptor set layouts from all shader stages
 * - Push constant ranges from shader uniforms
 * - Pipeline state optimizations based on shader analysis
 */
class VulkanPipelineCreator {
public:
    explicit VulkanPipelineCreator(Rendering::VulkanBase* vulkanBase);
    ~VulkanPipelineCreator();

    // Non-copyable, moveable
    VulkanPipelineCreator(const VulkanPipelineCreator&) = delete;
    VulkanPipelineCreator& operator=(const VulkanPipelineCreator&) = delete;
    VulkanPipelineCreator(VulkanPipelineCreator&&) noexcept;
    VulkanPipelineCreator& operator=(VulkanPipelineCreator&&) noexcept;

    /**
     * @brief Create a complete pipeline using SPIR-V reflection
     * @param params Pipeline creation parameters
     * @return Complete pipeline with auto-derived layout
     */
    PipelineResult CreatePipeline(const PipelineCreationParams& params);

    /**
     * @brief Create graphics pipeline with automatic state derivation
     * @param shaderPaths Vector of shader file paths
     * @param renderPass Target render pass
     * @param extent Viewport extent
     * @param config Graphics configuration (optional overrides)
     * @param debugName Debug name for the pipeline
     * @return Complete graphics pipeline
     */
    PipelineResult CreateGraphicsPipeline(
        const std::vector<std::string>& shaderPaths,
        VkRenderPass renderPass,
        const VkExtent2D& extent,
        const GraphicsConfig& config = Presets::Standard(),
        const std::string& debugName = "");

    /**
     * @brief Create compute pipeline with automatic layout derivation
     * @param computeShaderPath Path to compute shader
     * @param config Compute configuration (optional overrides)
     * @param debugName Debug name for the pipeline
     * @return Complete compute pipeline
     */
    PipelineResult CreateComputePipeline(
        const std::string& computeShaderPath,
        const ComputeConfig& config = Presets::StandardCompute(),
        const std::string& debugName = "");

    /**
     * @brief Analyze shaders and provide optimization recommendations
     * @param shaderPaths Paths to shader files
     * @return Analysis with recommendations
     */
    struct PipelineAnalysis {
        bool canOptimize = false;
        std::vector<std::string> recommendations;
        
        // Detected features
        bool usesBindless = false;
        bool usesUpdateAfterBind = false;
        bool hasComplexVertexInput = false;
        bool hasPushConstants = false;
        uint32_t descriptorSetCount = 0;
        uint32_t pushConstantSize = 0;
        
        // Suggested optimizations
        bool shouldUseVertexPulling = false;
        bool shouldUseDynamicRendering = false;
        GraphicsConfig recommendedGraphicsConfig;
        ComputeConfig recommendedComputeConfig;
    };

    PipelineAnalysis AnalyzeShaders(const std::vector<std::string>& shaderPaths);

private:
    Rendering::VulkanBase* m_vulkanBase;
    std::unique_ptr<PlanetGen::Rendering::SPIRV::SPIRVCore> m_spirvCore;
    
    // Cached reflection results for performance
    struct ReflectionCache {
        std::unordered_map<std::string, PlanetGen::Rendering::SPIRV::ShaderReflectionData> shaderReflection;
        std::unordered_map<std::string, std::vector<uint32_t>> spirvBytecode;
    } m_cache;

    // =============================================================================
    // SPIR-V REFLECTION AND ANALYSIS
    // =============================================================================

    /**
     * @brief Load and reflect all shaders in the pipeline
     * @param shaderPaths Paths to shader files
     * @return Merged reflection data from all stages
     */
    std::expected<PlanetGen::Rendering::SPIRV::ShaderReflectionData, std::string> 
    ReflectPipelineShaders(const std::vector<std::string>& shaderPaths);

    /**
     * @brief Load SPIR-V bytecode from file with caching
     * @param shaderPath Path to shader file
     * @return SPIR-V bytecode or error
     */
    std::expected<std::vector<uint32_t>, std::string> LoadShaderSPIRV(const std::string& shaderPath);

    /**
     * @brief Validate shader stage compatibility
     * @param shaderPaths Shader paths to validate
     * @return Validation result with detailed errors
     */
    PlanetGen::Rendering::SPIRV::ShaderInterfaceAnalysis ValidateShaderInterface(
        const std::vector<std::string>& shaderPaths);

    // =============================================================================
    // AUTOMATIC LAYOUT CREATION
    // =============================================================================

    /**
     * @brief Create descriptor set layouts from reflection data
     * @param reflectionData Merged reflection data
     * @return Descriptor set layouts or error
     */
    std::expected<std::vector<VkDescriptorSetLayout>, std::string> 
    CreateDescriptorSetLayouts(const PlanetGen::Rendering::SPIRV::ShaderReflectionData& reflectionData);

    /**
     * @brief Create pipeline layout from reflection data
     * @param reflectionData Merged reflection data
     * @param descriptorSetLayouts Created descriptor set layouts
     * @return Pipeline layout or error
     */
    std::expected<VkPipelineLayout, std::string> 
    CreatePipelineLayout(
        const PlanetGen::Rendering::SPIRV::ShaderReflectionData& reflectionData,
        const std::vector<VkDescriptorSetLayout>& descriptorSetLayouts);

    /**
     * @brief Create vertex input state from vertex shader reflection
     * @param vertexReflectionData Vertex shader reflection data
     * @return Vertex input state configuration
     */
    VkPipelineVertexInputStateCreateInfo CreateVertexInputState(
        const PlanetGen::Rendering::SPIRV::ShaderReflectionData& vertexReflectionData);

    // =============================================================================
    // PIPELINE CREATION INTERNALS
    // =============================================================================

    /**
     * @brief Create graphics pipeline internal implementation
     * @param shaderModules Loaded shader modules with stages
     * @param reflectionData Combined reflection data
     * @param renderPass Target render pass
     * @param extent Viewport extent
     * @param config Graphics configuration
     * @param debugName Debug name
     * @return Pipeline creation result
     */
    PipelineResult CreateGraphicsPipelineInternal(
        const std::vector<std::pair<VkShaderModule, VkShaderStageFlagBits>>& shaderModules,
        const PlanetGen::Rendering::SPIRV::ShaderReflectionData& reflectionData,
        VkRenderPass renderPass,
        const VkExtent2D& extent,
        const GraphicsConfig& config,
        const std::string& debugName);

    /**
     * @brief Create compute pipeline internal implementation
     * @param computeModule Compute shader module
     * @param reflectionData Compute shader reflection data
     * @param config Compute configuration
     * @param debugName Debug name
     * @return Pipeline creation result
     */
    PipelineResult CreateComputePipelineInternal(
        VkShaderModule computeModule,
        const PlanetGen::Rendering::SPIRV::ShaderReflectionData& reflectionData,
        const ComputeConfig& config,
        const std::string& debugName);

    /**
     * @brief Load shader modules from paths
     * @param shaderPaths Paths to shader files
     * @return Shader modules with stage flags or error
     */
    std::expected<std::vector<std::pair<VkShaderModule, VkShaderStageFlagBits>>, std::string>
    LoadShaderModules(const std::vector<std::string>& shaderPaths);

    /**
     * @brief Determine shader stage from file path
     * @param shaderPath Path to shader file
     * @return Shader stage flag or error
     */
    std::optional<VkShaderStageFlagBits> DetermineShaderStage(const std::string& shaderPath);

    // =============================================================================
    // OPTIMIZATION AND ANALYSIS
    // =============================================================================

    /**
     * @brief Analyze reflection data for optimization opportunities
     * @param reflectionData Shader reflection data
     * @param shaderPaths Original shader paths for context
     * @return Analysis with optimization recommendations
     */
    PipelineAnalysis AnalyzeReflectionData(
        const PlanetGen::Rendering::SPIRV::ShaderReflectionData& reflectionData,
        const std::vector<std::string>& shaderPaths);

    /**
     * @brief Detect if vertex pulling should be used instead of vertex attributes
     * @param reflectionData Vertex shader reflection data
     * @return True if vertex pulling is recommended
     */
    bool ShouldUseVertexPulling(const PlanetGen::Rendering::SPIRV::ShaderReflectionData& reflectionData);

    /**
     * @brief Optimize graphics configuration based on shader analysis
     * @param baseConfig Base graphics configuration
     * @param reflectionData Shader reflection data
     * @return Optimized graphics configuration
     */
    GraphicsConfig OptimizeGraphicsConfig(
        const GraphicsConfig& baseConfig,
        const PlanetGen::Rendering::SPIRV::ShaderReflectionData& reflectionData);

    /**
     * @brief Optimize compute configuration based on shader analysis
     * @param baseConfig Base compute configuration
     * @param reflectionData Shader reflection data
     * @return Optimized compute configuration
     */
    ComputeConfig OptimizeComputeConfig(
        const ComputeConfig& baseConfig,
        const PlanetGen::Rendering::SPIRV::ShaderReflectionData& reflectionData);

    // =============================================================================
    // UTILITY METHODS
    // =============================================================================

    /**
     * @brief Create error result with message
     * @param message Error message
     * @return Failed pipeline result
     */
    PipelineResult CreateErrorResult(const std::string& message);

    /**
     * @brief Clean up shader modules
     * @param shaderModules Modules to clean up
     */
    void CleanupShaderModules(const std::vector<std::pair<VkShaderModule, VkShaderStageFlagBits>>& shaderModules);

    /**
     * @brief Set debug name for pipeline object
     * @param pipeline Pipeline handle
     * @param debugName Debug name to set
     */
    void SetPipelineDebugName(VkPipeline pipeline, const std::string& debugName);

    /**
     * @brief Convert SPIR-V descriptor binding to Vulkan descriptor set layout binding
     * @param binding SPIR-V binding information
     * @return Vulkan descriptor set layout binding
     */
    VkDescriptorSetLayoutBinding ConvertToVulkanBinding(
        const PlanetGen::Rendering::SPIRV::DescriptorBinding& binding);

    /**
     * @brief Convert SPIR-V push constant to Vulkan push constant range
     * @param pushConstant SPIR-V push constant information
     * @return Vulkan push constant range
     */
    VkPushConstantRange ConvertToVulkanPushConstant(
        const PlanetGen::Rendering::SPIRV::PushConstantRange& pushConstant);

    /**
     * @brief Convert SPIR-V vertex attribute to Vulkan vertex input attribute
     * @param attribute SPIR-V vertex attribute information
     * @return Vulkan vertex input attribute description
     */
    VkVertexInputAttributeDescription ConvertToVulkanVertexAttribute(
        const PlanetGen::Rendering::SPIRV::VertexAttribute& attribute);
};

} // namespace PlanetGen::Rendering::Pipeline
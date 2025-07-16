module;

#include <vulkan/vulkan.h>

#include <filesystem>
#include <fstream>
#include <iostream>

module VulkanPipelineCreator;

import PipelineTypes;
import VulkanTypes;
import SPIRVCore;
import VulkanBase;

namespace PlanetGen::Rendering::Pipeline {

// =============================================================================
// CONSTRUCTOR/DESTRUCTOR
// =============================================================================

VulkanPipelineCreator::VulkanPipelineCreator(Rendering::VulkanBase* vulkanBase)
    : m_vulkanBase(vulkanBase),
      m_spirvCore(std::make_unique<PlanetGen::Rendering::SPIRV::SPIRVCore>()) {
  if (!m_vulkanBase) {
    throw std::runtime_error(
        "VulkanPipelineCreator: VulkanBase cannot be null");
  }
}

VulkanPipelineCreator::~VulkanPipelineCreator() = default;

VulkanPipelineCreator::VulkanPipelineCreator(VulkanPipelineCreator&&) noexcept =
    default;
VulkanPipelineCreator& VulkanPipelineCreator::operator=(
    VulkanPipelineCreator&&) noexcept = default;

// =============================================================================
// PUBLIC INTERFACE
// =============================================================================

PipelineResult VulkanPipelineCreator::CreatePipeline(
    const PipelineCreationParams& params) {
  switch (params.key.type) {
    case PipelineType::Graphics:
      if (!params.graphicsConfig) {
        return CreateErrorResult("Graphics pipeline requires GraphicsConfig");
      }
      return CreateGraphicsPipeline(params.key.shaderPaths,
                                    params.key.renderPass, params.extent,
                                    *params.graphicsConfig, params.debugName);

    case PipelineType::Compute:
      if (params.key.shaderPaths.size() != 1) {
        return CreateErrorResult(
            "Compute pipeline requires exactly one shader");
      }
      if (!params.computeConfig) {
        return CreateErrorResult("Compute pipeline requires ComputeConfig");
      }
      return CreateComputePipeline(params.key.shaderPaths[0],
                                   *params.computeConfig, params.debugName);

    default:
      return CreateErrorResult("Unknown pipeline type");
  }
}

PipelineResult VulkanPipelineCreator::CreateGraphicsPipeline(
    const std::vector<std::string>& shaderPaths, VkRenderPass renderPass,
    const VkExtent2D& extent, const GraphicsConfig& config,
    const std::string& debugName) {
  // Validate shaders using SPIR-V interface analysis
  auto interfaceAnalysis = ValidateShaderInterface(shaderPaths);
  if (!interfaceAnalysis.isCompatible) {
    std::string errorMsg = "Shader interface validation failed:\n";
    for (const auto& mismatch : interfaceAnalysis.mismatches) {
      errorMsg += mismatch.description + "\n";
    }
    return CreateErrorResult(errorMsg);
  }

  // Reflect all shaders to get combined information
  auto reflectionResult = ReflectPipelineShaders(shaderPaths);
  if (!reflectionResult) {
    return CreateErrorResult("Failed to reflect shaders: " +
                             reflectionResult.error());
  }

  // Load shader modules
  auto shaderModulesResult = LoadShaderModules(shaderPaths);
  if (!shaderModulesResult) {
    return CreateErrorResult("Failed to load shader modules: " +
                             shaderModulesResult.error());
  }

  // Create pipeline using reflection data
  auto result =
      CreateGraphicsPipelineInternal(*shaderModulesResult, *reflectionResult,
                                     renderPass, extent, config, debugName);

  // Cleanup shader modules
  CleanupShaderModules(*shaderModulesResult);

  return result;
}

PipelineResult VulkanPipelineCreator::CreateComputePipeline(
    const std::string& computeShaderPath, const ComputeConfig& config,
    const std::string& debugName) {
  // Load and reflect compute shader
  auto spirvResult = LoadShaderSPIRV(computeShaderPath);
  if (!spirvResult) {
    return CreateErrorResult("Failed to load compute shader: " +
                             spirvResult.error());
  }

  auto reflectionResult = m_spirvCore->ReflectSPIRV(*spirvResult);
  if (!reflectionResult) {
    return CreateErrorResult("Failed to reflect compute shader");
  }

  // Create shader module
  VkShaderModuleCreateInfo moduleInfo{};
  moduleInfo.sType = VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO;
  moduleInfo.codeSize = spirvResult->size() * sizeof(uint32_t);
  moduleInfo.pCode = spirvResult->data();

  VkShaderModule shaderModule;
  VkResult vkResult = vkCreateShaderModule(m_vulkanBase->GetDevice(),
                                           &moduleInfo, nullptr, &shaderModule);
  if (vkResult != VK_SUCCESS) {
    return CreateErrorResult("Failed to create compute shader module");
  }

  // Create pipeline
  auto result = CreateComputePipelineInternal(shaderModule, *reflectionResult,
                                              config, debugName);

  // Cleanup
  vkDestroyShaderModule(m_vulkanBase->GetDevice(), shaderModule, nullptr);

  return result;
}

VulkanPipelineCreator::PipelineAnalysis VulkanPipelineCreator::AnalyzeShaders(
    const std::vector<std::string>& shaderPaths) {
  PipelineAnalysis analysis{};

  auto reflectionResult = ReflectPipelineShaders(shaderPaths);
  if (!reflectionResult) {
    analysis.recommendations.push_back("Failed to reflect shaders: " +
                                       reflectionResult.error());
    return analysis;
  }

  return AnalyzeReflectionData(*reflectionResult, shaderPaths);
}

// =============================================================================
// SPIR-V REFLECTION AND ANALYSIS
// =============================================================================

std::expected<PlanetGen::Rendering::SPIRV::ShaderReflectionData, std::string>
VulkanPipelineCreator::ReflectPipelineShaders(
    const std::vector<std::string>& shaderPaths) {
  std::vector<PlanetGen::Rendering::SPIRV::ShaderReflectionData>
      reflectionDataList;

  for (const auto& shaderPath : shaderPaths) {
    auto spirvResult = LoadShaderSPIRV(shaderPath);
    if (!spirvResult) {
      return std::unexpected("Failed to load shader " + shaderPath + ": " +
                             spirvResult.error());
    }

    auto reflectionResult = m_spirvCore->ReflectSPIRV(*spirvResult);
    if (!reflectionResult) {
      return std::unexpected("Failed to reflect shader " + shaderPath);
    }

    reflectionDataList.push_back(*reflectionResult);
  }

  // Merge reflection data from all stages
  return PlanetGen::Rendering::SPIRV::Utils::MergeReflectionData(
      reflectionDataList);
}

std::expected<std::vector<uint32_t>, std::string>
VulkanPipelineCreator::LoadShaderSPIRV(const std::string& shaderPath) {
  // Check cache first
  if (auto it = m_cache.spirvBytecode.find(shaderPath);
      it != m_cache.spirvBytecode.end()) {
    return it->second;
  }

  // Load from file
  auto spirvResult = m_spirvCore->LoadSPIRVFromFile(shaderPath);
  if (!spirvResult) {
    return std::unexpected("Failed to load SPIR-V from " + shaderPath);
  }

  // Cache for future use
  m_cache.spirvBytecode[shaderPath] = *spirvResult;

  return *spirvResult;
}

PlanetGen::Rendering::SPIRV::ShaderInterfaceAnalysis
VulkanPipelineCreator::ValidateShaderInterface(
    const std::vector<std::string>& shaderPaths) {
  if (shaderPaths.size() < 2) {
    // Single shader (compute) or insufficient shaders for interface validation
    PlanetGen::Rendering::SPIRV::ShaderInterfaceAnalysis analysis;
    analysis.isCompatible = true;
    return analysis;
  }

  // Find vertex and fragment shaders
  std::string vertexShader, fragmentShader;
  for (const auto& path : shaderPaths) {
    auto stage = DetermineShaderStage(path);
    if (stage == VK_SHADER_STAGE_VERTEX_BIT) {
      vertexShader = path;
    } else if (stage == VK_SHADER_STAGE_FRAGMENT_BIT) {
      fragmentShader = path;
    }
  }

  if (vertexShader.empty() || fragmentShader.empty()) {
    PlanetGen::Rendering::SPIRV::ShaderInterfaceAnalysis analysis;
    analysis.isCompatible = true;  // Not a vertex-fragment pipeline
    return analysis;
  }

  // Load and validate interface
  auto vertexSpirv = LoadShaderSPIRV(vertexShader);
  auto fragmentSpirv = LoadShaderSPIRV(fragmentShader);

  if (!vertexSpirv || !fragmentSpirv) {
    PlanetGen::Rendering::SPIRV::ShaderInterfaceAnalysis analysis;
    analysis.isCompatible = false;
    analysis.mismatches.push_back(
        {PlanetGen::Rendering::SPIRV::InterfaceMismatch::MISSING_OUTPUT,
         "Failed to load shaders for interface validation", "", "",
         vertexShader, fragmentShader, "", 0, 0});
    return analysis;
  }

  return m_spirvCore->ValidateShaderInterface(*vertexSpirv, *fragmentSpirv);
}

// =============================================================================
// AUTOMATIC LAYOUT CREATION
// =============================================================================

std::expected<std::vector<VkDescriptorSetLayout>, std::string>
VulkanPipelineCreator::CreateDescriptorSetLayouts(
    const PlanetGen::Rendering::SPIRV::ShaderReflectionData& reflectionData) {
  std::vector<VkDescriptorSetLayout> descriptorSetLayouts;

  // Group bindings by set
  std::map<uint32_t, std::vector<VkDescriptorSetLayoutBinding>> bindingsBySet;

  for (const auto& binding : reflectionData.descriptorBindings) {
    auto vulkanBinding = ConvertToVulkanBinding(binding);
    bindingsBySet[binding.set].push_back(vulkanBinding);
  }

  // Create descriptor set layout for each set
  for (const auto& [setIndex, bindings] : bindingsBySet) {
    VkDescriptorSetLayoutCreateInfo layoutInfo{};
    layoutInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO;
    layoutInfo.bindingCount = static_cast<uint32_t>(bindings.size());
    layoutInfo.pBindings = bindings.data();

    // Enable Vulkan 1.4 features if detected
    VkDescriptorSetLayoutBindingFlagsCreateInfo bindingFlags{};
    std::vector<VkDescriptorBindingFlags> flags;

    if (reflectionData.usesUpdateAfterBind || reflectionData.usesBindless) {
      flags.resize(bindings.size(),
                   VK_DESCRIPTOR_BINDING_UPDATE_AFTER_BIND_BIT);

      bindingFlags.sType =
          VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_BINDING_FLAGS_CREATE_INFO;
      bindingFlags.bindingCount = static_cast<uint32_t>(flags.size());
      bindingFlags.pBindingFlags = flags.data();

      layoutInfo.pNext = &bindingFlags;
      layoutInfo.flags |=
          VK_DESCRIPTOR_SET_LAYOUT_CREATE_UPDATE_AFTER_BIND_POOL_BIT;
    }

    VkDescriptorSetLayout layout;
    VkResult result = vkCreateDescriptorSetLayout(
        m_vulkanBase->GetDevice(), &layoutInfo, nullptr, &layout);
    if (result != VK_SUCCESS) {
      // Cleanup previously created layouts
      for (auto& prevLayout : descriptorSetLayouts) {
        vkDestroyDescriptorSetLayout(m_vulkanBase->GetDevice(), prevLayout,
                                     nullptr);
      }
      return std::unexpected("Failed to create descriptor set layout for set " +
                             std::to_string(setIndex));
    }

    descriptorSetLayouts.push_back(layout);
  }

  return descriptorSetLayouts;
}

std::expected<VkPipelineLayout, std::string>
VulkanPipelineCreator::CreatePipelineLayout(
    const PlanetGen::Rendering::SPIRV::ShaderReflectionData& reflectionData,
    const std::vector<VkDescriptorSetLayout>& descriptorSetLayouts) {
  // Convert push constants
  std::vector<VkPushConstantRange> pushConstantRanges;
  for (const auto& pushConstant : reflectionData.pushConstantRanges) {
    pushConstantRanges.push_back(ConvertToVulkanPushConstant(pushConstant));
  }

  VkPipelineLayoutCreateInfo layoutInfo{};
  layoutInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO;
  layoutInfo.setLayoutCount =
      static_cast<uint32_t>(descriptorSetLayouts.size());
  layoutInfo.pSetLayouts = descriptorSetLayouts.data();
  layoutInfo.pushConstantRangeCount =
      static_cast<uint32_t>(pushConstantRanges.size());
  layoutInfo.pPushConstantRanges = pushConstantRanges.data();

  VkPipelineLayout pipelineLayout;
  VkResult result = vkCreatePipelineLayout(
      m_vulkanBase->GetDevice(), &layoutInfo, nullptr, &pipelineLayout);
  if (result != VK_SUCCESS) {
    return std::unexpected("Failed to create pipeline layout");
  }

  return pipelineLayout;
}

VkPipelineVertexInputStateCreateInfo
VulkanPipelineCreator::CreateVertexInputState(
    const PlanetGen::Rendering::SPIRV::ShaderReflectionData&
        vertexReflectionData) {
  static std::vector<VkVertexInputAttributeDescription> attributes;
  static std::vector<VkVertexInputBindingDescription> bindings;

  attributes.clear();
  bindings.clear();

  // Convert vertex attributes from reflection
  for (const auto& attribute : vertexReflectionData.vertexAttributes) {
    attributes.push_back(ConvertToVulkanVertexAttribute(attribute));
  }

  // Create a single binding for all attributes (typical case)
  if (!attributes.empty()) {
    VkVertexInputBindingDescription binding{};
    binding.binding = 0;
    binding.stride = 0;  // Will be calculated or set by user
    binding.inputRate = VK_VERTEX_INPUT_RATE_VERTEX;
    bindings.push_back(binding);
  }

  VkPipelineVertexInputStateCreateInfo vertexInputInfo{};
  vertexInputInfo.sType =
      VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO;
  vertexInputInfo.vertexBindingDescriptionCount =
      static_cast<uint32_t>(bindings.size());
  vertexInputInfo.pVertexBindingDescriptions = bindings.data();
  vertexInputInfo.vertexAttributeDescriptionCount =
      static_cast<uint32_t>(attributes.size());
  vertexInputInfo.pVertexAttributeDescriptions = attributes.data();

  return vertexInputInfo;
}

// =============================================================================
// PIPELINE CREATION INTERNALS
// =============================================================================

PipelineResult VulkanPipelineCreator::CreateGraphicsPipelineInternal(
    const std::vector<std::pair<VkShaderModule, VkShaderStageFlagBits>>&
        shaderModules,
    const PlanetGen::Rendering::SPIRV::ShaderReflectionData& reflectionData,
    VkRenderPass renderPass, const VkExtent2D& extent,
    const GraphicsConfig& config, const std::string& debugName) {
  PipelineResult result{};

  // Create descriptor set layouts
  auto descriptorLayoutsResult = CreateDescriptorSetLayouts(reflectionData);
  if (!descriptorLayoutsResult) {
    return CreateErrorResult("Failed to create descriptor layouts: " +
                             descriptorLayoutsResult.error());
  }
  result.descriptorSetLayouts = *descriptorLayoutsResult;

  // Create pipeline layout
  auto pipelineLayoutResult =
      CreatePipelineLayout(reflectionData, result.descriptorSetLayouts);
  if (!pipelineLayoutResult) {
    return CreateErrorResult("Failed to create pipeline layout: " +
                             pipelineLayoutResult.error());
  }
  result.layout = *pipelineLayoutResult;

  // Convert push constants for result
  for (const auto& pushConstant : reflectionData.pushConstantRanges) {
    result.pushConstantRanges.push_back(
        ConvertToVulkanPushConstant(pushConstant));
  }

  // Create shader stage infos
  std::vector<VkPipelineShaderStageCreateInfo> shaderStages;
  for (const auto& [module, stage] : shaderModules) {
    VkPipelineShaderStageCreateInfo stageInfo{};
    stageInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    stageInfo.stage = stage;
    stageInfo.module = module;
    stageInfo.pName = "main";
    shaderStages.push_back(stageInfo);
  }

  // Create vertex input state
  auto vertexInputState = CreateVertexInputState(reflectionData);

  // Create all other pipeline states
  VkPipelineInputAssemblyStateCreateInfo inputAssembly{};
  inputAssembly.sType =
      VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO;
  inputAssembly.topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST;
  inputAssembly.primitiveRestartEnable = VK_FALSE;

  VkViewport viewport{};
  viewport.x = 0.0f;
  viewport.y = 0.0f;
  viewport.width = static_cast<float>(extent.width);
  viewport.height = static_cast<float>(extent.height);
  viewport.minDepth = 0.0f;
  viewport.maxDepth = 1.0f;

  VkRect2D scissor{};
  scissor.offset = {0, 0};
  scissor.extent = extent;

  VkPipelineViewportStateCreateInfo viewportState{};
  viewportState.sType = VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO;
  viewportState.viewportCount = 1;
  viewportState.pViewports = &viewport;
  viewportState.scissorCount = 1;
  viewportState.pScissors = &scissor;

  VkPipelineRasterizationStateCreateInfo rasterizer{};
  rasterizer.sType = VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO;
  rasterizer.depthClampEnable = VK_FALSE;
  rasterizer.rasterizerDiscardEnable = VK_FALSE;
  rasterizer.polygonMode = config.polygonMode;
  rasterizer.lineWidth = config.lineWidth;
  rasterizer.cullMode = config.cullMode;
  rasterizer.frontFace = config.frontFace;
  rasterizer.depthBiasEnable = VK_FALSE;

  VkPipelineMultisampleStateCreateInfo multisampling{};
  multisampling.sType =
      VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO;
  multisampling.sampleShadingEnable =
      config.sampleShadingEnable ? VK_TRUE : VK_FALSE;
  multisampling.rasterizationSamples = config.sampleCount;
  multisampling.minSampleShading = config.minSampleShading;

  VkPipelineDepthStencilStateCreateInfo depthStencil{};
  depthStencil.sType =
      VK_STRUCTURE_TYPE_PIPELINE_DEPTH_STENCIL_STATE_CREATE_INFO;
  depthStencil.depthTestEnable = config.depthTestEnable ? VK_TRUE : VK_FALSE;
  depthStencil.depthWriteEnable = config.depthWriteEnable ? VK_TRUE : VK_FALSE;
  depthStencil.depthCompareOp = config.depthCompareOp;
  depthStencil.stencilTestEnable =
      config.stencilTestEnable ? VK_TRUE : VK_FALSE;

  VkPipelineColorBlendAttachmentState colorBlendAttachment{};
  colorBlendAttachment.colorWriteMask =
      VK_COLOR_COMPONENT_R_BIT | VK_COLOR_COMPONENT_G_BIT |
      VK_COLOR_COMPONENT_B_BIT | VK_COLOR_COMPONENT_A_BIT;
  colorBlendAttachment.blendEnable = config.blendEnable ? VK_TRUE : VK_FALSE;
  colorBlendAttachment.srcColorBlendFactor = config.srcColorBlendFactor;
  colorBlendAttachment.dstColorBlendFactor = config.dstColorBlendFactor;
  colorBlendAttachment.colorBlendOp = config.colorBlendOp;
  colorBlendAttachment.srcAlphaBlendFactor = config.srcAlphaBlendFactor;
  colorBlendAttachment.dstAlphaBlendFactor = config.dstAlphaBlendFactor;
  colorBlendAttachment.alphaBlendOp = config.alphaBlendOp;

  VkPipelineColorBlendStateCreateInfo colorBlending{};
  colorBlending.sType =
      VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO;
  colorBlending.logicOpEnable = VK_FALSE;
  colorBlending.attachmentCount = 1;
  colorBlending.pAttachments = &colorBlendAttachment;

  VkPipelineDynamicStateCreateInfo dynamicState{};
  dynamicState.sType = VK_STRUCTURE_TYPE_PIPELINE_DYNAMIC_STATE_CREATE_INFO;
  dynamicState.dynamicStateCount =
      static_cast<uint32_t>(config.dynamicStates.size());
  dynamicState.pDynamicStates = config.dynamicStates.data();

  VkGraphicsPipelineCreateInfo pipelineInfo{};
  pipelineInfo.sType = VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO;
  pipelineInfo.stageCount = static_cast<uint32_t>(shaderStages.size());
  pipelineInfo.pStages = shaderStages.data();
  pipelineInfo.pVertexInputState = &vertexInputState;
  pipelineInfo.pInputAssemblyState = &inputAssembly;
  pipelineInfo.pViewportState = &viewportState;
  pipelineInfo.pRasterizationState = &rasterizer;
  pipelineInfo.pMultisampleState = &multisampling;
  pipelineInfo.pDepthStencilState = &depthStencil;
  pipelineInfo.pColorBlendState = &colorBlending;
  pipelineInfo.pDynamicState = &dynamicState;
  pipelineInfo.layout = result.layout;
  pipelineInfo.renderPass = renderPass;
  pipelineInfo.subpass = 0;

  VkResult vkResult =
      vkCreateGraphicsPipelines(m_vulkanBase->GetDevice(), VK_NULL_HANDLE, 1,
                                &pipelineInfo, nullptr, &result.pipeline);

  if (vkResult != VK_SUCCESS) {
    return CreateErrorResult("Failed to create graphics pipeline");
  }

  // Set debug name
  if (!debugName.empty()) {
    SetPipelineDebugName(result.pipeline, debugName);
  }

  // Fill reflection info
  result.reflectionInfo.usesBindless = reflectionData.usesBindless;
  result.reflectionInfo.usesUpdateAfterBind =
      reflectionData.usesUpdateAfterBind;
  result.reflectionInfo.usesVariableDescriptorCount =
      reflectionData.usesVariableDescriptorCount;
  result.reflectionInfo.maxDescriptorSets = reflectionData.maxDescriptorSets;
  result.reflectionInfo.pushConstantSize = reflectionData.maxPushConstantSize;

  result.success = true;
  return result;
}

PipelineResult VulkanPipelineCreator::CreateComputePipelineInternal(
    VkShaderModule computeModule,
    const PlanetGen::Rendering::SPIRV::ShaderReflectionData& reflectionData,
    const ComputeConfig& config, const std::string& debugName) {
  PipelineResult result{};

  // Create descriptor set layouts
  auto descriptorLayoutsResult = CreateDescriptorSetLayouts(reflectionData);
  if (!descriptorLayoutsResult) {
    return CreateErrorResult("Failed to create descriptor layouts: " +
                             descriptorLayoutsResult.error());
  }
  result.descriptorSetLayouts = *descriptorLayoutsResult;

  // Create pipeline layout
  auto pipelineLayoutResult =
      CreatePipelineLayout(reflectionData, result.descriptorSetLayouts);
  if (!pipelineLayoutResult) {
    return CreateErrorResult("Failed to create pipeline layout: " +
                             pipelineLayoutResult.error());
  }
  result.layout = *pipelineLayoutResult;

  // Convert push constants for result
  for (const auto& pushConstant : reflectionData.pushConstantRanges) {
    result.pushConstantRanges.push_back(
        ConvertToVulkanPushConstant(pushConstant));
  }

  VkPipelineShaderStageCreateInfo shaderStageInfo{};
  shaderStageInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
  shaderStageInfo.stage = VK_SHADER_STAGE_COMPUTE_BIT;
  shaderStageInfo.module = computeModule;
  shaderStageInfo.pName = "main";

  VkComputePipelineCreateInfo pipelineInfo{};
  pipelineInfo.sType = VK_STRUCTURE_TYPE_COMPUTE_PIPELINE_CREATE_INFO;
  pipelineInfo.stage = shaderStageInfo;
  pipelineInfo.layout = result.layout;

  VkResult vkResult =
      vkCreateComputePipelines(m_vulkanBase->GetDevice(), VK_NULL_HANDLE, 1,
                               &pipelineInfo, nullptr, &result.pipeline);

  if (vkResult != VK_SUCCESS) {
    return CreateErrorResult("Failed to create compute pipeline");
  }

  // Set debug name
  if (!debugName.empty()) {
    SetPipelineDebugName(result.pipeline, debugName);
  }

  // Fill reflection info
  result.reflectionInfo.usesBindless = reflectionData.usesBindless;
  result.reflectionInfo.usesUpdateAfterBind =
      reflectionData.usesUpdateAfterBind;
  result.reflectionInfo.usesVariableDescriptorCount =
      reflectionData.usesVariableDescriptorCount;
  result.reflectionInfo.maxDescriptorSets = reflectionData.maxDescriptorSets;
  result.reflectionInfo.pushConstantSize = reflectionData.maxPushConstantSize;

  result.success = true;
  return result;
}

// =============================================================================
// UTILITY METHODS
// =============================================================================

std::expected<std::vector<std::pair<VkShaderModule, VkShaderStageFlagBits>>,
              std::string>
VulkanPipelineCreator::LoadShaderModules(
    const std::vector<std::string>& shaderPaths) {
  std::vector<std::pair<VkShaderModule, VkShaderStageFlagBits>> modules;

  for (const auto& path : shaderPaths) {
    auto spirvResult = LoadShaderSPIRV(path);
    if (!spirvResult) {
      CleanupShaderModules(modules);
      return std::unexpected("Failed to load shader " + path + ": " +
                             spirvResult.error());
    }

    auto stage = DetermineShaderStage(path);
    if (!stage) {
      CleanupShaderModules(modules);
      return std::unexpected("Cannot determine shader stage for " + path);
    }

    VkShaderModuleCreateInfo moduleInfo{};
    moduleInfo.sType = VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO;
    moduleInfo.codeSize = spirvResult->size() * sizeof(uint32_t);
    moduleInfo.pCode = spirvResult->data();

    VkShaderModule module;
    VkResult result = vkCreateShaderModule(m_vulkanBase->GetDevice(),
                                           &moduleInfo, nullptr, &module);
    if (result != VK_SUCCESS) {
      CleanupShaderModules(modules);
      return std::unexpected("Failed to create shader module for " + path);
    }

    modules.emplace_back(module, *stage);
  }

  return modules;
}

std::optional<VkShaderStageFlagBits>
VulkanPipelineCreator::DetermineShaderStage(const std::string& shaderPath) {
  std::filesystem::path path(shaderPath);
  std::string extension = path.extension().string();

  if (extension == ".vert" || shaderPath.find("vertex") != std::string::npos) {
    return VK_SHADER_STAGE_VERTEX_BIT;
  } else if (extension == ".frag" ||
             shaderPath.find("fragment") != std::string::npos) {
    return VK_SHADER_STAGE_FRAGMENT_BIT;
  } else if (extension == ".comp" ||
             shaderPath.find("compute") != std::string::npos) {
    return VK_SHADER_STAGE_COMPUTE_BIT;
  } else if (extension == ".tesc" ||
             shaderPath.find("tess_control") != std::string::npos) {
    return VK_SHADER_STAGE_TESSELLATION_CONTROL_BIT;
  } else if (extension == ".tese" ||
             shaderPath.find("tess_eval") != std::string::npos) {
    return VK_SHADER_STAGE_TESSELLATION_EVALUATION_BIT;
  } else if (extension == ".geom" ||
             shaderPath.find("geometry") != std::string::npos) {
    return VK_SHADER_STAGE_GEOMETRY_BIT;
  }

  return std::nullopt;
}

VulkanPipelineCreator::PipelineAnalysis VulkanPipelineCreator::AnalyzeReflectionData(
    const PlanetGen::Rendering::SPIRV::ShaderReflectionData& reflectionData,
    const std::vector<std::string>& shaderPaths) {
  PipelineAnalysis analysis{};

  analysis.usesBindless = reflectionData.usesBindless;
  analysis.usesUpdateAfterBind = reflectionData.usesUpdateAfterBind;
  analysis.hasPushConstants = !reflectionData.pushConstantRanges.empty();
  analysis.descriptorSetCount = reflectionData.maxDescriptorSets;
  analysis.pushConstantSize = reflectionData.maxPushConstantSize;
  analysis.hasComplexVertexInput = reflectionData.vertexAttributes.size() > 4;

  analysis.canOptimize = true;

  if (analysis.usesBindless) {
    analysis.recommendations.push_back(
        "Consider using descriptor indexing for bindless resources");
  }

  if (analysis.hasComplexVertexInput) {
    analysis.shouldUseVertexPulling = true;
    analysis.recommendations.push_back(
        "Consider vertex pulling for complex vertex inputs");
  }

  if (analysis.descriptorSetCount > 4) {
    analysis.recommendations.push_back(
        "High descriptor set count - consider consolidation");
  }

  return analysis;
}

PipelineResult VulkanPipelineCreator::CreateErrorResult(
    const std::string& message) {
  PipelineResult result{};
  result.success = false;
  result.errorMessage = message;
  return result;
}

void VulkanPipelineCreator::CleanupShaderModules(
    const std::vector<std::pair<VkShaderModule, VkShaderStageFlagBits>>&
        shaderModules) {
  for (const auto& [module, stage] : shaderModules) {
    vkDestroyShaderModule(m_vulkanBase->GetDevice(), module, nullptr);
  }
}

void VulkanPipelineCreator::SetPipelineDebugName(VkPipeline pipeline,
                                                 const std::string& debugName) {
  VkDebugUtilsObjectNameInfoEXT nameInfo{};
  nameInfo.sType = VK_STRUCTURE_TYPE_DEBUG_UTILS_OBJECT_NAME_INFO_EXT;
  nameInfo.objectType = VK_OBJECT_TYPE_PIPELINE;
  nameInfo.objectHandle = reinterpret_cast<uint64_t>(pipeline);
  nameInfo.pObjectName = debugName.c_str();

  // Note: This requires debug utils extension - should check if available
  // vkSetDebugUtilsObjectNameEXT(m_vulkanBase->GetDevice(), &nameInfo);
}

VkDescriptorSetLayoutBinding VulkanPipelineCreator::ConvertToVulkanBinding(
    const PlanetGen::Rendering::SPIRV::DescriptorBinding& binding) {
  VkDescriptorSetLayoutBinding vulkanBinding{};
  vulkanBinding.binding = binding.binding;
  vulkanBinding.descriptorType = binding.type;
  vulkanBinding.descriptorCount = binding.count;
  vulkanBinding.stageFlags = binding.stageFlags;
  vulkanBinding.pImmutableSamplers = nullptr;

  return vulkanBinding;
}

VkPushConstantRange VulkanPipelineCreator::ConvertToVulkanPushConstant(
    const PlanetGen::Rendering::SPIRV::PushConstantRange& pushConstant) {
  VkPushConstantRange vulkanRange{};
  vulkanRange.stageFlags = pushConstant.stageFlags;
  vulkanRange.offset = pushConstant.offset;
  vulkanRange.size = pushConstant.size;

  return vulkanRange;
}

VkVertexInputAttributeDescription
VulkanPipelineCreator::ConvertToVulkanVertexAttribute(
    const PlanetGen::Rendering::SPIRV::VertexAttribute& attribute) {
  VkVertexInputAttributeDescription vulkanAttribute{};
  vulkanAttribute.location = attribute.location;
  vulkanAttribute.binding = 0;  // Assume single binding for simplicity
  vulkanAttribute.format = attribute.format;
  vulkanAttribute.offset = 0;  // Will be set by user or calculated

  return vulkanAttribute;
}

// Stub implementations for missing optimization methods
bool VulkanPipelineCreator::ShouldUseVertexPulling(
    const PlanetGen::Rendering::SPIRV::ShaderReflectionData& reflectionData) {
  return reflectionData.vertexAttributes.size() > 8;  // Simple heuristic
}

GraphicsConfig VulkanPipelineCreator::OptimizeGraphicsConfig(
    const GraphicsConfig& baseConfig,
    const PlanetGen::Rendering::SPIRV::ShaderReflectionData& reflectionData) {
  return baseConfig;  // Return unmodified for now
}

ComputeConfig VulkanPipelineCreator::OptimizeComputeConfig(
    const ComputeConfig& baseConfig,
    const PlanetGen::Rendering::SPIRV::ShaderReflectionData& reflectionData) {
  return baseConfig;  // Return unmodified for now
}

}  // namespace PlanetGen::Rendering::Pipeline
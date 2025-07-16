module;

#include <vulkan/vulkan.h>
#include <algorithm>
#include <stdexcept>
#include <cassert>
#include <unordered_set>
#include <memory>
#include <string>
#include <Core/Logging/LoggerMacros.h>

module ComputeDescriptorService;

import Core.Logging.Logger;
import DescriptorManager;
import ShaderReflectionSystem;
import ServiceFactory;
import VulkanManager;
import VulkanResourceManager;
import VulkanTypes;
import TerrainProcessorHelpers;
import DescriptorLayoutRegistry;

namespace PlanetGen::Rendering::Services {

// Import ComputeDescriptorData from VulkanTypes
using ComputeDescriptorData = PlanetGen::Rendering::ComputeDescriptorData;

ComputeDescriptorService::ComputeDescriptorService(Rendering::DescriptorManager* descriptorManager)
    : BaseShaderDescriptorService<ComputeDescriptorService>(descriptorManager) {
    
    // Let SPIRV reflection determine bindings - don't pre-reserve artificial slots
}

PipelineDescriptorResult ComputeDescriptorService::CreateNoiseGenerationPipeline(
    const std::string& noiseShaderPath,
    const std::array<uint32_t, 3>& workGroupSize) {
    
    auto result = CreateLayoutFromShaders({noiseShaderPath}, "noise_generation_pipeline");
    
    if (result.success) {
        // Validate work group size compatibility
        auto bindings = GetShaderBindings(noiseShaderPath);
        auto validation = ValidateComputeWorkGroupRequirements(bindings);
        if (!validation) {
            result.success = false;
            result.validation = ServiceValidationResult::Failure("Work group size validation failed");
        }
        
        // Push constant ranges are determined by SPIRV reflection - don't override
    }
    
    return result;
}

PipelineDescriptorResult ComputeDescriptorService::CreateBufferProcessingPipeline(
    const std::string& computeShaderPath,
    uint32_t inputBufferCount,
    uint32_t outputBufferCount) {
    
    auto result = CreateLayoutFromShaders({computeShaderPath}, "buffer_processing_pipeline");
    
    if (result.success) {
        // Validate buffer counts
        auto bindings = GetShaderBindings(computeShaderPath);
        if (!ValidateStorageBufferBindings(bindings)) {
            result.success = false;
            result.validation = ServiceValidationResult::Failure("Storage buffer validation failed");
        }
    }
    
    return result;
}

PipelineDescriptorResult ComputeDescriptorService::CreateImageProcessingPipeline(
    const std::string& computeShaderPath,
    uint32_t inputImageCount,
    uint32_t outputImageCount) {
    
    auto result = CreateLayoutFromShaders({computeShaderPath}, "image_processing_pipeline");
    
    if (result.success) {
        // Validate image bindings
        auto bindings = GetShaderBindings(computeShaderPath);
        if (!ValidateImageBindings(bindings)) {
            result.success = false;
            result.validation = ServiceValidationResult::Failure("Image binding validation failed");
        }
    }
    
    return result;
}

ServiceValidationResult ComputeDescriptorService::ValidateCategorySpecificRequirementsImpl(
    const std::vector<ShaderBindingInfo>& bindings) {
    
    // Validate compute-specific requirements
    if (!ValidateStorageBufferBindings(bindings)) {
        return ServiceValidationResult::Failure("Storage buffer validation failed");
    }
    
    if (!ValidateImageBindings(bindings)) {
        return ServiceValidationResult::Failure("Image binding validation failed");
    }
    
    if (!ValidateComputeWorkGroupRequirements(bindings)) {
        return ServiceValidationResult::Failure("Work group requirements validation failed");
    }
    
    return ServiceValidationResult::Success();
}

DescriptorSetLayoutConfig ComputeDescriptorService::CreateCategoryOptimizedLayoutImpl(
    const std::vector<ShaderBindingInfo>& bindings) {
    
    // Determine compute type and create appropriate layout
    ComputeType computeType = DetermineComputeType(bindings);
    auto optimizedBindings = OptimizeComputeBindings(bindings);
    
    switch (computeType) {
        case ComputeType::BufferProcessing:
            // TODO: Use shader reflection instead of hardcoded layouts
            return CreateBufferProcessingLayout(optimizedBindings);
        case ComputeType::ImageProcessing:
            // TODO: Use shader reflection instead of hardcoded layouts
            return CreateImageProcessingLayout(optimizedBindings);
        case ComputeType::NoiseGeneration:
            // TODO: Use shader reflection instead of hardcoded layouts
            return CreateNoiseGenerationLayout(optimizedBindings);
        case ComputeType::Mixed:
            // TODO: Use shader reflection instead of hardcoded layouts
            return CreateMixedComputeLayout(optimizedBindings);
        default:
            // TODO: Use shader reflection instead of hardcoded layouts
            return CreateBufferProcessingLayout(optimizedBindings); // Default fallback
    }
}

std::vector<uint32_t> ComputeDescriptorService::GetPreferredBindingSlotsImpl() const {
    std::vector<uint32_t> slots;
    
    // Reserve compute binding ranges
    for (uint32_t i = ComputeBindingStrategy::INPUT_BUFFERS_START; 
         i <= ComputeBindingStrategy::INPUT_BUFFERS_END; ++i) {
        slots.push_back(i);
    }
    
    for (uint32_t i = ComputeBindingStrategy::OUTPUT_BUFFERS_START; 
         i <= ComputeBindingStrategy::OUTPUT_BUFFERS_END; ++i) {
        slots.push_back(i);
    }
    
    for (uint32_t i = ComputeBindingStrategy::UNIFORM_BUFFERS_START; 
         i <= ComputeBindingStrategy::UNIFORM_BUFFERS_END; ++i) {
        slots.push_back(i);
    }
    
    for (uint32_t i = ComputeBindingStrategy::INPUT_IMAGES_START; 
         i <= ComputeBindingStrategy::INPUT_IMAGES_END; ++i) {
        slots.push_back(i);
    }
    
    for (uint32_t i = ComputeBindingStrategy::OUTPUT_IMAGES_START; 
         i <= ComputeBindingStrategy::OUTPUT_IMAGES_END; ++i) {
        slots.push_back(i);
    }
    
    return slots;
}

// NEW METHOD: Get descriptor set using layout from registry
VkDescriptorSet ComputeDescriptorService::GetDescriptorSet(
    const std::string& layoutName, 
    const ComputeDescriptorData& bindData) {
    
    auto* manager = GetDescriptorManager();
    if (!manager) {
        return VK_NULL_HANDLE;
    }
    
    // 1. Get the layout from the registry (should be pre-registered)
    VkDescriptorSetLayout layout = manager->GetLayoutFromRegistry(layoutName);
    if (layout == VK_NULL_HANDLE) {
        // Layout not found - it should have been registered during initialization
        return VK_NULL_HANDLE;
    }
    
    // 2. Create layout config from registry bindings
    auto registryBindings = manager->GetLayoutBindingsFromRegistry(layoutName);
    if (registryBindings.empty()) {
        return VK_NULL_HANDLE;
    }
    
    DescriptorSetLayoutConfig layoutConfig;
    layoutConfig.name = layoutName;
    layoutConfig.flags = VK_DESCRIPTOR_SET_LAYOUT_CREATE_UPDATE_AFTER_BIND_POOL_BIT;
    
    for (const auto& regBinding : registryBindings) {
        DescriptorBinding binding;
        binding.id = BindingId(regBinding.binding);
        binding.binding = regBinding.binding;
        binding.type = regBinding.type;
        binding.descriptorCount = regBinding.descriptorCount;
        binding.stageFlags = regBinding.stages;
        binding.flags = VK_DESCRIPTOR_BINDING_UPDATE_AFTER_BIND_BIT;
        binding.name = regBinding.semanticName;
        binding.required = !regBinding.isOptional;
        
        layoutConfig.bindings.push_back(binding);
    }
    
    // 3. Create layout and allocate descriptor set
    DescriptorSetLayoutId layoutId = manager->CreateLayout(layoutConfig);
    if (layoutId == INVALID_LAYOUT_ID) {
        return VK_NULL_HANDLE;
    }
    
    DescriptorSetId descriptorSetId = manager->AllocateDescriptorSet(layoutId, layoutName + "_DescriptorSet");
    if (descriptorSetId == INVALID_SET_ID) {
        manager->ReleaseLayout(layoutId);
        return VK_NULL_HANDLE;
    }
    
    // 4. Update descriptor set with binding data
    if (!UpdateDescriptorSet(descriptorSetId, bindData)) {
        manager->ReleaseDescriptorSet(descriptorSetId);
        manager->ReleaseLayout(layoutId);
        return VK_NULL_HANDLE;
    }
    
    // 5. Return the VkDescriptorSet handle
    return manager->GetDescriptorSet(descriptorSetId);
}

bool ComputeDescriptorService::UpdateDescriptorSet(
    DescriptorSetId setId, 
    const ComputeDescriptorData& bindData) {
    
    auto* manager = GetDescriptorManager();
    if (!manager) {
        return false;
    }
    
    std::vector<DescriptorWrite> writes;
    
    // Process buffer bindings
    for (const auto& [binding, buffer] : bindData.bufferBindings) {
        if (buffer != VK_NULL_HANDLE) {
            DescriptorWrite write;
            write.binding = BindingId(binding);
            write.arrayElement = 0;
            write.type = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER;
            write.bufferInfo.buffer = buffer;
            write.bufferInfo.offset = 0;
            write.bufferInfo.range = VK_WHOLE_SIZE;
            write.name = "buffer_" + std::to_string(binding);
            
            writes.push_back(write);
        }
    }
    
    // Process uniform buffer bindings
    for (const auto& [binding, buffer] : bindData.uniformBindings) {
        if (buffer != VK_NULL_HANDLE) {
            DescriptorWrite write;
            write.binding = BindingId(binding);
            write.arrayElement = 0;
            write.type = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
            write.bufferInfo.buffer = buffer;
            write.bufferInfo.offset = 0;
            write.bufferInfo.range = VK_WHOLE_SIZE;
            write.name = "uniform_" + std::to_string(binding);
            
            writes.push_back(write);
        }
    }
    
    // Process image bindings
    for (const auto& [binding, imageData] : bindData.imageBindings) {
        if (imageData.imageView != VK_NULL_HANDLE) {
            DescriptorWrite write;
            write.binding = BindingId(binding);
            write.arrayElement = 0;
            write.type = imageData.sampler != VK_NULL_HANDLE ? 
                        VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER : 
                        VK_DESCRIPTOR_TYPE_STORAGE_IMAGE;
            write.imageInfo.imageView = imageData.imageView;
            write.imageInfo.sampler = imageData.sampler;
            write.imageInfo.imageLayout = imageData.imageLayout;
            write.name = "image_" + std::to_string(binding);
            
            writes.push_back(write);
        }
    }
    
    if (writes.empty()) {
        return true; // Nothing to update
    }
    
    // Update the descriptor set
    auto result = manager->UpdateDescriptorSet(setId, writes);
    return result.IsSuccess();
}

// Static layout creation methods
DescriptorSetLayoutConfig ComputeDescriptorService::CreateErosionDescriptorLayout() {
    return PlanetGen::Rendering::Terrain::TerrainLayoutFactory::CreateErosionLayout();
}

DescriptorSetLayoutConfig ComputeDescriptorService::CreateOceanDescriptorLayout() {
    return PlanetGen::Rendering::Terrain::TerrainLayoutFactory::CreateOceanLayout();
}

// Helper function to convert DescriptorBinding to BindingDefinition
static PlanetGen::Rendering::Vulkan::BindingDefinition ConvertToRegistryBinding(const DescriptorBinding& binding) {
    return PlanetGen::Rendering::Vulkan::BindingDefinition(
        binding.binding,
        binding.type,
        binding.stageFlags,
        binding.name,
        "Compute shader binding"
    );
}

void ComputeDescriptorService::RegisterComputeLayouts(DescriptorManager* descriptorManager) {
    if (!descriptorManager) {
        return;
    }
    
    // Register Erosion layout
    {
        auto erosionConfig = CreateErosionDescriptorLayout();
        std::vector<PlanetGen::Rendering::Vulkan::BindingDefinition> bindings;
        
        for (const auto& binding : erosionConfig.bindings) {
            bindings.push_back(ConvertToRegistryBinding(binding));
        }
        
        descriptorManager->RegisterLayoutWithRegistry("Erosion", bindings, "Erosion compute shader layout");
    }
    
    // Register Ocean layout
    {
        auto oceanConfig = CreateOceanDescriptorLayout();
        std::vector<PlanetGen::Rendering::Vulkan::BindingDefinition> bindings;
        
        for (const auto& binding : oceanConfig.bindings) {
            bindings.push_back(ConvertToRegistryBinding(binding));
        }
        
        descriptorManager->RegisterLayoutWithRegistry("Ocean", bindings, "Ocean compute shader layout");
    }
}

// Private implementation methods

DescriptorSetLayoutConfig ComputeDescriptorService::CreateBufferProcessingLayout(
    const std::vector<ShaderBindingInfo>& bindings) {
    
    DescriptorSetLayoutConfig config;
    config.name = "compute_buffer_processing_layout";
    config.flags = VK_DESCRIPTOR_SET_LAYOUT_CREATE_UPDATE_AFTER_BIND_POOL_BIT;
    
    for (const auto& bindingInfo : bindings) {
        DescriptorBinding binding;
        binding.id = BindingId(bindingInfo.binding);
        binding.binding = bindingInfo.binding;
        binding.type = bindingInfo.type;
        binding.descriptorCount = bindingInfo.count;
        binding.stageFlags = VK_SHADER_STAGE_COMPUTE_BIT;
        binding.flags = bindingInfo.bindingFlags | VK_DESCRIPTOR_BINDING_UPDATE_AFTER_BIND_BIT;
        binding.name = bindingInfo.name;
        binding.required = bindingInfo.required;
        
        config.bindings.push_back(binding);
    }
    
    return config;
}

DescriptorSetLayoutConfig ComputeDescriptorService::CreateImageProcessingLayout(
    const std::vector<ShaderBindingInfo>& bindings) {
    
    DescriptorSetLayoutConfig config;
    config.name = "compute_image_processing_layout";
    config.flags = VK_DESCRIPTOR_SET_LAYOUT_CREATE_UPDATE_AFTER_BIND_POOL_BIT;
    
    // Group by type for optimal layout
    std::vector<ShaderBindingInfo> uniformBindings, storageImages, sampledImages;
    
    for (const auto& binding : bindings) {
        switch (binding.type) {
            case VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER:
            case VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER_DYNAMIC:
                uniformBindings.push_back(binding);
                break;
            case VK_DESCRIPTOR_TYPE_STORAGE_IMAGE:
                storageImages.push_back(binding);
                break;
            case VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER:
            case VK_DESCRIPTOR_TYPE_SAMPLED_IMAGE:
                sampledImages.push_back(binding);
                break;
            default:
                uniformBindings.push_back(binding);
                break;
        }
    }
    
    // Add bindings in optimal order: uniforms, sampled images, storage images
    auto addBindingsToConfig = [&config](const std::vector<ShaderBindingInfo>& bindingGroup) {
        for (const auto& bindingInfo : bindingGroup) {
            DescriptorBinding binding;
            binding.id = BindingId(bindingInfo.binding);
            binding.binding = bindingInfo.binding;
            binding.type = bindingInfo.type;
            binding.descriptorCount = bindingInfo.count;
            binding.stageFlags = VK_SHADER_STAGE_COMPUTE_BIT;
            binding.flags = bindingInfo.bindingFlags | VK_DESCRIPTOR_BINDING_UPDATE_AFTER_BIND_BIT;
            binding.name = bindingInfo.name;
            binding.required = bindingInfo.required;
            
            config.bindings.push_back(binding);
        }
    };
    
    addBindingsToConfig(uniformBindings);
    addBindingsToConfig(sampledImages);
    addBindingsToConfig(storageImages);
    
    return config;
}

DescriptorSetLayoutConfig ComputeDescriptorService::CreateMixedComputeLayout(
    const std::vector<ShaderBindingInfo>& bindings) {
    
    DescriptorSetLayoutConfig config;
    config.name = "compute_mixed_layout";
    config.flags = VK_DESCRIPTOR_SET_LAYOUT_CREATE_UPDATE_AFTER_BIND_POOL_BIT;
    
    // Mixed layout supports both buffers and images
    for (const auto& bindingInfo : bindings) {
        DescriptorBinding binding;
        binding.id = BindingId(bindingInfo.binding);
        binding.binding = bindingInfo.binding;
        binding.type = bindingInfo.type;
        binding.descriptorCount = bindingInfo.count;
        binding.stageFlags = VK_SHADER_STAGE_COMPUTE_BIT;
        binding.flags = bindingInfo.bindingFlags | VK_DESCRIPTOR_BINDING_UPDATE_AFTER_BIND_BIT;
        binding.name = bindingInfo.name;
        binding.required = bindingInfo.required;
        
        // Enable variable descriptor count for arrays
        if (bindingInfo.count > 1) {
            binding.flags |= VK_DESCRIPTOR_BINDING_VARIABLE_DESCRIPTOR_COUNT_BIT;
        }
        
        config.bindings.push_back(binding);
    }
    
    return config;
}

DescriptorSetLayoutConfig ComputeDescriptorService::CreateNoiseGenerationLayout(
    const std::vector<ShaderBindingInfo>& bindings) {
    
    DescriptorSetLayoutConfig config;
    config.name = "compute_noise_generation_layout";
    config.flags = VK_DESCRIPTOR_SET_LAYOUT_CREATE_UPDATE_AFTER_BIND_POOL_BIT;
    
    // Optimized for noise generation patterns
    for (const auto& bindingInfo : bindings) {
        DescriptorBinding binding;
        binding.id = BindingId(bindingInfo.binding);
        binding.binding = bindingInfo.binding;
        binding.type = bindingInfo.type;
        binding.descriptorCount = bindingInfo.count;
        binding.stageFlags = VK_SHADER_STAGE_COMPUTE_BIT;
        binding.flags = bindingInfo.bindingFlags | VK_DESCRIPTOR_BINDING_UPDATE_AFTER_BIND_BIT;
        binding.name = bindingInfo.name;
        binding.required = bindingInfo.required;
        
        config.bindings.push_back(binding);
    }
    
    return config;
}

bool ComputeDescriptorService::ValidateComputeWorkGroupRequirements(
    const std::vector<ShaderBindingInfo>& bindings) {
    
    // Basic validation - could be expanded with shader reflection data
    return true; // For now, assume valid
}

bool ComputeDescriptorService::ValidateStorageBufferBindings(
    const std::vector<ShaderBindingInfo>& bindings) {
    
    // Don't artificially limit storage buffer count - let Vulkan/hardware determine limits
    // If there are actual Vulkan limits exceeded, they'll be caught during pipeline creation
    return true;
}

bool ComputeDescriptorService::ValidateImageBindings(
    const std::vector<ShaderBindingInfo>& bindings) {
    
    // Count images and validate they're in appropriate ranges
    size_t imageCount = std::count_if(bindings.begin(), bindings.end(),
        [](const ShaderBindingInfo& binding) {
            return binding.type == VK_DESCRIPTOR_TYPE_STORAGE_IMAGE ||
                   binding.type == VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER ||
                   binding.type == VK_DESCRIPTOR_TYPE_SAMPLED_IMAGE;
        });
    
    // Validate reasonable image count
    const size_t MAX_IMAGES = 6;
    return imageCount <= MAX_IMAGES;
}

ComputeDescriptorService::ComputeType ComputeDescriptorService::DetermineComputeType(
    const std::vector<ShaderBindingInfo>& bindings) {
    
    bool hasStorageBuffers = false;
    bool hasImages = false;
    bool hasNoisePattern = false;
    
    for (const auto& binding : bindings) {
        switch (binding.type) {
            case VK_DESCRIPTOR_TYPE_STORAGE_BUFFER:
                hasStorageBuffers = true;
                break;
            case VK_DESCRIPTOR_TYPE_STORAGE_IMAGE:
            case VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER:
            case VK_DESCRIPTOR_TYPE_SAMPLED_IMAGE:
                hasImages = true;
                break;
            default:
                break;
        }
        
        // Check for noise generation patterns - expanded detection
        if (binding.name.find("noise") != std::string::npos ||
            binding.name.find("random") != std::string::npos ||
            binding.name.find("inputBuffer") != std::string::npos ||
            binding.name.find("outputBuffer") != std::string::npos) {
            hasNoisePattern = true;
        }
    }
    
    if (hasNoisePattern) {
        return ComputeType::NoiseGeneration;
    } else if (hasStorageBuffers && hasImages) {
        return ComputeType::Mixed;
    } else if (hasImages) {
        return ComputeType::ImageProcessing;
    } else {
        return ComputeType::BufferProcessing;
    }
}

std::vector<ShaderBindingInfo> ComputeDescriptorService::OptimizeComputeBindings(
    const std::vector<ShaderBindingInfo>& bindings) {
    
    auto optimizedBindings = bindings;
    
    // DISABLED: Don't reassign bindings - use SPIRV reflection as-is
    // GroupBindingsByType(optimizedBindings);
    
    // Sort bindings by binding number
    std::sort(optimizedBindings.begin(), optimizedBindings.end(),
        [](const ShaderBindingInfo& a, const ShaderBindingInfo& b) {
            return a.binding < b.binding;
        });
    
    return optimizedBindings;
}

void ComputeDescriptorService::GroupBindingsByType(std::vector<ShaderBindingInfo>& bindings) {
    
    // Determine compute type first to decide if we should preserve original bindings
    ComputeType computeType = DetermineComputeType(bindings);
    
    // For noise generation, preserve original shader bindings since they're already correct
    if (computeType == ComputeType::NoiseGeneration) {
        // Don't remap bindings for noise shaders - they already have the correct layout
        return;
    }
    
    // Reassign bindings to appropriate ranges based on type for other compute types
    std::unordered_set<uint32_t> usedBindings;
    
    for (auto& binding : bindings) {
        uint32_t newBinding = binding.binding;
        
        switch (binding.type) {
            case VK_DESCRIPTOR_TYPE_STORAGE_BUFFER:
                // Input buffers first, then output buffers
                if (binding.name.find("input") != std::string::npos ||
                    binding.name.find("in_") != std::string::npos) {
                    for (uint32_t slot = ComputeBindingStrategy::INPUT_BUFFERS_START;
                         slot <= ComputeBindingStrategy::INPUT_BUFFERS_END; ++slot) {
                        if (usedBindings.find(slot) == usedBindings.end()) {
                            newBinding = slot;
                            break;
                        }
                    }
                } else {
                    for (uint32_t slot = ComputeBindingStrategy::OUTPUT_BUFFERS_START;
                         slot <= ComputeBindingStrategy::OUTPUT_BUFFERS_END; ++slot) {
                        if (usedBindings.find(slot) == usedBindings.end()) {
                            newBinding = slot;
                            break;
                        }
                    }
                }
                break;
                
            case VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER:
            case VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER_DYNAMIC:
                for (uint32_t slot = ComputeBindingStrategy::UNIFORM_BUFFERS_START;
                     slot <= ComputeBindingStrategy::UNIFORM_BUFFERS_END; ++slot) {
                    if (usedBindings.find(slot) == usedBindings.end()) {
                        newBinding = slot;
                        break;
                    }
                }
                break;
                
            case VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER:
            case VK_DESCRIPTOR_TYPE_SAMPLED_IMAGE:
                for (uint32_t slot = ComputeBindingStrategy::INPUT_IMAGES_START;
                     slot <= ComputeBindingStrategy::INPUT_IMAGES_END; ++slot) {
                    if (usedBindings.find(slot) == usedBindings.end()) {
                        newBinding = slot;
                        break;
                    }
                }
                break;
                
            case VK_DESCRIPTOR_TYPE_STORAGE_IMAGE:
                for (uint32_t slot = ComputeBindingStrategy::OUTPUT_IMAGES_START;
                     slot <= ComputeBindingStrategy::OUTPUT_IMAGES_END; ++slot) {
                    if (usedBindings.find(slot) == usedBindings.end()) {
                        newBinding = slot;
                        break;
                    }
                }
                break;
        }
        
        binding.binding = newBinding;
        usedBindings.insert(newBinding);
    }
}

// Static registration
namespace {
    struct ComputeServiceRegistrar {
        ComputeServiceRegistrar() {
            Services::ServiceRegistrar::Instance().RegisterService(
                ServiceType::Compute,
                [](Rendering::DescriptorManager* dm, const ServiceConfiguration&) -> std::unique_ptr<IShaderDescriptorService> {
                    return std::make_unique<ComputeDescriptorService>(dm);
                });
        }
    };
    
    // This will be initialized at static initialization time
    static ComputeServiceRegistrar s_computeRegistrar;
}

PipelineDescriptorResult ComputeDescriptorService::CreateLayoutFromRegistry(
    const std::string& layoutName,
    const std::string& debugName) {
    
    PipelineDescriptorResult result;
    
    // Check if the layout is already registered in the descriptor manager's registry
    if (!GetDescriptorManager()->HasLayoutInRegistry(layoutName)) {
        result.success = false;
        result.validation = ServiceValidationResult::Failure("Layout not found in registry: " + layoutName);
        return result;
    }
    
    // Get the layout from the registry
    VkDescriptorSetLayout vkLayout = GetDescriptorManager()->GetLayoutFromRegistry(layoutName);
    if (vkLayout == VK_NULL_HANDLE) {
        result.success = false;
        result.validation = ServiceValidationResult::Failure("Failed to get layout from registry: " + layoutName);
        return result;
    }
    
    // Create a layout ID in the descriptor manager from the registry layout
    DescriptorSetLayoutConfig config;
    config.name = layoutName;
    config.flags = VK_DESCRIPTOR_SET_LAYOUT_CREATE_UPDATE_AFTER_BIND_POOL_BIT;
    
    // Get the bindings from the registry
    auto bindings = GetDescriptorManager()->GetLayoutBindingsFromRegistry(layoutName);
    for (const auto& regBinding : bindings) {
        DescriptorBinding binding;
        binding.id = BindingId(regBinding.binding);
        binding.binding = regBinding.binding;
        binding.type = regBinding.type;
        binding.descriptorCount = regBinding.descriptorCount;
        binding.stageFlags = regBinding.stages;
        binding.flags = VK_DESCRIPTOR_BINDING_UPDATE_AFTER_BIND_BIT;
        binding.name = regBinding.semanticName;
        binding.required = !regBinding.isOptional;
        
        config.bindings.push_back(binding);
    }
    
    // Create the layout
    result.layoutId = GetDescriptorManager()->CreateLayout(config);
    if (result.layoutId == INVALID_LAYOUT_ID) {
        result.success = false;
        result.validation = ServiceValidationResult::Failure("Failed to create layout from registry");
        return result;
    }
    
    result.success = true;
    result.validation = ServiceValidationResult::Success();
    
    return result;
}

// Default implementations for new architecture methods
std::vector<ShaderBindingInfo> ComputeDescriptorService::ApplyDescriptorTypeCorrectionsImpl(
    const std::vector<ShaderBindingInfo>& bindings,
    const std::vector<std::string>& shaderPaths) {
    
    // Apply corrections for compute shaders that may have misidentified descriptor types
    std::vector<ShaderBindingInfo> correctedBindings = bindings;
    
    // Check if this is a terrain compute shader
    bool isTerrainShader = false;
    for (const auto& path : shaderPaths) {
        if (path.find("terrain") != std::string::npos) {
            isTerrainShader = true;
            break;
        }
    }
    
    // Apply corrections based on binding patterns and shader type
    for (auto& binding : correctedBindings) {
        // For terrain normal generation and similar shaders
        if (isTerrainShader) {
            // Binding 0 is typically the input heightmap texture (sampler2D)
            if (binding.binding == 0 && binding.name.find("heightmap") != std::string::npos) {
                if (binding.type != VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER) {
                    LOG_DEBUG("ComputeDescriptorService", "Correcting binding 0 '{}' to COMBINED_IMAGE_SAMPLER", binding.name);
                    binding.type = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
                }
            }
            // Binding 1 is typically the output storage image (writeonly image2D)
            else if (binding.binding == 1 && (binding.name.find("Map") != std::string::npos || 
                                              binding.name.find("map") != std::string::npos ||
                                              binding.name.find("Texture") != std::string::npos)) {
                if (binding.type != VK_DESCRIPTOR_TYPE_STORAGE_IMAGE) {
                    LOG_DEBUG("ComputeDescriptorService", "Correcting binding 1 '{}' to STORAGE_IMAGE", binding.name);
                    binding.type = VK_DESCRIPTOR_TYPE_STORAGE_IMAGE;
                }
            }
        }
        
        // General compute shader corrections
        // Only correct descriptor types when we have clear evidence of misidentification
        // Do NOT change storage buffers to storage images based on naming alone
        if (binding.name.find("output") != std::string::npos ||
            binding.name.find("Output") != std::string::npos ||
            (binding.name.find("Map") != std::string::npos && binding.binding > 0)) {
            // Only correct if it's currently a COMBINED_IMAGE_SAMPLER or UNIFORM_BUFFER
            // Never change STORAGE_BUFFER to STORAGE_IMAGE
            if (binding.type == VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER) {
                LOG_DEBUG("ComputeDescriptorService", "Correcting output binding {} '{}' from COMBINED_IMAGE_SAMPLER to STORAGE_IMAGE", 
                         binding.binding, binding.name);
                binding.type = VK_DESCRIPTOR_TYPE_STORAGE_IMAGE;
            } else if (binding.type == VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER &&
                       (binding.name.find("Map") != std::string::npos || 
                        binding.name.find("Texture") != std::string::npos ||
                        binding.name.find("Image") != std::string::npos)) {
                // Only correct uniform buffers to storage images if the name strongly suggests an image
                LOG_DEBUG("ComputeDescriptorService", "Correcting output binding {} '{}' from UNIFORM_BUFFER to STORAGE_IMAGE", 
                         binding.binding, binding.name);
                binding.type = VK_DESCRIPTOR_TYPE_STORAGE_IMAGE;
            }
            // Explicitly do NOT change STORAGE_BUFFER types
        }
    }
    
    
    if (correctedBindings.size() != bindings.size() || 
        !std::equal(correctedBindings.begin(), correctedBindings.end(), bindings.begin(),
                   [](const auto& a, const auto& b) { return a.type == b.type; })) {
        LOG_DEBUG("ComputeDescriptorService", "Applied descriptor type corrections to {} bindings", correctedBindings.size());
    }
    
    return correctedBindings;
}

std::string ComputeDescriptorService::GetCorrectionCacheKeyImpl(
    const std::vector<std::string>& shaderPaths,
    const std::string& baseName) const {
    
    // ComputeDescriptorService doesn't need cache key modifications
    return baseName;
}

bool ComputeDescriptorService::RequiresCorrectionsImpl(
    const std::vector<ShaderBindingInfo>& bindings,
    const std::vector<std::string>& shaderPaths) const {
    
    // Check if any shader paths indicate terrain or compute shaders that may need corrections
    for (const auto& path : shaderPaths) {
        if (path.find("terrain") != std::string::npos ||
            path.find("generate_") != std::string::npos ||
            path.find("compute") != std::string::npos) {
            return true;
        }
    }
    
    // Check if any bindings look like they might be misidentified
    for (const auto& binding : bindings) {
        // Output images in compute shaders are often misidentified
        if ((binding.name.find("output") != std::string::npos ||
             binding.name.find("Output") != std::string::npos ||
             binding.name.find("Map") != std::string::npos) &&
            binding.type != VK_DESCRIPTOR_TYPE_STORAGE_IMAGE) {
            return true;
        }
    }
    
    return false;
}

} // namespace PlanetGen::Rendering::Services
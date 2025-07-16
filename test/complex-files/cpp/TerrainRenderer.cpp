module;

#include <vulkan/vulkan.h>
#include <iostream>
#include <cmath>
#include <limits>
#include <Core/Logging/LoggerMacros.h>
#include <chrono>
#include <atomic>

module TerrainRenderer;

import PipelineFactory;
import Core.Logging.Logger;
import VulkanPipelineBase;
import BufferManagement;
import BufferCore;
import DescriptorServiceTypes;
import DescriptorTypes;
import VulkanTextureManager;
import RenderingTypes;
import IResourceManager;
import IPipelineRegistry;
import TerrainTextureGeneratorConfig;
import VulkanCommandBufferManager;
import Core.Parameters.ParameterSystemAdapter;
import Core.Parameters.PlanetParams;

namespace PlanetGen::Rendering {

TerrainRenderer::TerrainRenderer(
    VulkanBase* base,
    VulkanPipelineManager* pipelineManager,
    DescriptorManager* descriptorManager,
    IResourceManager* resourceManager,
    VulkanTerrainTextureCoordinator* textureCoordinator)
    : m_base(base)
    , m_pipelineManager(pipelineManager)
    , m_descriptorManager(descriptorManager)
    , m_resourceManager(resourceManager)
    , m_textureCoordinator(textureCoordinator) {
    
    // Create pipeline builder integration for advanced pipeline management
    m_pipelineIntegration = std::make_unique<Pipeline::PipelineFactory>(
        m_descriptorManager, m_base, static_cast<Rendering::IPipelineRegistry*>(m_resourceManager->GetPipelineRegistry()));
}

TerrainRenderer::~TerrainRenderer() {
    Shutdown();
}

bool TerrainRenderer::Initialize(const VkExtent2D& swapChainExtent) {
    m_extent = swapChainExtent;
    
    // Initialize descriptor service for terrain-specific bindings
    if (!m_descriptorService) {
        m_descriptorService = std::make_unique<Services::TerrainDescriptorService>(m_descriptorManager);
    }
    
    // Create pipelines first - this will create the descriptor layout through shader reflection
    if (!CreatePipelines()) {
        LOG_ERROR("TerrainRenderer", "Failed to create pipelines");
        return false;
    }
    
    // Create uniform buffers
    if (!CreateUniformBuffers()) {
        LOG_ERROR("TerrainRenderer", "Failed to create uniform buffers");
        return false;
    }
    
    // Create descriptor sets using the layout from pipeline creation
    if (!CreateDescriptorSets()) {
        LOG_ERROR("TerrainRenderer", "Failed to create descriptor sets");
        return false;
    }
    
    m_initialized = true;
    LOG_INFO("TerrainRenderer", "TerrainRenderer initialized successfully with extent {}x{}", 
             swapChainExtent.width, swapChainExtent.height);
    return true;
}

void TerrainRenderer::Shutdown() {
    if (!m_initialized) return;
    
    // Clean up sampler
    if (m_defaultSampler != VK_NULL_HANDLE && m_base) {
        vkDestroySampler(m_base->GetDevice(), m_defaultSampler, nullptr);
        m_defaultSampler = VK_NULL_HANDLE;
    }
    
    // Note: Placeholder textures are managed by VulkanTextureManager and will be cleaned up there
    // We don't need to explicitly destroy them here
    
    // Reset all handles and views
    m_heightmapLowView = VK_NULL_HANDLE;
    m_heightmapMidView = VK_NULL_HANDLE;
    m_heightmapHighView = VK_NULL_HANDLE;
    m_heightmapMicroView = VK_NULL_HANDLE;
    m_albedoTextureView = VK_NULL_HANDLE;
    m_normalTextureView = VK_NULL_HANDLE;
    m_roughnessTextureView = VK_NULL_HANDLE;
    m_aoTextureView = VK_NULL_HANDLE;
    m_detailNormalTextureView = VK_NULL_HANDLE;
    m_detailRoughnessTextureView = VK_NULL_HANDLE;
    m_noiseTextureView = VK_NULL_HANDLE;
    
    if (m_terrainDescriptorSet != 0 && m_descriptorManager) {
        m_descriptorManager->ReleaseDescriptorSet(m_terrainDescriptorSet);
        m_terrainDescriptorSet = 0;
    }
    if (m_frameDescriptorSet != 0 && m_descriptorManager) {
        m_descriptorManager->ReleaseDescriptorSet(m_frameDescriptorSet);
        m_frameDescriptorSet = 0;
    }
    if (m_textureDescriptorSet != 0 && m_descriptorManager) {
        m_descriptorManager->ReleaseDescriptorSet(m_textureDescriptorSet);
        m_textureDescriptorSet = 0;
    }
    
    // Reset descriptor result to release any held layout references
    // Note: Do NOT manually release the layout ID here - the PipelineRegistry owns it
    // and will clean it up automatically during shutdown
    if (m_pipelineDescriptorResult.success) {
        LOG_DEBUG("TerrainRenderer", "Resetting pipeline descriptor result (layout ID: {}) - PipelineRegistry will handle cleanup", 
                 m_pipelineDescriptorResult.layoutId);
        m_pipelineDescriptorResult = Services::PipelineDescriptorResult{};
    }
    
    // Clean up pipeline integration (may hold ManagedLayoutHandle references)
    if (m_pipelineIntegration) {
        m_pipelineIntegration.reset();
    }
    
    // Clean up descriptor service (may hold descriptor layout references)
    if (m_descriptorService) {
        m_descriptorService.reset();
    }

    m_frameUniformBuffer.reset();
    m_terrainUniformBuffer.reset();
    
    m_placeholderTexturesCreated = false;
    m_initialized = false;
}

bool TerrainRenderer::RenderTerrainMesh(
    VkCommandBuffer cmdBuffer,
    const RenderableMesh& mesh,
    const TerrainUniforms& uniforms,
    const RenderContext& context) {
    
    static bool firstCall = true;
    if (firstCall) {
        LOG_INFO("TerrainRenderer", "RenderTerrainMesh called for the first time");
        firstCall = false;
    }
    
    if (!m_initialized || !cmdBuffer) {
        LOG_ERROR("TerrainRenderer", "Not initialized or invalid command buffer");
        return false;
    }
    
    if (!m_pipelineIntegration) {
        LOG_ERROR("TerrainRenderer", "Pipeline integration not available");
        return false;
    }
    
    // Validate mesh data
    if (!mesh.mesh) {
        LOG_ERROR("TerrainRenderer", "Cannot render terrain: mesh data is null");
        return false;
    }
    
    if (!mesh.mesh->vertexBuffer || !mesh.mesh->indexBuffer) {
        LOG_ERROR("TerrainRenderer", "Cannot render terrain: buffers not uploaded");
        return false;
    }
    
    static bool meshValidationLogged = false;
    if (!meshValidationLogged) {
        LOG_INFO("TerrainRenderer", "Mesh validation passed - {} vertices, {} indices", 
                  mesh.mesh->vertexCount, mesh.mesh->indexCount);
        meshValidationLogged = true;
        
        // Validate height data in vertex buffer (skip if device-local only)
        if (mesh.mesh->vertexBuffer) {
            // Check if we have CPU-accessible vertex data instead
            if (!mesh.mesh->vertices.empty()) {
                // Use CPU-side vertex data for validation
                LOG_INFO("TerrainRenderer", "Validating {} vertices from CPU-side data", mesh.mesh->vertices.size());
                
                float minHeight = std::numeric_limits<float>::max();
                float maxHeight = std::numeric_limits<float>::lowest();
                float minY = std::numeric_limits<float>::max();
                float maxY = std::numeric_limits<float>::lowest();
                size_t validCount = 0;
                
                size_t samplesToCheck = std::min(size_t(100), mesh.mesh->vertices.size());
                for (size_t i = 0; i < samplesToCheck; ++i) {
                    // Assuming height is stored in vertex.height field
                    float posY = mesh.mesh->vertices[i].position.y;
                    
                    if (std::isfinite(posY)) {
                        minY = std::min(minY, posY);
                        maxY = std::max(maxY, posY);
                        validCount++;
                    }
                }
                
                LOG_INFO("TerrainRenderer", "PRE-RENDER vertex validation: {} valid samples, position.y range [{}, {}]",
                         validCount, minY, maxY);
                
                // Log transform scale info and planet radius
                vec3 scale = vec3(mesh.worldTransform[0][0], mesh.worldTransform[1][1], mesh.worldTransform[2][2]);
                float planetRadius = uniforms.atmosphereParams.x;
                LOG_INFO("TerrainRenderer", "World transform scale: [{}, {}, {}], Planet radius: {}",
                         scale.x, scale.y, scale.z, planetRadius);
                
                // Check if height values are appropriate for planet scale
                float heightRange = maxY - minY;
                float heightToRadiusRatio = heightRange / planetRadius;
                LOG_INFO("TerrainRenderer", "Height range: {}, Height to radius ratio: {:.6f} ({:.2f}% of radius)",
                         heightRange, heightToRadiusRatio, heightToRadiusRatio * 100.0f);
            } else {
                // Vertex buffer is device-local only, cannot map for validation
                LOG_DEBUG("TerrainRenderer", "No CPU-side vertex data available for validation");
            }
        }
    }
    
    // Get or create terrain pipeline using PipelineFactory
    auto* terrainPipeline = m_pipelineManager->GetPipeline(PipelineType::Terrain);
    static bool pipelineStatusLogged = false;
    if (!pipelineStatusLogged) {
        LOG_INFO("TerrainRenderer", "Pipeline manager returned terrain pipeline: {}", 
                  terrainPipeline ? "valid" : "null");
        if (terrainPipeline) {
            LOG_INFO("TerrainRenderer", "Pipeline layout handle: {}", 
                     reinterpret_cast<void*>(terrainPipeline->GetPipelineLayout()));
        }
        pipelineStatusLogged = true;
    }
    
    if (!terrainPipeline) {
        // If we already have descriptor sets, we cannot recreate the pipeline
        // as it would create a mismatch between the pipeline layout and descriptor sets
        if (m_frameDescriptorSet != 0) {
            LOG_ERROR("TerrainRenderer", "Pipeline not found but descriptor sets already exist - cannot recreate pipeline");
            LOG_ERROR("TerrainRenderer", "This indicates the pipeline was deleted or not properly stored in the manager");
            return false;
        }
        
        static bool pipelineCreationLogged = false;
        if (!pipelineCreationLogged) {
            LOG_INFO("TerrainRenderer", "Creating terrain pipeline on-demand using PipelineFactory");
            pipelineCreationLogged = true;
        }
        
        // Create terrain pipeline using the integration system
        if (!CreatePipelines()) {
            LOG_ERROR("TerrainRenderer", "Failed to create terrain pipeline");
            return false;
        }
        
        // Also need to create descriptor sets if we're creating the pipeline on-demand
        if (!CreateDescriptorSets()) {
            LOG_ERROR("TerrainRenderer", "Failed to create descriptor sets after on-demand pipeline creation");
            return false;
        }
        
        // Retry getting the pipeline
        terrainPipeline = m_pipelineManager->GetPipeline(PipelineType::Terrain);
        LOG_DEBUG("TerrainRenderer", "After creation, pipeline manager returned: {}", 
                  terrainPipeline ? "valid" : "null");
        
        if (!terrainPipeline) {
            LOG_ERROR("TerrainRenderer", "Terrain pipeline still not available after creation");
            return false;
        }
    }
    
    // Verbose logging removed
    
    // Bind terrain pipeline
    terrainPipeline->Bind(cmdBuffer);
    
    // Set viewport and scissor to match render context
    VkViewport viewport{};
    viewport.x = 0.0f;
    viewport.y = 0.0f;
    viewport.width = static_cast<float>(m_extent.width);
    viewport.height = static_cast<float>(m_extent.height);
    viewport.minDepth = 0.0f;
    viewport.maxDepth = 1.0f;
    vkCmdSetViewport(cmdBuffer, 0, 1, &viewport);
    
    VkRect2D scissor{};
    scissor.offset = {0, 0};
    scissor.extent = m_extent;
    vkCmdSetScissor(cmdBuffer, 0, 1, &scissor);
    
    // Update uniforms and bind descriptor sets BEFORE push constants
    if (m_descriptorService) {
        LOG_ONCE(::Core::Logging::LogLevel::DEBUG, "TerrainRenderer", "Updating terrain uniforms...");
        UpdateTerrainUniforms(uniforms);
        
        // Update water/terrain analysis for debug visualization
        UpdateWaterTerrainMetrics(mesh);
        
        LOG_ONCE(::Core::Logging::LogLevel::DEBUG, "TerrainRenderer", "About to bind descriptor sets...");
        // Bind descriptor sets
        if (!BindDescriptorSets(cmdBuffer, terrainPipeline)) {
            // Rate limit this error to prevent spam
            static auto lastError = std::chrono::steady_clock::time_point{};
            auto now = std::chrono::steady_clock::now();
            if (now - lastError > std::chrono::seconds(5)) {
                LOG_ERROR("TerrainRenderer", "Failed to bind descriptor sets - this will cause validation errors! (rate limited)");
                lastError = now;
            }
            // The pipeline expects descriptors, so we cannot continue without them
            return false;
        }
        LOG_ONCE(::Core::Logging::LogLevel::DEBUG, "TerrainRenderer", "Descriptor sets bound successfully in RenderTerrainMesh");
    } else {
        LOG_ERROR("TerrainRenderer", "No descriptor service available - cannot bind required descriptor sets");
        return false;
    }
    
    // Set push constants AFTER binding descriptor sets
    if (!SetPushConstants(cmdBuffer, uniforms, context)) {
        LOG_ERROR("TerrainRenderer", "Failed to set push constants");
        return false;
    }
    
    // Bind vertex buffer
    VkBuffer vertexBuffers[] = { mesh.mesh->vertexBuffer->GetBuffer() };
    VkDeviceSize offsets[] = { 0 };
    vkCmdBindVertexBuffers(cmdBuffer, 0, 1, vertexBuffers, offsets);
    
    // Bind index buffer
    vkCmdBindIndexBuffer(cmdBuffer, mesh.mesh->indexBuffer->GetBuffer(), 0, VK_INDEX_TYPE_UINT32);
    
    // Draw the terrain mesh
    vkCmdDrawIndexed(cmdBuffer, mesh.mesh->indexCount, 1, 0, 0, 0);
    
    LOG_ONCE(::Core::Logging::LogLevel::DEBUG, "TerrainRenderer", "Successfully rendered terrain mesh with {} triangles", 
              mesh.mesh->indexCount / 3);
    
    return true;
}

bool TerrainRenderer::SetPlanetaryData(const PlanetaryData& planetaryData) {
    m_planetaryData = planetaryData;
    
    LOG_INFO("TerrainRenderer", "SetPlanetaryData called - texture coordinator: {}, elevation data size: {}", 
             m_textureCoordinator ? "available" : "null", 
             planetaryData.elevation.data.size());
    
    // Mark that we have real planetary data to prevent placeholder creation
    m_hasRealPlanetaryData = true;
    
    // If we have a texture coordinator, use it to create proper elevation-based textures
    if (m_textureCoordinator && !planetaryData.elevation.data.empty()) {
        LOG_INFO("TerrainRenderer", "Creating elevation-based textures from planetary data");
        
        // Configure GPU texture generation based on planet type and quality settings
        Generation::Texture::TerrainTextureGenerationConfig textureConfig;
        textureConfig.useGPUGeneration = true;
        
        // Default planet type (Earth-like) - can be extended based on planetary data properties
        int planetType = 0; // Earth-like by default
        
        // Determine planet type based on temperature and water presence
        if (planetaryData.temperature.data.size() > 0) {
            float avgTemp = 0.0f;
            for (float temp : planetaryData.temperature.data) {
                avgTemp += temp;
            }
            avgTemp /= planetaryData.temperature.data.size();
            
            // Simple planet type classification based on temperature
            if (avgTemp < 250.0f) {
                planetType = 4; // Ice world
            } else if (avgTemp > 350.0f) {
                planetType = 3; // Volcanic
            } else if (planetaryData.seaLevel < -0.5f) {
                planetType = 1; // Mars-like (dry)
            } else if (planetaryData.seaLevel > 0.5f) {
                planetType = 2; // Water world
            }
        }
        
        // Configure based on planet type
        switch (planetType) {
            case 0: // Earth-like
                textureConfig.normalStrength = 1.0f;
                textureConfig.altitudeSnowLine = 0.7f;
                textureConfig.altitudeTreeLine = 0.4f;
                textureConfig.slopeThreshold = 0.5f;
                break;
            case 1: // Mars-like
                textureConfig.normalStrength = 1.2f;
                textureConfig.altitudeSnowLine = 0.9f;
                textureConfig.altitudeTreeLine = 1.0f; // No trees on Mars
                textureConfig.slopeThreshold = 0.6f;
                break;
            case 2: // Water world
                textureConfig.normalStrength = 0.8f;
                textureConfig.altitudeSnowLine = 0.95f;
                textureConfig.altitudeTreeLine = 0.2f;
                textureConfig.slopeThreshold = 0.4f;
                break;
            case 3: // Volcanic
                textureConfig.normalStrength = 1.5f;
                textureConfig.altitudeSnowLine = 1.0f; // No snow on volcanic worlds
                textureConfig.altitudeTreeLine = 1.0f; // No trees either
                textureConfig.slopeThreshold = 0.7f;
                break;
            case 4: // Ice world
                textureConfig.normalStrength = 0.9f;
                textureConfig.altitudeSnowLine = 0.1f; // Almost all snow
                textureConfig.altitudeTreeLine = 1.0f; // No trees
                textureConfig.slopeThreshold = 0.3f;
                break;
            case 5: // Alien
                textureConfig.normalStrength = 1.3f;
                textureConfig.altitudeSnowLine = 0.8f;
                textureConfig.altitudeTreeLine = 0.5f;
                textureConfig.slopeThreshold = 0.55f;
                textureConfig.detailOctaves = 6; // More complex detail
                break;
        }
        
        // Set the texture generation configuration
        m_textureCoordinator->SetTextureGenerationConfig(textureConfig);
        
        // Clear any existing textures before creating new ones
        m_textureCoordinator->ClearAllTextures();
        LOG_INFO("TerrainRenderer", "Cleared existing textures before creating new ones");
        
        // Initialize GPU generators if not already initialized
        if (textureConfig.useGPUGeneration) {
            // Get buffer management system instance
            auto& bufferMgr = BufferManagementSystem::Instance();
            VulkanCommandBufferManager* commandManager = static_cast<VulkanCommandBufferManager*>(m_resourceManager->GetCommandBufferManager());
            
            // Clean up existing GPU generators first to ensure fresh pipeline states
            m_textureCoordinator->CleanupGPUGenerators();
            
            // Always reinitialize GPU generators to ensure they have valid pipeline handles
            // This is necessary after water system cleanup which may invalidate shader modules
            if (commandManager && m_textureCoordinator->InitializeGPUGenerators(
                    m_base, 
                    m_resourceManager, 
                    commandManager, 
                    &bufferMgr)) {
            } else {
                LOG_WARN("TerrainRenderer", "Failed to initialize GPU generators, falling back to CPU generation");
                textureConfig.useGPUGeneration = false;
                m_textureCoordinator->SetTextureGenerationConfig(textureConfig);
            }
        }
        
        // Create heightmap LOD chain from actual planetary data
        float minHeight = planetaryData.elevation.minValue;
        float maxHeight = planetaryData.elevation.maxValue;
        
        if (!m_textureCoordinator->CreateHeightmapLODChain(
                planetaryData.elevation.data, 
                planetaryData.elevation.width, // Using width as resolution
                minHeight, 
                maxHeight - minHeight, // Pass the range, not max value
                "terrain_heightmap")) {
            LOG_ERROR("TerrainRenderer", "Failed to create heightmap LOD chain from planetary data");
            return false;
        }
        
        // Create material textures with elevation-based coloring
        if (!m_textureCoordinator->CreateMaterialTextures(planetaryData, planetaryData.elevation.width, planetType)) {
            LOG_ERROR("TerrainRenderer", "Failed to create material textures from planetary data");
            return false;
        }
        
        LOG_INFO("TerrainRenderer", "Successfully created elevation-based textures using {} generation", 
                 textureConfig.useGPUGeneration ? "GPU" : "CPU");
        m_placeholderTexturesCreated = false; // Force update of texture views
        
        // Get the newly created texture views from the coordinator
        auto terrainData = m_textureCoordinator->CreateTerrainDataFromCurrentSet();
        
        // Update our cached texture views with the new ones
        // Note: TerrainDescriptorData uses different field names than our cache
        if (terrainData.heightmapView != VK_NULL_HANDLE) {
            m_heightmapLowView = terrainData.heightmapView;
            m_heightmapMidView = terrainData.heightmapView;  // Use same for all LODs for now
            m_heightmapHighView = terrainData.heightmapView;
            m_heightmapMicroView = terrainData.heightmapView;
        }
        if (terrainData.albedoTextureView != VK_NULL_HANDLE) {
            m_albedoTextureView = terrainData.albedoTextureView;
        }
        if (terrainData.normalTextureView != VK_NULL_HANDLE) {
            m_normalTextureView = terrainData.normalTextureView;
        }
        if (terrainData.roughnessTextureView != VK_NULL_HANDLE) {
            m_roughnessTextureView = terrainData.roughnessTextureView;
        }
        if (terrainData.aoTextureView != VK_NULL_HANDLE) {
            m_aoTextureView = terrainData.aoTextureView;
        }
        if (terrainData.detailNormalView != VK_NULL_HANDLE) {
            m_detailNormalTextureView = terrainData.detailNormalView;
        }
        if (terrainData.detailRoughnessView != VK_NULL_HANDLE) {
            m_detailRoughnessTextureView = terrainData.detailRoughnessView;
        }
        if (terrainData.noiseTextureView != VK_NULL_HANDLE) {
            m_noiseTextureView = terrainData.noiseTextureView;
        }
        
        // Update descriptor sets with new textures
        if (m_frameDescriptorSet != 0) {
            UpdateDescriptorSetBindings();
            LOG_INFO("TerrainRenderer", "Updated descriptor sets with new planetary textures");
        }
        
        // Use the actual planet radius from planetary data (respecting user configuration)
        float planetRadius = static_cast<float>(planetaryData.planetRadius);
        LOG_INFO("TerrainRenderer", "Using planet radius from planetary data: {}", planetRadius);
        
        // Update uniform buffers with planet radius
        TerrainUniforms uniforms{};
        uniforms.atmosphereParams.x = planetRadius;
        uniforms.planetRadius = planetRadius;
        uniforms.heightScale = (planetaryData.elevation.maxValue - planetaryData.elevation.minValue);
        
        if (!planetaryData.elevation.data.empty()) {
            uniforms.maxElevation = planetaryData.elevation.maxValue;
            uniforms.elevationExaggeration = 1.0f;
        }
        LOG_INFO("TerrainRenderer", "Planet radius: {}", planetRadius);
        LOG_INFO("TerrainRenderer", "Height scale: {}", uniforms.heightScale);
        LOG_INFO("TerrainRenderer", "Max elevation: {}", uniforms.maxElevation);
        
        UpdateTerrainUniforms(uniforms);
        
    } else {
        LOG_WARN("TerrainRenderer", "No texture coordinator or elevation data available for texture generation - coordinator: {}, elevation size: {}", 
                 m_textureCoordinator ? "available" : "null",
                 planetaryData.elevation.data.size());
    }
    
    return true;
}

void TerrainRenderer::UpdateTerrainUniforms(const TerrainUniforms& uniforms) {
    if (!m_resourceManager) {
        LOG_WARN("TerrainRenderer", "Cannot update terrain uniforms - resource manager not available");
        return;
    }
    
    // Update frame uniform buffer with camera data (binding 0)
    if (m_frameUniformBuffer) {
        struct CameraData {
            mat4 view;
            mat4 projection;
            mat4 viewProjection;
            vec4 cameraPosition;
        } cameraData;
        
        cameraData.view = uniforms.view;
        cameraData.projection = uniforms.projection;
        cameraData.viewProjection = uniforms.projection * uniforms.view;
        
        // Extract camera position from inverse view matrix
        mat4 invView = inverse(uniforms.view);
        cameraData.cameraPosition = vec4(invView[3][0], invView[3][1], invView[3][2], 1.0f);
        
        VkResult result = m_frameUniformBuffer->UpdateData(&cameraData, sizeof(CameraData));
        if (result != VK_SUCCESS) {
            LOG_ERROR("TerrainRenderer", "Failed to update frame uniform buffer - VkResult: {}", static_cast<int>(result));
        }
    }
    
    // Update terrain uniform buffer (binding 1)
    if (m_terrainUniformBuffer) {
        // Use BufferResource::UpdateData() instead of manual mapping
        LOG_ONCE(::Core::Logging::LogLevel::DEBUG, "TerrainRenderer", "Updating terrain uniform buffer with {} bytes", sizeof(TerrainUniforms));
        
        VkResult result = m_terrainUniformBuffer->UpdateData(&uniforms, sizeof(TerrainUniforms));
        if (result == VK_SUCCESS) {
            LOG_ONCE(::Core::Logging::LogLevel::DEBUG, "TerrainRenderer", "Terrain uniforms updated successfully using BufferResource::UpdateData()");
        } else {
            LOG_ERROR("TerrainRenderer", "Failed to update terrain uniform buffer - VkResult: {}", static_cast<int>(result));
            LOG_ONCE(::Core::Logging::LogLevel::DEBUG, "TerrainRenderer", "Buffer handle valid: {}", m_terrainUniformBuffer ? "yes" : "no");
        }
    } else {
        LOG_WARN("TerrainRenderer", "Cannot update terrain uniforms - terrain uniform buffer not available");
    }
    
    // Update terrain block buffer (binding 14 - TerrainBlock)
    if (m_terrainBlockBuffer) {
        struct TerrainBlock {
            float planetRadius;
            float maxHeight;
            float heightScale;
            float textureScale;
            vec4 padding;
        } terrainBlock;
        
        terrainBlock.planetRadius = uniforms.planetRadius;
        
        float dynamicMaxHeight = 15000.0f;
        float dynamicHeightScale = 1.0f;
        
        if (m_planetaryData.elevation.data.size() > 0) {
            dynamicMaxHeight = std::abs(m_planetaryData.elevation.maxValue - m_planetaryData.elevation.minValue);
        }
        
        // Apply visual scaling parameters from uniforms
        // This exaggeration factor is calculated in GPUInfrastructureManager to make terrain visible
        if (uniforms.elevationExaggeration > 0.0f) {
            dynamicHeightScale = uniforms.elevationExaggeration;
        } else if (uniforms.heightScale > 0.0f) {
            // Fallback to heightScale if elevationExaggeration not set
            dynamicHeightScale = uniforms.heightScale;
        } else {
            // Emergency fallback - calculate based on planet size vs terrain range
            float planetRadius = uniforms.planetRadius;
            if (planetRadius > 0.0f && dynamicMaxHeight > 0.0f) {
                float naturalRatio = dynamicMaxHeight / planetRadius;
                float targetRatio = 0.05f; // 5% visual target
                dynamicHeightScale = targetRatio / naturalRatio;
                dynamicHeightScale = std::max(2.0f, std::min(50.0f, dynamicHeightScale));
                LOG_WARN("TerrainRenderer", "No elevation exaggeration provided, calculated {}x based on planet scale", dynamicHeightScale);
            }
        }
        
        terrainBlock.maxHeight = dynamicMaxHeight;
        terrainBlock.heightScale = dynamicHeightScale;
        
        terrainBlock.textureScale = 1.0f;
        terrainBlock.padding = vec4(0.0f);
        
        VkResult result = m_terrainBlockBuffer->UpdateData(&terrainBlock, sizeof(TerrainBlock));
        if (result != VK_SUCCESS) {
            LOG_ERROR("TerrainRenderer", "Failed to update terrain block buffer - VkResult: {}", static_cast<int>(result));
        }
    }
}

bool TerrainRenderer::CreatePipelines() {
    if (!m_pipelineIntegration) {
        LOG_ERROR("TerrainRenderer", "Pipeline integration not available");
        return false;
    }
    
    // Use the PipelineFactory to create terrain pipeline with proper shaders
    std::string vertexShaderPath = "terrain/terrain.vert";
    std::string fragmentShaderPath = "shaders/terrain/terrain.frag.spv";
    std::string tessControlShaderPath = "shaders/terrain/terrain.tesc.spv";
    std::string tessEvalShaderPath = "shaders/terrain/terrain.tese.spv";
    
    // Create terrain pipeline using decoupled approach
    PipelineConfig config{};
    config.renderPass = VK_NULL_HANDLE; // Using dynamic rendering
    config.extent = m_extent;
    config.vertexShaderPath = vertexShaderPath;
    config.fragmentShaderPath = fragmentShaderPath;
    config.tessellationControlShaderPath = tessControlShaderPath;
    config.tessellationEvaluationShaderPath = tessEvalShaderPath;
    
    // Set formats for dynamic rendering
    config.colorFormat = VK_FORMAT_B8G8R8A8_SRGB; // Common swapchain format
    config.depthFormat = VK_FORMAT_D32_SFLOAT; // Common depth format
    
    // Enable tessellation
    config.enableTessellation = true;
    config.patchControlPoints = 4; // Quad patches (matching mesh generator)
    config.inputAssembly.topology = VK_PRIMITIVE_TOPOLOGY_PATCH_LIST;
    
    auto result = m_pipelineIntegration->CreateTerrainPipeline(
        vertexShaderPath,
        fragmentShaderPath,
        VK_NULL_HANDLE, // renderPass - using dynamic rendering
        m_extent,
        true, // enableTessellation
        "TerrainPipeline",
        tessControlShaderPath,  // Include tessellation control shader
        tessEvalShaderPath      // Include tessellation evaluation shader
    );
    
    if (!result.success) {
        LOG_ERROR("TerrainRenderer", "Failed to create terrain pipeline: {}", result.errorMessage);
        return false;
    }
    
    // Store the descriptor result for descriptor set creation
    m_pipelineDescriptorResult = result.descriptorResult;
    
    LOG_INFO("TerrainRenderer", "Terrain pipeline created successfully using PipelineFactory");
    LOG_INFO("TerrainRenderer", "Stored descriptor result with layout ID: {}", m_pipelineDescriptorResult.layoutId);
    if (!m_pipelineDescriptorResult.descriptorSetLayouts.empty()) {
        LOG_INFO("TerrainRenderer", "Stored descriptor set layout handle: {}", 
                 reinterpret_cast<void*>(m_pipelineDescriptorResult.descriptorSetLayouts[0]));
    }
    return true;
}

bool TerrainRenderer::CreateDescriptorSets() {
    if (!m_descriptorService || !m_descriptorManager) {
        LOG_ERROR("TerrainRenderer", "Descriptor service or manager not available");
        return false;
    }
    
    // Use the descriptor result from pipeline creation if available
    if (m_pipelineDescriptorResult.success && m_pipelineDescriptorResult.layoutId != INVALID_LAYOUT_ID) {
        LOG_INFO("TerrainRenderer", "Allocating descriptor set with layout ID: {} from pipeline creation", 
                 m_pipelineDescriptorResult.layoutId);
        if (!m_pipelineDescriptorResult.descriptorSetLayouts.empty()) {
            LOG_INFO("TerrainRenderer", "First descriptor set layout handle: {}", 
                     reinterpret_cast<void*>(m_pipelineDescriptorResult.descriptorSetLayouts[0]));
        }
        
        // Allocate descriptor set with dynamic binding strategy for per-frame updates
        m_frameDescriptorSet = m_descriptorManager->AllocateDescriptorSet(
            m_pipelineDescriptorResult.layoutId, 
            BindingStrategy::Dynamic,
            "TerrainFrameDescriptorSet");
        
        if (m_frameDescriptorSet == 0) {
            LOG_ERROR("TerrainRenderer", "Failed to allocate terrain descriptor set");
            return false;
        }
        
        LOG_INFO("TerrainRenderer", "Allocated DYNAMIC descriptor set {} with layout ID {} ({} bindings)", 
                 m_frameDescriptorSet, m_pipelineDescriptorResult.layoutId,
                 m_pipelineDescriptorResult.bindings.size());
        
        // Debug: Log all bindings
        for (const auto& binding : m_pipelineDescriptorResult.bindings) {
            LOG_DEBUG("TerrainRenderer", "  Binding {}: {} (type: {}, stages: {})", 
                     binding.binding, binding.name, static_cast<uint32_t>(binding.type), static_cast<uint32_t>(binding.stages));
        }
    } else {
        // Fallback: ALWAYS create descriptor sets using shader paths for proper reflection
        // The CreateLayoutFromShaderModules is a stub that only creates 2 bindings!
        LOG_WARN("TerrainRenderer", "Pipeline descriptor result not available or incomplete, using shader reflection");
        
        std::vector<std::string> shaderPaths = {
            "shaders/terrain/terrain.vert.spv",
            "shaders/terrain/terrain.frag.spv",
            "shaders/terrain/terrain.tesc.spv",
            "shaders/terrain/terrain.tese.spv"
        };
        
        auto layoutResult = m_descriptorService->CreateLayoutFromShaders(shaderPaths, "TerrainPipelineLayout");
        if (!layoutResult.success) {
            LOG_ERROR("TerrainRenderer", "Failed to create terrain pipeline layout: {}", 
                     layoutResult.validation.errorMessage);
            return false;
        }
        
        // Allocate descriptor set with dynamic binding strategy for per-frame updates
        m_frameDescriptorSet = m_descriptorManager->AllocateDescriptorSet(
            layoutResult.layoutId,
            BindingStrategy::Dynamic,
            "TerrainFrameDescriptorSet");
        
        if (m_frameDescriptorSet == 0) {
            LOG_ERROR("TerrainRenderer", "Failed to allocate terrain descriptor set");
            return false;
        }
        
        // Store the result for later use
        m_pipelineDescriptorResult = layoutResult;
    }
    
    // Update descriptor set with our uniform buffers and placeholder textures
    if (!UpdateDescriptorSetBindings()) {
        LOG_ERROR("TerrainRenderer", "Failed to update descriptor set bindings");
        return false;
    }
    
    LOG_INFO("TerrainRenderer", "Terrain descriptor sets created and updated successfully");
    return true;
}

bool TerrainRenderer::CreateUniformBuffers() {
    // Use VulkanResourceManager to create uniform buffers
    if (!m_resourceManager) {
        LOG_ERROR("TerrainRenderer", "Resource manager not available");
        return false;
    }
    
    // Create uniform buffers using BufferManagementSystem
    auto& bufferMgr = BufferManagementSystem::Instance();
    
    // Create frame uniform buffer for CameraData struct
    struct CameraData {
        mat4 view;
        mat4 projection;
        mat4 viewProjection;
        vec4 cameraPosition;
    };
    size_t frameUniformSize = sizeof(CameraData); // 3 matrices + 1 vector = 208 bytes
    LOG_DEBUG("TerrainRenderer", "Creating frame uniform buffer of size {} bytes", frameUniformSize);
    
    auto frameBuffer = bufferMgr.CreateUniformBuffer(
        frameUniformSize,
        false, // not device local (host visible)
        BufferPoolType::Rendering
    );
    
    // Create terrain uniform buffer (terrain-specific parameters)
    size_t terrainUniformSize = sizeof(TerrainUniforms);
    LOG_DEBUG("TerrainRenderer", "Creating terrain uniform buffer of size {} bytes", terrainUniformSize);
    
    auto terrainBuffer = bufferMgr.CreateUniformBuffer(
        terrainUniformSize,
        false, // not device local (host visible)
        BufferPoolType::Rendering
    );
    
    // Create terrain parameters buffer for binding 14 (TerrainBlock)
    struct TerrainBlock {
        float planetRadius;
        float maxHeight;
        float heightScale;
        float textureScale;
        vec4 padding; // Ensure 16-byte alignment
    };
    size_t terrainBlockSize = sizeof(TerrainBlock);
    LOG_DEBUG("TerrainRenderer", "Creating terrain block buffer of size {} bytes", terrainBlockSize);
    
    auto terrainBlockBuffer = bufferMgr.CreateUniformBuffer(
        terrainBlockSize,
        false, // not device local (host visible)
        BufferPoolType::Rendering
    );
    
    if (!frameBuffer || !terrainBuffer || !terrainBlockBuffer) {
        LOG_ERROR("TerrainRenderer", "Failed to create uniform buffers - frameBuffer: {}, terrainBuffer: {}, terrainBlockBuffer: {}", 
                 frameBuffer ? "valid" : "null", terrainBuffer ? "valid" : "null", terrainBlockBuffer ? "valid" : "null");
        return false;
    }
    
    // Store buffer resources
    m_frameUniformBuffer = frameBuffer;
    m_terrainUniformBuffer = terrainBuffer;
    m_terrainBlockBuffer = terrainBlockBuffer;
    
    if (!m_frameUniformBuffer || !m_terrainUniformBuffer) {
        LOG_ERROR("TerrainRenderer", "Uniform buffer resources are not valid after assignment");
        return false;
    }
    
    LOG_DEBUG("TerrainRenderer", "Terrain uniform buffer created successfully with handle: {}", 
             reinterpret_cast<void*>(m_terrainUniformBuffer.get()));
    
    LOG_INFO("TerrainRenderer", "Uniform buffers created successfully");
    return true;
}

bool TerrainRenderer::BindPipeline(VkCommandBuffer cmdBuffer) {
    if (!cmdBuffer) {
        return false;
    }
    
    // Get terrain pipeline from pipeline manager
    auto* terrainPipeline = m_pipelineManager->GetPipeline(PipelineType::Terrain);
    if (!terrainPipeline) {
        LOG_WARN("TerrainRenderer", "Terrain pipeline not available for binding");
        return false;
    }
    
    // Bind the pipeline
    terrainPipeline->Bind(cmdBuffer);
    return true;
}

bool TerrainRenderer::BindDescriptorSets(VkCommandBuffer cmdBuffer, VulkanPipelineBase* terrainPipeline) {
    if (!cmdBuffer) {
        LOG_ERROR("TerrainRenderer", "BindDescriptorSets: Command buffer is null");
        return false;
    }
    
    if (!terrainPipeline) {
        LOG_ERROR("TerrainRenderer", "BindDescriptorSets: Terrain pipeline is null");
        return false;
    }
    
    if (!m_descriptorService) {
        LOG_ERROR("TerrainRenderer", "BindDescriptorSets: Descriptor service is null");
        return false;
    }
    
    // Bind descriptor sets using the DescriptorManager
    if (m_frameDescriptorSet == 0) {
        LOG_ERROR("TerrainRenderer", "BindDescriptorSets: No descriptor set available (m_frameDescriptorSet = 0)");
        return false;
    }
    
    LOG_ONCE(::Core::Logging::LogLevel::DEBUG, "TerrainRenderer", "BindDescriptorSets: m_frameDescriptorSet = {}", m_frameDescriptorSet);
    
    VkPipelineLayout pipelineLayout = terrainPipeline->GetPipelineLayout();
    if (pipelineLayout == VK_NULL_HANDLE) {
        // Rate limit this error to prevent spam
        static auto lastError = std::chrono::steady_clock::time_point{};
        auto now = std::chrono::steady_clock::now();
        if (now - lastError > std::chrono::seconds(5)) {
            LOG_ERROR("TerrainRenderer", "BindDescriptorSets: Pipeline layout is VK_NULL_HANDLE (rate limited)");
            lastError = now;
        }
        return false;
    }
    
    // All verbose logging removed - direct binding works
    
    // Use DescriptorManager's binding method for Vulkan 1.4 best practices
    std::vector<Rendering::DescriptorSetId> setIds = { m_frameDescriptorSet };
    
    // Verify the descriptor set is valid before binding
    VkDescriptorSet actualSet = m_descriptorManager->GetDescriptorSet(m_frameDescriptorSet);
    if (actualSet == VK_NULL_HANDLE) {
        LOG_ERROR("TerrainRenderer", "Descriptor set ID {} maps to VK_NULL_HANDLE!", m_frameDescriptorSet);
        return false;
    }
    
    auto result = m_descriptorManager->BindDescriptorSets(
        cmdBuffer,
        pipelineLayout,
        setIds,
        0, // first set
        VK_PIPELINE_BIND_POINT_GRAPHICS
    );
    
    if (!result.IsSuccess()) {
        LOG_ERROR("TerrainRenderer", "Failed to bind descriptor sets through manager: {}", result.message);
        return false;
    }
    
    return true;
}

bool TerrainRenderer::SetPushConstants(VkCommandBuffer cmdBuffer, const TerrainUniforms& uniforms, const RenderContext& context) {
    if (!cmdBuffer) {
        return false;
    }
    
    auto* terrainPipeline = m_pipelineManager->GetPipeline(PipelineType::Terrain);
    if (!terrainPipeline || terrainPipeline->GetPipelineLayout() == VK_NULL_HANDLE) {
        LOG_ERROR("TerrainRenderer", "Pipeline or pipeline layout not available for push constants");
        return false;
    }
    
    // Create push constants structure matching shader layout
    struct TerrainPushConstants {
        mat4 modelViewProjection;
        mat4 modelView;
        vec4 cameraPos;
        vec4 sunDirection;
        vec4 sunColor;
        vec4 atmosphereParams;
    } pushConstants;
    
    // Fill push constants from uniforms and context
    // Correct matrix multiplication order: projection * view * model
    pushConstants.modelViewProjection = uniforms.projection * uniforms.view * uniforms.model;
    pushConstants.modelView = uniforms.view * uniforms.model;
    
    // Extract camera position from inverse view matrix
    mat4 invView = inverse(uniforms.view);
    pushConstants.cameraPos = vec4(invView[3][0], invView[3][1], invView[3][2], 1.0f);
    
    pushConstants.sunDirection = vec4(uniforms.sunDirection, 0.0f);
    pushConstants.sunColor = vec4(uniforms.sunColor, uniforms.minTessLevel);
    pushConstants.atmosphereParams = vec4(uniforms.atmosphereParams, uniforms.maxTessLevel);
    
    // Push constants to all shader stages that use them (including fragment for pipeline layout compatibility)
    vkCmdPushConstants(
        cmdBuffer,
        terrainPipeline->GetPipelineLayout(),
        VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_TESSELLATION_CONTROL_BIT | VK_SHADER_STAGE_TESSELLATION_EVALUATION_BIT | VK_SHADER_STAGE_FRAGMENT_BIT,
        0, // offset
        sizeof(TerrainPushConstants),
        &pushConstants
    );
    
    LOG_ONCE(::Core::Logging::LogLevel::DEBUG, "TerrainRenderer", "Push constants set successfully");
    return true;
}

bool TerrainRenderer::UpdateDescriptorSetBindings() {
    if (!m_descriptorManager || m_frameDescriptorSet == 0) {
        LOG_ERROR("TerrainRenderer", "Cannot update descriptor bindings - manager or set not available");
        return false;
    }
    
    // Use the bindings from shader reflection if available
    if (m_pipelineDescriptorResult.success && !m_pipelineDescriptorResult.bindings.empty()) {
        // Update descriptor set based on shader reflection bindings
        Services::EnhancedTerrainData terrainData;
        
        // Fill in the available buffers
        terrainData.cameraBuffer = m_frameUniformBuffer ? m_frameUniformBuffer->GetBuffer() : VK_NULL_HANDLE;
        terrainData.transformBuffer = m_terrainUniformBuffer ? m_terrainUniformBuffer->GetBuffer() : VK_NULL_HANDLE;
        terrainData.terrainParamsBuffer = m_terrainBlockBuffer ? m_terrainBlockBuffer->GetBuffer() : VK_NULL_HANDLE;
        
        // Create or get default sampler
        if (!m_defaultSampler) {
            CreateDefaultSampler();
        }
        
        // Create placeholder textures if needed (skip if we have real planetary data)
        if (!m_placeholderTexturesCreated && !m_hasRealPlanetaryData) {
            CreatePlaceholderTextures();
        }
        
        // Fill in texture data - prefer coordinator textures if available
        terrainData.textureSampler = m_defaultSampler;
        terrainData.detailSampler = m_defaultSampler;
        
        // If we have a texture coordinator and it's ready, use its texture data
        if (m_textureCoordinator && m_textureCoordinator->IsReadyForRendering()) {
            auto coordinatorData = m_textureCoordinator->CreateTerrainDataFromCurrentSet();
            
            // Get individual LOD heightmap views from texture manager
            // The coordinator creates textures with names like "terrain_heightmap_low_v1", etc.
            if (m_resourceManager) {
                VulkanTextureManager* textureManager = static_cast<VulkanTextureManager*>(m_resourceManager->GetTextureManager());
                if (textureManager != nullptr) {
                    LOG_INFO("TerrainRenderer", "Searching for heightmap textures in texture manager");
                    
                    // Try to find the LOD heightmaps with common naming patterns
                    std::vector<std::string> prefixes = {"terrain_heightmap_", "heightmap_", "terrain_"};
                    std::vector<std::string> suffixes = {"_v1", "_v2", "_v3", "_v4", "_v5"};
                
                    for (const auto& prefix : prefixes) {
                        for (const auto& suffix : suffixes) {
                            // Try to get heightmap low
                            std::string lowName = prefix + "low" + suffix;
                            auto heightmapLowResource = textureManager->GetTexture(lowName);
                            if (heightmapLowResource && heightmapLowResource->isValid()) {
                                terrainData.heightmapLow = heightmapLowResource->view;
                                LOG_INFO("TerrainRenderer", "Found heightmap low: {}", lowName);
                                
                                // If we found low, try to find the others with the same pattern
                                std::string midName = prefix + "mid" + suffix;
                                auto heightmapMidResource = textureManager->GetTexture(midName);
                                if (heightmapMidResource && heightmapMidResource->isValid()) {
                                    terrainData.heightmapMid = heightmapMidResource->view;
                                    LOG_INFO("TerrainRenderer", "Found heightmap mid: {}", midName);
                                }
                                
                                std::string highName = prefix + "high" + suffix;
                                auto heightmapHighResource = textureManager->GetTexture(highName);
                                if (heightmapHighResource && heightmapHighResource->isValid()) {
                                    terrainData.heightmapHigh = heightmapHighResource->view;
                                    LOG_INFO("TerrainRenderer", "Found heightmap high: {}", highName);
                                }
                                
                                // Use high resolution as micro for now
                                terrainData.heightmapMicro = terrainData.heightmapHigh;
                                break; // Found a valid set, stop searching
                            }
                        }
                        if (terrainData.heightmapLow != VK_NULL_HANDLE) {
                            break; // Found textures, stop searching prefixes
                        }
                    }
                    
                    // Fallback: use coordinatorData.heightmapView for all LODs if available
                    if (terrainData.heightmapLow == VK_NULL_HANDLE) {
                        if (coordinatorData.heightmapView) {
                            LOG_WARN("TerrainRenderer", "Using single heightmap for all LOD levels");
                            terrainData.heightmapLow = coordinatorData.heightmapView;
                            terrainData.heightmapMid = coordinatorData.heightmapView;
                            terrainData.heightmapHigh = coordinatorData.heightmapView;
                            terrainData.heightmapMicro = coordinatorData.heightmapView;
                        } else {
                            LOG_ERROR("TerrainRenderer", "No heightmap textures found!");
                        }
                    }
                }
            }
            
            if (coordinatorData.albedoTextureView) {
                terrainData.albedoTexture = coordinatorData.albedoTextureView;
            }
            if (coordinatorData.normalTextureView) {
                terrainData.normalTexture = coordinatorData.normalTextureView;
            }
            if (coordinatorData.roughnessTextureView) {
                terrainData.roughnessTexture = coordinatorData.roughnessTextureView;
            }
            if (coordinatorData.aoTextureView) {
                terrainData.aoTexture = coordinatorData.aoTextureView;
            }
            if (coordinatorData.detailNormalView) {
                terrainData.detailNormalTexture = coordinatorData.detailNormalView;
            }
            if (coordinatorData.detailRoughnessView) {
                terrainData.detailRoughnessTexture = coordinatorData.detailRoughnessView;
            }
        }
        
        // Always use placeholder textures as fallback for any missing textures
        if (!terrainData.heightmapLow) terrainData.heightmapLow = m_heightmapLowView;
        if (!terrainData.heightmapMid) terrainData.heightmapMid = m_heightmapMidView;
        if (!terrainData.heightmapHigh) terrainData.heightmapHigh = m_heightmapHighView;
        if (!terrainData.heightmapMicro) terrainData.heightmapMicro = m_heightmapMicroView;
        
        if (!terrainData.albedoTexture) terrainData.albedoTexture = m_albedoTextureView;
        if (!terrainData.normalTexture) terrainData.normalTexture = m_normalTextureView;
        if (!terrainData.roughnessTexture) terrainData.roughnessTexture = m_roughnessTextureView;
        if (!terrainData.aoTexture) terrainData.aoTexture = m_aoTextureView;
        if (!terrainData.detailNormalTexture) terrainData.detailNormalTexture = m_detailNormalTextureView;
        if (!terrainData.detailRoughnessTexture) terrainData.detailRoughnessTexture = m_detailRoughnessTextureView;
        // Note: binding 26 (noise) uses albedo texture as placeholder in TerrainDescriptorService
        
        // Log what resources we have
        LOG_DEBUG("TerrainRenderer", "Available resources for descriptor update:");
        LOG_DEBUG("TerrainRenderer", "  cameraBuffer: {}", terrainData.cameraBuffer ? "valid" : "null");
        LOG_DEBUG("TerrainRenderer", "  transformBuffer: {}", terrainData.transformBuffer ? "valid" : "null");
        LOG_DEBUG("TerrainRenderer", "  terrainParamsBuffer: {}", terrainData.terrainParamsBuffer ? "valid" : "null");
        LOG_DEBUG("TerrainRenderer", "  textureSampler: {}", terrainData.textureSampler ? "valid" : "null");
        
        // Update descriptor set using the service method that matches shader bindings
        m_descriptorService->UpdateDescriptorSetFromBindings(
            m_frameDescriptorSet,
            m_pipelineDescriptorResult.bindings,
            terrainData
        );
        
        LOG_INFO("TerrainRenderer", "Updated descriptor set with {} shader-reflected bindings", 
                  m_pipelineDescriptorResult.bindings.size());
    } else {
        // Fallback: Create minimal descriptor writes for basic rendering
        std::vector<Rendering::DescriptorWrite> writes;
        
        // Only update the uniform buffers we have
        if (m_frameUniformBuffer) {
            Rendering::DescriptorWrite write;
            write.binding = 0;
            write.arrayElement = 0;
            write.type = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
            write.bufferInfo.buffer = m_frameUniformBuffer->GetBuffer();
            write.bufferInfo.offset = 0;
            write.bufferInfo.range = VK_WHOLE_SIZE;
            writes.push_back(write);
        }
        
        if (m_terrainUniformBuffer) {
            Rendering::DescriptorWrite write;
            write.binding = 1;
            write.arrayElement = 0;
            write.type = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
            write.bufferInfo.buffer = m_terrainUniformBuffer->GetBuffer();
            write.bufferInfo.offset = 0;
            write.bufferInfo.range = VK_WHOLE_SIZE;
            writes.push_back(write);
        }
        
        // Add TerrainBlock buffer at binding 14
        if (m_terrainBlockBuffer) {
            Rendering::DescriptorWrite write;
            write.binding = 14;
            write.arrayElement = 0;
            write.type = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
            write.bufferInfo.buffer = m_terrainBlockBuffer->GetBuffer();
            write.bufferInfo.offset = 0;
            write.bufferInfo.range = VK_WHOLE_SIZE;
            writes.push_back(write);
        }
        
        if (!writes.empty()) {
            auto result = m_descriptorManager->UpdateDescriptorSet(m_frameDescriptorSet, writes);
            if (!result.IsSuccess()) {
                LOG_ERROR("TerrainRenderer", "Failed to update descriptor set: {}", result.message);
                return false;
            }
            
            LOG_DEBUG("TerrainRenderer", "Updated descriptor set with {} bindings (fallback mode)", writes.size());
        }
    }
    
    return true;
}

bool TerrainRenderer::CreateDefaultSampler() {
    if (!m_base) {
        LOG_ERROR("TerrainRenderer", "VulkanBase not available for sampler creation");
        return false;
    }
    
    VkSamplerCreateInfo samplerInfo{};
    samplerInfo.sType = VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO;
    samplerInfo.magFilter = VK_FILTER_LINEAR;
    samplerInfo.minFilter = VK_FILTER_LINEAR;
    samplerInfo.addressModeU = VK_SAMPLER_ADDRESS_MODE_REPEAT;
    samplerInfo.addressModeV = VK_SAMPLER_ADDRESS_MODE_REPEAT;
    samplerInfo.addressModeW = VK_SAMPLER_ADDRESS_MODE_REPEAT;
    samplerInfo.anisotropyEnable = VK_TRUE;
    samplerInfo.maxAnisotropy = 16.0f;
    samplerInfo.borderColor = VK_BORDER_COLOR_INT_OPAQUE_BLACK;
    samplerInfo.unnormalizedCoordinates = VK_FALSE;
    samplerInfo.compareEnable = VK_FALSE;
    samplerInfo.compareOp = VK_COMPARE_OP_ALWAYS;
    samplerInfo.mipmapMode = VK_SAMPLER_MIPMAP_MODE_LINEAR;
    samplerInfo.mipLodBias = 0.0f;
    samplerInfo.minLod = 0.0f;
    samplerInfo.maxLod = VK_LOD_CLAMP_NONE;
    
    VkResult result = vkCreateSampler(m_base->GetDevice(), &samplerInfo, nullptr, &m_defaultSampler);
    if (result != VK_SUCCESS) {
        LOG_ERROR("TerrainRenderer", "Failed to create default sampler: {}", static_cast<int>(result));
        return false;
    }
    
    LOG_DEBUG("TerrainRenderer", "Created default sampler");
    return true;
}

bool TerrainRenderer::CreatePlaceholderTextures() {
    // Skip procedural texture generation if coordinator is available
    // We'll create real textures when SetPlanetaryData is called
    if (m_textureCoordinator) {
        LOG_INFO("TerrainRenderer", "Deferring procedural texture creation until planetary data is available");
        // We still need to create basic placeholder textures for the descriptor set to be valid
        // But we won't trigger the full texture generation pipeline
    }
    
    // Fallback: create simple placeholder textures if no coordinator
    LOG_WARN("TerrainRenderer", "No texture coordinator available, creating simple placeholder textures");
    
    if (!m_resourceManager) {
        LOG_ERROR("TerrainRenderer", "Resource manager not available");
        return false;
    }
    
    // Get the texture manager from resource manager
    VulkanTextureManager* textureManager = static_cast<VulkanTextureManager*>(m_resourceManager->GetTextureManager());
    if (!textureManager) {
        LOG_ERROR("TerrainRenderer", "Texture manager not available");
        return false;
    }
    
    // Create placeholder heightmap texture (R16 format)
    {
        TextureConfig heightmapConfig{};
        heightmapConfig.format = VK_FORMAT_R16_UNORM;
        heightmapConfig.usage = VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT;
        
        uint32_t textureRes = PlanetGen::Core::Parameters::ParameterSystemAdapter::Get<uint32_t>(
            PlanetGen::Core::Parameters::PlanetParams::TEXTURE_RESOLUTION);
        VkExtent3D extent{textureRes, textureRes, 1};
        
        // Create placeholder heightmap data (mid-gray)
        std::vector<uint16_t> heightmapData(textureRes * textureRes, 32768); // Half of uint16 max
        
        if (textureManager->CreateTexture(heightmapData.data(), heightmapData.size() * sizeof(uint16_t), 
                                         extent, heightmapConfig, "placeholder_heightmap")) {
            const Texture* texture = textureManager->GetTexture("placeholder_heightmap");
            if (texture) {
                m_heightmapLowView = texture->view;
                m_heightmapMidView = texture->view;
                m_heightmapHighView = texture->view;
                m_heightmapMicroView = texture->view;
            }
        }
    }
    
    // Create placeholder albedo texture (RGBA8 SRGB)
    {
        TextureConfig albedoConfig{};
        albedoConfig.format = VK_FORMAT_R8G8B8A8_SRGB;
        albedoConfig.usage = VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT;
        
        uint32_t textureRes = PlanetGen::Core::Parameters::ParameterSystemAdapter::Get<uint32_t>(
            PlanetGen::Core::Parameters::PlanetParams::TEXTURE_RESOLUTION);
        VkExtent3D extent{textureRes, textureRes, 1};
        
        // Create placeholder albedo data (neutral gray)
        std::vector<uint8_t> albedoData(textureRes * textureRes * 4, 128);
        
        if (textureManager->CreateTexture(albedoData.data(), albedoData.size(), 
                                         extent, albedoConfig, "placeholder_albedo")) {
            const Texture* texture = textureManager->GetTexture("placeholder_albedo");
            if (texture) {
                m_albedoTextureView = texture->view;
            }
        }
    }
    
    // Create placeholder normal texture (RGBA8)
    {
        TextureConfig normalConfig{};
        normalConfig.format = VK_FORMAT_R8G8B8A8_UNORM;
        normalConfig.usage = VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT;
        
        uint32_t textureRes = PlanetGen::Core::Parameters::ParameterSystemAdapter::Get<uint32_t>(
            PlanetGen::Core::Parameters::PlanetParams::TEXTURE_RESOLUTION);
        VkExtent3D extent{textureRes, textureRes, 1};
        
        // Create placeholder normal data (pointing up: 0.5, 0.5, 1.0, 1.0 -> 128, 128, 255, 255)
        std::vector<uint8_t> normalData(textureRes * textureRes * 4);
        for (size_t i = 0; i < textureRes * textureRes; ++i) {
            normalData[i * 4 + 0] = 128;  // X (0.5)
            normalData[i * 4 + 1] = 128;  // Y (0.5)
            normalData[i * 4 + 2] = 255;  // Z (1.0)
            normalData[i * 4 + 3] = 255;  // W (1.0)
        }
        
        if (textureManager->CreateTexture(normalData.data(), normalData.size(), 
                                         extent, normalConfig, "placeholder_normal")) {
            const Texture* texture = textureManager->GetTexture("placeholder_normal");
            if (texture) {
                m_normalTextureView = texture->view;
                m_detailNormalTextureView = texture->view;
            }
        }
    }
    
    // Create placeholder roughness texture (RGBA8)
    {
        TextureConfig roughnessConfig{};
        roughnessConfig.format = VK_FORMAT_R8G8B8A8_UNORM;
        roughnessConfig.usage = VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT;
        
        uint32_t textureRes = PlanetGen::Core::Parameters::ParameterSystemAdapter::Get<uint32_t>(
            PlanetGen::Core::Parameters::PlanetParams::TEXTURE_RESOLUTION);
        VkExtent3D extent{textureRes, textureRes, 1};
        
        // Create placeholder roughness data (medium roughness)
        std::vector<uint8_t> roughnessData(textureRes * textureRes * 4, 128);
        
        if (textureManager->CreateTexture(roughnessData.data(), roughnessData.size(), 
                                         extent, roughnessConfig, "placeholder_roughness")) {
            const Texture* texture = textureManager->GetTexture("placeholder_roughness");
            if (texture) {
                m_roughnessTextureView = texture->view;
                m_detailRoughnessTextureView = texture->view;
            }
        }
    }
    
    // Create placeholder AO texture (RGBA8)
    {
        TextureConfig aoConfig{};
        aoConfig.format = VK_FORMAT_R8G8B8A8_UNORM;
        aoConfig.usage = VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT;
        
        uint32_t textureRes = PlanetGen::Core::Parameters::ParameterSystemAdapter::Get<uint32_t>(
            PlanetGen::Core::Parameters::PlanetParams::TEXTURE_RESOLUTION);
        VkExtent3D extent{textureRes, textureRes, 1};
        
        // Create placeholder AO data (no occlusion - white)
        std::vector<uint8_t> aoData(textureRes * textureRes * 4, 255);
        
        if (textureManager->CreateTexture(aoData.data(), aoData.size(), 
                                         extent, aoConfig, "placeholder_ao")) {
            const Texture* texture = textureManager->GetTexture("placeholder_ao");
            if (texture) {
                m_aoTextureView = texture->view;
            }
        }
    }
    
    // Create placeholder noise texture (RGBA8)
    {
        TextureConfig noiseConfig{};
        noiseConfig.format = VK_FORMAT_R8G8B8A8_UNORM;
        noiseConfig.usage = VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT;
        
        VkExtent3D extent{256, 256, 1};
        
        // Create simple noise data
        std::vector<uint8_t> noiseData(256 * 256 * 4);
        for (size_t i = 0; i < 256 * 256; ++i) {
            // Simple pseudo-random noise
            uint8_t val = static_cast<uint8_t>((i * 73 + i * i * 17) % 256);
            noiseData[i * 4 + 0] = val;
            noiseData[i * 4 + 1] = val;
            noiseData[i * 4 + 2] = val;
            noiseData[i * 4 + 3] = 255;
        }
        
        if (textureManager->CreateTexture(noiseData.data(), noiseData.size(), 
                                         extent, noiseConfig, "placeholder_noise")) {
            const Texture* texture = textureManager->GetTexture("placeholder_noise");
            if (texture) {
                m_noiseTextureView = texture->view;
            }
        }
    }
    
    m_placeholderTexturesCreated = true;
    LOG_INFO("TerrainRenderer", "Created placeholder textures");
    return true;
}

// =============================================================================
// DEBUG VISUALIZATION IMPLEMENTATION
// =============================================================================

void TerrainRenderer::AnalyzeWaterTerrainAreas(const RenderableMesh& renderableMesh) {
    if (!renderableMesh.mesh || !renderableMesh.mesh->vertexBuffer) {
        LOG_WARN("TerrainRenderer", "Cannot analyze water/terrain areas - invalid mesh data");
        return;
    }
    
    auto startTime = std::chrono::high_resolution_clock::now();
    
    // Initialize debug info
    m_waterTerrainDebugInfo = WaterTerrainDebugInfo{};
    m_waterTerrainDebugInfo.totalVertices = renderableMesh.mesh->vertexCount;
    
    // Try to access vertex data for analysis
    if (renderableMesh.mesh->vertexBuffer->IsMappable()) {
        LOG_DEBUG("TerrainRenderer", "Analyzing water vs terrain areas for {} vertices", renderableMesh.mesh->vertexCount);
        
        void* vertexData = nullptr;
        VkResult result = renderableMesh.mesh->vertexBuffer->Map(&vertexData);
        if (result == VK_SUCCESS && vertexData) {
            // Try to use CPU-side vertex data first if available
            if (!renderableMesh.mesh->vertices.empty()) {
                const auto& vertices = renderableMesh.mesh->vertices;
                
                float minHeight = std::numeric_limits<float>::max();
                float maxHeight = std::numeric_limits<float>::lowest();
                float totalWaterDepth = 0.0f;
                uint32_t waterVertexCount = 0;
                uint32_t boundaryVertexCount = 0;
                
                // Analyze each vertex
                for (uint32_t i = 0; i < static_cast<uint32_t>(vertices.size()); ++i) {
                    const auto& vertex = vertices[i];
                    float height = vertex.position.y; // Assuming Y-up coordinate system
                    
                    minHeight = std::min(minHeight, height);
                    maxHeight = std::max(maxHeight, height);
                    
                    // Check if vertex is underwater
                    if (IsVertexUnderwater(vertex.position)) {
                        waterVertexCount++;
                        float depth = m_waterLevel - height;
                        totalWaterDepth += depth;
                        m_waterTerrainDebugInfo.maxWaterDepth = std::max(m_waterTerrainDebugInfo.maxWaterDepth, depth);
                    }
                    
                    // Check if vertex is near water boundary
                    float distanceToWater = std::abs(height - m_waterLevel);
                    if (distanceToWater < 2.0f) { // Within 2 units of water level
                        boundaryVertexCount++;
                    }
                }
                
                // Calculate statistics
                m_waterTerrainDebugInfo.waterVertices = waterVertexCount;
                m_waterTerrainDebugInfo.terrainVertices = static_cast<uint32_t>(vertices.size()) - waterVertexCount;
                m_waterTerrainDebugInfo.waterCoverage = (float)waterVertexCount / vertices.size() * 100.0f;
                m_waterTerrainDebugInfo.avgWaterDepth = waterVertexCount > 0 ? totalWaterDepth / waterVertexCount : 0.0f;
                m_waterTerrainDebugInfo.waterBoundaryVertices = boundaryVertexCount;
                m_waterTerrainDebugInfo.waterBounds = vec2(minHeight, maxHeight);
                m_waterTerrainDebugInfo.waterMeshValid = waterVertexCount > 0;
                
                LOG_DEBUG("TerrainRenderer", "Water/Terrain analysis complete: {:.1f}% water coverage, {} water vertices, {} boundary vertices",
                         m_waterTerrainDebugInfo.waterCoverage, waterVertexCount, boundaryVertexCount);
            } else {
                // Fallback to mapped GPU buffer data
                const auto* gpuVertices = reinterpret_cast<const VertexAttributes*>(vertexData);
                
                float minHeight = std::numeric_limits<float>::max();
                float maxHeight = std::numeric_limits<float>::lowest();
                float totalWaterDepth = 0.0f;
                uint32_t waterVertexCount = 0;
                uint32_t boundaryVertexCount = 0;
                
                // Analyze each vertex
                for (uint32_t i = 0; i < renderableMesh.mesh->vertexCount; ++i) {
                    const auto& vertex = gpuVertices[i];
                    float height = vertex.position.y; // Assuming Y-up coordinate system
                    
                    minHeight = std::min(minHeight, height);
                    maxHeight = std::max(maxHeight, height);
                    
                    // Check if vertex is underwater
                    if (IsVertexUnderwater(vertex.position)) {
                        waterVertexCount++;
                        float depth = m_waterLevel - height;
                        totalWaterDepth += depth;
                        m_waterTerrainDebugInfo.maxWaterDepth = std::max(m_waterTerrainDebugInfo.maxWaterDepth, depth);
                    }
                    
                    // Check if vertex is near water boundary
                    float distanceToWater = std::abs(height - m_waterLevel);
                    if (distanceToWater < 2.0f) { // Within 2 units of water level
                        boundaryVertexCount++;
                    }
                }
                
                // Calculate statistics
                m_waterTerrainDebugInfo.waterVertices = waterVertexCount;
                m_waterTerrainDebugInfo.terrainVertices = renderableMesh.mesh->vertexCount - waterVertexCount;
                m_waterTerrainDebugInfo.waterCoverage = (float)waterVertexCount / renderableMesh.mesh->vertexCount * 100.0f;
                m_waterTerrainDebugInfo.avgWaterDepth = waterVertexCount > 0 ? totalWaterDepth / waterVertexCount : 0.0f;
                m_waterTerrainDebugInfo.waterBoundaryVertices = boundaryVertexCount;
                m_waterTerrainDebugInfo.waterBounds = vec2(minHeight, maxHeight);
                m_waterTerrainDebugInfo.waterMeshValid = waterVertexCount > 0;
                
                LOG_DEBUG("TerrainRenderer", "Water/Terrain analysis complete: {:.1f}% water coverage, {} water vertices, {} boundary vertices",
                         m_waterTerrainDebugInfo.waterCoverage, waterVertexCount, boundaryVertexCount);
            }
            
            renderableMesh.mesh->vertexBuffer->Unmap();
        }
    } else {
        LOG_DEBUG("TerrainRenderer", "Cannot analyze water/terrain areas - vertex buffer not mappable");
        // Set basic info even if we can't analyze
        m_waterTerrainDebugInfo.waterMeshValid = false;
    }
    
    auto endTime = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime);
    m_waterTerrainDebugInfo.lastAnalysisTime = duration.count() / 1000.0f; // Convert to milliseconds
}

void TerrainRenderer::UpdateWaterTerrainMetrics(const RenderableMesh& mesh) {
    // Update debug info if debug mode is active
    if (m_debugMode == DebugMode::ShowWaterVsTerrain ||
        m_debugMode == DebugMode::ShowWaterBoundaries ||
        m_debugMode == DebugMode::ShowWaterDepth) {
        AnalyzeWaterTerrainAreas(mesh);
    }
}

bool TerrainRenderer::IsVertexUnderwater(const vec3& position) const {
    // Simple check - in a real implementation, this might consider:
    // - Wave height at this position
    // - Tidal variations
    // - Local water level variations
    return position.y < m_waterLevel;
}

} // namespace PlanetGen::Rendering
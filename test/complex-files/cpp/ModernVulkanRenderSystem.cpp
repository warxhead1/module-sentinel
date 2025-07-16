module;

#include <vulkan/vulkan.h>
#include <memory>
#include <vector>
#include <string>
#include <cassert>
#include <stdexcept>
#include <iostream>

module ModernVulkanRenderSystem;

import VulkanTypes;
import RenderingTypes;
import FrameGraph;
import RenderSubmission;
import GenerationTypes;
import GLMModule;
import WaterTypes;
import PerformanceMonitor;
import VulkanRenderPipelineManager;
import VulkanBase;
import VulkanSwapChain;
import VulkanFrameOrchestrator;
import IResourceManager;
import VulkanResourceManager;
import VulkanCommandBufferManager;
import BufferManagement;
import VulkanTextureManager;

namespace PlanetGen::Rendering {

ModernVulkanRenderSystem::ModernVulkanRenderSystem(VulkanBase* base)
    : m_base(base) {
    if (!m_base) {
        throw std::invalid_argument("VulkanBase cannot be null");
    }
}


ModernVulkanRenderSystem::~ModernVulkanRenderSystem() {
    if (m_initialized && !m_isShutdown) {
        Shutdown();
    }
}

bool ModernVulkanRenderSystem::Initialize(const ModernRenderSystemConfig& config) {
    if (m_initialized) {
        return false;
    }

    m_config = config;

    // Initialize components in dependency order
    if (!InitializeSwapChain()) {
        std::cerr << "Failed to initialize swapchain" << std::endl;
        return false;
    }

    if (!InitializeResourceManagement()) {
        std::cerr << "Failed to initialize resource management" << std::endl;
        return false;
    }

    if (!InitializeFrameOrchestration()) {
        std::cerr << "Failed to initialize frame orchestration" << std::endl;
        return false;
    }

    if (!InitializeFrameGraph()) {
        std::cerr << "Failed to initialize frame graph" << std::endl;
        return false;
    }

    if (!InitializeRenderPipelineManager()) {
        std::cerr << "Failed to initialize render pipeline manager" << std::endl;
        return false;
    }

    // Setup standard render passes
    SetupStandardRenderPasses();

    // Initialize current frame state
    m_currentSubmission = std::make_unique<RenderSubmission>();
    
    // Check dynamic rendering support
    m_dynamicRenderingSupported = m_config.enableDynamicRendering;

    m_initialized = true;
    return true;
}

void ModernVulkanRenderSystem::Shutdown() {
    if (!m_initialized || m_isShutdown) {
        return;
    }

    // Wait for GPU to finish
    vkDeviceWaitIdle(m_base->GetDevice());

    // Shutdown components in reverse order
    m_currentSubmission.reset();
    m_renderPipelineManager.reset();
    m_frameGraph.reset();
    m_textureManager.reset();
    m_bufferManagement.reset();
    m_commandBufferManager.reset();
    m_resourceManager.reset();
    m_frameOrchestrator.reset();

    // Destroy swapchain
    if (m_swapChainHandle != 0) {
        m_base->GetSwapChainManager()->DestroySwapChain(m_swapChainHandle);
        m_swapChainHandle = 0;
    }

    m_initialized = false;
    m_isShutdown = true;
}

bool ModernVulkanRenderSystem::BeginFrame() {
    if (!m_initialized) {
        return false;
    }

    // Validate render state
    if (!ValidateRenderState()) {
        return false;
    }

    // Begin frame orchestration
    if (!m_frameOrchestrator->BeginFrame()) {
        return false;
    }

    // Update render context
    UpdateRenderContext();

    // Clear previous frame's submission
    m_currentSubmission->Clear();

    return true;
}

bool ModernVulkanRenderSystem::EndFrame() {
    if (!m_initialized) {
        return false;
    }

    // Execute current submission through FrameGraph
    if (!ExecuteCurrentSubmission()) {
        return false;
    }

    // End frame orchestration
    if (!m_frameOrchestrator->EndFrame()) {
        return false;
    }

    // Update performance monitoring
    if (m_performanceMonitor) {
        m_performanceMonitor->EndFrame();
    }

    return true;
}

void ModernVulkanRenderSystem::UpdateCamera(const mat4& view, const mat4& projection, const vec3& position) {
    m_renderContext.view = view;
    m_renderContext.projection = projection;
    m_renderContext.cameraPosition = position;
    m_renderContext.viewProjection = projection * view;
}

void ModernVulkanRenderSystem::SetRenderScale(float scale) {
    m_renderContext.renderScale = scale;
}

bool ModernVulkanRenderSystem::RecreateSwapChain(uint32_t width, uint32_t height) {
    if (!m_initialized) {
        return false;
    }

    // Wait for GPU to finish
    vkDeviceWaitIdle(m_base->GetDevice());

    // Recreate swapchain
    VulkanSwapChainCreationInfo info{};
    info.width = width;
    info.height = height;
    info.surface = m_config.surface;
    info.vsync = true;
    info.colorSpace = VK_COLOR_SPACE_SRGB_NONLINEAR_KHR;
    
    if (m_swapChainHandle != 0) {
        m_base->GetSwapChainManager()->DestroySwapChain(m_swapChainHandle);
    }

    m_swapChainHandle = m_base->GetSwapChainManager()->CreateSwapChain(info);
    if (m_swapChainHandle == 0) {
        return false;
    }

    // Update config
    m_config.defaultWidth = width;
    m_config.defaultHeight = height;

    // Recreate frame graph with new dimensions
    if (!InitializeFrameGraph()) {
        return false;
    }

    return true;
}

void ModernVulkanRenderSystem::SubmitRenderWork(const RenderSubmission& submission) {
    if (!m_initialized || !m_currentSubmission) {
        return;
    }

    // Merge submission into current frame's submission
    m_currentSubmission->Merge(submission);
}

void ModernVulkanRenderSystem::RenderMesh(const MeshRenderParams& params) {
    if (!m_initialized) {
        return;
    }

    // Create render submission for mesh
    RenderSubmission submission;
    submission.AddRenderItem({
        .mesh = params.mesh,
        .material = params.material,
        .renderPass = params.renderPass,
        .priority = params.priority,
        .transform = mat4(1.0f)
    });

    SubmitRenderWork(submission);
}

void ModernVulkanRenderSystem::RenderTerrain(const TerrainRenderParams& params) {
    if (!m_initialized) {
        return;
    }

    // Create render submission for terrain
    RenderSubmission submission;
    submission.AddRenderItem({
        .mesh = params.terrainMesh,
        .renderPass = params.renderPass,
        .priority = params.priority,
        .transform = mat4(1.0f)
    });

    // Add terrain-specific uniforms
    submission.AddUniformBuffer("TerrainUniforms", &params.uniforms, sizeof(TerrainUniforms));
    submission.AddUniformBuffer("PlanetaryData", &params.planetaryData, sizeof(PlanetaryData));

    SubmitRenderWork(submission);
}

void ModernVulkanRenderSystem::RenderWater(const WaterRenderParams& params) {
    if (!m_initialized) {
        return;
    }

    // Create render submission for water
    RenderSubmission submission;
    submission.AddRenderItem({
        .mesh = params.waterMesh,
        .renderPass = params.renderPass,
        .priority = params.priority,
        .transform = mat4(1.0f)
    });

    // Add water-specific uniforms
    submission.AddUniformBuffer("WaterFrameUniforms", &params.frameUniforms, sizeof(Water::WaterFrameUniforms));
    submission.AddUniformBuffer("WaterBodyUniforms", &params.bodyUniforms, sizeof(Water::WaterBodyUniforms));
    submission.AddUniformBuffer("WaterLightingUniforms", &params.lightingUniforms, sizeof(Water::WaterLightingUniforms));

    SubmitRenderWork(submission);
}

void ModernVulkanRenderSystem::RenderPlanet(const PlanetRenderParams& params) {
    if (!m_initialized) {
        return;
    }

    // Render terrain
    RenderTerrain(params.terrain);

    // Render water if present
    if (params.water.has_value()) {
        RenderWater(params.water.value());
    }
}

bool ModernVulkanRenderSystem::UploadMeshBuffers(MeshData& mesh) {
    if (!m_initialized || !m_bufferManagement) {
        return false;
    }

    // Delegate to buffer management system
    return m_bufferManagement->UploadMeshData(mesh);
}

bool ModernVulkanRenderSystem::UploadTerrainMeshBuffers(MeshData& mesh,
                                                       const std::vector<TerrainVertexAttributes>& terrainVertices,
                                                       const std::vector<uint32_t>& indices) {
    if (!m_initialized || !m_bufferManagement) {
        return false;
    }

    // Update mesh with terrain-specific data
    mesh.terrainVertices = terrainVertices;
    mesh.indices = indices;
    mesh.isTerrainMesh = true;
    
    // Delegate to buffer management system
    return m_bufferManagement->UploadMeshData(mesh);
}

void ModernVulkanRenderSystem::SetWireframeMode(bool enable) {
    m_wireframeMode = enable;
    // Update pipeline state if needed
    if (m_renderPipelineManager) {
        m_renderPipelineManager->SetWireframeMode(enable);
    }
}

void ModernVulkanRenderSystem::EnableProfiling(bool enable) {
    m_config.enableProfiling = enable;
    if (m_performanceMonitor) {
        m_performanceMonitor->SetEnabled(enable);
    }
}

void ModernVulkanRenderSystem::SetPerformanceMonitor(std::shared_ptr<PlanetGen::Core::Performance::PerformanceMonitor> monitor) {
    m_performanceMonitor = monitor;
}

void ModernVulkanRenderSystem::PrintFrameStats() const {
    if (m_performanceMonitor) {
        m_performanceMonitor->PrintStats();
    }
}

VkCommandBuffer ModernVulkanRenderSystem::GetCurrentFrameCommandBuffer() const {
    if (m_frameOrchestrator) {
        return m_frameOrchestrator->GetCurrentCommandBuffer();
    }
    return VK_NULL_HANDLE;
}

ModernVulkanRenderSystem::SwapchainImageInfo ModernVulkanRenderSystem::GetCurrentSwapchainImage() const {
    SwapchainImageInfo info{};
    
    if (m_swapChainHandle != 0) {
        auto swapChainManager = m_base->GetSwapChainManager();
        info.image = swapChainManager->GetCurrentImage(m_swapChainHandle);
        info.imageIndex = swapChainManager->GetCurrentImageIndex(m_swapChainHandle);
        info.extent = swapChainManager->GetSwapChainExtent(m_swapChainHandle);
        info.format = swapChainManager->GetSwapChainFormat(m_swapChainHandle);
    }
    
    return info;
}

// Private implementation methods

bool ModernVulkanRenderSystem::InitializeSwapChain() {
    VulkanSwapChainCreationInfo info{};
    info.width = m_config.defaultWidth;
    info.height = m_config.defaultHeight;
    info.surface = m_config.surface;
    info.vsync = true;
    info.colorSpace = VK_COLOR_SPACE_SRGB_NONLINEAR_KHR;

    m_swapChainHandle = m_base->GetSwapChainManager()->CreateSwapChain(info);
    return m_swapChainHandle != 0;
}

bool ModernVulkanRenderSystem::InitializeFrameOrchestration() {
    VulkanFrameOrchestrationConfig config{};
    config.maxFramesInFlight = m_config.maxFramesInFlight;
    config.enableProfiling = m_config.enableProfiling;
    config.swapChainHandle = m_swapChainHandle;

    m_frameOrchestrator = std::make_unique<VulkanFrameOrchestrator>(m_base, config);
    return m_frameOrchestrator->Initialize();
}

bool ModernVulkanRenderSystem::InitializeResourceManagement() {
    // Initialize resource manager
    m_resourceManager = std::make_unique<VulkanResourceManager>(m_base);
    if (!m_resourceManager->Initialize()) {
        return false;
    }

    // Initialize command buffer manager
    m_commandBufferManager = std::make_unique<VulkanCommandBufferManager>(m_base);
    if (!m_commandBufferManager->Initialize()) {
        return false;
    }

    // Initialize buffer management
    m_bufferManagement = std::make_unique<BufferManagementSystem>(m_base, m_resourceManager.get());
    if (!m_bufferManagement->Initialize()) {
        return false;
    }

    // Initialize texture manager
    m_textureManager = std::make_unique<VulkanTextureManager>(m_base, m_resourceManager.get());
    if (!m_textureManager->Initialize()) {
        return false;
    }

    return true;
}

bool ModernVulkanRenderSystem::InitializeFrameGraph() {
    FrameGraphConfig config{};
    config.swapChainHandle = m_swapChainHandle;
    config.maxFramesInFlight = m_config.maxFramesInFlight;
    config.enableDynamicRendering = m_config.enableDynamicRendering;

    m_frameGraph = std::make_unique<FrameGraph>(m_base, config);
    return m_frameGraph->Initialize();
}

bool ModernVulkanRenderSystem::InitializeRenderPipelineManager() {
    Pipeline::RenderPipelineConfig config{};
    config.enableDynamicRendering = m_config.enableDynamicRendering;
    config.enableDebugNames = m_config.enableDebugNames;

    m_renderPipelineManager = std::make_unique<Pipeline::VulkanRenderPipelineManager>(m_base, config);
    return m_renderPipelineManager->Initialize();
}

void ModernVulkanRenderSystem::SetupStandardRenderPasses() {
    AddTerrainRenderPass();
    AddWaterRenderPass();
    AddMainRenderPass();
    AddPresentRenderPass();
}

void ModernVulkanRenderSystem::AddTerrainRenderPass() {
    FrameGraphRenderPassInfo passInfo{};
    passInfo.name = "terrain";
    passInfo.priority = 100;
    passInfo.clearColor = {0.0f, 0.0f, 0.0f, 1.0f};
    passInfo.clearDepth = 1.0f;
    passInfo.loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR;
    passInfo.storeOp = VK_ATTACHMENT_STORE_OP_STORE;

    m_frameGraph->AddRenderPass(passInfo);
}

void ModernVulkanRenderSystem::AddWaterRenderPass() {
    FrameGraphRenderPassInfo passInfo{};
    passInfo.name = "water";
    passInfo.priority = 200;
    passInfo.clearColor = {0.0f, 0.0f, 0.0f, 0.0f};
    passInfo.clearDepth = 1.0f;
    passInfo.loadOp = VK_ATTACHMENT_LOAD_OP_LOAD;
    passInfo.storeOp = VK_ATTACHMENT_STORE_OP_STORE;

    m_frameGraph->AddRenderPass(passInfo);
}

void ModernVulkanRenderSystem::AddMainRenderPass() {
    FrameGraphRenderPassInfo passInfo{};
    passInfo.name = "main";
    passInfo.priority = 300;
    passInfo.clearColor = {0.0f, 0.0f, 0.0f, 1.0f};
    passInfo.clearDepth = 1.0f;
    passInfo.loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR;
    passInfo.storeOp = VK_ATTACHMENT_STORE_OP_STORE;

    m_frameGraph->AddRenderPass(passInfo);
}

void ModernVulkanRenderSystem::AddPresentRenderPass() {
    FrameGraphRenderPassInfo passInfo{};
    passInfo.name = "present";
    passInfo.priority = 1000;
    passInfo.clearColor = {0.0f, 0.0f, 0.0f, 1.0f};
    passInfo.clearDepth = 1.0f;
    passInfo.loadOp = VK_ATTACHMENT_LOAD_OP_LOAD;
    passInfo.storeOp = VK_ATTACHMENT_STORE_OP_STORE;

    m_frameGraph->AddRenderPass(passInfo);
}

bool ModernVulkanRenderSystem::ExecuteCurrentSubmission() {
    if (!m_currentSubmission || !m_frameGraph) {
        return false;
    }

    // Gather resources for submission
    auto buffers = GatherBuffersForSubmission(*m_currentSubmission);
    auto textures = GatherTexturesForSubmission(*m_currentSubmission);

    // Execute through frame graph
    FrameExecutionInfo executionInfo{};
    executionInfo.submission = m_currentSubmission.get();
    executionInfo.renderContext = &m_renderContext;
    executionInfo.buffers = buffers;
    executionInfo.textures = textures;

    return m_frameGraph->ExecuteFrame(executionInfo);
}

bool ModernVulkanRenderSystem::ValidateRenderState() const {
    return m_initialized && 
           m_base && 
           m_swapChainHandle != 0 && 
           m_frameOrchestrator && 
           m_frameGraph && 
           m_renderPipelineManager;
}

void ModernVulkanRenderSystem::UpdateRenderContext() {
    m_renderContext.frameIndex = m_frameOrchestrator->GetCurrentFrameIndex();
    m_renderContext.deltaTime = m_frameOrchestrator->GetDeltaTime();
    m_renderContext.totalTime = m_frameOrchestrator->GetTotalTime();
    
    // Update render area from swapchain
    m_renderContext.renderArea = CreateRenderAreaFromSwapchain();
}

Pipeline::RenderArea ModernVulkanRenderSystem::CreateRenderAreaFromSwapchain() const {
    Pipeline::RenderArea area{};
    
    if (m_swapChainHandle != 0) {
        auto extent = m_base->GetSwapChainManager()->GetSwapChainExtent(m_swapChainHandle);
        area.x = 0;
        area.y = 0;
        area.width = extent.width;
        area.height = extent.height;
    }
    
    return area;
}

std::map<std::string, std::shared_ptr<BufferResource>> ModernVulkanRenderSystem::GatherBuffersForSubmission(const RenderSubmission& submission) const {
    std::map<std::string, std::shared_ptr<BufferResource>> buffers;
    
    // Gather buffers from submission
    for (const auto& [name, buffer] : submission.GetUniformBuffers()) {
        if (m_bufferManagement) {
            auto bufferResource = m_bufferManagement->GetBuffer(name);
            if (bufferResource) {
                buffers[name] = bufferResource;
            }
        }
    }
    
    return buffers;
}

std::map<std::string, std::shared_ptr<TextureResource>> ModernVulkanRenderSystem::GatherTexturesForSubmission(const RenderSubmission& submission) const {
    std::map<std::string, std::shared_ptr<TextureResource>> textures;
    
    // Gather textures from submission
    for (const auto& [name, texture] : submission.GetTextures()) {
        if (m_textureManager) {
            auto textureResource = m_textureManager->GetTexture(name);
            if (textureResource) {
                textures[name] = textureResource;
            }
        }
    }
    
    return textures;
}


} // namespace PlanetGen::Rendering
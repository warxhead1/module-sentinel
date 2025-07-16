module;

#include <vulkan/vulkan.h>
#include <memory>
#include <Core/Logging/LoggerMacros.h>

export module TerrainRenderer;

import VulkanBase;
import VulkanTypes;
import RenderingTypes;
import VulkanPipelineManager;
import DescriptorManager;
import IResourceManager;
import GLMModule;
import GenerationTypes;
import TerrainDescriptorService;
import VulkanTerrainTextureCoordinator;
import PipelineFactory;
import Core.Logging.Logger;
import VulkanPipelineBase;
import BufferManagement;
import BufferCore;
import DescriptorServiceTypes;

export namespace PlanetGen::Rendering {

/**
 * Specialized renderer for terrain meshes with planetary data integration
 * Single Responsibility: Renders terrain with height-based texturing and LOD
 */
class TerrainRenderer {
public:
    TerrainRenderer(
        VulkanBase* base,
        VulkanPipelineManager* pipelineManager,
        DescriptorManager* descriptorManager,
        IResourceManager* resourceManager,
        VulkanTerrainTextureCoordinator* textureCoordinator
    );
    
    ~TerrainRenderer();
    
    bool Initialize(const VkExtent2D& swapChainExtent);
    void Shutdown();
    bool IsInitialized() const { return m_initialized; }
    
    // Render terrain mesh with uniforms
    bool RenderTerrainMesh(
        VkCommandBuffer cmdBuffer,
        const RenderableMesh& mesh,
        const TerrainUniforms& uniforms,
        const RenderContext& context
    );
    
    // Set planetary data for texture generation
    bool SetPlanetaryData(const PlanetaryData& planetaryData);
    
    // Update per-frame uniforms
    void UpdateFrameUniforms(const RenderContext& context);
    
    // LOD control
    void SetLODDistance(float distance) { m_lodDistance = distance; }
    float GetLODDistance() const { return m_lodDistance; }
    
    // Debug visualization modes
    enum class DebugMode {
        None,
        ShowNormals,
        ShowTangents,
        ShowHeightmap,
        ShowBiomes,
        ShowWaterVsTerrain,     // New: Highlight water vs terrain areas
        ShowWaterBoundaries,    // New: Show water boundary detection
        ShowWaterDepth          // New: Visualize water depth
    };
    void SetDebugMode(DebugMode mode) { m_debugMode = mode; }
    
    // Wireframe mode
    void SetWireframeMode(bool enable) { m_wireframeMode = enable; }
    
    // Debug visualization controls
    DebugMode GetDebugMode() const { return m_debugMode; }
    bool IsWireframeEnabled() const { return m_wireframeMode; }
    
    // Water vs terrain debug info
    struct WaterTerrainDebugInfo {
        uint32_t totalVertices = 0;
        uint32_t waterVertices = 0;
        uint32_t terrainVertices = 0;
        float waterCoverage = 0.0f;        // Percentage of water coverage
        float avgWaterDepth = 0.0f;        // Average water depth
        float maxWaterDepth = 0.0f;        // Maximum water depth
        vec2 waterBounds = vec2(0.0f);     // Water area bounds
        uint32_t waterBoundaryVertices = 0; // Vertices at water boundaries
        bool waterMeshValid = false;        // Whether water mesh is valid
        float lastAnalysisTime = 0.0f;     // Time of last analysis in ms
    };
    
    // Get debug information
    WaterTerrainDebugInfo GetWaterTerrainDebugInfo() const { return m_waterTerrainDebugInfo; }
    
    // Set water level for debug visualization
    void SetWaterLevel(float waterLevel) { m_waterLevel = waterLevel; }
    float GetWaterLevel() const { return m_waterLevel; }
    
private:
    // Core dependencies (non-owning)
    VulkanBase* m_base;
    VulkanPipelineManager* m_pipelineManager;
    DescriptorManager* m_descriptorManager;
    IResourceManager* m_resourceManager;
    VulkanTerrainTextureCoordinator* m_textureCoordinator;
    
    // Descriptor service for terrain-specific bindings
    std::unique_ptr<Services::TerrainDescriptorService> m_descriptorService;
    
    // Pipeline builder integration for advanced pipeline management
    std::unique_ptr<Pipeline::PipelineFactory> m_pipelineIntegration;
    
    // Pipeline handles
    uint32_t m_terrainPipelineHandle = 0;
    uint32_t m_terrainWireframePipelineHandle = 0;
    uint32_t m_debugPipelineHandle = 0;
    
    // Descriptor set handles
    uint32_t m_frameDescriptorSet = 0;
    uint32_t m_terrainDescriptorSet = 0;
    uint32_t m_textureDescriptorSet = 0;
    
    // Uniform buffer resources
    BufferResourcePtr m_frameUniformBuffer;
    BufferResourcePtr m_terrainUniformBuffer;
    BufferResourcePtr m_terrainBlockBuffer; // For binding 14 (TerrainBlock)
    
    // Texture handles for terrain layers
    struct TerrainTextures {
        uint32_t heightmapTexture = 0;
        uint32_t normalTexture = 0;
        uint32_t biomeTexture = 0;
        uint32_t detailTextures[8] = {0}; // Rock, grass, sand, snow, etc.
    };
    TerrainTextures m_textures;
    
    // State
    bool m_initialized = false;
    bool m_wireframeMode = false;
    float m_lodDistance = 100.0f;
    DebugMode m_debugMode = DebugMode::None;
    VkExtent2D m_extent{};
    PlanetaryData m_planetaryData{};
    
    // Pipeline descriptor result from shader reflection
    Services::PipelineDescriptorResult m_pipelineDescriptorResult;
    
    // Texture resources
    VkSampler m_defaultSampler = VK_NULL_HANDLE;
    bool m_placeholderTexturesCreated = false;
    
    // Placeholder texture image views
    VkImageView m_heightmapLowView = VK_NULL_HANDLE;
    VkImageView m_heightmapMidView = VK_NULL_HANDLE;
    VkImageView m_heightmapHighView = VK_NULL_HANDLE;
    VkImageView m_heightmapMicroView = VK_NULL_HANDLE;
    VkImageView m_albedoTextureView = VK_NULL_HANDLE;
    VkImageView m_normalTextureView = VK_NULL_HANDLE;
    VkImageView m_roughnessTextureView = VK_NULL_HANDLE;
    VkImageView m_aoTextureView = VK_NULL_HANDLE;
    VkImageView m_detailNormalTextureView = VK_NULL_HANDLE;
    VkImageView m_detailRoughnessTextureView = VK_NULL_HANDLE;
    VkImageView m_noiseTextureView = VK_NULL_HANDLE;
    
    // Flag to track if we have real planetary data
    bool m_hasRealPlanetaryData = false;
    
    // Debug visualization state
    WaterTerrainDebugInfo m_waterTerrainDebugInfo;
    float m_waterLevel = 0.0f;
    
    // Private methods
    bool CreatePipelines();
    bool CreateDescriptorSets();
    bool CreateUniformBuffers();
    bool GenerateTerrainTextures();
    void UpdateTerrainUniforms(const TerrainUniforms& uniforms);
    bool BindPipeline(VkCommandBuffer cmdBuffer);
    bool BindDescriptorSets(VkCommandBuffer cmdBuffer, VulkanPipelineBase* terrainPipeline);
    bool SetPushConstants(VkCommandBuffer cmdBuffer, const TerrainUniforms& uniforms, const RenderContext& context);
    bool UpdateDescriptorSetBindings();
    void SetupDebugVisualization(VkCommandBuffer cmdBuffer);
    bool CreateDefaultSampler();
    bool CreatePlaceholderTextures();
    
    // Debug visualization analysis
    void AnalyzeWaterTerrainAreas(const RenderableMesh& mesh);
    void UpdateWaterTerrainMetrics(const RenderableMesh& mesh);
    bool IsVertexUnderwater(const vec3& position) const;
};

} // namespace PlanetGen::Rendering
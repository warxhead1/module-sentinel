module;

#include <vulkan/vulkan.h>

#include <algorithm>
#include <chrono>
#include <mutex>
#include <cstring>

module VulkanPipelineManager;

import PipelineTypes;
import VulkanPipelineCreator;
import VulkanTypes;
import VulkanBase;
import BufferCore;
import DescriptorManager;
import VulkanCommandBufferManager;

namespace PlanetGen::Rendering::Pipeline {

// =============================================================================
// CONSTRUCTOR/DESTRUCTOR
// =============================================================================

VulkanPipelineManager::VulkanPipelineManager(Rendering::VulkanBase* vulkanBase)
    : m_vulkanBase(vulkanBase),
      m_creator(std::make_unique<VulkanPipelineCreator>(vulkanBase)) {
  if (!m_vulkanBase) {
    throw std::runtime_error(
        "VulkanPipelineManager: VulkanBase cannot be null");
  }
}

VulkanPipelineManager::~VulkanPipelineManager() { ClearCache(true); }

VulkanPipelineManager::VulkanPipelineManager(VulkanPipelineManager&& other) noexcept
    : m_vulkanBase(other.m_vulkanBase),
      m_creator(std::move(other.m_creator)),
      m_pipelineCache(std::move(other.m_pipelineCache)),
      m_cacheHits(other.m_cacheHits.load()),
      m_cacheMisses(other.m_cacheMisses.load()),
      m_currentFrame(other.m_currentFrame.load()),
      m_eventCallbacks(std::move(other.m_eventCallbacks)),
      m_autoOptimizationEnabled(other.m_autoOptimizationEnabled),
      m_optimizationFrameInterval(other.m_optimizationFrameInterval),
      m_lastOptimizationFrame(other.m_lastOptimizationFrame) {
    // Reset the moved-from object
    other.m_vulkanBase = nullptr;
}

VulkanPipelineManager& VulkanPipelineManager::operator=(VulkanPipelineManager&& other) noexcept {
    if (this != &other) {
        // Clean up current state
        ClearCache(false);
        
        // Move data
        m_vulkanBase = other.m_vulkanBase;
        m_creator = std::move(other.m_creator);
        m_pipelineCache = std::move(other.m_pipelineCache);
        m_cacheHits = other.m_cacheHits.load();
        m_cacheMisses = other.m_cacheMisses.load();
        m_currentFrame = other.m_currentFrame.load();
        m_eventCallbacks = std::move(other.m_eventCallbacks);
        m_autoOptimizationEnabled = other.m_autoOptimizationEnabled;
        m_optimizationFrameInterval = other.m_optimizationFrameInterval;
        m_lastOptimizationFrame = other.m_lastOptimizationFrame;
        
        // Reset the moved-from object
        other.m_vulkanBase = nullptr;
    }
    return *this;
}

// =============================================================================
// CORE PIPELINE MANAGEMENT
// =============================================================================

PipelineResult VulkanPipelineManager::GetOrCreatePipeline(
    const PipelineCreationParams& params) {
  auto key = GeneratePipelineKey(params);

  // Check cache first
  {
    std::lock_guard<std::mutex> lock(m_cacheMutex);

    if (auto it = m_pipelineCache.find(key); it != m_pipelineCache.end()) {
      // Update usage statistics
      it->second.lastUsedFrame = m_currentFrame;
      it->second.accessCount++;
      m_cacheHits++;

      return it->second.result;
    }
  }

  // Cache miss - create new pipeline
  m_cacheMisses++;
  return CreatePipeline(key, params, false);
}

PipelineResult VulkanPipelineManager::CreatePipeline(
    const PipelineKey& key, const PipelineCreationParams& params,
    bool replaceExisting) {
  std::lock_guard<std::mutex> lock(m_cacheMutex);

  // Check if pipeline already exists
  if (!replaceExisting && m_pipelineCache.find(key) != m_pipelineCache.end()) {
    return m_pipelineCache[key].result;
  }

  // Create new pipeline
  auto result = m_creator->CreatePipeline(params);

  if (result.success) {
    // Cache the successful result
    CachedPipeline cachedPipeline{};
    cachedPipeline.result = result;
    cachedPipeline.lastUsedFrame = m_currentFrame;
    cachedPipeline.creationFrame = m_currentFrame;
    cachedPipeline.debugName = params.debugName;
    cachedPipeline.configHash = HashPipelineKey(key);

    // Replace existing if needed
    if (replaceExisting) {
      if (auto it = m_pipelineCache.find(key); it != m_pipelineCache.end()) {
        CleanupPipeline(it->second);
        FirePipelineEvent(key, false);  // Destroyed
      }
    }

    m_pipelineCache[key] = std::move(cachedPipeline);
    FirePipelineEvent(key, true);  // Created

    // Check if we should run automatic optimization
    if (ShouldRunAutomaticOptimization()) {
      OptimizeCacheInternal(60);  // Remove pipelines unused for 60 frames
    }
  }

  return result;
}

PipelineResult VulkanPipelineManager::GetPipeline(const PipelineKey& key) {
  std::lock_guard<std::mutex> lock(m_cacheMutex);

  if (auto it = m_pipelineCache.find(key); it != m_pipelineCache.end()) {
    it->second.lastUsedFrame = m_currentFrame;
    it->second.accessCount++;
    m_cacheHits++;
    return it->second.result;
  }

  // Return empty result if not found
  PipelineResult result{};
  result.success = false;
  result.errorMessage = "Pipeline not found in cache";
  return result;
}

bool VulkanPipelineManager::RemovePipeline(const PipelineKey& key) {
  std::lock_guard<std::mutex> lock(m_cacheMutex);

  if (auto it = m_pipelineCache.find(key); it != m_pipelineCache.end()) {
    CleanupPipeline(it->second);
    m_pipelineCache.erase(it);
    FirePipelineEvent(key, false);  // Destroyed
    return true;
  }

  return false;
}

// =============================================================================
// APPLICATION-SPECIFIC CONVENIENCE METHODS
// =============================================================================

PipelineResult VulkanPipelineManager::GetTerrainPipeline(
    Rendering::LODLevel lod, const std::string& vertexShader,
    const std::string& fragmentShader, VkRenderPass renderPass,
    const VkExtent2D& extent, bool enableTessellation) {
  PipelineCreationParams params{};
  params.key.type = PipelineType::Graphics;
  params.key.shaderPaths = {vertexShader, fragmentShader};
  params.key.renderPass = renderPass;
  params.extent = extent;
  params.debugName =
      "TerrainPipeline_LOD" + std::to_string(static_cast<int>(lod));

  // Configure for terrain rendering
  auto config = Presets::Terrain();
  config.enableTessellation = enableTessellation;

  // Optimize based on LOD
  switch (lod) {
    case Rendering::LODLevel::LOD0:  // Highest detail
      config.sampleCount = VK_SAMPLE_COUNT_4_BIT;
      config.sampleShadingEnable = true;
      break;
    case Rendering::LODLevel::LOD1:
      config.sampleCount = VK_SAMPLE_COUNT_2_BIT;
      break;
    default:  // Lower LODs
      config.sampleCount = VK_SAMPLE_COUNT_1_BIT;
      config.enableTessellation = false;  // Disable for distant terrain
      break;
  }

  params.graphicsConfig = config;

  return GetOrCreatePipeline(params);
}

PipelineResult VulkanPipelineManager::GetWaterPipeline(
    const std::string& vertexShader, const std::string& fragmentShader,
    VkRenderPass renderPass, const VkExtent2D& extent,
    bool enableTransparency) {
  PipelineCreationParams params{};
  params.key.type = PipelineType::Graphics;
  params.key.shaderPaths = {vertexShader, fragmentShader};
  params.key.renderPass = renderPass;
  params.extent = extent;
  params.debugName = "WaterPipeline";

  auto config = Presets::Transparent();
  if (!enableTransparency) {
    config.blendEnable = false;
    config.depthWriteEnable = true;
  }

  // Water-specific optimizations
  config.cullMode = VK_CULL_MODE_NONE;  // Water can be viewed from both sides
  config.sampleCount = VK_SAMPLE_COUNT_4_BIT;  // Higher quality for water

  params.graphicsConfig = config;

  return GetOrCreatePipeline(params);
}

PipelineResult VulkanPipelineManager::GetAtmospherePipeline(
    const std::string& vertexShader, const std::string& fragmentShader,
    VkRenderPass renderPass, const VkExtent2D& extent) {
  PipelineCreationParams params{};
  params.key.type = PipelineType::Graphics;
  params.key.shaderPaths = {vertexShader, fragmentShader};
  params.key.renderPass = renderPass;
  params.extent = extent;
  params.debugName = "AtmospherePipeline";

  auto config = Presets::Transparent();
  config.cullMode = VK_CULL_MODE_FRONT_BIT;  // Atmosphere renders from inside
  config.depthTestEnable = false;  // Atmosphere is always behind everything
  config.depthWriteEnable = false;

  params.graphicsConfig = config;

  return GetOrCreatePipeline(params);
}

PipelineResult VulkanPipelineManager::GetComputePipeline(
    const std::string& operationType, const std::string& computeShader,
    const std::array<uint32_t, 3>& workGroupSize) {
  PipelineCreationParams params{};
  params.key.type = PipelineType::Compute;
  params.key.shaderPaths = {computeShader};
  params.debugName = operationType + "ComputePipeline";

  auto config = Presets::StandardCompute();
  config.workGroupSize = workGroupSize;

  // Optimize based on operation type
  if (operationType == "noise") {
    config = Presets::NoiseGeneration();
  } else if (operationType == "water") {
    config = Presets::WaterSimulation();
  }

  params.computeConfig = config;

  return GetOrCreatePipeline(params);
}

PipelineResult VulkanPipelineManager::GetNoisePipeline(
    const std::string& computeShader) {
  return GetComputePipeline("noise", computeShader, {8, 8, 1});
}

PipelineResult VulkanPipelineManager::GetStandardPipeline(
    const std::string& vertexShader, const std::string& fragmentShader,
    VkRenderPass renderPass, const VkExtent2D& extent, bool enableBlending) {
  PipelineCreationParams params{};
  params.key.type = PipelineType::Graphics;
  params.key.shaderPaths = {vertexShader, fragmentShader};
  params.key.renderPass = renderPass;
  params.extent = extent;
  params.debugName = "StandardPipeline";

  auto config = Presets::Standard();
  config.blendEnable = enableBlending;

  params.graphicsConfig = config;

  return GetOrCreatePipeline(params);
}

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================

VulkanPipelineManager::CacheStatistics
VulkanPipelineManager::GetCacheStatistics() const {
  std::lock_guard<std::mutex> lock(m_cacheMutex);

  CacheStatistics stats{};
  stats.totalPipelines = m_pipelineCache.size();
  stats.cacheHits = m_cacheHits.load();
  stats.cacheMisses = m_cacheMisses.load();

  if (stats.cacheHits + stats.cacheMisses > 0) {
    stats.hitRatio = static_cast<double>(stats.cacheHits) /
                     (stats.cacheHits + stats.cacheMisses);
  }

  // Calculate active pipelines and memory usage
  for (const auto& [key, pipeline] : m_pipelineCache) {
    if (pipeline.referenceCount > 0) {
      stats.activePipelines++;
    }
    stats.memoryUsageBytes += CalculatePipelineMemoryUsage(pipeline);
  }

  // Get top pipelines by access count
  std::vector<std::pair<std::string, uint32_t>> pipelineAccess;
  for (const auto& [key, pipeline] : m_pipelineCache) {
    pipelineAccess.emplace_back(pipeline.debugName, pipeline.accessCount);
  }

  std::sort(pipelineAccess.begin(), pipelineAccess.end(),
            [](const auto& a, const auto& b) { return a.second > b.second; });

  stats.topPipelines = std::move(pipelineAccess);
  if (stats.topPipelines.size() > 10) {
    stats.topPipelines.resize(10);
  }

  return stats;
}

void VulkanPipelineManager::ClearCache(bool waitForIdle) {
  if (waitForIdle) {
    vkDeviceWaitIdle(m_vulkanBase->GetDevice());
  }

  std::lock_guard<std::mutex> lock(m_cacheMutex);

  for (auto& [key, pipeline] : m_pipelineCache) {
    CleanupPipeline(pipeline);
    FirePipelineEvent(key, false);  // Destroyed
  }

  m_pipelineCache.clear();
  m_cacheHits = 0;
  m_cacheMisses = 0;
}

size_t VulkanPipelineManager::OptimizeCache(uint32_t maxUnusedAge) {
  std::lock_guard<std::mutex> lock(m_cacheMutex);
  return OptimizeCacheInternal(maxUnusedAge);
}

void VulkanPipelineManager::PrecompileCommonPipelines(
    const std::vector<std::vector<std::string>>& commonShaderPaths,
    VkRenderPass renderPass, const VkExtent2D& extent) {
  for (const auto& shaderPaths : commonShaderPaths) {
    if (shaderPaths.empty()) continue;

    PipelineCreationParams params{};
    params.extent = extent;

    // Determine pipeline type based on shader count
    if (shaderPaths.size() == 1) {
      // Assume compute
      params.key.type = PipelineType::Compute;
      params.computeConfig = Presets::StandardCompute();
    } else {
      // Assume graphics
      params.key.type = PipelineType::Graphics;
      params.key.renderPass = renderPass;
      params.graphicsConfig = Presets::Standard();
    }

    params.key.shaderPaths = shaderPaths;
    params.debugName = "Precompiled";

    // Create pipeline (will be cached automatically)
    GetOrCreatePipeline(params);
  }
}

// =============================================================================
// PIPELINE LIFECYCLE AND REFERENCE COUNTING
// =============================================================================

uint32_t VulkanPipelineManager::AddReference(const PipelineKey& key) {
  std::lock_guard<std::mutex> lock(m_cacheMutex);

  if (auto it = m_pipelineCache.find(key); it != m_pipelineCache.end()) {
    return ++it->second.referenceCount;
  }

  return 0;
}

uint32_t VulkanPipelineManager::RemoveReference(const PipelineKey& key) {
  std::lock_guard<std::mutex> lock(m_cacheMutex);

  if (auto it = m_pipelineCache.find(key); it != m_pipelineCache.end()) {
    if (it->second.referenceCount > 0) {
      return --it->second.referenceCount;
    }
  }

  return 0;
}

uint32_t VulkanPipelineManager::GetReferenceCount(
    const PipelineKey& key) const {
  std::lock_guard<std::mutex> lock(m_cacheMutex);

  if (auto it = m_pipelineCache.find(key); it != m_pipelineCache.end()) {
    return it->second.referenceCount;
  }

  return 0;
}

// =============================================================================
// ADVANCED FEATURES
// =============================================================================

void VulkanPipelineManager::RegisterEventCallback(
    PipelineEventCallback callback) {
  std::lock_guard<std::mutex> lock(m_cacheMutex);
  m_eventCallbacks.push_back(std::move(callback));
}

void VulkanPipelineManager::SetAutomaticOptimization(bool enable,
                                                     uint32_t frameInterval) {
  m_autoOptimizationEnabled = enable;
  m_optimizationFrameInterval = frameInterval;
}

void VulkanPipelineManager::UpdateFrameCounter() { m_currentFrame++; }

std::vector<std::string> VulkanPipelineManager::ValidateCache() const {
  std::lock_guard<std::mutex> lock(m_cacheMutex);

  std::vector<std::string> issues;

  for (const auto& [key, pipeline] : m_pipelineCache) {
    // Validate pipeline handles
    if (pipeline.result.pipeline == VK_NULL_HANDLE) {
      issues.push_back("Invalid pipeline handle for: " + pipeline.debugName);
    }

    if (pipeline.result.layout == VK_NULL_HANDLE) {
      issues.push_back("Invalid pipeline layout for: " + pipeline.debugName);
    }

    // Validate configuration hash
    auto expectedHash = HashPipelineKey(key);
    if (pipeline.configHash != expectedHash) {
      issues.push_back("Hash mismatch for pipeline: " + pipeline.debugName);
    }
  }

  return issues;
}

// =============================================================================
// INTERNAL METHODS
// =============================================================================

PipelineKey VulkanPipelineManager::GeneratePipelineKey(
    const PipelineCreationParams& params) {
  PipelineKey key = params.key;
  key.hash = HashPipelineKey(key);
  return key;
}

template <typename ConfigType>
ConfigType VulkanPipelineManager::OptimizeConfigForApplication(
    const ConfigType& baseConfig, const std::string& applicationType) {
  // This is a placeholder for application-specific optimizations
  // In a real implementation, this would contain detailed optimization logic
  return baseConfig;
}

bool VulkanPipelineManager::ShouldRunAutomaticOptimization() const {
  if (!m_autoOptimizationEnabled) return false;

  return (m_currentFrame - m_lastOptimizationFrame) >=
         m_optimizationFrameInterval;
}

size_t VulkanPipelineManager::OptimizeCacheInternal(uint32_t maxUnusedAge) {
  size_t removedCount = 0;
  uint64_t currentFrame = m_currentFrame;

  auto it = m_pipelineCache.begin();
  while (it != m_pipelineCache.end()) {
    const auto& pipeline = it->second;

    // Check if pipeline is unused and old enough to remove
    bool shouldRemove = pipeline.referenceCount == 0 &&
                        (currentFrame - pipeline.lastUsedFrame) > maxUnusedAge;

    if (shouldRemove) {
      CleanupPipeline(pipeline);
      FirePipelineEvent(it->first, false);  // Destroyed
      it = m_pipelineCache.erase(it);
      removedCount++;
    } else {
      ++it;
    }
  }

  m_lastOptimizationFrame = currentFrame;
  return removedCount;
}

void VulkanPipelineManager::FirePipelineEvent(const PipelineKey& key,
                                              bool created) {
  for (const auto& callback : m_eventCallbacks) {
    try {
      callback(key, created);
    } catch (...) {
      // Ignore callback exceptions
    }
  }
}

void VulkanPipelineManager::CleanupPipeline(
    const CachedPipeline& cachedPipeline) {
  const auto& result = cachedPipeline.result;

  if (result.pipeline != VK_NULL_HANDLE) {
    vkDestroyPipeline(m_vulkanBase->GetDevice(), result.pipeline, nullptr);
  }

  if (result.layout != VK_NULL_HANDLE) {
    vkDestroyPipelineLayout(m_vulkanBase->GetDevice(), result.layout, nullptr);
  }

  for (auto layout : result.descriptorSetLayouts) {
    if (layout != VK_NULL_HANDLE) {
      vkDestroyDescriptorSetLayout(m_vulkanBase->GetDevice(), layout, nullptr);
    }
  }
}

size_t VulkanPipelineManager::CalculatePipelineMemoryUsage(
    const CachedPipeline& cachedPipeline) const {
  // Rough estimation of pipeline memory usage
  // In practice, this would need more sophisticated calculation
  size_t baseSize = sizeof(CachedPipeline);

  // Add estimated Vulkan object sizes
  baseSize += 1024;  // Estimated pipeline object size
  baseSize += 512;   // Estimated pipeline layout size
  baseSize += cachedPipeline.result.descriptorSetLayouts.size() *
              256;  // Descriptor layouts

  return baseSize;
}

// =============================================================================
// HIGH-LEVEL EXECUTION METHODS
// =============================================================================

bool VulkanPipelineManager::ExecuteCompute(
    const std::string& shaderPath,
    uint32_t width,
    uint32_t height,
    const std::map<std::string, BufferResourcePtr>& bufferBindings,
    const void* pushConstants,
    size_t pushConstantsSize) {
    
    return ExecuteComputeWithIterations(
        shaderPath, width, height, 1, bufferBindings,
        pushConstants ? [pushConstants, pushConstantsSize](uint32_t, void* dst) {
            std::memcpy(dst, pushConstants, pushConstantsSize);
        } : nullptr,
        pushConstantsSize);
}

bool VulkanPipelineManager::ExecuteComputeWithIterations(
    const std::string& shaderPath,
    uint32_t width,
    uint32_t height,
    uint32_t iterations,
    const std::map<std::string, BufferResourcePtr>& bufferBindings,
    std::function<void(uint32_t iteration, void* pushConstants)> updatePushConstants,
    size_t pushConstantsSize) {
    
    // Create pipeline for compute shader
    PipelineKey key;
    key.type = PipelineType::Compute;
    key.shaderPaths = {shaderPath};
    
    PipelineCreationParams params;
    params.key = key;
    params.computeConfig = Presets::StandardCompute();
    params.debugName = "ExecuteCompute_" + shaderPath;
    
    auto pipelineResult = GetOrCreatePipeline(params);
    if (!pipelineResult.success) {
        return false;
    }
    
    // TODO: Implement descriptor set creation from buffer bindings using shader reflection
    // This is where the shader reflection system would automatically match
    // binding names to descriptor slots and create the appropriate descriptor sets
    
    // TODO: Implement command buffer recording with iteration support
    // - Record initial barriers if needed
    // - Loop through iterations
    // - Bind pipeline and descriptors
    // - Update push constants via callback
    // - Dispatch compute
    // - Add barriers between iterations
    
    // For now, return true as placeholder until we implement the full pipeline
    // TODO: Remove this placeholder and implement proper execution
    return true;
}

}  // namespace PlanetGen::Rendering::Pipeline
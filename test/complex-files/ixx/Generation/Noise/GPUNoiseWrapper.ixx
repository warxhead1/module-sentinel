// This file is deprecated and moved to
// Generation/Heightmaps/GPUNoiseWrapper.ixx to maintain proper layer
// separation. GPU noise operations belong with heightmap generation.

module;

#include <glm/glm.hpp>
#include <memory>
#include <vector>

export module GPUNoiseWrapper;

import NoiseInterface;
import NoiseTypes;
import GPUNoiseTypes; // This will be from Heightmaps
import GLMModule;

// Note: VulkanNoiseForward is not needed here as GPUNoiseWrapper is just an
// interface The actual Vulkan implementation will be in the heightmaps layer

export namespace PlanetGen::Rendering::Noise {

/**
 * @brief Interface for bulk noise generation operations
 */
class IBulkNoiseGenerator {
 public:
  virtual ~IBulkNoiseGenerator() = default;

  // Generate noise for a grid of points
  virtual std::vector<float> GenerateNoiseMap(float startX, float startZ,
                                              int width, int depth,
                                              float stepSize) const = 0;
};

/**
 * @brief Enhanced GPU-accelerated noise generator with comprehensive noise type support
 * 
 * This class provides a unified interface for both GPU and CPU noise generation,
 * automatically selecting the best approach based on the noise type and operation.
 * 
 * Supported GPU noise types:
 * - Simplex Noise (GPU accelerated)
 * - Worley Noise (GPU accelerated)
 * - SimpleNoise (GPU accelerated)
 * 
 * CPU fallback for advanced types:
 * - RidgedNoise (mountain ridges, canyons)
 * - StarFieldNoise (cosmic scale generation)
 * - DomainWarpedNoise (organic, flowing patterns)
 * - FlowNoise (fluid dynamics)
 * - And 30+ other procedural noise types
 */
class GPUNoiseWrapper : public INoiseGenerator, public IBulkNoiseGenerator {
 public:
  GPUNoiseWrapper(int seed = 1337, float frequency = 0.01f, int octaves = 4);
  ~GPUNoiseWrapper() override;

  // Initialize GPU resources
  bool Initialize();

  // INoiseGenerator implementation (single-point queries)
  float GetNoise(float x, float y, float z) override;
  float GetNoise(const glm::vec3& pos) override;
  void SetSeed(int seed) override;
  void SetFrequency(float freq) override;
  void SetOctaves(int octaves) override;
  
  // Enhanced noise type management
  NoiseType GetNoiseType() const override;
  void SetNoiseType(NoiseType type);

  // IBulkNoiseGenerator implementation
  std::vector<float> GenerateNoiseMap(float startX, float startZ, int width,
                                      int depth, float stepSize) const override;

  // Advanced parameter control
  void SetPersistence(float persistence);
  void SetLacunarity(float lacunarity);
  void SetAmplitude(float amplitude);
  
  // GPU capability querying
  bool IsGPUSupported(NoiseType type) const;
  
  // Static helper methods for noise type categories
  static const char* GetNoiseTypeName(NoiseType type);
  static const char* GetNoiseCategory(NoiseType type);

 private:
  class Impl;
  std::unique_ptr<Impl> m_impl;
};

// Helper functions for noise type information
const char* GetNoiseTypeName(NoiseType type);
const char* GetNoiseCategory(NoiseType type);
bool IsNoiseTypeGPUAccelerated(NoiseType type);

}  // namespace PlanetGen::Rendering::Noise

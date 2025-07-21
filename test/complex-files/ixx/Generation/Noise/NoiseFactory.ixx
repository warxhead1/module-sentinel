module;

#include <memory>
#include <string>
#include <vector>

export module NoiseFactory;

import NoiseInterface;
import NoiseTypes;
import SimpleNoiseWrapper;
import WorleyNoise;

export namespace PlanetGen::Rendering::Noise {
/**
 * @brief Factory for creating noise generators
 */
class NoiseFactory {
 public:
  // Create a noise generator of the specified type
  static std::unique_ptr<INoiseGenerator> Create(NoiseType type,
                                                 int seed = 1337,
                                                 float frequency = 0.01f,
                                                 int octaves = 1);

  // Basic noise generators
  static std::unique_ptr<INoiseGenerator> CreateSimpleNoise(
      int seed = 1337, float frequency = 0.01f, int octaves = 1);

  static std::unique_ptr<INoiseGenerator> CreateWorley(int seed = 1337,
                                                       float frequency = 0.01f,
                                                       int octaves = 1);

  // Advanced fractal noise generators
  static std::unique_ptr<INoiseGenerator> CreateRidgedNoise(
      int seed = 1337, float frequency = 0.01f, int octaves = 4);

  static std::unique_ptr<INoiseGenerator> CreateBillowNoise(
      int seed = 1337, float frequency = 0.01f, int octaves = 4);

  static std::unique_ptr<INoiseGenerator> CreateVolcanicNoise(
      int seed = 1337, float frequency = 0.01f, int octaves = 4);

  // Cosmic noise generators
  static std::unique_ptr<INoiseGenerator> CreateStarFieldNoise(
      int seed = 1337, float frequency = 0.01f, int octaves = 3);

  // Domain warped noise generators
  static std::unique_ptr<INoiseGenerator> CreateDomainWarpedSimplex(
      int seed = 1337, float frequency = 0.01f, int octaves = 4);

  static std::unique_ptr<INoiseGenerator> CreateDomainWarpedWorley(
      int seed = 1337, float frequency = 0.01f, int octaves = 1);

  static std::unique_ptr<INoiseGenerator> CreateFlowNoise(
      int seed = 1337, float frequency = 0.01f, int octaves = 3);

  // Create a noise generator from a string name
  static std::unique_ptr<INoiseGenerator> CreateFromString(
      const std::string& name, int seed = 1337, float frequency = 0.01f,
      int octaves = 1);

  // Convert string to NoiseType
  static NoiseType StringToNoiseType(const std::string& type);

  // Convert NoiseType to string
  static std::string NoiseTypeToString(NoiseType type);

  // Helper function to categorize noise types
  static NoiseCategory GetNoiseCategory(NoiseType type);

  // Get all noise types in a category
  static std::vector<NoiseType> GetNoiseTypesInCategory(NoiseCategory category);

  // Get recommended noise types for specific use cases
  static std::vector<NoiseType> GetRecommendedNoiseForPlanetSurface();
  static std::vector<NoiseType> GetRecommendedNoiseForCosmicStructures();
  static std::vector<NoiseType> GetRecommendedNoiseForAtmosphericEffects();
};

/**
 * @brief Advanced noise combination utilities
 */
class NoiseComposer {
public:
  // Create layered noise combining multiple generators
  static std::unique_ptr<INoiseGenerator> CreateLayeredNoise(
      std::vector<std::unique_ptr<INoiseGenerator>> layers,
      std::vector<float> weights,
      int seed = 1337);

  // Create masked noise (noise applied only in certain regions)
  static std::unique_ptr<INoiseGenerator> CreateMaskedNoise(
      std::unique_ptr<INoiseGenerator> mainNoise,
      std::unique_ptr<INoiseGenerator> maskNoise,
      float threshold = 0.0f,
      int seed = 1337);

  // Create terrain-specific noise combinations
  static std::unique_ptr<INoiseGenerator> CreatePlanetTerrainNoise(
      int seed = 1337, float scale = 0.01f);

  static std::unique_ptr<INoiseGenerator> CreateStarFieldComposite(
      int seed = 1337, float scale = 0.001f);

  static std::unique_ptr<INoiseGenerator> CreateNebulaComposite(
      int seed = 1337, float scale = 0.005f);
};

}  // namespace PlanetGen::Rendering::Noise

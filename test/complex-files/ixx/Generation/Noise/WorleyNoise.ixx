module;

#include <cmath>
#include <cstdint>

#include <memory>
#include <random>

export module WorleyNoise;
import GLMModule;
import NoiseInterface;
import NoiseTypes;

export namespace PlanetGen::Rendering::Noise {

/**
 * @brief Worley (Cellular) noise implementation
 */
class WorleyNoise : public INoiseGenerator {
public:
  WorleyNoise(int seed = 1337, float frequency = 0.01f, int octaves = 1);
  ~WorleyNoise() override = default;

  // INoiseGenerator implementation
  float GetNoise(float x, float y, float z) override;
  float GetNoise(const vec3 &pos) override;
  void SetSeed(int seed) override;
  void SetFrequency(float freq) override;
  void SetOctaves(int octaves) override;
  NoiseType GetNoiseType() const override { return NoiseType::Worley; }

private:
  // Core Worley noise implementation
  float WorleyNoise3D(float x, float y, float z) const;
  vec3 GenerateFeaturePoint(int cellX, int cellY, int cellZ) const;
  uint32_t HashCell(int x, int y, int z) const;

  // Parameters
  int m_seed;
  float m_frequency;
  int m_octaves;
  std::mt19937 m_rng;
};

} // namespace PlanetGen::Rendering::Noise

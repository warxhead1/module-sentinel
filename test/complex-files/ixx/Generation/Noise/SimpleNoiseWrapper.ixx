module;

#include <memory>

export module SimpleNoiseWrapper;
import GLMModule;
import NoiseInterface;
import SimpleNoise;

export namespace PlanetGen::Rendering::Noise {

/**
 * @brief Wrapper for SimpleNoise library
 */
class SimpleNoiseWrapper : public INoiseGenerator {
 public:
  SimpleNoiseWrapper(int seed = 1337, float frequency = 0.01f, int octaves = 1);
  ~SimpleNoiseWrapper() override = default;

  // INoiseGenerator interface
  float GetNoise(float x, float y, float z) override;
  float GetNoise(const vec3& pos) override;
  void SetSeed(int seed) override;
  void SetFrequency(float freq) override;
  void SetOctaves(int octaves) override;
  NoiseType GetNoiseType() const override { return NoiseType::SimpleNoise; }

  // Additional settings
  void SetPersistence(float persistence);
  void SetLacunarity(float lacunarity);

 private:
  std::unique_ptr<SimpleNoise::NoiseProvider> m_noise;
  float m_frequency;
  int m_seed;
};

}  // namespace PlanetGen::Rendering::Noise
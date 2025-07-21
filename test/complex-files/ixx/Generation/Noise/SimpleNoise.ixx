module;

// Standard library includes (must be in global module fragment)

#include <array>
#include <cmath>
#include <memory>
#include <random>
#include <stdexcept>
#include <vector>

export module SimpleNoise;

// Module imports (after module declaration)
import GLMModule;

export namespace SimpleNoise {

// Base noise generator interface
class INoiseGenerator {
 public:
  virtual ~INoiseGenerator() = default;
  virtual float GetNoise(float x, float y, float z) = 0;
  virtual float GetNoise(const vec3& pos) = 0;
};

// Simple noise provider that handles both base and fractal noise
class NoiseProvider : public INoiseGenerator {
 public:
  // Create a noise provider with Simplex noise and FBM fractal
  NoiseProvider(float persistence = 0.5f, float lacunarity = 2.0f,
                int octaves = 1);

  float GetNoise(float x, float y, float z) override;
  float GetNoise(const vec3& pos) override;

  // Settings
  void SetPersistence(float persistence);
  void SetLacunarity(float lacunarity);
  void SetOctaves(int octaves);

 private:
  float m_persistence;
  float m_lacunarity;
  int m_octaves;

  // Internal noise generation
  float SimplexNoise(float x, float y, float z);
  float FractalNoise(float x, float y, float z);
};

}  // namespace SimpleNoise
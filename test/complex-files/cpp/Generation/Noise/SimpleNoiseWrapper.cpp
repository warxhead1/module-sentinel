module;
#include <memory>
#include <random>
#include <stdexcept>

module SimpleNoiseWrapper;

import SimpleNoise;
import GLMModule;

namespace PlanetGen::Rendering::Noise {

SimpleNoiseWrapper::SimpleNoiseWrapper(int seed, float frequency, int octaves)
    : m_frequency(frequency), m_seed(seed) {
  m_noise = std::make_unique<SimpleNoise::NoiseProvider>(0.5f, 2.0f, octaves);
  SetSeed(seed);  // Initialize with seed
}

float SimpleNoiseWrapper::GetNoise(float x, float y, float z) {
  if (!m_noise) {
    throw std::runtime_error("Noise generator not initialized");
  }
  return m_noise->GetNoise(x * m_frequency, y * m_frequency, z * m_frequency);
}

float SimpleNoiseWrapper::GetNoise(const vec3& pos) {
  return GetNoise(pos.x, pos.y, pos.z);
}

void SimpleNoiseWrapper::SetSeed(int seed) {
  m_seed = seed;
  // TODO: Implement seed-based randomization
}

void SimpleNoiseWrapper::SetFrequency(float freq) {
  if (freq <= 0.0f) {
    throw std::invalid_argument("Frequency must be positive");
  }
  m_frequency = freq;
}

void SimpleNoiseWrapper::SetOctaves(int octaves) {
  if (octaves < 1) {
    throw std::invalid_argument("Octaves must be at least 1");
  }
  m_noise->SetOctaves(octaves);
}

void SimpleNoiseWrapper::SetPersistence(float persistence) {
  if (persistence <= 0.0f) {
    throw std::invalid_argument("Persistence must be positive");
  }
  m_noise->SetPersistence(persistence);
}

void SimpleNoiseWrapper::SetLacunarity(float lacunarity) {
  if (lacunarity <= 0.0f) {
    throw std::invalid_argument("Lacunarity must be positive");
  }
  m_noise->SetLacunarity(lacunarity);
}

}  // namespace PlanetGen::Rendering::Noise
module;
#define GLM_FORCE_RADIANS
#define GLM_FORCE_DEPTH_ZERO_TO_ONE
#include <cstdint>
#include <algorithm>
#include <cmath>
#include <limits>
#include <random>

module WorleyNoise; // implement the module (no export)

import GLMModule;

namespace PlanetGen::Rendering::Noise {

WorleyNoise::WorleyNoise(int seed, float frequency, int octaves)
    : m_seed(seed), m_frequency(frequency), m_octaves(octaves), m_rng(seed) {}

float WorleyNoise::GetNoise(float x, float y, float z) {
  x *= m_frequency;
  y *= m_frequency;
  z *= m_frequency;
  if (m_octaves <= 1) {
    return WorleyNoise3D(x, y, z);
  }

  float result = 0.0f;
  float amplitude = 1.0f;
  float frequency = 1.0f;
  float maxValue = 0.0f;

  for (int i = 0; i < m_octaves; i++) {
    result +=
        amplitude * WorleyNoise3D(x * frequency, y * frequency, z * frequency);
    maxValue += amplitude;
    amplitude *= 0.5f; // Persistence
    frequency *= 2.0f; // Lacunarity
  }

  return result / maxValue;
}

float WorleyNoise::GetNoise(const vec3 &pos) {
  return GetNoise(pos.x, pos.y, pos.z);
}

void WorleyNoise::SetSeed(int seed) {
  m_seed = seed;
  m_rng.seed(seed);
}

void WorleyNoise::SetFrequency(float freq) { m_frequency = freq; }

void WorleyNoise::SetOctaves(int octaves) { m_octaves = std::max(1, octaves); }

float WorleyNoise::WorleyNoise3D(float x, float y, float z) const {
  int cellX = static_cast<int>(std::floor(x));
  int cellY = static_cast<int>(std::floor(y));
  int cellZ = static_cast<int>(std::floor(z));

  float minDist = std::numeric_limits<float>::max();
  for (int dz = -1; dz <= 1; dz++) {
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec3 featurePoint =
            GenerateFeaturePoint(cellX + dx, cellY + dy, cellZ + dz);
        float dist = length(vec3(x, y, z) - featurePoint);
        minDist = std::min(minDist, dist);
      }
    }
  }
  return std::min(1.0f,
                  minDist / 1.732f); // sqrt(3) is max distance in unit cube
}

vec3 WorleyNoise::GenerateFeaturePoint(int cellX, int cellY,
                                            int cellZ) const {
  uint32_t hash = HashCell(cellX, cellY, cellZ);
  uint32_t x_hash = hash;
  uint32_t y_hash = hash * 1597334677U;
  uint32_t z_hash = hash * 3812015801U;
  float fx =
      static_cast<float>(x_hash & 0xFFFFFF) / static_cast<float>(0xFFFFFF);
  float fy =
      static_cast<float>(y_hash & 0xFFFFFF) / static_cast<float>(0xFFFFFF);
  float fz =
      static_cast<float>(z_hash & 0xFFFFFF) / static_cast<float>(0xFFFFFF);

  return vec3(cellX + fx, cellY + fy, cellZ + fz);
}

uint32_t WorleyNoise::HashCell(int x, int y, int z) const {
  uint32_t hash = static_cast<uint32_t>(m_seed);

  hash ^= static_cast<uint32_t>(x) + 0x9e3779b9 + (hash << 6) + (hash >> 2);
  hash ^= static_cast<uint32_t>(y) + 0x9e3779b9 + (hash << 6) + (hash >> 2);
  hash ^= static_cast<uint32_t>(z) + 0x9e3779b9 + (hash << 6) + (hash >> 2);

  return hash;
}

} // namespace PlanetGen::Rendering::Noise

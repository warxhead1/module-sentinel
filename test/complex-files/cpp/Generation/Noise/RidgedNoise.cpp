module;

#include <memory>
#include <cmath>
#include <algorithm>

module RidgedNoise;

import GLMModule;

import SimpleNoise;

namespace PlanetGen::Rendering::Noise {

RidgedNoise::RidgedNoise(int seed, float frequency, int octaves)
    : m_seed(seed),
      m_frequency(frequency),
      m_octaves(std::max(1, octaves)),
      m_persistence(0.5f),
      m_lacunarity(2.0f),
      m_ridgeOffset(1.0f),
      m_ridgeGain(2.0f),
      m_ridgeThreshold(0.0f) {
    
    m_baseNoise = std::make_unique<SimpleNoise::NoiseProvider>(m_persistence, m_lacunarity, 1);
}

float RidgedNoise::GetNoise(float x, float y, float z) {
    return ComputeRidgedNoise(x * m_frequency, y * m_frequency, z * m_frequency);
}

float RidgedNoise::GetNoise(const vec3& pos) {
    return GetNoise(pos.x, pos.y, pos.z);
}

void RidgedNoise::SetSeed(int seed) {
    m_seed = seed;
    // TODO: Implement seed-based randomization for base noise
}

void RidgedNoise::SetFrequency(float freq) {
    m_frequency = std::max(0.001f, freq);
}

void RidgedNoise::SetOctaves(int octaves) {
    m_octaves = std::max(1, octaves);
}

void RidgedNoise::SetPersistence(float persistence) {
    m_persistence = std::clamp(persistence, 0.0f, 1.0f);
    m_baseNoise->SetPersistence(m_persistence);
}

void RidgedNoise::SetLacunarity(float lacunarity) {
    m_lacunarity = std::max(1.0f, lacunarity);
    m_baseNoise->SetLacunarity(m_lacunarity);
}

void RidgedNoise::SetRidgeOffset(float offset) {
    m_ridgeOffset = offset;
}

void RidgedNoise::SetRidgeGain(float gain) {
    m_ridgeGain = std::max(0.1f, gain);
}

void RidgedNoise::SetRidgeThreshold(float threshold) {
    m_ridgeThreshold = std::clamp(threshold, -1.0f, 1.0f);
}

float RidgedNoise::ComputeRidgedNoise(float x, float y, float z) const {
    float result = 0.0f;
    float frequency = 1.0f;
    float amplitude = 1.0f;
    float weight = 1.0f;
    float signal = 0.0f;
    
    for (int i = 0; i < m_octaves; i++) {
        // Get the raw noise value
        signal = m_baseNoise->GetNoise(x * frequency, y * frequency, z * frequency);
        
        // Apply ridge transformation
        signal = ApplyRidgeTransform(signal);
        
        // Weight successive contributions by previous signal
        signal *= weight;
        weight = std::clamp(signal * m_ridgeGain, 0.0f, 1.0f);
        
        // Add to result
        result += signal * amplitude;
        
        // Prepare for next octave
        frequency *= m_lacunarity;
        amplitude *= m_persistence;
    }
    
    return std::clamp(result, -1.0f, 1.0f);
}

float RidgedNoise::ApplyRidgeTransform(float noise) const {
    // Create ridges by taking absolute value and inverting
    noise = std::abs(noise);
    noise = m_ridgeOffset - noise;
    
    // Apply threshold to create sharper ridges
    if (noise < m_ridgeThreshold) {
        noise = m_ridgeThreshold;
    }
    
    // Square the result to sharpen ridges further
    noise = noise * noise;
    
    return noise;
}

}  // namespace PlanetGen::Rendering::Noise 
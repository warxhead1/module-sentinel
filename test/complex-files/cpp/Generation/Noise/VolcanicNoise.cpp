module;

#include <memory>
#include <cmath>
#include <cstdint>

module VolcanicNoise;

import GLMModule;
import RidgedNoise;
import SimpleNoiseWrapper;

namespace PlanetGen::Rendering::Noise {

VolcanicNoise::VolcanicNoise(int seed, float frequency, int octaves)
    : m_seed(seed) {
    m_ridgedNoise = std::make_unique<RidgedNoise>(seed, frequency, octaves);
    
    // Create turbulence noise at higher frequency for detail
    m_turbulenceNoise = std::make_unique<SimpleNoiseWrapper>(seed + 1, frequency * 3.0f, octaves - 1);
}

float VolcanicNoise::GetNoise(float x, float y, float z) {
    // Get base ridged noise for sharp volcanic features
    float ridgedValue = m_ridgedNoise->GetNoise(x, y, z);
    
    // Add turbulence for more chaotic volcanic patterns
    float turbulence = m_turbulenceNoise->GetNoise(x, y, z);
    
    // Apply volcanic transformation
    return ApplyVolcanicTransform(ridgedValue, turbulence);
}

float VolcanicNoise::GetNoise(const vec3& pos) {
    return GetNoise(pos.x, pos.y, pos.z);
}

void VolcanicNoise::SetSeed(int seed) {
    m_seed = seed;
    m_ridgedNoise->SetSeed(seed);
    m_turbulenceNoise->SetSeed(seed + 1);
}

void VolcanicNoise::SetFrequency(float freq) {
    m_ridgedNoise->SetFrequency(freq);
    m_turbulenceNoise->SetFrequency(freq * 3.0f);
}

void VolcanicNoise::SetOctaves(int octaves) {
    m_ridgedNoise->SetOctaves(octaves);
    m_turbulenceNoise->SetOctaves(std::fmax(1, octaves - 1));
}

void VolcanicNoise::SetPersistence(float persistence) {
    // RidgedNoise doesn't have SetPersistence, but we can store it if needed
    // For now, we'll just pass it to the turbulence noise
    m_turbulenceNoise->SetPersistence(persistence);
}

void VolcanicNoise::SetLacunarity(float lacunarity) {
    // RidgedNoise doesn't have SetLacunarity, but we can store it if needed
    // For now, we'll just pass it to the turbulence noise
    m_turbulenceNoise->SetLacunarity(lacunarity);
}

float VolcanicNoise::ApplyVolcanicTransform(float ridgedValue, float turbulence) const {
    // Combine ridged noise with turbulence for volcanic effect
    float volcanic = ridgedValue * m_volcanicIntensity;
    
    // Add turbulent details
    volcanic += turbulence * m_turbulenceScale;
    
    // Apply additional sharpening for volcanic peaks
    if (volcanic > 0.0f) {
        volcanic = std::pow(volcanic, 1.3f); // Sharpen peaks
    } else {
        volcanic = -std::pow(-volcanic, 0.8f); // Soften valleys
    }
    
    // Clamp to reasonable range
    return std::fmax(-1.0f, std::fmin(1.0f, volcanic));
}

} // namespace PlanetGen::Rendering::Noise
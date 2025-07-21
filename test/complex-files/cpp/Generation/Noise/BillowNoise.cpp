module;

#include <memory>
#include <cmath>
#include <cstdint>

module BillowNoise;

import GLMModule;
import SimpleNoiseWrapper;

namespace PlanetGen::Rendering::Noise {

BillowNoise::BillowNoise(int seed, float frequency, int octaves)
    : m_octaves(octaves) {
    m_baseNoise = std::make_unique<SimpleNoiseWrapper>(seed, frequency, octaves);
    m_baseNoise->SetPersistence(m_persistence);
    m_baseNoise->SetLacunarity(m_lacunarity);
}

float BillowNoise::GetNoise(float x, float y, float z) {
    // Get base noise value
    float baseValue = m_baseNoise->GetNoise(x, y, z);
    
    // Apply billow transformation: abs(noise) * 2 - 1
    // This creates the characteristic puffy, billowy pattern
    return ApplyBillowTransform(baseValue);
}

float BillowNoise::GetNoise(const vec3& pos) {
    return GetNoise(pos.x, pos.y, pos.z);
}

void BillowNoise::SetSeed(int seed) {
    m_baseNoise->SetSeed(seed);
}

void BillowNoise::SetFrequency(float freq) {
    m_baseNoise->SetFrequency(freq);
}

void BillowNoise::SetOctaves(int octaves) {
    m_octaves = octaves;
    m_baseNoise->SetOctaves(octaves);
}

void BillowNoise::SetPersistence(float persistence) {
    m_persistence = persistence;
    m_baseNoise->SetPersistence(persistence);
}

void BillowNoise::SetLacunarity(float lacunarity) {
    m_lacunarity = lacunarity;
    m_baseNoise->SetLacunarity(lacunarity);
}

float BillowNoise::ApplyBillowTransform(float value) const {
    // Billow transformation: creates rounded, puffy shapes
    // Take absolute value and scale to maintain proper range
    float billow = std::abs(value);
    
    // Scale the billow effect
    billow *= m_billowScale;
    
    // Remap to [-1, 1] range
    return billow * 2.0f - 1.0f;
}

} // namespace PlanetGen::Rendering::Noise
module;

// Define M_PI if not already defined
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#include <memory>
#include <cmath>
#include <algorithm>

module DomainWarpedNoise;

import GLMModule;

import SimpleNoise;
import SimpleNoiseWrapper;
import WorleyNoise;

namespace PlanetGen::Rendering::Noise {

DomainWarpedNoise::DomainWarpedNoise(std::unique_ptr<INoiseGenerator> baseNoise,
                                     int seed, 
                                     float frequency, 
                                     int octaves)
    : m_baseNoise(std::move(baseNoise)),
      m_seed(seed),
      m_frequency(frequency),
      m_octaves(std::max(1, octaves)),
      m_enableMultiLevel(false),
      m_warpLevels(2) {
    
    // Initialize default warp parameters
    m_warpParams = WarpParameters{};
    
    // Create warping noise functions
    m_warpNoiseX = std::make_unique<SimpleNoise::NoiseProvider>(
        m_warpParams.warpPersistence, 
        m_warpParams.warpLacunarity, 
        m_warpParams.warpOctaves
    );
    m_warpNoiseY = std::make_unique<SimpleNoise::NoiseProvider>(
        m_warpParams.warpPersistence, 
        m_warpParams.warpLacunarity, 
        m_warpParams.warpOctaves
    );
    m_warpNoiseZ = std::make_unique<SimpleNoise::NoiseProvider>(
        m_warpParams.warpPersistence, 
        m_warpParams.warpLacunarity, 
        m_warpParams.warpOctaves
    );
    m_rotationNoise = std::make_unique<SimpleNoise::NoiseProvider>(0.5f, 2.0f, 2);
    m_turbulenceNoise = std::make_unique<SimpleNoise::NoiseProvider>(0.6f, 2.0f, 3);
}

float DomainWarpedNoise::GetNoise(float x, float y, float z) {
    if (!m_baseNoise) return 0.0f;
    
    // Compute warp offset
    vec3 warpOffset = ComputeWarpOffset(x, y, z);
    
    // Apply warping to the coordinates
    vec3 warpedPos = vec3(x, y, z) + warpOffset;
    
    // Sample the base noise at the warped coordinates
    return m_baseNoise->GetNoise(warpedPos.x, warpedPos.y, warpedPos.z);
}

float DomainWarpedNoise::GetNoise(const vec3& pos) {
    return GetNoise(pos.x, pos.y, pos.z);
}

void DomainWarpedNoise::SetSeed(int seed) {
    m_seed = seed;
    if (m_baseNoise) {
        m_baseNoise->SetSeed(seed);
    }
    // TODO: Update warping noise seeds
}

void DomainWarpedNoise::SetFrequency(float freq) {
    m_frequency = std::max(0.001f, freq);
    if (m_baseNoise) {
        m_baseNoise->SetFrequency(freq);
    }
}

void DomainWarpedNoise::SetOctaves(int octaves) {
    m_octaves = std::max(1, octaves);
    if (m_baseNoise) {
        m_baseNoise->SetOctaves(octaves);
    }
}

void DomainWarpedNoise::SetWarpParameters(const WarpParameters& params) {
    m_warpParams = params;
    
    // Update warping noise parameters
    m_warpNoiseX->SetPersistence(params.warpPersistence);
    m_warpNoiseX->SetLacunarity(params.warpLacunarity);
    m_warpNoiseX->SetOctaves(params.warpOctaves);
    
    m_warpNoiseY->SetPersistence(params.warpPersistence);
    m_warpNoiseY->SetLacunarity(params.warpLacunarity);
    m_warpNoiseY->SetOctaves(params.warpOctaves);
    
    m_warpNoiseZ->SetPersistence(params.warpPersistence);
    m_warpNoiseZ->SetLacunarity(params.warpLacunarity);
    m_warpNoiseZ->SetOctaves(params.warpOctaves);
}

void DomainWarpedNoise::SetBaseNoise(std::unique_ptr<INoiseGenerator> baseNoise) {
    m_baseNoise = std::move(baseNoise);
}

vec3 DomainWarpedNoise::ComputeWarpOffset(float x, float y, float z) const {
    return ComputeWarpOffset(vec3(x, y, z));
}

vec3 DomainWarpedNoise::ComputeWarpOffset(const vec3& pos) const {
    if (m_enableMultiLevel) {
        return ApplyMultiLevelWarping(pos, m_warpLevels);
    }
    
    // Compute basic warp
    vec3 basicWarp = ComputeBasicWarp(pos.x, pos.y, pos.z);
    
    // Add rotational warping if enabled
    if (m_warpParams.enableRotation) {
        basicWarp += ComputeRotationalWarp(pos.x, pos.y, pos.z);
    }
    
    // Add turbulence if enabled
    if (m_warpParams.enableTurbulence) {
        basicWarp += ComputeTurbulenceWarp(pos.x, pos.y, pos.z);
    }
    
    return basicWarp;
}

void DomainWarpedNoise::EnableMultiLevelWarping(bool enable, int levels) {
    m_enableMultiLevel = enable;
    m_warpLevels = std::max(1, levels);
}

vec3 DomainWarpedNoise::ComputeBasicWarp(float x, float y, float z) const {
    float warpFreq = m_warpParams.warpFrequency * m_frequency;
    
    float warpX = m_warpNoiseX->GetNoise(x * warpFreq, y * warpFreq, z * warpFreq);
    float warpY = m_warpNoiseY->GetNoise(
        (x + 100.0f) * warpFreq, 
        (y + 100.0f) * warpFreq, 
        (z + 100.0f) * warpFreq
    );
    float warpZ = m_warpNoiseZ->GetNoise(
        (x + 200.0f) * warpFreq, 
        (y + 200.0f) * warpFreq, 
        (z + 200.0f) * warpFreq
    );
    
    return vec3(warpX, warpY, warpZ) * m_warpParams.warpStrength;
}

vec3 DomainWarpedNoise::ComputeRotationalWarp(float x, float y, float z) const {
    float rotFreq = m_warpParams.warpFrequency * m_frequency * 0.5f;
    float rotationAmount = m_rotationNoise->GetNoise(x * rotFreq, y * rotFreq, z * rotFreq);
    rotationAmount *= m_warpParams.rotationStrength;
    
    // Apply rotation around the Z axis
    float cosRot = std::cos(rotationAmount);
    float sinRot = std::sin(rotationAmount);
    
    float newX = x * cosRot - y * sinRot;
    float newY = x * sinRot + y * cosRot;
    
    return vec3(newX - x, newY - y, 0.0f);
}

vec3 DomainWarpedNoise::ComputeTurbulenceWarp(float x, float y, float z) const {
    float turbFreq = m_warpParams.warpFrequency * m_frequency * 2.0f;
    
    float turbX = m_turbulenceNoise->GetNoise(x * turbFreq, y * turbFreq, z * turbFreq);
    float turbY = m_turbulenceNoise->GetNoise(
        (x + 300.0f) * turbFreq, 
        (y + 300.0f) * turbFreq, 
        (z + 300.0f) * turbFreq
    );
    float turbZ = m_turbulenceNoise->GetNoise(
        (x + 400.0f) * turbFreq, 
        (y + 400.0f) * turbFreq, 
        (z + 400.0f) * turbFreq
    );
    
    return vec3(turbX, turbY, turbZ) * m_warpParams.turbulenceStrength;
}

vec3 DomainWarpedNoise::ApplyMultiLevelWarping(const vec3& pos, int level) const {
    if (level <= 0) return vec3(0.0f);
    
    // Compute warp for this level
    vec3 currentWarp = ComputeBasicWarp(pos.x, pos.y, pos.z);
    
    // Scale warp strength for this level
    float levelScale = 1.0f / (1.0f + level * 0.5f);
    currentWarp *= levelScale;
    
    // Recursively apply warping at the next level
    vec3 warpedPos = pos + currentWarp;
    vec3 nextLevelWarp = ApplyMultiLevelWarping(warpedPos, level - 1);
    
    return currentWarp + nextLevelWarp * 0.5f;
}

// Factory implementations
std::unique_ptr<DomainWarpedNoise> DomainWarpedNoiseFactory::CreateWarpedSimplex(
    int seed, float frequency, int octaves, float warpStrength) {
    
    auto baseNoise = std::make_unique<SimpleNoiseWrapper>(seed, frequency, octaves);
    auto warpedNoise = std::make_unique<DomainWarpedNoise>(std::move(baseNoise), seed, frequency, octaves);
    
    DomainWarpedNoise::WarpParameters params;
    params.warpStrength = warpStrength;
    warpedNoise->SetWarpParameters(params);
    
    return warpedNoise;
}

std::unique_ptr<DomainWarpedNoise> DomainWarpedNoiseFactory::CreateWarpedWorley(
    int seed, float frequency, int octaves, float warpStrength) {
    
    auto baseNoise = std::make_unique<WorleyNoise>(seed, frequency, octaves);
    auto warpedNoise = std::make_unique<DomainWarpedNoise>(std::move(baseNoise), seed, frequency, octaves);
    
    DomainWarpedNoise::WarpParameters params;
    params.warpStrength = warpStrength;
    warpedNoise->SetWarpParameters(params);
    
    return warpedNoise;
}

std::unique_ptr<DomainWarpedNoise> DomainWarpedNoiseFactory::CreateFlowNoise(
    int seed, float frequency, int octaves, float flowStrength) {
    
    auto baseNoise = std::make_unique<SimpleNoiseWrapper>(seed, frequency, octaves);
    auto flowNoise = std::make_unique<DomainWarpedNoise>(std::move(baseNoise), seed, frequency, octaves);
    
    DomainWarpedNoise::WarpParameters params;
    params.warpStrength = flowStrength;
    params.enableRotation = true;
    params.rotationStrength = flowStrength * 0.5f;
    params.enableTurbulence = true;
    params.turbulenceStrength = flowStrength * 0.3f;
    flowNoise->SetWarpParameters(params);
    
    // Enable multi-level warping for more complex flow patterns
    flowNoise->EnableMultiLevelWarping(true, 2);
    
    return flowNoise;
}

}  // namespace PlanetGen::Rendering::Noise 
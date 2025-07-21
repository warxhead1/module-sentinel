module;
#define GLM_FORCE_RADIANS
#define GLM_FORCE_DEPTH_ZERO_TO_ONE

// Define M_PI if not already defined
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#include <memory>
#include <cmath>
#include <algorithm>
#include <vector>
#include <random>

#include <limits>

module StarFieldNoise;

import GLMModule;
import WorleyNoise;

namespace PlanetGen::Rendering::Noise {

StarFieldNoise::StarFieldNoise(int seed, float frequency, int octaves)
    : m_seed(seed),
      m_frequency(frequency),
      m_octaves(std::max(1, octaves)),
      m_rng(seed),
      m_uniform01(0.0f, 1.0f) {
    
    // Initialize default star parameters
    m_starParams = StarParameters{};
    
    // Create noise generators for different stellar phenomena
    m_starNoise = std::make_unique<WorleyNoise>(seed, frequency, 1);
    m_clusterNoise = std::make_unique<WorleyNoise>(seed + 1, frequency * 0.3f, 1);
    m_nebulaNoiseA = std::make_unique<WorleyNoise>(seed + 2, frequency * 0.1f, 2);
    m_nebulaNoiseB = std::make_unique<WorleyNoise>(seed + 3, frequency * 0.15f, 2);
    m_brightnessNoise = std::make_unique<WorleyNoise>(seed + 4, frequency * 2.0f, 1);
}

float StarFieldNoise::GetNoise(float x, float y, float z) {
    return ComputeStarDensity(x, y, z);
}

float StarFieldNoise::GetNoise(const vec3& pos) {
    return GetNoise(pos.x, pos.y, pos.z);
}

void StarFieldNoise::SetSeed(int seed) {
    m_seed = seed;
    m_rng.seed(seed);
    
    // Update all noise generators with new seeds
    m_starNoise->SetSeed(seed);
    m_clusterNoise->SetSeed(seed + 1);
    m_nebulaNoiseA->SetSeed(seed + 2);
    m_nebulaNoiseB->SetSeed(seed + 3);
    m_brightnessNoise->SetSeed(seed + 4);
}

void StarFieldNoise::SetFrequency(float freq) {
    m_frequency = std::max(0.001f, freq);
    
    // Update frequencies for all noise generators
    m_starNoise->SetFrequency(freq);
    m_clusterNoise->SetFrequency(freq * 0.3f);
    m_nebulaNoiseA->SetFrequency(freq * 0.1f);
    m_nebulaNoiseB->SetFrequency(freq * 0.15f);
    m_brightnessNoise->SetFrequency(freq * 2.0f);
}

void StarFieldNoise::SetOctaves(int octaves) {
    m_octaves = std::max(1, octaves);
}

void StarFieldNoise::SetStarParameters(const StarParameters& params) {
    m_starParams = params;
}

StarFieldNoise::StarData StarFieldNoise::GetStarData(float x, float y, float z) const {
    StarData data{};
    
    // Compute base star density
    float density = ComputeStarDensity(x, y, z);
    
    // Calculate brightness with variation
    float brightnessBase = m_brightnessNoise->GetNoise(x, y, z);
    data.brightness = std::clamp(
        (brightnessBase + 1.0f) * 0.5f * m_starParams.brightnessFactor,
        0.0f, 1.0f
    );
    
    // Calculate color temperature variation
    data.colorTemp = std::clamp(
        0.5f + m_starParams.colorVariation * brightnessBase,
        0.0f, 1.0f
    );
    
    // Calculate nebula influence
    data.nebulaInfluence = ComputeNebulaEffect(x, y, z);
    
    // Determine if this is a binary star system (random chance based on position)
    uint32_t hash = static_cast<uint32_t>((x + y * 73856093.0f + z * 19349663.0f) * 83492791.0f);
    data.isBinaryStar = (hash % 100) < 15; // 15% chance of binary system
    
    return data;
}

StarFieldNoise::StarData StarFieldNoise::GetStarData(const vec3& pos) const {
    return GetStarData(pos.x, pos.y, pos.z);
}

std::vector<vec3> StarFieldNoise::GenerateStarPositions(
    const vec3& region, 
    const vec3& size, 
    int maxStars) const {
    
    std::vector<vec3> positions;
    positions.reserve(maxStars);
    
    // Sample points across the region
    int samples = static_cast<int>(std::sqrt(maxStars)) + 1;
    float stepX = size.x / samples;
    float stepY = size.y / samples;
    float stepZ = size.z / samples;
    
    for (int x = 0; x < samples && positions.size() < maxStars; ++x) {
        for (int y = 0; y < samples && positions.size() < maxStars; ++y) {
            for (int z = 0; z < samples && positions.size() < maxStars; ++z) {
                vec3 pos = region + vec3(x * stepX, y * stepY, z * stepZ);
                
                float density = ComputeStarDensity(pos.x, pos.y, pos.z);
                
                if (ShouldGenerateStar(density, pos.x, pos.y, pos.z)) {
                    // Add some random offset within the cell
                    pos += vec3(
                        (m_uniform01(m_rng) - 0.5f) * stepX,
                        (m_uniform01(m_rng) - 0.5f) * stepY,
                        (m_uniform01(m_rng) - 0.5f) * stepZ
                    );
                    positions.push_back(pos);
                }
            }
        }
    }
    
    return positions;
}

float StarFieldNoise::ComputeStarDensity(float x, float y, float z) const {
    // Base star distribution using Worley noise
    float baseDensity = m_starNoise->GetNoise(x, y, z);
    
    // Apply clustering effects
    float clustering = ComputeClusteringEffect(x, y, z);
    
    // Apply spiral galaxy influence if enabled
    float spiralInfluence = 1.0f;
    if (m_starParams.spiralInfluence > 0.0f) {
        spiralInfluence = ComputeSpiralInfluence(x, y);
    }
    
    // Combine all effects
    float density = baseDensity * clustering * spiralInfluence;
    
    // Apply base star density scaling
    density *= m_starParams.starDensity;
    
    return std::clamp(density, 0.0f, 1.0f);
}

float StarFieldNoise::ComputeNebulaEffect(float x, float y, float z) const {
    if (m_starParams.nebulaDensity <= 0.0f) return 0.0f;
    
    // Combine two noise layers for more complex nebula patterns
    float nebulaA = m_nebulaNoiseA->GetNoise(x, y, z);
    float nebulaB = m_nebulaNoiseB->GetNoise(x, y, z);
    
    float nebula = (nebulaA + nebulaB * 0.5f) * m_starParams.nebulaDensity;
    
    return std::clamp(nebula, 0.0f, 1.0f);
}

float StarFieldNoise::ComputeSpiralInfluence(float x, float y) const {
    // Convert to polar coordinates centered on spiral center
    float dx = x - m_starParams.spiralCenter.x;
    float dy = y - m_starParams.spiralCenter.y;
    float radius = std::sqrt(dx * dx + dy * dy);
    float angle = std::atan2(dy, dx);
    
    // Calculate spiral arm positions
    float armSpacing = 2.0f * static_cast<float>(M_PI) / m_starParams.numSpiralArms;
    float minDistance = std::numeric_limits<float>::max();
    
    for (int arm = 0; arm < m_starParams.numSpiralArms; ++arm) {
        float armAngle = arm * armSpacing + radius * m_starParams.spiralTightness;
        float angleDiff = std::abs(angle - armAngle);
        
        // Handle wrap-around
        angleDiff = std::min(angleDiff, 2.0f * static_cast<float>(M_PI) - angleDiff);
        
        minDistance = std::min(minDistance, angleDiff);
    }
    
    // Convert distance to influence (closer to spiral arm = higher influence)
    float influence = 1.0f - std::clamp(minDistance / (static_cast<float>(M_PI) * 0.5f), 0.0f, 1.0f);
    
    return 1.0f + m_starParams.spiralInfluence * influence;
}

float StarFieldNoise::ComputeClusteringEffect(float x, float y, float z) const {
    if (m_starParams.clusterFactor <= 0.0f) return 1.0f;
    
    float clustering = m_clusterNoise->GetNoise(x, y, z);
    clustering = (clustering + 1.0f) * 0.5f; // Normalize to 0-1
    
    // Apply clustering factor
    return 1.0f + m_starParams.clusterFactor * clustering;
}

bool StarFieldNoise::ShouldGenerateStar(float density, float x, float y, float z) const {
    // Use density as probability threshold
    uint32_t hash = static_cast<uint32_t>((x + y * 73856093.0f + z * 19349663.0f) * 83492791.0f);
    float random = static_cast<float>(hash % 10000) / 10000.0f;
    
    return random < density;
}

}  // namespace PlanetGen::Rendering::Noise 
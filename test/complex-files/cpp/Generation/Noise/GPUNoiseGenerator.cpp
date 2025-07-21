module;
#include <iostream>
#include <stdexcept>
#include <vector>
#include <glm/glm.hpp>

module GPUNoiseGenerator;

import VulkanNoiseGenerator;
import NoiseTypes;

namespace PlanetGen::Rendering::Noise {

GPUNoiseGenerator::GPUNoiseGenerator(PlanetGen::Rendering::VulkanNoiseGenerator* gpuGenerator, NoiseType type)
    : m_gpuGenerator(gpuGenerator), m_noiseType(type) {
    if (!m_gpuGenerator) {
        throw std::invalid_argument("VulkanNoiseGenerator cannot be null.");
    }
    m_params.type = type;
}

float GPUNoiseGenerator::GetNoise(float x, float y, float z) {
    return GetNoise({x, y, z});
}

float GPUNoiseGenerator::GetNoise(const glm::vec3& pos) {
    std::vector<float> result(1);
    GenerateNoiseMap(result.data(), 1, 1, 1, pos);
    return result[0];
}

void GPUNoiseGenerator::SetSeed(int seed) {
    m_params.seed = seed;
}

void GPUNoiseGenerator::SetFrequency(float freq) {
    m_params.frequency = freq;
}

void GPUNoiseGenerator::SetOctaves(int octaves) {
    m_params.octaves = octaves;
}

NoiseType GPUNoiseGenerator::GetNoiseType() const {
    return m_noiseType;
}

std::vector<float> GPUNoiseGenerator::SampleBatch(const std::vector<glm::vec3>& positions) const {
    std::vector<float> results;
    results.reserve(positions.size());
    
    for (const auto& pos : positions) {
        results.push_back(const_cast<GPUNoiseGenerator*>(this)->GetNoise(pos));
    }
    
    return results;
}

bool GPUNoiseGenerator::GeneratePlanetaryElevation(const std::vector<glm::vec3>& sphericalCoords,
                                                   const std::vector<std::pair<int, float>>& noiseLayers,
                                                   float worldScale, float seaLevel, float elevationScale,
                                                   std::vector<float>& outElevation) {
    if (!m_gpuGenerator) {
        return false;
    }
    
    // Convert to coordinate pairs for existing GPU method
    std::vector<std::pair<float, float>> coordinates;
    coordinates.reserve(sphericalCoords.size());
    for (const auto& coord : sphericalCoords) {
        coordinates.emplace_back(coord.x, coord.y);
    }
    
    // Convert noise layers to SimpleNoiseLayer format
    std::vector<PlanetGen::Rendering::Noise::SimpleNoiseLayer> layers;
    for (const auto& [noiseTypeInt, amplitude] : noiseLayers) {
        PlanetGen::Rendering::Noise::SimpleNoiseLayer layer;
        layer.type = static_cast<NoiseType>(noiseTypeInt);
        layer.amplitude = amplitude;
        layer.frequency = m_params.frequency;
        layer.octaves = m_params.octaves;
        layer.persistence = m_params.persistence;
        layer.lacunarity = m_params.lacunarity;
        layer.seed = m_params.seed;
        layers.push_back(layer);
    }
    
    return m_gpuGenerator->GeneratePlanetaryElevation(coordinates, layers, worldScale, seaLevel, elevationScale, outElevation);
}

void GPUNoiseGenerator::GenerateNoiseMap(float* data, int width, int height, int depth, const glm::vec3& offset) {
    if (!m_gpuGenerator) {
        std::cerr << "GPU Noise Generator is not valid. Cannot generate noise map." << std::endl;
        return;
    }

    // Use the stored parameters, but override the offset for this specific call
    GPUNoiseParameters currentParams = m_params;
    currentParams.offset = offset;
    
    // Use 2D or 3D based on depth parameter
    if (depth > 1) {
        m_gpuGenerator->GenerateNoise3D(currentParams, data, width, height, depth);
    } else {
        m_gpuGenerator->GenerateNoise2D(currentParams, data, width, height);
    }
}

} 
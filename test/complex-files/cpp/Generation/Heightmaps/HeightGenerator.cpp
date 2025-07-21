module;

#include <algorithm>
#include <cmath>
#include <stdexcept>

module HeightGenerator;

import NoiseTypes;
import IGPUNoiseAccelerator;

namespace PlanetGen::Generation {

HeightGenerator::HeightGenerator(std::shared_ptr<IGPUNoiseAccelerator> noiseAccelerator)
    : m_noiseAccelerator(std::move(noiseAccelerator)) {
    if (!m_noiseAccelerator) {
        throw std::runtime_error("HeightGenerator: noiseAccelerator cannot be null");
    }
}

bool HeightGenerator::GenerateHeightmap(
    uint32_t width, 
    uint32_t height,
    const std::vector<PlanetGen::Rendering::Noise::SimpleNoiseLayer>& layers,
    float worldScale,
    float seaLevel,
    std::vector<float>& outHeights) {
    
    if (!ValidateParameters(width, height, layers)) {
        return false;
    }

    // Prepare coordinates for the heightmap
    std::vector<std::pair<float, float>> coordinates;
    coordinates.reserve(width * height);
    
    for (uint32_t y = 0; y < height; ++y) {
        for (uint32_t x = 0; x < width; ++x) {
            float u = static_cast<float>(x) / static_cast<float>(width - 1);
            float v = static_cast<float>(y) / static_cast<float>(height - 1);
            coordinates.emplace_back(u * worldScale, v * worldScale);
        }
    }

    // Generate using GPU noise accelerator
    outHeights.resize(width * height);
    bool success = m_noiseAccelerator->GeneratePlanetaryElevation(
        coordinates, layers, worldScale, seaLevel, 1.0f, outHeights);

    if (success) {
        ApplySeaLevel(outHeights, seaLevel);
    }

    return success;
}

bool HeightGenerator::GeneratePlanetaryElevation(
    const std::vector<std::pair<float, float>>& coordinates,
    const std::vector<PlanetGen::Rendering::Noise::SimpleNoiseLayer>& layers,
    float worldScale,
    float seaLevel,
    float elevationScale,
    std::vector<float>& outElevation) {
    
    if (layers.empty() || coordinates.empty()) {
        return false;
    }

    // Direct pass-through to GPU noise accelerator
    bool success = m_noiseAccelerator->GeneratePlanetaryElevation(
        coordinates, layers, worldScale, seaLevel, elevationScale, outElevation);

    if (success && elevationScale != 1.0f) {
        ApplyElevationScale(outElevation, elevationScale);
    }

    return success;
}

bool HeightGenerator::GenerateMultiScaleTerrain(
    uint32_t width,
    uint32_t height,
    const std::vector<PlanetGen::Rendering::Noise::SimpleNoiseLayer>& layers,
    float baseScale,
    uint32_t numOctaves,
    std::vector<float>& outHeights) {
    
    if (!ValidateParameters(width, height, layers)) {
        return false;
    }

    // Create multi-scale layers
    std::vector<PlanetGen::Rendering::Noise::SimpleNoiseLayer> multiScaleLayers;
    multiScaleLayers.reserve(numOctaves);
    
    for (uint32_t octave = 0; octave < numOctaves; ++octave) {
        for (const auto& baseLayer : layers) {
            auto layer = baseLayer;
            layer.frequency *= std::pow(2.0f, static_cast<float>(octave));
            layer.amplitude *= std::pow(0.5f, static_cast<float>(octave));
            multiScaleLayers.push_back(layer);
        }
    }

    // Generate using the multi-scale layers
    return GenerateHeightmap(width, height, multiScaleLayers, baseScale, 0.0f, outHeights);
}

bool HeightGenerator::ValidateParameters(
    uint32_t width, 
    uint32_t height, 
    const std::vector<PlanetGen::Rendering::Noise::SimpleNoiseLayer>& layers) {
    
    if (width == 0 || height == 0) {
        return false;
    }
    
    if (layers.empty()) {
        return false;
    }
    
    if (!m_noiseAccelerator || !m_noiseAccelerator->IsInitialized()) {
        return false;
    }
    
    return true;
}

void HeightGenerator::ApplySeaLevel(std::vector<float>& heights, float seaLevel) {
    for (auto& height : heights) {
        height = std::max(height, seaLevel);
    }
}

void HeightGenerator::ApplyElevationScale(std::vector<float>& heights, float scale) {
    for (auto& height : heights) {
        height *= scale;
    }
}

} // namespace PlanetGen::Generation
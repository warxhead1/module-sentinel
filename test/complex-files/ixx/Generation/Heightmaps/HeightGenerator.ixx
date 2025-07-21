module;

#include <vector>
#include <memory>
#include <utility>

export module HeightGenerator;

import NoiseTypes;
import IGPUNoiseAccelerator;
import GLMModule;

export namespace PlanetGen::Generation {

/**
 * @brief GPU-based height generation using VulkanNoiseGenerator
 * 
 * This is the consolidated height generation system that replaces all the old
 * heightmap generators. It uses VulkanNoiseGenerator for all noise operations
 * and provides a clean, high-level interface for terrain generation.
 */
class HeightGenerator {
public:
    HeightGenerator(std::shared_ptr<IGPUNoiseAccelerator> noiseAccelerator);
    ~HeightGenerator() = default;

    // High-level terrain generation
    bool GenerateHeightmap(
        uint32_t width, 
        uint32_t height,
        const std::vector<PlanetGen::Rendering::Noise::SimpleNoiseLayer>& layers,
        float worldScale,
        float seaLevel,
        std::vector<float>& outHeights);

    // Planetary elevation generation
    bool GeneratePlanetaryElevation(
        const std::vector<std::pair<float, float>>& coordinates,
        const std::vector<PlanetGen::Rendering::Noise::SimpleNoiseLayer>& layers,
        float worldScale,
        float seaLevel,
        float elevationScale,
        std::vector<float>& outElevation);

    // Multi-scale terrain generation
    bool GenerateMultiScaleTerrain(
        uint32_t width,
        uint32_t height,
        const std::vector<PlanetGen::Rendering::Noise::SimpleNoiseLayer>& layers,
        float baseScale,
        uint32_t numOctaves,
        std::vector<float>& outHeights);

private:
    std::shared_ptr<IGPUNoiseAccelerator> m_noiseAccelerator;
    
    // Helper methods
    bool ValidateParameters(uint32_t width, uint32_t height, const std::vector<PlanetGen::Rendering::Noise::SimpleNoiseLayer>& layers);
    void ApplySeaLevel(std::vector<float>& heights, float seaLevel);
    void ApplyElevationScale(std::vector<float>& heights, float scale);
};

} // namespace PlanetGen::Generation
module;

#include <memory>
#include <glm/glm.hpp>

export module GPUNoiseGenerator;

import NoiseInterface;
import NoiseTypes;
import VulkanNoiseGenerator;
import INoiseProvider;

export namespace PlanetGen::Rendering::Noise {

class GPUNoiseGenerator : public INoiseGenerator, public PlanetGen::Generation::INoiseProvider {
public:
    GPUNoiseGenerator(PlanetGen::Rendering::VulkanNoiseGenerator* gpuGenerator, NoiseType type);
    ~GPUNoiseGenerator() override = default;

    // Core noise evaluation - implement the actual interface
    float GetNoise(float x, float y, float z) override;
    float GetNoise(const glm::vec3& pos) override;

    // Parameter control - implement the interface
    void SetSeed(int seed) override;
    void SetFrequency(float freq) override;
    void SetOctaves(int octaves) override;

    // Type information
    NoiseType GetNoiseType() const override;
    
    // INoiseProvider interface - map to existing methods
    float Sample(const glm::vec3& position) const override { return const_cast<GPUNoiseGenerator*>(this)->GetNoise(position); }
    float Sample2D(const glm::vec2& position) const override { return const_cast<GPUNoiseGenerator*>(this)->GetNoise(glm::vec3(position, 0.0f)); }
    std::vector<float> SampleBatch(const std::vector<glm::vec3>& positions) const override;
    
    // Parameter control (already implemented for INoiseGenerator)
    void SetAmplitude(float amplitude) override { m_params.amplitude = amplitude; }
    void SetPersistence(float persistence) override { m_params.persistence = persistence; }
    void SetLacunarity(float lacunarity) override { m_params.lacunarity = lacunarity; }
    
    // State queries
    int GetSeed() const override { return m_params.seed; }
    float GetFrequency() const override { return m_params.frequency; }
    float GetAmplitude() const override { return m_params.amplitude; }
    int GetOctaves() const override { return m_params.octaves; }
    float GetPersistence() const override { return m_params.persistence; }
    float GetLacunarity() const override { return m_params.lacunarity; }
    
    // GPU capabilities (duh, it's a GPU noise generator!)
    bool SupportsGPU() const override { return true; }
    bool IsGPUAvailable() const override { return true; }
    bool GeneratePlanetaryElevation(const std::vector<glm::vec3>& sphericalCoords,
                                   const std::vector<std::pair<int, float>>& noiseLayers,
                                   float worldScale, float seaLevel, float elevationScale,
                                   std::vector<float>& outElevation) override;

private:
    // This is an internal helper, not part of the public interface
    void GenerateNoiseMap(float* data, int width, int height, int depth, const glm::vec3& offset);

    PlanetGen::Rendering::VulkanNoiseGenerator* m_gpuGenerator = nullptr;
    NoiseType m_noiseType;
    GPUNoiseParameters m_params;
};

}
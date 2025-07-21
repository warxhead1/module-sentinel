module;

#include <glm/glm.hpp>
#include <memory>
#include <vector>

#include <utility>
export module INoiseProvider;

export namespace PlanetGen::Generation {

// Pure interface for noise generation - breaks circular dependencies
class INoiseProvider {
public:
    virtual ~INoiseProvider() = default;
    
    // Core noise sampling
    virtual float Sample(const glm::vec3& position) const = 0;
    virtual float Sample2D(const glm::vec2& position) const = 0;
    
    // Batch operations
    virtual std::vector<float> SampleBatch(const std::vector<glm::vec3>& positions) const = 0;
    
    // Configuration
    virtual void SetSeed(int seed) = 0;
    virtual void SetFrequency(float frequency) = 0;
    virtual void SetAmplitude(float amplitude) = 0;
    virtual void SetOctaves(int octaves) = 0;
    virtual void SetPersistence(float persistence) = 0;
    virtual void SetLacunarity(float lacunarity) = 0;
    
    // State queries
    virtual int GetSeed() const = 0;
    virtual float GetFrequency() const = 0;
    virtual float GetAmplitude() const = 0;
    virtual int GetOctaves() const = 0;
    virtual float GetPersistence() const = 0;
    virtual float GetLacunarity() const = 0;
    
    // GPU capabilities
    virtual bool SupportsGPU() const = 0;
    virtual bool IsGPUAvailable() const = 0;
    
    // GPU planetary generation
    virtual bool GeneratePlanetaryElevation(
        const std::vector<glm::vec3>& sphericalCoords,
        const std::vector<std::pair<int, float>>& noiseLayers, // NoiseType as int, amplitude
        float worldScale,
        float seaLevel,
        float elevationScale,
        std::vector<float>& outElevation) = 0;
};

} // namespace PlanetGen::Generation
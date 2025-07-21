module;

#include <memory>
#include <cmath>

export module VolcanicNoise;
import GLMModule;
import NoiseInterface;
import RidgedNoise;
import SimpleNoiseWrapper;

export namespace PlanetGen::Rendering::Noise {

/**
 * @brief Volcanic noise generator creates sharp, volcanic terrain patterns
 * 
 * Volcanic noise combines ridged noise with additional turbulence to create
 * sharp peaks, calderas, and volcanic terrain features. It's particularly
 * useful for creating mountainous volcanic landscapes.
 */
class VolcanicNoise : public INoiseGenerator {
public:
    VolcanicNoise(int seed = 1337, float frequency = 0.01f, int octaves = 4);
    ~VolcanicNoise() override = default;

    // INoiseGenerator interface
    float GetNoise(float x, float y, float z) override;
    float GetNoise(const vec3& pos) override;
    void SetSeed(int seed) override;
    void SetFrequency(float freq) override;
    void SetOctaves(int octaves) override;
    NoiseType GetNoiseType() const override { return NoiseType::VolcanicNoise; }

    // Volcanic-specific settings
    void SetPersistence(float persistence);
    void SetLacunarity(float lacunarity);
    void SetVolcanicIntensity(float intensity) { m_volcanicIntensity = intensity; }
    void SetTurbulenceScale(float scale) { m_turbulenceScale = scale; }

private:
    std::unique_ptr<RidgedNoise> m_ridgedNoise;
    std::unique_ptr<SimpleNoiseWrapper> m_turbulenceNoise;
    float m_volcanicIntensity = 1.2f;
    float m_turbulenceScale = 0.3f;
    int m_seed = 1337;
    
    float ApplyVolcanicTransform(float ridgedValue, float turbulence) const;
};

} // namespace PlanetGen::Rendering::Noise
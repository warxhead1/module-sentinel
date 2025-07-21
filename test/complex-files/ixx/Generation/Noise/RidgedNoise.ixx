module;

#include <memory>
#include <random>

export module RidgedNoise;

import GLMModule;
import NoiseInterface;
import NoiseTypes;
import SimpleNoise;

export namespace PlanetGen::Rendering::Noise {

/**
 * @brief Ridged multi-fractal noise implementation
 * 
 * Generates sharp ridges and valleys suitable for mountain ranges,
 * canyons, and other dramatic terrain features. The ridged pattern
 * is created by taking the absolute value of noise and inverting it.
 */
class RidgedNoise : public INoiseGenerator {
public:
    RidgedNoise(int seed = 1337, float frequency = 0.01f, int octaves = 4);
    ~RidgedNoise() override = default;

    // INoiseGenerator implementation
    float GetNoise(float x, float y, float z) override;
    float GetNoise(const vec3& pos) override;
    void SetSeed(int seed) override;
    void SetFrequency(float freq) override;
    void SetOctaves(int octaves) override;
    NoiseType GetNoiseType() const override { return NoiseType::RidgedNoise; }

    // Ridged noise specific parameters
    void SetPersistence(float persistence);
    void SetLacunarity(float lacunarity);
    void SetRidgeOffset(float offset);
    void SetRidgeGain(float gain);
    void SetRidgeThreshold(float threshold);

    float GetPersistence() const { return m_persistence; }
    float GetLacunarity() const { return m_lacunarity; }
    float GetRidgeOffset() const { return m_ridgeOffset; }
    float GetRidgeGain() const { return m_ridgeGain; }
    float GetRidgeThreshold() const { return m_ridgeThreshold; }

private:
    // Core ridged noise computation
    float ComputeRidgedNoise(float x, float y, float z) const;
    float ApplyRidgeTransform(float noise) const;
    
    // Parameters
    int m_seed;
    float m_frequency;
    int m_octaves;
    float m_persistence;   // How much each octave contributes
    float m_lacunarity;    // Frequency multiplier between octaves
    float m_ridgeOffset;   // Offset for ridge calculation
    float m_ridgeGain;     // Gain for ridge sharpening
    float m_ridgeThreshold; // Threshold for ridge detection
    
    // Base noise generator
    std::unique_ptr<SimpleNoise::NoiseProvider> m_baseNoise;
};

}  // namespace PlanetGen::Rendering::Noise 
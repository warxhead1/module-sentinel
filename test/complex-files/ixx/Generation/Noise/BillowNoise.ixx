module;

#include <memory>
#include <cmath>

export module BillowNoise;
import GLMModule;
import NoiseInterface;
import SimpleNoiseWrapper;

export namespace PlanetGen::Rendering::Noise {

/**
 * @brief Billow noise generator creates puffy, cloud-like patterns
 * 
 * Billow noise is typically created by taking the absolute value of noise
 * and scaling it to create rounded, billowy shapes suitable for clouds,
 * rolling hills, and organic forms.
 */
class BillowNoise : public INoiseGenerator {
public:
    BillowNoise(int seed = 1337, float frequency = 0.01f, int octaves = 4);
    ~BillowNoise() override = default;

    // INoiseGenerator interface
    float GetNoise(float x, float y, float z) override;
    float GetNoise(const vec3& pos) override;
    void SetSeed(int seed) override;
    void SetFrequency(float freq) override;
    void SetOctaves(int octaves) override;
    NoiseType GetNoiseType() const override { return NoiseType::BillowNoise; }

    // Billow-specific settings
    void SetPersistence(float persistence);
    void SetLacunarity(float lacunarity);
    void SetBillowScale(float scale) { m_billowScale = scale; }

private:
    std::unique_ptr<SimpleNoiseWrapper> m_baseNoise;
    float m_billowScale = 1.0f;
    float m_persistence = 0.5f;
    float m_lacunarity = 2.0f;
    int m_octaves = 4;
    
    float ApplyBillowTransform(float value) const;
};

} // namespace PlanetGen::Rendering::Noise
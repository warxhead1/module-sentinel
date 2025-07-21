module;

#include <memory>
#include <random>
#include <vector>

export module StarFieldNoise;

import GLMModule;
import NoiseInterface;
import NoiseTypes;
import WorleyNoise;

export namespace PlanetGen::Rendering::Noise {

/**
 * @brief Star field noise for generating realistic star distributions
 * 
 * Creates star fields with proper density distributions, clustering effects,
 * and brightness variations suitable for space backgrounds and galaxy generation.
 * Uses multiple layers of Worley noise with different parameters to simulate
 * various stellar phenomena.
 */
class StarFieldNoise : public INoiseGenerator {
public:
    /**
     * @brief Star formation parameters
     */
    struct StarParameters {
        float starDensity = 0.1f;        // Base star density (0-1)
        float clusterFactor = 0.3f;      // How much stars cluster (0-1)
        float brightnessFactor = 1.0f;   // Brightness scaling factor
        float colorVariation = 0.2f;     // Color temperature variation
        float nebulaDensity = 0.05f;     // Background nebula density
        float spiralInfluence = 0.0f;    // Spiral galaxy arm influence (0-1)
        vec2 spiralCenter{0.5f, 0.5f}; // Center of spiral if enabled
        float spiralTightness = 2.0f;    // How tight the spiral arms are
        int numSpiralArms = 2;           // Number of spiral arms
    };

    StarFieldNoise(int seed = 1337, float frequency = 0.01f, int octaves = 3);
    ~StarFieldNoise() override = default;

    // INoiseGenerator implementation
    float GetNoise(float x, float y, float z) override;
    float GetNoise(const vec3& pos) override;
    void SetSeed(int seed) override;
    void SetFrequency(float freq) override;
    void SetOctaves(int octaves) override;
    NoiseType GetNoiseType() const override { return NoiseType::StarFieldNoise; }

    // Star field specific methods
    void SetStarParameters(const StarParameters& params);
    const StarParameters& GetStarParameters() const { return m_starParams; }
    
    // Generate star field data with additional information
    struct StarData {
        float brightness;      // Star brightness (0-1)
        float colorTemp;       // Color temperature factor
        float nebulaInfluence; // Background nebula contribution
        bool isBinaryStar;     // Whether this is part of a binary system
    };
    
    StarData GetStarData(float x, float y, float z) const;
    StarData GetStarData(const vec3& pos) const;
    
    // Bulk generation for large star fields
    std::vector<vec3> GenerateStarPositions(const vec3& region, 
                                                 const vec3& size, 
                                                 int maxStars = 10000) const;

private:
    // Core computation methods
    float ComputeStarDensity(float x, float y, float z) const;
    float ComputeNebulaEffect(float x, float y, float z) const;
    float ComputeSpiralInfluence(float x, float y) const;
    float ComputeClusteringEffect(float x, float y, float z) const;
    bool ShouldGenerateStar(float density, float x, float y, float z) const;
    
    // Parameters
    int m_seed;
    float m_frequency;
    int m_octaves;
    StarParameters m_starParams;
    
    // Noise generators for different stellar phenomena
    std::unique_ptr<WorleyNoise> m_starNoise;        // Primary star distribution
    std::unique_ptr<WorleyNoise> m_clusterNoise;     // Star clustering
    std::unique_ptr<WorleyNoise> m_nebulaNoiseA;     // Nebula layer A
    std::unique_ptr<WorleyNoise> m_nebulaNoiseB;     // Nebula layer B
    std::unique_ptr<WorleyNoise> m_brightnessNoise;  // Brightness variation
    
    // Random number generation
    mutable std::mt19937 m_rng;
    mutable std::uniform_real_distribution<float> m_uniform01;
};

}  // namespace PlanetGen::Rendering::Noise 
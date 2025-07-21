module;

#include <memory>

export module DomainWarpedNoise;

import GLMModule;
import NoiseInterface;
import NoiseTypes;
import SimpleNoise;

export namespace PlanetGen::Rendering::Noise {

/**
 * @brief Domain warping noise wrapper
 * 
 * Applies domain warping to any noise function by offsetting the sample
 * coordinates based on other noise functions. This creates more organic,
 * flowing patterns that look less artificial and more natural.
 * 
 * Domain warping is achieved by:
 * noise(x + warpX(x,y,z), y + warpY(x,y,z), z + warpZ(x,y,z))
 * 
 * Where warpX, warpY, warpZ are separate noise functions that distort
 * the sampling coordinates.
 */
class DomainWarpedNoise : public INoiseGenerator {
public:
    /**
     * @brief Domain warping parameters
     */
    struct WarpParameters {
        float warpStrength = 0.1f;      // Overall warping strength
        float warpFrequency = 0.5f;     // Frequency of warping noise
        int warpOctaves = 2;            // Octaves for warping noise
        float warpPersistence = 0.5f;   // Persistence of warping noise
        float warpLacunarity = 2.0f;    // Lacunarity of warping noise
        bool enableRotation = false;    // Enable rotational warping
        float rotationStrength = 0.1f;  // Strength of rotational effect
        bool enableTurbulence = false;  // Enable turbulence effect
        float turbulenceStrength = 0.05f; // Strength of turbulence
    };

    DomainWarpedNoise(std::unique_ptr<INoiseGenerator> baseNoise, 
                      int seed = 1337, 
                      float frequency = 0.01f, 
                      int octaves = 1);
    ~DomainWarpedNoise() override = default;

    // INoiseGenerator implementation
    float GetNoise(float x, float y, float z) override;
    float GetNoise(const vec3& pos) override;
    void SetSeed(int seed) override;
    void SetFrequency(float freq) override;
    void SetOctaves(int octaves) override;
    NoiseType GetNoiseType() const override { 
        return m_baseNoise ? m_baseNoise->GetNoiseType() : NoiseType::SimpleNoise;
    }

    // Domain warping specific methods
    void SetWarpParameters(const WarpParameters& params);
    const WarpParameters& GetWarpParameters() const { return m_warpParams; }
    
    // Set the base noise function to warp
    void SetBaseNoise(std::unique_ptr<INoiseGenerator> baseNoise);
    INoiseGenerator* GetBaseNoise() const { return m_baseNoise.get(); }
    
    // Advanced warping methods
    vec3 ComputeWarpOffset(float x, float y, float z) const;
    vec3 ComputeWarpOffset(const vec3& pos) const;
    
    // Multiple levels of warping (warping the warping)
    void EnableMultiLevelWarping(bool enable, int levels = 2);
    bool IsMultiLevelWarpingEnabled() const { return m_enableMultiLevel; }
    int GetWarpLevels() const { return m_warpLevels; }

private:
    // Core warping computations
    vec3 ComputeBasicWarp(float x, float y, float z) const;
    vec3 ComputeRotationalWarp(float x, float y, float z) const;
    vec3 ComputeTurbulenceWarp(float x, float y, float z) const;
    vec3 ApplyMultiLevelWarping(const vec3& pos, int level) const;
    
    // Parameters
    int m_seed;
    float m_frequency;
    int m_octaves;
    WarpParameters m_warpParams;
    
    // Multi-level warping
    bool m_enableMultiLevel;
    int m_warpLevels;
    
    // Base noise function to warp
    std::unique_ptr<INoiseGenerator> m_baseNoise;
    
    // Warping noise functions
    std::unique_ptr<SimpleNoise::NoiseProvider> m_warpNoiseX;
    std::unique_ptr<SimpleNoise::NoiseProvider> m_warpNoiseY;
    std::unique_ptr<SimpleNoise::NoiseProvider> m_warpNoiseZ;
    std::unique_ptr<SimpleNoise::NoiseProvider> m_rotationNoise;
    std::unique_ptr<SimpleNoise::NoiseProvider> m_turbulenceNoise;
};

/**
 * @brief Factory methods for creating common domain warped noise types
 */
class DomainWarpedNoiseFactory {
public:
    // Create domain warped simplex noise
    static std::unique_ptr<DomainWarpedNoise> CreateWarpedSimplex(
        int seed = 1337, 
        float frequency = 0.01f, 
        int octaves = 4,
        float warpStrength = 0.1f);
    
    // Create domain warped Worley noise
    static std::unique_ptr<DomainWarpedNoise> CreateWarpedWorley(
        int seed = 1337, 
        float frequency = 0.01f, 
        int octaves = 1,
        float warpStrength = 0.1f);
    
    // Create flow noise (specialized warping for fluid-like patterns)
    static std::unique_ptr<DomainWarpedNoise> CreateFlowNoise(
        int seed = 1337, 
        float frequency = 0.01f, 
        int octaves = 3,
        float flowStrength = 0.2f);
};

}  // namespace PlanetGen::Rendering::Noise 
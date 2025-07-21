module;

#include <glm/glm.hpp>
#include <memory>
#include <string>

export module NoiseInterface;

import NoiseTypes;

export namespace PlanetGen::Rendering::Noise {

// Re-export the NoiseType enum from NoiseTypes module
using PlanetGen::Rendering::Noise::NoiseType;

/**
 * @brief Base interface for all noise generators
 */
class INoiseGenerator {
 public:
  virtual ~INoiseGenerator() = default;

  // Core noise evaluation
  virtual float GetNoise(float x, float y, float z) = 0;
  virtual float GetNoise(const glm::vec3& pos) = 0;

  // Parameter control
  virtual void SetSeed(int seed) = 0;
  virtual void SetFrequency(float freq) = 0;
  virtual void SetOctaves(int octaves) = 0;

  // Type information
  virtual NoiseType GetNoiseType() const = 0;
};

    // Pure noise provision interface - NO resource management
    class INoiseProvider {
    public:
        virtual ~INoiseProvider() = default;

        // Noise Generation (PURE responsibility)
        virtual float Sample(const glm::vec3& position) const = 0;
        virtual float Sample(const glm::vec2& position) const = 0;
        virtual float Sample(float x, float y, float z) const = 0;
        
        // Noise Configuration
        virtual void SetSeed(int seed) = 0;
        virtual void SetFrequency(float frequency) = 0;
        virtual void SetAmplitude(float amplitude) = 0;
        virtual void SetOctaves(int octaves) = 0;
        virtual void SetLacunarity(float lacunarity) = 0;
        virtual void SetPersistence(float persistence) = 0;
        
        // Noise Information
        virtual NoiseType GetNoiseType() const = 0;
        virtual std::string GetName() const = 0;
        virtual bool IsGPUAccelerated() const = 0;
        virtual float GetMinValue() const = 0;
        virtual float GetMaxValue() const = 0;
        
        // Performance and Resource Queries (NO resource management)
        virtual bool RequiresGPUContext() const = 0;
        virtual size_t GetMemoryFootprint() const = 0;
        
        // NO GPU resource creation!
        // NO VulkanResourceManager dependencies!
        // Pure noise algorithms only!
    };

    // Pure noise generation service - implements INoiseProvider
    class NoiseGenerationService : public INoiseProvider {
    public:
        NoiseGenerationService() = default;
        ~NoiseGenerationService() override = default;
        
        void Initialize() {
            // Initialize method - generator should be set via SetNoiseType or externally
            // Cannot create directly here due to circular dependency
        }
        
        // INoiseProvider implementation
        float Sample(const glm::vec3& position) const override {
            return m_currentGenerator ? m_currentGenerator->GetNoise(position) * m_amplitude : 0.0f;
        }
        
        float Sample(const glm::vec2& position) const override {
            return m_currentGenerator ? m_currentGenerator->GetNoise(glm::vec3(position, 0.0f)) * m_amplitude : 0.0f;
        }
        
        float Sample(float x, float y, float z) const override {
            return m_currentGenerator ? m_currentGenerator->GetNoise(x, y, z) * m_amplitude : 0.0f;
        }
        
        void SetSeed(int seed) override {
            m_seed = seed;
            if (m_currentGenerator) {
                m_currentGenerator->SetSeed(seed);
            }
        }
        
        void SetFrequency(float frequency) override {
            m_frequency = frequency;
            if (m_currentGenerator) {
                m_currentGenerator->SetFrequency(frequency);
            }
        }
        
        void SetAmplitude(float amplitude) override {
            m_amplitude = amplitude;
            // Amplitude is applied during sampling, not set on the generator
        }
        
        void SetOctaves(int octaves) override {
            m_octaves = octaves;
            if (m_currentGenerator) {
                m_currentGenerator->SetOctaves(octaves);
            }
        }
        
        void SetLacunarity(float lacunarity) override { m_lacunarity = lacunarity; }
        void SetPersistence(float persistence) override { m_persistence = persistence; }
        
        NoiseType GetNoiseType() const override { 
            return m_currentGenerator ? m_currentGenerator->GetNoiseType() : NoiseType::SimpleNoise; 
        }
        
        std::string GetName() const override { return "NoiseGenerationService"; }
        bool IsGPUAccelerated() const override { return false; } // CPU-only service
        float GetMinValue() const override { return -1.0f; }
        float GetMaxValue() const override { return 1.0f; }
        bool RequiresGPUContext() const override { return false; }
        size_t GetMemoryFootprint() const override { return sizeof(*this) + (m_currentGenerator ? 1024 : 0); }
        
        // Service-specific methods
        void SetGenerator(std::unique_ptr<INoiseGenerator> generator) {
            m_currentGenerator = std::move(generator);
            if (m_currentGenerator) {
                m_currentGenerator->SetSeed(m_seed);
                m_currentGenerator->SetFrequency(m_frequency);
                m_currentGenerator->SetOctaves(m_octaves);
            }
        }
        
        INoiseGenerator* GetGenerator() const {
            return m_currentGenerator.get();
        }
        
    private:
        std::unique_ptr<INoiseGenerator> m_currentGenerator;
        int m_seed = 12345;
        float m_frequency = 0.01f;
        float m_amplitude = 1.0f;
        int m_octaves = 4;
        float m_lacunarity = 2.0f;
        float m_persistence = 0.5f;
    };

}  // namespace PlanetGen::Rendering::Noise

module;

#include <memory>
#include <functional>
#include <future>
#include <atomic>

export module PlanetaryGenerator;

import GLMModule;
import GenerationTypes;
import INoiseProvider;

export namespace PlanetGen::Generation {

/**
 * PlanetaryGenerator - SINGLE RESPONSIBILITY: Generate complete planetary dataset
 * 
 * This class follows SOLID principles:
 * - Single Responsibility: Only coordinates planetary data generation
 * - Open/Closed: Extensible through dependency injection
 * - Liskov Substitution: Uses interfaces for all dependencies
 * - Interface Segregation: Uses focused interfaces
 * - Dependency Inversion: Depends on abstractions, not concretions
 */
class PlanetaryGenerator {
public:
    /**
     * Constructor with dependency injection
     * @param noiseProvider Interface for noise generation
     */
    explicit PlanetaryGenerator(INoiseProvider& noiseProvider);
    
    ~PlanetaryGenerator() = default;
    
    // Non-copyable, movable
    PlanetaryGenerator(const PlanetaryGenerator&) = delete;
    PlanetaryGenerator& operator=(const PlanetaryGenerator&) = delete;
    PlanetaryGenerator(PlanetaryGenerator&&) = default;
    PlanetaryGenerator& operator=(PlanetaryGenerator&&) = default;
    
    /**
     * CORE RESPONSIBILITY: Generate complete planetary dataset
     * @param designTemplate Template containing all generation parameters
     * @param resolution Grid resolution for generation
     * @param seed Random seed for reproducibility
     * @return Complete planetary dataset with all modalities
     */
    PlanetaryData GeneratePlanet(const PlanetaryDesignTemplate& designTemplate, 
                                uint32_t resolution, 
                                uint32_t seed = 12345);
    
    /**
     * Async version for non-blocking generation
     * @param designTemplate Template containing all generation parameters
     * @param resolution Grid resolution for generation
     * @param seed Random seed for reproducibility
     * @return Future containing complete planetary dataset
     */
    std::future<PlanetaryData> GeneratePlanetAsync(const PlanetaryDesignTemplate& designTemplate,
                                                  uint32_t resolution, 
                                                  uint32_t seed = 12345);
    
    /**
     * Get current generation progress (0.0 to 1.0)
     * @return Progress value between 0.0 and 1.0
     */
    float GetGenerationProgress() const { return m_progress; }
    
    /**
     * Check if generation is currently in progress
     * @return True if generation is active
     */
    bool IsGenerating() const { return m_isGenerating; }
    
    /**
     * Cancel current generation if in progress
     */
    void CancelGeneration();

private:
    // Dependencies (injected, non-owning)
    INoiseProvider* m_noiseProvider;
    
    // Generation state
    std::atomic<float> m_progress{0.0f};
    std::atomic<bool> m_isGenerating{false};
    std::atomic<bool> m_cancellationRequested{false};
    
    // Generation implementation
    PlanetaryData GeneratePlanetImpl(const PlanetaryDesignTemplate& designTemplate,
                                    uint32_t resolution, 
                                    uint32_t seed);
    
    // Core generation phases
    PlanetaryModality GenerateElevation(const PlanetaryDesignTemplate& designTemplate,
                                       uint32_t resolution, 
                                       uint32_t seed);
    
    PlanetaryModality GenerateTemperature(const PlanetaryDesignTemplate& designTemplate,
                                         const PlanetaryModality& elevation,
                                         uint32_t resolution);
    
    PlanetaryModality GeneratePrecipitation(const PlanetaryDesignTemplate& designTemplate,
                                           const PlanetaryModality& elevation,
                                           const PlanetaryModality& temperature,
                                           uint32_t resolution);
    
    PlanetaryModality GenerateVegetation(const PlanetaryDesignTemplate& designTemplate,
                                        const PlanetaryModality& elevation,
                                        const PlanetaryModality& temperature,
                                        const PlanetaryModality& precipitation,
                                        uint32_t resolution);
    
    // Utility methods
    void UpdateProgress(float progress);
    bool ShouldCancelGeneration() const;
    void ValidateDesignTemplate(const PlanetaryDesignTemplate& designTemplate) const;
    
    // Data assembly
    PlanetaryData AssemblePlanetaryData(const PlanetaryDesignTemplate& designTemplate,
                                       const PlanetaryModality& elevation,
                                       const PlanetaryModality& temperature,
                                       const PlanetaryModality& precipitation,
                                       const PlanetaryModality& vegetation) const;
};

/**
 * Factory for creating PlanetaryGenerator instances with proper dependency injection
 */
class PlanetaryGeneratorFactory {
public:
    /**
     * Create PlanetaryGenerator with injected dependencies
     * @param noiseProvider Noise generation interface
     * @return Unique pointer to configured PlanetaryGenerator
     */
    static std::unique_ptr<PlanetaryGenerator> Create(INoiseProvider& noiseProvider);
};

} // namespace PlanetGen::Generation
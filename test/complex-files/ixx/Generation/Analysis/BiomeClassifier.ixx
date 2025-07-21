module;

#include <vector>
#include <memory>
#include <unordered_map>
#include <functional>

#include <utility>
export module BiomeClassifier;

import GLMModule;
import TerrainAnalysisTypes;

export namespace PlanetGen::Generation::Analysis {

/**
 * Advanced biome classification system with realistic biome types
 * Supports parallel processing and extensible classification algorithms
 */
class BiomeClassifier {
public:
    BiomeClassifier();
    ~BiomeClassifier() = default;
    
    /**
     * Initialize the classifier with biome definitions
     */
    bool Initialize();
    
    /**
     * Classify a single point's biome based on environmental factors
     */
    BiomeType ClassifyPoint(float elevation, float temperature, float precipitation, 
                           float slope, float latitude, float longitude) const;
    
    /**
     * Classify multiple points in parallel using JobSystem
     */
    std::vector<BiomeType> ClassifyPoints(
        const std::vector<float>& elevations,
        const std::vector<float>& temperatures,
        const std::vector<float>& precipitations,
        const std::vector<float>& slopes,
        const std::vector<std::pair<float, float>>& coordinates) const;
    
    /**
     * Get detailed biome analysis for a point including secondary biomes
     */
    TerrainAnalysisPoint AnalyzePoint(float elevation, float temperature, float precipitation,
                                     float slope, float latitude, float longitude, 
                                     const TerrainAnalysisParams& params) const;
    
    /**
     * Analyze multiple points with full terrain analysis
     */
    std::vector<TerrainAnalysisPoint> AnalyzePoints(
        const std::vector<float>& elevations,
        const std::vector<std::pair<float, float>>& coordinates,
        const TerrainAnalysisParams& params) const;
    
    /**
     * Get biome definition for a specific biome type
     */
    const BiomeDefinition& GetBiomeDefinition(BiomeType type) const;
    
    /**
     * Register custom biome definition
     */
    void RegisterBiomeDefinition(const BiomeDefinition& definition);
    
    /**
     * Calculate climate properties for a coordinate
     */
    void CalculateClimate(float latitude, float longitude, float elevation,
                         const TerrainAnalysisParams& params,
                         float& temperature, float& precipitation, float& humidity) const;
    
    /**
     * Calculate slope and aspect from elevation data
     */
    void CalculateTopography(const std::vector<float>& elevations,
                           const std::vector<std::pair<float, float>>& coordinates,
                           uint32_t width, uint32_t height,
                           std::vector<float>& slopes, std::vector<float>& aspects) const;
    
    /**
     * Get biome color based on environmental conditions
     */
    TerrainColor GetBiomeColor(BiomeType primaryBiome, BiomeType secondaryBiome,
                              float blend, const TerrainAnalysisParams& params) const;
    
    /**
     * Set custom classification algorithm
     */
    void SetClassificationAlgorithm(std::function<BiomeType(float, float, float, float, float, float)> algorithm);
    
    /**
     * Enable/disable parallel processing
     */
    void SetParallelProcessing(bool enabled) { m_useParallelProcessing = enabled; }
    
    /**
     * Set chunk size for parallel processing
     */
    void SetChunkSize(uint32_t chunkSize) { m_chunkSize = chunkSize; }
    
    /**
     * Get statistics about biome distribution
     */
    std::unordered_map<BiomeType, uint32_t> GetBiomeStatistics(const std::vector<BiomeType>& biomes) const;
    
private:
    std::unordered_map<BiomeType, BiomeDefinition> m_biomeDefinitions;
    std::function<BiomeType(float, float, float, float, float, float)> m_classificationAlgorithm;
    bool m_useParallelProcessing = true;
    uint32_t m_chunkSize = 1024;
    
    // Default biome definitions
    void InitializeDefaultBiomes();
    
    // Default classification algorithm
    BiomeType DefaultClassificationAlgorithm(float elevation, float temperature, 
                                           float precipitation, float slope,
                                           float latitude, float longitude) const;
    
    // Helper methods
    ClimateZone DetermineClimateZone(float latitude, float temperature, float precipitation) const;
    GeologyType DetermineGeology(float elevation, float slope, BiomeType biome) const;
    float CalculateHabitability(BiomeType biome, float temperature, float precipitation) const;
    float CalculateVegetation(BiomeType biome, float temperature, float precipitation, float elevation) const;
    
    // Calculate smooth transitions between biomes
    std::vector<std::pair<BiomeType, float>> CalculateBiomeTransitions(
        float elevation, float temperature, float precipitation, 
        float slope, float latitude, float longitude) const;
    
    // Parallel processing helpers
    std::vector<TerrainAnalysisPoint> ProcessChunk(
        const std::vector<float>& elevations,
        const std::vector<std::pair<float, float>>& coordinates,
        const TerrainAnalysisParams& params,
        uint32_t startIndex, uint32_t endIndex) const;
};

/**
 * Factory for creating biome classifiers with different configurations
 */
class BiomeClassifierFactory {
public:
    /**
     * Create classifier for Earth-like planets
     */
    static std::unique_ptr<BiomeClassifier> CreateEarthLikeClassifier();
    
    /**
     * Create classifier for Mars-like planets
     */
    static std::unique_ptr<BiomeClassifier> CreateMarsLikeClassifier();
    
    /**
     * Create classifier for arctic/frozen planets
     */
    static std::unique_ptr<BiomeClassifier> CreateArcticClassifier();
    
    /**
     * Create classifier for desert planets
     */
    static std::unique_ptr<BiomeClassifier> CreateDesertClassifier();
    
    /**
     * Create classifier for ocean worlds
     */
    static std::unique_ptr<BiomeClassifier> CreateOceanWorldClassifier();
    
    /**
     * Create classifier for volcanic worlds
     */
    static std::unique_ptr<BiomeClassifier> CreateVolcanicClassifier();
    
    /**
     * Create custom classifier with user-defined biomes
     */
    static std::unique_ptr<BiomeClassifier> CreateCustomClassifier(
        const std::vector<BiomeDefinition>& biomes);
};

} // namespace PlanetGen::Generation::Analysis
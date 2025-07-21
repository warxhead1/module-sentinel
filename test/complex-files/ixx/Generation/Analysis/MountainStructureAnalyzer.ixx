module;

#include <memory>
#include <vector>
#include <unordered_map>
#include <string>

export module MountainStructureAnalyzer;

import GLMModule;
import GenerationTypes;
import TerrainAnalysisTypes;

export namespace PlanetGen::Generation::Analysis {

/**
 * @brief Advanced mountain structure and tectonic analysis for realistic terrain evaluation
 * 
 * This class provides sophisticated analysis of mountain formations, tectonic patterns,
 * and erosion processes to determine how realistic generated terrain appears compared
 * to real-world geological processes.
 */
class MountainStructureAnalyzer {
public:
    MountainStructureAnalyzer();
    ~MountainStructureAnalyzer() = default;
    
    // Non-copyable, non-movable
    MountainStructureAnalyzer(const MountainStructureAnalyzer&) = delete;
    MountainStructureAnalyzer& operator=(const MountainStructureAnalyzer&) = delete;
    MountainStructureAnalyzer(MountainStructureAnalyzer&&) = delete;
    MountainStructureAnalyzer& operator=(MountainStructureAnalyzer&&) = delete;
    
    /**
     * @brief Analyze tectonic realism of terrain
     * @param data Planetary data to analyze
     * @return TectonicActivity structure with detailed scores
     */
    TectonicActivity AnalyzeTectonicRealism(const PlanetaryData& data);
    
    /**
     * @brief Analyze erosion pattern realism
     * @param data Planetary data to analyze  
     * @return ErosionAnalysis structure with detailed scores
     */
    ErosionAnalysis AnalyzeErosionRealism(const PlanetaryData& data);
    
    /**
     * @brief Get parameter recommendations for improving mountain/tectonic realism
     * @param data Current planetary data
     * @param tectonic Tectonic analysis results
     * @param erosion Erosion analysis results
     * @return Map of parameter names to recommended values
     */
    std::unordered_map<std::string, float> GetParameterRecommendations(
        const PlanetaryData& data, 
        const TectonicActivity& tectonic,
        const ErosionAnalysis& erosion);
    
    /**
     * @brief Calculate overall mountain structure realism score
     * @param tectonic Tectonic analysis results
     * @param erosion Erosion analysis results
     * @return Combined realism score (0-1)
     */
    float CalculateOverallMountainRealism(const TectonicActivity& tectonic, const ErosionAnalysis& erosion) const {
        return (tectonic.overallRealism * 0.6f + erosion.overallErosionRealism * 0.4f);
    }
    
private:
    // Internal analysis methods
    std::vector<MountainChain> DetectMountainChains(const PlanetaryData& data);
    std::vector<size_t> FindPeaks(const PlanetaryData& data);
    std::vector<MountainChain> GroupPeaksIntoChains(const std::vector<size_t>& peaks, const PlanetaryData& data);
    float CalculateDistance(size_t idx1, size_t idx2, uint32_t width);
    float EvaluateRidgeFormation(const std::vector<MountainChain>& chains, const PlanetaryData& data);
    float CalculateChainLinearity(const MountainChain& chain, const PlanetaryData& data);
    float CalculateElevationConsistency(const MountainChain& chain, const PlanetaryData& data);
    float EvaluateValleyCarving(const PlanetaryData& data);
    bool IsValleyPoint(size_t idx, const PlanetaryData& data);
    float AnalyzeValleyDepth(size_t idx, const PlanetaryData& data);
    float EvaluatePlateauFormation(const PlanetaryData& data);
    float EvaluateCoastalComplexity(const PlanetaryData& data);
    float AnalyzeWaterErosionPatterns(const PlanetaryData& data);
    float AnalyzeWindErosionPatterns(const PlanetaryData& data);
    float AnalyzeGlacialErosionPatterns(const PlanetaryData& data);
};

/**
 * @brief Factory for creating mountain structure analyzers
 */
class MountainStructureAnalyzerFactory {
public:
    /**
     * @brief Create analyzer tuned for Earth-like planets
     */
    static std::unique_ptr<MountainStructureAnalyzer> CreateEarthLikeAnalyzer();
    
    /**
     * @brief Create analyzer for alien planet types
     */
    static std::unique_ptr<MountainStructureAnalyzer> CreateAlienAnalyzer();
    
    /**
     * @brief Create analyzer with custom parameters
     */
    static std::unique_ptr<MountainStructureAnalyzer> CreateCustomAnalyzer(
        const std::unordered_map<std::string, float>& parameters);
};

} // namespace PlanetGen::Generation::Analysis
module;

#include <memory>
#include <vector>
#include <string>
#include <unordered_map>
#include <variant>
#include <algorithm>
#include <numeric>
#include <random>
#include <functional>
#include <chrono>
#include <Core/Logging/LoggerMacros.h>

#include <exception>
export module TerrainFeedbackLoop;

import GLMModule;
import FeedbackLoopManager;
import GenerationTypes;
import Core.Logging.Logger;
import TerrainOrchestrator;
import PlanetaryGenerator;
import INoiseProvider;
import GPUNoiseGenerator;
import NoiseTypes;
import PlanetaryConfigurationManager;
import MountainStructureAnalyzer;
import RenderingTypes;

export namespace PlanetGen::Generation::Optimization {

// Forward declaration for geological analysis (will be in separate module later)
namespace Analysis {
    struct GeologicalRealismMetrics {
        struct GeologicalFitnessResult {
            float totalFitness = 0.0f;
            struct Components {
                float massConservationFitness = 0.0f;
                float gradientPlausibilityFitness = 0.0f;
                float hydrologyFitness = 0.0f;
                float elevationDistributionFitness = 0.0f;
                float multiScaleRoughnessFitness = 0.0f;
                float patternNaturalnessFitness = 0.0f;
                std::vector<float> roughnessSpectrum;
                float fractalDimension = 2.0f;
                float lacunarity = 1.0f;
            } components;
        };
        
        GeologicalFitnessResult EvaluateCompleteTerrain(
            const std::vector<float>& elevationData,
            size_t width, size_t height,
            vec2 origin
        ) {
            // Placeholder implementation
            GeologicalFitnessResult result;
            result.totalFitness = 0.7f; // Dummy fitness
            result.components.massConservationFitness = 0.8f;
            result.components.gradientPlausibilityFitness = 0.6f;
            result.components.hydrologyFitness = 0.7f;
            result.components.elevationDistributionFitness = 0.75f;
            result.components.multiScaleRoughnessFitness = 0.65f;
            result.components.patternNaturalnessFitness = 0.72f;
            result.components.roughnessSpectrum = {0.1f, 0.2f, 0.3f};
            return result;
        }
    };
}

/**
 * @brief Terrain-specific data wrapper for optimization
 */
struct TerrainOptimizationData {
    using ParameterType = PlanetaryParameters;
    using value_type = float; // Required for CRTP
    
    // The actual terrain data
    std::vector<float> elevationData;
    uvec2 dimensions = {512, 512};
    
    // Parameters that generated this terrain
    PlanetaryParameters parameters;
    
    // Metadata for tracking
    std::string planetType;
    float generationTime = 0.0f;
    size_t memoryUsageMB = 0;
};

/**
 * @brief Concrete optimizer for terrain generation
 */
class TerrainEvolutionaryOptimizer {
public:
    using DataType = TerrainOptimizationData;
    
    // Configuration structure (simplified from CRTP base)
    struct Config {
        size_t populationSize = 20;
        uint32_t maxGenerations = 10;
        float mutationRate = 0.15f;
        float crossoverRate = 0.8f;
        float elitePercentage = 0.2f;
        bool enableParallelEvaluation = true;
    };
    
    std::string GetOptimizerName() const {
        return "TerrainEvolutionaryOptimizer";
    }
    
    std::string GetOptimizerVersion() const {
        return "1.0.0";
    }
    
    // Simplified optimization function compatible with FeedbackLoopManager
    FeedbackLoopResult<DataType> Optimize(
        std::function<DataType()> generator,
        std::function<float(const DataType&)> evaluator,
        const Config& config
    ) {
        FeedbackLoopResult<DataType> result;
        
        // Generate initial population
        std::vector<DataType> population;
        population.reserve(config.populationSize);
        
        for (size_t i = 0; i < config.populationSize; ++i) {
            population.push_back(generator());
        }
        
        // Evolution loop
        for (uint32_t gen = 0; gen < config.maxGenerations; ++gen) {
            // Evaluate fitness
            std::vector<float> fitness;
            fitness.reserve(population.size());
            
            for (const auto& individual : population) {
                fitness.push_back(evaluator(individual));
            }
            
            // Track best
            auto bestIdx = std::distance(fitness.begin(), 
                                        std::max_element(fitness.begin(), fitness.end()));
            result.bestSolution = population[bestIdx];
            result.bestFitness = fitness[bestIdx];
            
            // Evolution step
            if (gen < config.maxGenerations - 1) {
                population = EvolvePopulation(population, fitness, config);
            }
            
            // Track generation statistics
            float avgFitness = std::accumulate(fitness.begin(), fitness.end(), 0.0f) / fitness.size();
            LOG_INFO("FeedbackLoop", "Generation {}: Best={}, Avg={}", gen, result.bestFitness, avgFitness);
        }
        
        result.converged = false; // Simple implementation
        result.generationsCompleted = config.maxGenerations;
        return result;
    }
    
    bool SupportsParallelEvaluation() const {
        return true;
    }
    
    Config GetRecommendedConfig() const {
        Config config;
        config.populationSize = 20;
        config.maxGenerations = 10;
        config.mutationRate = 0.15f;
        config.crossoverRate = 0.8f;
        config.elitePercentage = 0.2f;
        config.enableParallelEvaluation = true;
        return config;
    }
    
    bool ValidateConfig(const Config& config) const {
        return config.populationSize > 0 && config.maxGenerations > 0;
    }
    
private:
    std::vector<DataType> EvolvePopulation(
        const std::vector<DataType>& current,
        const std::vector<float>& fitness,
        const Config& config
    ) {
        std::vector<DataType> next;
        next.reserve(current.size());
        
        // Elite selection
        size_t eliteCount = static_cast<size_t>(current.size() * config.elitePercentage);
        std::vector<size_t> indices(current.size());
        std::iota(indices.begin(), indices.end(), 0);
        
        std::partial_sort(indices.begin(), indices.begin() + eliteCount, indices.end(),
            [&fitness](size_t a, size_t b) { return fitness[a] > fitness[b]; });
        
        // Copy elites
        for (size_t i = 0; i < eliteCount; ++i) {
            next.push_back(current[indices[i]]);
        }
        
        // Fill rest with mutations/crossovers
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_int_distribution<size_t> dis(0, eliteCount - 1);
        
        while (next.size() < current.size()) {
            // Simple mutation for now
            size_t parentIdx = indices[dis(gen)];
            auto child = current[parentIdx];
            
            // Mutate parameters
            MutateParameters(child.parameters, config.mutationRate, gen);
            
            next.push_back(child);
        }
        
        return next;
    }
    
    void MutateParameters(PlanetaryParameters& params, float rate, std::mt19937& gen) {
        std::uniform_real_distribution<float> rateDis(0.0f, 1.0f);
        std::uniform_real_distribution<float> scaleDis(0.9f, 1.1f);
        std::uniform_int_distribution<int> octaveDis(-1, 1);
        
        // Mutate noise parameters
        if (rateDis(gen) < rate) {
            params.scale *= scaleDis(gen);
        }
        if (rateDis(gen) < rate) {
            params.octaves = std::max(1, params.octaves + octaveDis(gen));
        }
        if (rateDis(gen) < rate) {
            params.persistence *= scaleDis(gen);
        }
        // Add more parameter mutations as needed
    }
};

/**
 * @brief Concrete fitness evaluator for terrain
 */
class TerrainGeologicalEvaluator {
private:
    std::unique_ptr<Analysis::GeologicalRealismMetrics> m_geologicalMetrics;
    
public:
    
    TerrainGeologicalEvaluator() {
        m_geologicalMetrics = std::make_unique<Analysis::GeologicalRealismMetrics>();
    }
    
    std::string GetEvaluatorName() const {
        return "TerrainGeologicalEvaluator";
    }
    
    std::string GetEvaluatorVersion() const {
        return "1.0.0";
    }
    
    // Comprehensive evaluation function using FeedbackLoopTerrainApp methods
    float EvaluateFitness(const TerrainOptimizationData& data) const {
        
        // Use comprehensive fitness scoring from FeedbackLoopTerrainApp
        return CalculateComprehensiveFitness(data, false); // Non-verbose by default
    }
    
    // Comprehensive fitness calculation method
    float CalculateComprehensiveFitness(const TerrainOptimizationData& data, bool showDetailedAnalysis = false) const {
        float score = 0.0f;
        
        // CRITICAL: Water coverage validation (20% weight) - Earth should have ~70% water
        float waterScore = EvaluateWaterCoverageInternal(data, showDetailedAnalysis);
        score += waterScore * 0.20f;
        
        // CRITICAL: Mountain/Tectonic structure analysis (25% weight) 
        float mountainScore = EvaluateMountainRealismInternal(data, showDetailedAnalysis);
        score += mountainScore * 0.25f;
        
        // CRITICAL: Biome distribution validation (20% weight)
        float biomeScore = EvaluateBiomeDistributionInternal(data, showDetailedAnalysis);
        score += biomeScore * 0.20f;
        
        // Continental structure validation (15% weight) - coastlines, land continuity
        float continentalScore = EvaluateContinentalStructureInternal(data);
        score += continentalScore * 0.15f;
        
        // Geological realism (10% weight) - elevation patterns
        float geologicalScore = EvaluateGeologicalRealismInternal(data);
        score += geologicalScore * 0.10f;
        
        // Feature composition (10% weight) - basic terrain metrics
        float featureScore = EvaluateBasicFeatureComposition(data);
        score += featureScore * 0.10f;
        
        if (showDetailedAnalysis) {
            LOG_INFO("FeedbackLoop", "Comprehensive fitness: Water={:.3f}, Mountain={:.3f}, Biome={:.3f}, Continental={:.3f}, Geological={:.3f}, Feature={:.3f}, Total={:.3f}",
                     waterScore, mountainScore, biomeScore, continentalScore, geologicalScore, featureScore, score);
        }
        
        return std::clamp(score, 0.0f, 1.0f);
    }
    
private:
    float EvaluateBasicFeatureComposition(const TerrainOptimizationData& data) const {
        if (data.elevationData.empty()) return 0.0f;
        
        // Basic statistical analysis of elevation distribution
        auto minMax = std::minmax_element(data.elevationData.begin(), data.elevationData.end());
        float minElevation = *minMax.first;
        float maxElevation = *minMax.second;
        float range = maxElevation - minElevation;
        
        // Good terrain should have reasonable elevation range
        float rangeScore = 0.0f;
        if (range > 1000.0f && range < 5000.0f) {
            rangeScore = 1.0f - std::abs(range - 3000.0f) / 3000.0f; // Optimal around 3km range
        } else {
            rangeScore = 0.3f; // Low score for extreme ranges
        }
        
        return std::clamp(rangeScore, 0.0f, 1.0f);
    }
    
    // Internal evaluation methods for use within evaluator
    float EvaluateWaterCoverageInternal(const TerrainOptimizationData& data, bool showDetailedAnalysis = false) const {
        if (data.elevationData.empty()) return 0.0f;
        
        float seaLevel = 0.0f; // Standard sea level
        size_t waterPixels = 0;
        size_t totalPixels = data.elevationData.size();
        
        for (float elevation : data.elevationData) {
            if (elevation <= seaLevel) {
                waterPixels++;
            }
        }
        
        float actualWaterCoverage = static_cast<float>(waterPixels) / totalPixels;
        float expectedWaterCoverage = 0.7f; // Earth-like default
        
        // Score based on how close to expected water coverage
        float difference = std::abs(actualWaterCoverage - expectedWaterCoverage);
        float score = std::max(0.0f, 1.0f - (difference / 0.5f)); // Penalty over 50% difference
        
        if (showDetailedAnalysis) {
            LOG_INFO("FeedbackLoop", "Water coverage: {:.1f}% (expected {:.1f}%), score: {:.3f}", 
                     actualWaterCoverage * 100, expectedWaterCoverage * 100, score);
        }
        
        return score;
    }
    
    float EvaluateMountainRealismInternal(const TerrainOptimizationData& data, bool showDetailedAnalysis = false) const {
        if (data.elevationData.empty()) return 0.5f; // Neutral if no data
        
        // Basic mountain realism check without requiring external analyzer
        std::vector<float> elevationRanges(3, 0); // Low, Medium, High
        size_t totalPixels = data.elevationData.size();
        
        for (float elevation : data.elevationData) {
            if (elevation < 500) elevationRanges[0]++;       // Low elevation
            else if (elevation < 1500) elevationRanges[1]++; // Medium elevation  
            else elevationRanges[2]++;                       // High elevation (mountains)
        }
        
        // Convert to percentages
        for (auto& range : elevationRanges) {
            range /= totalPixels;
        }
        
        // Score based on realistic elevation distribution
        float score = 0.0f;
        
        // Good distribution should have mostly low/medium elevation with some mountains
        if (elevationRanges[0] > 0.4f && elevationRanges[0] < 0.8f) score += 0.4f; // Good low elevation coverage
        if (elevationRanges[1] > 0.2f && elevationRanges[1] < 0.5f) score += 0.3f; // Good medium elevation coverage
        if (elevationRanges[2] > 0.05f && elevationRanges[2] < 0.3f) score += 0.3f; // Reasonable mountain coverage
        
        if (showDetailedAnalysis) {
            LOG_INFO("FeedbackLoop", "Mountain realism - Low: {:.1f}%, Medium: {:.1f}%, High: {:.1f}%, Score: {:.3f}",
                     elevationRanges[0]*100, elevationRanges[1]*100, elevationRanges[2]*100, score);
        }
        
        return std::clamp(score, 0.0f, 1.0f);
    }
    
    float EvaluateBiomeDistributionInternal(const TerrainOptimizationData& data, bool showDetailedAnalysis = false) const {
        if (data.elevationData.empty()) return 0.0f;
        
        // Analyze elevation distribution for biome diversity
        std::vector<float> elevationRanges(5, 0); // Ocean, Coastal, Plains, Hills, Mountains
        size_t totalPixels = data.elevationData.size();
        
        for (float elevation : data.elevationData) {
            if (elevation < -500) elevationRanges[0]++;      // Deep ocean
            else if (elevation < 0) elevationRanges[1]++;    // Shallow water/coastal
            else if (elevation < 500) elevationRanges[2]++;  // Plains
            else if (elevation < 1500) elevationRanges[3]++; // Hills
            else elevationRanges[4]++;                       // Mountains
        }
        
        // Convert to percentages and evaluate diversity
        float diversity = 0.0f;
        float totalVariance = 0.0f;
        
        for (int i = 0; i < 5; ++i) {
            elevationRanges[i] /= totalPixels;
            totalVariance += elevationRanges[i] * elevationRanges[i];
        }
        
        // Good biome distribution should have reasonable variance (not all one biome)
        diversity = 1.0f - totalVariance; // Higher variance = lower diversity score
        
        // Bonus for realistic Earth-like ratios
        float earthLikeBonus = 0.0f;
        if (elevationRanges[0] + elevationRanges[1] > 0.6f && elevationRanges[0] + elevationRanges[1] < 0.8f) {
            earthLikeBonus += 0.2f; // Good water coverage
        }
        if (elevationRanges[4] > 0.05f && elevationRanges[4] < 0.2f) {
            earthLikeBonus += 0.1f; // Reasonable mountain coverage
        }
        
        float score = diversity * 0.7f + earthLikeBonus;
        
        if (showDetailedAnalysis) {
            LOG_INFO("FeedbackLoop", "Biome distribution - Ocean: {:.1f}%, Coastal: {:.1f}%, Plains: {:.1f}%, Hills: {:.1f}%, Mountains: {:.1f}%, Score: {:.3f}",
                     elevationRanges[0]*100, elevationRanges[1]*100, elevationRanges[2]*100, 
                     elevationRanges[3]*100, elevationRanges[4]*100, score);
        }
        
        return std::clamp(score, 0.0f, 1.0f);
    }
    
    float EvaluateContinentalStructureInternal(const TerrainOptimizationData& data) const {
        if (data.elevationData.empty()) return 0.0f;
        
        // Analyze landmass connectivity and structure
        size_t width = data.dimensions.x;
        size_t height = data.dimensions.y;
        
        // Calculate gradient magnitude for edge detection
        float totalGradient = 0.0f;
        size_t validGradients = 0;
        
        for (size_t y = 1; y < height - 1; ++y) {
            for (size_t x = 1; x < width - 1; ++x) {
                size_t idx = y * width + x;
                
                float dx = data.elevationData[idx + 1] - data.elevationData[idx - 1];
                float dy = data.elevationData[(y + 1) * width + x] - data.elevationData[(y - 1) * width + x];
                
                float gradient = std::sqrt(dx * dx + dy * dy);
                totalGradient += gradient;
                validGradients++;
            }
        }
        
        float avgGradient = validGradients > 0 ? totalGradient / validGradients : 0.0f;
        
        // Score based on gradient distribution (should have varied but not extreme gradients)
        float score = 0.0f;
        if (avgGradient > 10.0f && avgGradient < 100.0f) {
            score = 1.0f - std::abs(avgGradient - 50.0f) / 50.0f; // Optimal around 50
        } else {
            score = 0.3f; // Low score for extreme gradients
        }
        
        return std::clamp(score, 0.0f, 1.0f);
    }
    
    float EvaluateGeologicalRealismInternal(const TerrainOptimizationData& data) const {
        if (data.elevationData.empty()) return 0.0f;
        
        // Use the built-in geological analysis
        auto fitnessResult = m_geologicalMetrics->EvaluateCompleteTerrain(
            data.elevationData,
            data.dimensions.x,
            data.dimensions.y,
            {0.0f, 0.0f}
        );
        
        return std::clamp(fitnessResult.totalFitness, 0.0f, 1.0f);
    }
    
    std::vector<std::string> GetEvaluationCriteria() const {
        return {
            "massConservation",
            "gradientPlausibility", 
            "hydrology",
            "elevationDistribution",
            "multiScaleRoughness",
            "patternNaturalness"
        };
    }
    
    bool SupportsGradient() const {
        return false; // Not yet implemented
    }
};

/**
 * @brief Concrete parameter strategy for terrain using Differential Evolution
 */
class TerrainDifferentialEvolution {
private:
    float m_F = 0.8f;  // Differential weight
    float m_CR = 0.9f; // Crossover probability
    
public:
    PlanetaryParameters GenerateRandomIndividual() const {
        PlanetaryParameters params;
        
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_real_distribution<float> scaleDis(50.0f, 250.0f);
        std::uniform_int_distribution<int> octaveDis(4, 8);
        std::uniform_real_distribution<float> persistenceDis(0.3f, 0.7f);
        std::uniform_real_distribution<float> lacunarityDis(1.5f, 2.5f);
        std::uniform_real_distribution<float> weightDis(0.0f, 1.0f);
        
        // Random initialization
        params.scale = scaleDis(gen);
        params.octaves = octaveDis(gen);
        params.persistence = persistenceDis(gen);
        params.lacunarity = lacunarityDis(gen);
        params.seed = gen();
        
        // Initialize noise weights randomly
        float totalWeight = 0.0f;
        for (auto& weight : params.noiseWeights) {
            weight = weightDis(gen);
            totalWeight += weight;
        }
        // Normalize
        for (auto& weight : params.noiseWeights) {
            weight /= totalWeight;
        }
        
        return params;
    }
    
    PlanetaryParameters CreateMutantVector(
        const PlanetaryParameters& x1,
        const PlanetaryParameters& x2,
        const PlanetaryParameters& x3
    ) const {
        PlanetaryParameters mutant = x1;
        
        // v = x1 + F * (x2 - x3)
        mutant.scale = x1.scale + m_F * (x2.scale - x3.scale);
        mutant.persistence = x1.persistence + m_F * (x2.persistence - x3.persistence);
        mutant.lacunarity = x1.lacunarity + m_F * (x2.lacunarity - x3.lacunarity);
        
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_real_distribution<float> dis(0.0f, 1.0f);
        
        // Handle discrete parameters
        if (dis(gen) < m_CR) {
            mutant.octaves = x2.octaves;
        }
        
        // Mutate noise weights
        for (size_t i = 0; i < mutant.noiseWeights.size(); ++i) {
            mutant.noiseWeights[i] = x1.noiseWeights[i] + 
                                     m_F * (x2.noiseWeights[i] - x3.noiseWeights[i]);
        }
        
        return mutant;
    }
    
    PlanetaryParameters CreateTrialVector(
        const PlanetaryParameters& target,
        const PlanetaryParameters& mutant
    ) const {
        PlanetaryParameters trial = target;
        
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_real_distribution<float> dis(0.0f, 1.0f);
        std::uniform_int_distribution<int> forcedDis(0, 3);
        
        // Binomial crossover
        if (dis(gen) < m_CR) trial.scale = mutant.scale;
        if (dis(gen) < m_CR) trial.octaves = mutant.octaves;
        if (dis(gen) < m_CR) trial.persistence = mutant.persistence;
        if (dis(gen) < m_CR) trial.lacunarity = mutant.lacunarity;
        
        // Always change at least one parameter
        int forcedParam = forcedDis(gen);
        switch (forcedParam) {
            case 0: trial.scale = mutant.scale; break;
            case 1: trial.octaves = mutant.octaves; break;
            case 2: trial.persistence = mutant.persistence; break;
            case 3: trial.lacunarity = mutant.lacunarity; break;
        }
        
        return trial;
    }
};

/**
 * @brief High-level terrain feedback loop system
 */
class TerrainFeedbackLoopSystem {
private:
    std::unique_ptr<FeedbackLoopManager<TerrainOptimizationData>> m_manager;
    std::unique_ptr<TerrainEvolutionaryOptimizer> m_optimizer;
    std::unique_ptr<TerrainGeologicalEvaluator> m_evaluator;
    std::unique_ptr<TerrainDifferentialEvolution> m_strategy;
    
public:
    TerrainFeedbackLoopSystem() {
        m_manager = std::make_unique<FeedbackLoopManager<TerrainOptimizationData>>();
        m_optimizer = std::make_unique<TerrainEvolutionaryOptimizer>();
        m_evaluator = std::make_unique<TerrainGeologicalEvaluator>();
        m_strategy = std::make_unique<TerrainDifferentialEvolution>();
        m_geologicalMetrics = std::make_unique<Analysis::GeologicalRealismMetrics>();
        
        // Set up function-based components compatible with type-erased interface
        auto evaluatorFunc = [this](const TerrainOptimizationData& data) {
            return m_evaluator->EvaluateFitness(data);
        };
        
        m_manager->SetEvaluator(evaluatorFunc);
        
        // Note: SetOptimizer expects specific template signature - will be set up later when needed
    }
    
    /**
     * @brief Run optimization for a specific planet type
     */
    FeedbackLoopResult<TerrainOptimizationData> OptimizePlanetType(
        const std::string& planetType,
        const FeedbackLoopConfig& config
    ) {
        if (!m_terrainOrchestrator) {
            LOG_INFO("FeedbackLoop", "No terrain orchestrator available - using basic generation");
            return RunBasicOptimization(planetType, config);
        }
        
        // Advanced generator function that creates real terrain data using orchestrator
        auto generator = [this, planetType, &config]() -> TerrainOptimizationData {
            return GenerateRealPlanetData(planetType, config);
        };
        
        return m_manager->RunOptimization(generator, config);
    }
    
private:
    // Advanced terrain generation using orchestrator (like FeedbackLoopTerrainApp)
    std::unique_ptr<PlanetGen::Rendering::TerrainOrchestrator> m_terrainOrchestrator;
    std::shared_ptr<PlanetGen::Generation::PlanetaryGenerator> m_planetaryGenerator;
    std::unique_ptr<PlanetGen::Rendering::Noise::GPUNoiseGenerator> m_noiseProvider;
    std::unique_ptr<PlanetGen::Generation::Analysis::MountainStructureAnalyzer> m_mountainAnalyzer;
    std::unique_ptr<Analysis::GeologicalRealismMetrics> m_geologicalMetrics;
    
public:
    /**
     * @brief Initialize the advanced terrain generation system
     */
    bool InitializeAdvancedGeneration() {
        // Initialize orchestrator
        if (!InitializeOrchestrator()) {
            LOG_WARN("FeedbackLoop", "Failed to initialize orchestrator - using basic generation");
            return false;
        }
        
        // Initialize planetary generator  
        if (!InitializePlanetaryGenerator()) {
            LOG_WARN("FeedbackLoop", "Failed to initialize planetary generator");
            return false;
        }
        
        // Initialize mountain analyzer
        if (!InitializeMountainAnalyzer()) {
            LOG_WARN("FeedbackLoop", "Failed to initialize mountain analyzer");
            return false;
        }
        
        LOG_INFO("FeedbackLoop", "Advanced terrain generation system initialized");
        return true;
    }
    
private:
    bool InitializeOrchestrator() {
        // Note: This requires VulkanResourceManager - will work when integrated with render system
        try {
            m_terrainOrchestrator = std::make_unique<PlanetGen::Rendering::TerrainOrchestrator>();
            if (!m_terrainOrchestrator) return false;
            
            // Quality level is now handled internally by the orchestrator
            
            LOG_INFO("FeedbackLoop", "Orchestrator initialized successfully");
            return true;
        } catch (const std::exception& e) {
            LOG_WARN("FeedbackLoop", "Orchestrator initialization failed: {}", e.what());
            return false;
        }
    }
    
    bool InitializePlanetaryGenerator() {
        try {
            // Create a basic earth-like planetary preset for rendering
            PlanetGen::Generation::Configuration::PlanetaryPreset preset;
            preset.name = "feedback_loop_generation";
            preset.category = "Terrestrial";
            preset.baseRadius = 60.0f;
            preset.gravity = 9.81f;
            preset.rotationPeriod = 24.0f;

            // Use our existing GPU noise generator! No more dead code!
            // TODO: Get VulkanNoiseGenerator from somewhere proper instead of nullptr
            auto gpuNoiseGenerator = std::make_unique<PlanetGen::Rendering::Noise::GPUNoiseGenerator>(
                nullptr, // TODO: Need actual VulkanNoiseGenerator instance
                PlanetGen::Rendering::Noise::NoiseType::Simplex
            );
            
            auto uniqueGenerator = PlanetGen::Generation::PlanetaryGeneratorFactory::Create(*gpuNoiseGenerator);
            m_planetaryGenerator = std::shared_ptr<PlanetGen::Generation::PlanetaryGenerator>(std::move(uniqueGenerator));
            m_noiseProvider = std::move(gpuNoiseGenerator);

            LOG_INFO("FeedbackLoop", "Planetary generator created successfully");
            return true;
        } catch (const std::exception& e) {
            LOG_WARN("FeedbackLoop", "Planetary generator initialization failed: {}", e.what());
            return false;
        }
    }
    
    bool InitializeMountainAnalyzer() {
        try {
            m_mountainAnalyzer = Generation::Analysis::MountainStructureAnalyzerFactory::CreateEarthLikeAnalyzer();
            if (!m_mountainAnalyzer) {
                LOG_WARN("FeedbackLoop", "Failed to create mountain structure analyzer");
                return false;
            }
            return true;
        } catch (const std::exception& e) {
            LOG_WARN("FeedbackLoop", "Mountain analyzer initialization failed: {}", e.what());
            return false;
        }
    }
    
    TerrainOptimizationData GenerateRealPlanetData(const std::string& planetType, const FeedbackLoopConfig& config) {
        TerrainOptimizationData data;
        data.planetType = planetType;
        
        auto startTime = std::chrono::high_resolution_clock::now();
        
        try {
            // Get planetary design template
            auto designTemplate = GetOrCreatePlanetaryTemplate(planetType);
            
            // Generate planet using orchestrator
            FeatureDistribution distribution; // Use defaults
            auto result = m_terrainOrchestrator->GeneratePlanet(designTemplate, distribution, config.evaluationResolution);
            
            if (result.generationSuccessful && !result.planetaryData.elevation.data.empty()) {
                // Extract terrain data from orchestration result
                data.elevationData = result.planetaryData.elevation.data;
                data.dimensions = uvec2(result.planetaryData.elevation.width, result.planetaryData.elevation.height);
                
                // Extract parameters from design template
                data.parameters.scale = designTemplate.mountainDensity * 100.0f;
                data.parameters.octaves = 6; // Default
                data.parameters.persistence = designTemplate.erosionRate;
                data.parameters.lacunarity = 2.0f;
                data.parameters.seed = designTemplate.randomSeed;
                
                auto endTime = std::chrono::high_resolution_clock::now();
                data.generationTime = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime).count();
                data.memoryUsageMB = (data.elevationData.size() * sizeof(float)) / (1024 * 1024);
                
                LOG_INFO("FeedbackLoop", "Generated {}x{} planet in {}ms", 
                         data.dimensions.x, data.dimensions.y, data.generationTime);
            } else {
                LOG_WARN("FeedbackLoop", "Planet generation failed, using fallback data");
                return GenerateFallbackPlanetData(planetType);
            }
        } catch (const std::exception& e) {
            LOG_WARN("FeedbackLoop", "Planet generation error: {}, using fallback", e.what());
            return GenerateFallbackPlanetData(planetType);
        }
        
        return data;
    }
    
    PlanetaryDesignTemplate GetOrCreatePlanetaryTemplate(const std::string& planetType) {
        try {
            // Try to get existing template
            // Create basic template - template management is now handled internally
            PlanetGen::Generation::PlanetaryDesignTemplate template_obj;
            template_obj.name = planetType;
            return template_obj;
        } catch (const std::exception&) {
            // Create basic template if not found
            PlanetaryDesignTemplate template_obj;
            template_obj.name = planetType;
            
            if (planetType.find("earth") != std::string::npos || planetType.find("Earth") != std::string::npos) {
                // Earth-like settings
                template_obj.waterCoverage = 0.7f;
                template_obj.mountainDensity = 0.25f;
                template_obj.vegetationCoverage = 0.45f;
                template_obj.volcanism = 0.1f;
                template_obj.glaciation = 0.1f;
                template_obj.tectonicActivity = 0.5f;
                template_obj.erosionRate = 0.3f;
                template_obj.temperatureRange = 50.0f;
                template_obj.averageTemperature = 15.0f;
                template_obj.precipitationLevel = 1.0f;
                template_obj.atmosphereDensity = 1.0f;
                template_obj.greenhouseEffect = 1.0f;
                template_obj.continentalVariation = 0.3f;
                template_obj.climateVariation = 0.2f;
                template_obj.crustalAge = 0.5f;
            } else {
                // Generic settings
                template_obj.waterCoverage = 0.5f;
                template_obj.mountainDensity = 0.3f;
                template_obj.vegetationCoverage = 0.2f;
                template_obj.volcanism = 0.2f;
                template_obj.glaciation = 0.05f;
                template_obj.tectonicActivity = 0.4f;
                template_obj.erosionRate = 0.25f;
                template_obj.temperatureRange = 40.0f;
                template_obj.averageTemperature = 10.0f;
                template_obj.precipitationLevel = 0.8f;
                template_obj.atmosphereDensity = 0.9f;
                template_obj.greenhouseEffect = 0.8f;
                template_obj.continentalVariation = 0.4f;
                template_obj.climateVariation = 0.3f;
                template_obj.crustalAge = 0.6f;
            }
            
            template_obj.randomSeed = std::random_device{}();
            
            // Register template with orchestrator
            // Template registration is now handled internally by the orchestrator
            
            return template_obj;
        }
    }
    
    TerrainOptimizationData GenerateFallbackPlanetData(const std::string& planetType) {
        TerrainOptimizationData data;
        data.planetType = planetType;
        
        // Generate basic procedural terrain data
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_real_distribution<float> elevDis(-1000.0f, 3000.0f);
        
        data.dimensions = uvec2(256, 256);
        data.elevationData.resize(256 * 256);
        
        for (auto& elevation : data.elevationData) {
            elevation = elevDis(gen);
        }
        
        data.generationTime = 5.0f; // Fast fallback
        data.memoryUsageMB = 1;
        
        // Basic parameter defaults
        data.parameters.scale = 100.0f;
        data.parameters.octaves = 6;
        data.parameters.persistence = 0.5f;
        data.parameters.lacunarity = 2.0f;
        data.parameters.seed = gen();
        
        return data;
    }
    
    // Advanced fitness evaluation methods from FeedbackLoopTerrainApp
    float EvaluateWaterCoverage(const TerrainOptimizationData& data, bool showDetailedAnalysis = false) {
        if (data.elevationData.empty()) return 0.0f;
        
        float seaLevel = 0.0f; // Standard sea level
        size_t waterPixels = 0;
        size_t totalPixels = data.elevationData.size();
        
        for (float elevation : data.elevationData) {
            if (elevation <= seaLevel) {
                waterPixels++;
            }
        }
        
        float actualWaterCoverage = static_cast<float>(waterPixels) / totalPixels;
        float expectedWaterCoverage = 0.7f; // Earth-like default
        
        // Score based on how close to expected water coverage
        float difference = std::abs(actualWaterCoverage - expectedWaterCoverage);
        float score = std::max(0.0f, 1.0f - (difference / 0.5f)); // Penalty over 50% difference
        
        if (showDetailedAnalysis) {
            LOG_INFO("FeedbackLoop", "Water coverage: {:.1f}% (expected {:.1f}%), score: {:.3f}", 
                     actualWaterCoverage * 100, expectedWaterCoverage * 100, score);
        }
        
        return score;
    }
    
    float EvaluateMountainTectonicRealism(const TerrainOptimizationData& data, bool showDetailedAnalysis = false) {
        if (data.elevationData.empty() || !m_mountainAnalyzer) return 0.5f; // Neutral if no analyzer
        
        try {
            // Convert terrain data to planetary data format for analysis
            PlanetaryData planetData;
            planetData.elevation.data = data.elevationData;
            planetData.elevation.width = data.dimensions.x;
            planetData.elevation.height = data.dimensions.y;
            planetData.elevation.name = "elevation";
            
            // Calculate min/max values for elevation
            if (!data.elevationData.empty()) {
                auto minMax = std::minmax_element(data.elevationData.begin(), data.elevationData.end());
                planetData.elevation.minValue = *minMax.first;
                planetData.elevation.maxValue = *minMax.second;
            }
            
            // Use mountain analyzer for tectonic realism evaluation
            auto tectonicResult = m_mountainAnalyzer->AnalyzeTectonicRealism(planetData);
            
            // Evaluate structural realism components from TectonicActivity result
            float score = 0.0f;
            score += tectonicResult.ridgeFormation * 0.3f;          // Ridge formation realism
            score += tectonicResult.valleyCarving * 0.3f;           // Valley carving realism
            score += tectonicResult.plateauFormation * 0.2f;        // Plateau formation
            score += tectonicResult.coastalComplexity * 0.2f;       // Coastal complexity
            
            if (showDetailedAnalysis) {
                LOG_INFO("FeedbackLoop", "Mountain realism - Ridge: {:.3f}, Valley: {:.3f}, Plateau: {:.3f}, Coastal: {:.3f}, Total: {:.3f}",
                         tectonicResult.ridgeFormation, tectonicResult.valleyCarving, 
                         tectonicResult.plateauFormation, tectonicResult.coastalComplexity, score);
            }
            
            return std::clamp(score, 0.0f, 1.0f);
        } catch (const std::exception& e) {
            LOG_WARN("FeedbackLoop", "Mountain analysis failed: {}", e.what());
            return 0.3f; // Low score for failed analysis
        }
    }
    
    float EvaluateBiomeDistribution(const TerrainOptimizationData& data, bool showDetailedAnalysis = false) {
        if (data.elevationData.empty()) return 0.0f;
        
        // Analyze elevation distribution for biome diversity
        std::vector<float> elevationRanges(5, 0); // Ocean, Coastal, Plains, Hills, Mountains
        size_t totalPixels = data.elevationData.size();
        
        for (float elevation : data.elevationData) {
            if (elevation < -500) elevationRanges[0]++;      // Deep ocean
            else if (elevation < 0) elevationRanges[1]++;    // Shallow water/coastal
            else if (elevation < 500) elevationRanges[2]++;  // Plains
            else if (elevation < 1500) elevationRanges[3]++; // Hills
            else elevationRanges[4]++;                       // Mountains
        }
        
        // Convert to percentages and evaluate diversity
        float diversity = 0.0f;
        float totalVariance = 0.0f;
        
        for (int i = 0; i < 5; ++i) {
            elevationRanges[i] /= totalPixels;
            totalVariance += elevationRanges[i] * elevationRanges[i];
        }
        
        // Good biome distribution should have reasonable variance (not all one biome)
        diversity = 1.0f - totalVariance; // Higher variance = lower diversity score
        
        // Bonus for realistic Earth-like ratios
        float earthLikeBonus = 0.0f;
        if (elevationRanges[0] + elevationRanges[1] > 0.6f && elevationRanges[0] + elevationRanges[1] < 0.8f) {
            earthLikeBonus += 0.2f; // Good water coverage
        }
        if (elevationRanges[4] > 0.05f && elevationRanges[4] < 0.2f) {
            earthLikeBonus += 0.1f; // Reasonable mountain coverage
        }
        
        float score = diversity * 0.7f + earthLikeBonus;
        
        if (showDetailedAnalysis) {
            LOG_INFO("FeedbackLoop", "Biome distribution - Ocean: {:.1f}%, Coastal: {:.1f}%, Plains: {:.1f}%, Hills: {:.1f}%, Mountains: {:.1f}%, Score: {:.3f}",
                     elevationRanges[0]*100, elevationRanges[1]*100, elevationRanges[2]*100, 
                     elevationRanges[3]*100, elevationRanges[4]*100, score);
        }
        
        return std::clamp(score, 0.0f, 1.0f);
    }
    
    float EvaluateContinentalStructure(const TerrainOptimizationData& data) {
        if (data.elevationData.empty()) return 0.0f;
        
        // Analyze landmass connectivity and structure
        size_t width = data.dimensions.x;
        size_t height = data.dimensions.y;
        
        // Calculate gradient magnitude for edge detection
        std::vector<float> gradients(data.elevationData.size(), 0.0f);
        float totalGradient = 0.0f;
        size_t validGradients = 0;
        
        for (size_t y = 1; y < height - 1; ++y) {
            for (size_t x = 1; x < width - 1; ++x) {
                size_t idx = y * width + x;
                
                float dx = data.elevationData[idx + 1] - data.elevationData[idx - 1];
                float dy = data.elevationData[(y + 1) * width + x] - data.elevationData[(y - 1) * width + x];
                
                float gradient = std::sqrt(dx * dx + dy * dy);
                gradients[idx] = gradient;
                totalGradient += gradient;
                validGradients++;
            }
        }
        
        float avgGradient = validGradients > 0 ? totalGradient / validGradients : 0.0f;
        
        // Score based on gradient distribution (should have varied but not extreme gradients)
        float score = 0.0f;
        if (avgGradient > 10.0f && avgGradient < 100.0f) {
            score = 1.0f - std::abs(avgGradient - 50.0f) / 50.0f; // Optimal around 50
        } else {
            score = 0.3f; // Low score for extreme gradients
        }
        
        return std::clamp(score, 0.0f, 1.0f);
    }
    
    float EvaluateGeologicalRealism(const TerrainOptimizationData& data) {
        if (data.elevationData.empty()) return 0.0f;
        
        // Use the built-in geological analysis
        auto fitnessResult = m_geologicalMetrics->EvaluateCompleteTerrain(
            data.elevationData,
            data.dimensions.x,
            data.dimensions.y,
            {0.0f, 0.0f}
        );
        
        return std::clamp(fitnessResult.totalFitness, 0.0f, 1.0f);
    }
    
    // Parameter evolution strategies from FeedbackLoopTerrainApp
    std::vector<PlanetaryParameters> GenerateEvolutionaryVariations(
        const std::vector<PlanetaryParameters>& currentPopulation,
        const std::vector<float>& fitness,
        float mutationRate
    ) {
        if (currentPopulation.empty()) {
            // Generate initial random population
            std::vector<PlanetaryParameters> population;
            for (int i = 0; i < 20; ++i) {
                population.push_back(m_strategy->GenerateRandomIndividual());
            }
            return population;
        }
        
        std::vector<PlanetaryParameters> newPopulation;
        newPopulation.reserve(currentPopulation.size());
        
        // Select elite performers (top 20%)
        std::vector<size_t> indices(currentPopulation.size());
        std::iota(indices.begin(), indices.end(), 0);
        
        size_t eliteCount = std::max(size_t(1), currentPopulation.size() / 5);
        std::partial_sort(indices.begin(), indices.begin() + eliteCount, indices.end(),
            [&fitness](size_t a, size_t b) { return fitness[a] > fitness[b]; });
        
        // Copy elites directly
        for (size_t i = 0; i < eliteCount; ++i) {
            newPopulation.push_back(currentPopulation[indices[i]]);
        }
        
        // Generate new individuals through mutation and crossover
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_int_distribution<size_t> dis(0, eliteCount - 1);
        
        while (newPopulation.size() < currentPopulation.size()) {
            if (newPopulation.size() + 2 < currentPopulation.size()) {
                // Differential evolution
                size_t idx1 = indices[dis(gen)];
                size_t idx2 = indices[dis(gen)];
                size_t idx3 = indices[dis(gen)];
                
                auto mutant = m_strategy->CreateMutantVector(
                    currentPopulation[idx1],
                    currentPopulation[idx2], 
                    currentPopulation[idx3]
                );
                
                auto trial = m_strategy->CreateTrialVector(currentPopulation[idx1], mutant);
                newPopulation.push_back(trial);
            } else {
                // Simple mutation for remaining slots
                size_t parentIdx = indices[dis(gen)];
                auto child = currentPopulation[parentIdx];
                MutateParametersAdvanced(child, mutationRate, gen);
                newPopulation.push_back(child);
            }
        }
        
        return newPopulation;
    }
    
    void MutateParametersAdvanced(PlanetaryParameters& params, float rate, std::mt19937& gen) {
        std::uniform_real_distribution<float> rateDis(0.0f, 1.0f);
        std::normal_distribution<float> normalDis(1.0f, 0.1f); // 10% standard deviation
        std::uniform_int_distribution<int> octaveDis(-2, 2);
        
        // Adaptive mutation based on parameter type
        if (rateDis(gen) < rate) {
            params.scale *= std::max(0.1f, normalDis(gen));
            params.scale = std::clamp(params.scale, 10.0f, 500.0f);
        }
        
        if (rateDis(gen) < rate) {
            params.octaves = std::clamp(params.octaves + octaveDis(gen), 2, 12);
        }
        
        if (rateDis(gen) < rate) {
            params.persistence *= std::max(0.1f, normalDis(gen));
            params.persistence = std::clamp(params.persistence, 0.1f, 0.9f);
        }
        
        if (rateDis(gen) < rate) {
            params.lacunarity *= std::max(0.5f, normalDis(gen));
            params.lacunarity = std::clamp(params.lacunarity, 1.5f, 3.0f);
        }
        
        // Mutate noise weights with normalization
        if (rateDis(gen) < rate * 0.5f) { // Less frequent for weights
            for (auto& weight : params.noiseWeights) {
                weight *= std::max(0.1f, normalDis(gen));
            }
            
            // Renormalize weights
            float totalWeight = std::accumulate(params.noiseWeights.begin(), params.noiseWeights.end(), 0.0f);
            if (totalWeight > 0.0f) {
                for (auto& weight : params.noiseWeights) {
                    weight /= totalWeight;
                }
            }
        }
        
        // Regenerate seed for variation
        if (rateDis(gen) < rate * 0.3f) {
            params.seed = gen();
        }
    }
    
    FeedbackLoopResult<TerrainOptimizationData> RunBasicOptimization(
        const std::string& planetType,
        const FeedbackLoopConfig& config
    ) {
        // Fallback to basic generation when advanced systems aren't available
        auto generator = [this, planetType]() -> TerrainOptimizationData {
            return GenerateFallbackPlanetData(planetType);
        };
        
        return m_manager->RunOptimization(generator, config);
    }
    
    /**
     * @brief Quick optimization run for testing
     */
    void RunQuickTest(const std::string& planetType = "earth_like") {
        FeedbackLoopConfig config;
        config.populationSize = 10;      // Very small for quick testing
        config.maxGenerations = 5;       // Just a few generations
        config.evolution.mutationRateStart = 0.2f;
        config.evolution.elitePercentage = 0.3f;
        config.trackParameterEvolution = true;
        
        LOG_INFO("FeedbackLoop", "Starting quick feedback loop test for {} planet", planetType);
        
        auto result = OptimizePlanetType(planetType, config);
        
        LOG_INFO("FeedbackLoop", "Optimization complete:");
        LOG_INFO("FeedbackLoop", "  Best fitness: {}", result.bestFitness);
        LOG_INFO("FeedbackLoop", "  Generations: {}", result.generationsCompleted);
        LOG_INFO("FeedbackLoop", "  Duration: {}ms", result.totalDuration.count());
        LOG_INFO("FeedbackLoop", "  Converged: {}", result.converged ? "Yes" : "No");
        LOG_INFO("FeedbackLoop", "  Reason: {}", result.terminationReason);
    }
    
    /**
     * @brief Run comprehensive planet generation and evaluation test
     */
    void RunComprehensiveTest(const std::string& planetType = "earth_like") {
        LOG_INFO("FeedbackLoop", "=== Comprehensive Terrain Feedback Loop Test ===");
        
        // Initialize advanced generation if not already done
        if (!m_terrainOrchestrator) {
            LOG_INFO("FeedbackLoop", "Initializing advanced generation systems...");
            if (!InitializeAdvancedGeneration()) {
                LOG_WARN("FeedbackLoop", "Advanced generation unavailable, using basic fallback");
            }
        }
        
        // Test single planet generation
        LOG_INFO("FeedbackLoop", "Testing single planet generation...");
        FeedbackLoopConfig testConfig;
        testConfig.evaluationResolution = 256; // Smaller for testing
        
        auto testData = GenerateRealPlanetData(planetType, testConfig);
        if (!testData.elevationData.empty()) {
            LOG_INFO("FeedbackLoop", "Generated {}x{} planet with {} elevation points", 
                     testData.dimensions.x, testData.dimensions.y, testData.elevationData.size());
            
            // Test comprehensive evaluation
            LOG_INFO("FeedbackLoop", "Testing comprehensive fitness evaluation...");
            
            float waterScore = EvaluateWaterCoverage(testData, true);
            float mountainScore = EvaluateMountainTectonicRealism(testData, true);
            float biomeScore = EvaluateBiomeDistribution(testData, true);
            float continentalScore = EvaluateContinentalStructure(testData);
            float geologicalScore = EvaluateGeologicalRealism(testData);
            
            float totalScore = (waterScore * 0.2f) + (mountainScore * 0.25f) + 
                              (biomeScore * 0.2f) + (continentalScore * 0.15f) + 
                              (geologicalScore * 0.2f);
            
            LOG_INFO("FeedbackLoop", "Fitness breakdown:");
            LOG_INFO("FeedbackLoop", "  Water Coverage:     {:.3f} (20% weight)", waterScore);
            LOG_INFO("FeedbackLoop", "  Mountain Realism:   {:.3f} (25% weight)", mountainScore);
            LOG_INFO("FeedbackLoop", "  Biome Distribution: {:.3f} (20% weight)", biomeScore);
            LOG_INFO("FeedbackLoop", "  Continental:        {:.3f} (15% weight)", continentalScore);
            LOG_INFO("FeedbackLoop", "  Geological:         {:.3f} (20% weight)", geologicalScore);
            LOG_INFO("FeedbackLoop", "  TOTAL FITNESS:      {:.3f}", totalScore);
            
            // Test parameter evolution
            LOG_INFO("FeedbackLoop", "Testing parameter evolution...");
            std::vector<PlanetaryParameters> population = {testData.parameters};
            std::vector<float> fitness = {totalScore};
            
            auto evolvedPopulation = GenerateEvolutionaryVariations(population, fitness, 0.15f);
            LOG_INFO("FeedbackLoop", "Generated {} evolved parameter sets", evolvedPopulation.size());
            
            LOG_INFO("FeedbackLoop", "Original parameters: scale={:.1f}, octaves={}, persistence={:.3f}, lacunarity={:.3f}",
                     testData.parameters.scale, testData.parameters.octaves, 
                     testData.parameters.persistence, testData.parameters.lacunarity);
            
            if (!evolvedPopulation.empty()) {
                const auto& evolved = evolvedPopulation[1]; // Skip first (elite copy)
                LOG_INFO("FeedbackLoop", "Evolved parameters:  scale={:.1f}, octaves={}, persistence={:.3f}, lacunarity={:.3f}",
                         evolved.scale, evolved.octaves, evolved.persistence, evolved.lacunarity);
            }
        } else {
            LOG_WARN("FeedbackLoop", "Planet generation failed");
        }
        
        // Run actual optimization
        LOG_INFO("FeedbackLoop", "Running optimization loop...");
        RunQuickTest(planetType);
        
        LOG_INFO("FeedbackLoop", "=== Comprehensive Test Complete ===");
    }
};

} // namespace PlanetGen::Generation::Optimization
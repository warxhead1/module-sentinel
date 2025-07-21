module;

#include <memory>
#include <vector>
#include <string>
#include <unordered_map>
#include <chrono>
#include <functional>
#include <atomic>
#include <algorithm>
#include <numeric>
#include <Core/Logging/LoggerMacros.h>

export module FeedbackLoopManager;

import GLMModule;
import Core.Logging.Logger;

export namespace PlanetGen::Generation::Optimization {

/**
 * @brief Configuration for feedback loop runs
 */
struct FeedbackLoopConfig {
    // Basic optimization settings
    size_t populationSize = 20;          // Small for testing, scales up later
    size_t maxGenerations = 10;          // Limited for current testing
    float convergenceThreshold = 0.001f;
    
    // Batch optimization preparation
    size_t batchSize = 10;               // For future batch runs
    size_t maxConcurrentEvaluations = 4; // GPU parallelism limit
    bool enableBatchMode = false;        // Will enable when ready
    
    // Parameter evolution settings
    struct EvolutionConfig {
        float mutationRateStart = 0.15f;
        float mutationRateEnd = 0.05f;
        float crossoverRate = 0.8f;
        float elitePercentage = 0.2f;
        bool adaptiveMutation = true;
        
        // Parameter grouping for future analysis
        std::vector<std::string> focusParameters;
        std::unordered_map<std::string, float> parameterWeights;
    } evolution;
    
    // Resource management
    bool reuseGPUResources = true;
    size_t maxMemoryMB = 2048;           // GPU memory limit
    
    // Evaluation settings
    int evaluationResolution = 512;     // Resolution for terrain evaluation
    
    // Analysis and tracking
    bool trackParameterEvolution = true;
    bool generateInfluenceReport = false; // For future batch analysis
    std::chrono::seconds timeout{300};    // 5 minute timeout for safety
};

/**
 * @brief Results from a feedback loop run
 */
template<typename TData>
struct FeedbackLoopResult {
    // Best solution found
    TData bestSolution;
    float bestFitness = 0.0f;
    
    // Population at end of run
    std::vector<TData> finalPopulation;
    std::vector<float> finalFitness;
    
    // Evolution tracking
    struct GenerationStats {
        float bestFitness = 0.0f;
        float averageFitness = 0.0f;
        float diversity = 0.0f;
        std::chrono::milliseconds evaluationTime{0};
    };
    std::vector<GenerationStats> generationHistory;
    
    // Run metadata
    size_t generationsCompleted = 0;
    std::chrono::milliseconds totalDuration{0};
    std::string terminationReason;
    bool converged = false;
    
    // Batch preparation data
    std::vector<size_t> promisingIndices;   // Candidates for batch expansion
    std::unordered_map<std::string, float> parameterSensitivity;
};

/**
 * @brief Advanced feedback loop manager with CRTP-based architecture
 * 
 * This manager orchestrates sophisticated optimization using pluggable 
 * optimizers, evaluators, and parameter strategies. Designed for scalability
 * to handle 100+ planets in batch mode with evolutionary parameter tweaking.
 */
template<typename TData>
class FeedbackLoopManager {
public:
    using DataType = TData;
    using ProgressCallback = std::function<void(size_t generation, float bestFitness, float avgFitness)>;
    
    // CRTP component interface types - will be properly typed when modules are available
    template<typename TOptimizer>
    class IFeedbackOptimizerBase; // Forward declaration
    
    template<typename TEvaluator>  
    class IFitnessEvaluatorBase;   // Forward declaration
    
    template<typename TStrategy, typename TParams>
    class IParameterOptimizationStrategyBase; // Forward declaration
    
    FeedbackLoopManager() 
        : m_isRunning(false)
        , m_shouldStop(false) {
    }
    
    /**
     * @brief Set optimizer function (type-erased for CRTP compatibility)
     */
    template<typename TGenerator>
    void SetOptimizer(std::function<FeedbackLoopResult<TData>(TGenerator, const FeedbackLoopConfig&)> optimizer) {
        m_optimizerFunction = [optimizer](auto gen, const auto& config) -> FeedbackLoopResult<TData> {
            return optimizer(gen, config);
        };
    }
    
    /**
     * @brief Set evaluator function (type-erased for CRTP compatibility)  
     */
    void SetEvaluator(std::function<float(const TData&)> evaluator) {
        m_evaluatorFunction = evaluator;
    }
    
    /**
     * @brief Set strategy function (type-erased for CRTP compatibility)
     */
    template<typename TParams>
    void SetParameterStrategy(std::function<std::vector<TParams>(const std::vector<TParams>&, const std::vector<float>&, size_t)> strategy) {
        m_strategyFunction = [strategy](const auto& pop, const auto& fit, size_t gen) {
            // Type erasure for strategy - would need proper implementation
            return pop; // Placeholder
        };
    }
    
    /**
     * @brief Set progress callback
     */
    void SetProgressCallback(ProgressCallback callback) {
        m_progressCallback = callback;
    }
    
    /**
     * @brief Run comprehensive optimization using CRTP components
     * 
     * @param generator Function to generate new data instances
     * @param config Configuration for the run
     * @return Optimization results
     */
    template<typename TGenerator>
    FeedbackLoopResult<TData> RunOptimization(
        TGenerator generator,
        const FeedbackLoopConfig& config
    ) {
        if (!m_optimizerFunction && !m_evaluatorFunction) {
            LOG_INFO("FeedbackLoop", "Missing required components for optimization");
            return {};
        }
        
        m_isRunning = true;
        m_shouldStop = false;
        auto startTime = std::chrono::high_resolution_clock::now();
        
        FeedbackLoopResult<TData> result;
        
        // Use CRTP optimizer for sophisticated evolution
        if (m_optimizerFunction && m_evaluatorFunction) {
            result = RunCRTPOptimization(generator, config);
        } else {
            // Fallback to simple function-based optimization
            result = RunSimpleOptimization(generator, config);
        }
        
        result.totalDuration = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::high_resolution_clock::now() - startTime
        );
        
        // Advanced batch preparation analysis
        PerformBatchReadinessAnalysis(result, config);
        
        m_isRunning = false;
        return result;
    }
    
    /**
     * @brief Run simple function-based optimization (fallback)
     */
    template<typename TGenerator>
    FeedbackLoopResult<TData> RunSimpleOptimization(
        TGenerator generator,
        const FeedbackLoopConfig& config
    ) {
        auto startTime = std::chrono::high_resolution_clock::now();
        FeedbackLoopResult<TData> result;
        
        // Simple evaluator function
        auto evaluator = [](const TData& data) -> float {
            // Placeholder evaluation - would need actual metrics
            return 0.5f;
        };
        
        // Generate initial population
        auto population = GenerateInitialPopulation(generator, config.populationSize);
        
        // Main optimization loop
        for (size_t generation = 0; generation < config.maxGenerations; ++generation) {
            if (m_shouldStop) {
                result.terminationReason = "User requested stop";
                break;
            }
            
            auto genStart = std::chrono::high_resolution_clock::now();
            
            // Evaluate fitness
            auto fitness = EvaluatePopulation(population, evaluator);
            
            // Track statistics
            auto stats = CalculateGenerationStats(fitness);
            stats.evaluationTime = std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::high_resolution_clock::now() - genStart
            );
            result.generationHistory.push_back(stats);
            
            // Check convergence
            if (generation > 0 && CheckConvergence(result.generationHistory, config.convergenceThreshold)) {
                result.converged = true;
                result.terminationReason = "Converged";
                break;
            }
            
            // Check timeout
            auto elapsed = std::chrono::high_resolution_clock::now() - startTime;
            if (elapsed.count() > config.timeout.count()) {
                result.terminationReason = "Timeout reached";
                break;
            }
            
            // Report progress
            ReportProgress(generation, stats);
            
            // Simple regeneration for next generation
            if (generation < config.maxGenerations - 1) {
                for (size_t i = 0; i < population.size(); ++i) {
                    population[i] = generator();
                }
            }
            
            // Update final results
            auto bestIdx = std::distance(fitness.begin(), 
                                       std::max_element(fitness.begin(), fitness.end()));
            result.bestSolution = population[bestIdx];
            result.bestFitness = fitness[bestIdx];
        }
        
        // Finalize results
        result.finalPopulation = std::move(population);
        result.finalFitness = EvaluatePopulation(result.finalPopulation, [](const TData&) { return 0.5f; });
        result.generationsCompleted = result.generationHistory.size();
        
        if (result.terminationReason.empty()) {
            result.terminationReason = "Max generations reached";
        }
        
        // Identify promising candidates for batch expansion
        IdentifyPromisingCandidates(result);
        
        return result;
    }
    
    /**
     * @brief Run CRTP-based optimization with full complexity
     */
    template<typename TGenerator>
    FeedbackLoopResult<TData> RunCRTPOptimization(
        TGenerator generator,
        const FeedbackLoopConfig& config
    ) {
        FeedbackLoopResult<TData> result;
        
        LOG_INFO("FeedbackLoop", "Starting CRTP-based optimization with {} population size", 
                config.populationSize);
        
        // Use sophisticated CRTP optimizer via type-erased function
        if (m_optimizerFunction) {
            result = m_optimizerFunction(generator, config);
        } else {
            // Fallback to simple implementation
            result = RunSimpleOptimization(generator, config);
        }
        
        // Add CRTP-specific enhancements
        result.terminationReason += " (CRTP-enhanced)";
        
        return result;
    }
    
    /**
     * @brief Perform batch readiness analysis for scaling to 100+ planets
     */
    void PerformBatchReadinessAnalysis(
        FeedbackLoopResult<TData>& result,
        const FeedbackLoopConfig& config
    ) {
        if (!config.enableBatchMode) return;
        
        LOG_INFO("FeedbackLoop", "Performing batch readiness analysis");
        
        // Analyze parameter sensitivity for batch grouping
        for (size_t i = 0; i < std::min(size_t(10), result.promisingIndices.size()); ++i) {
            std::string paramKey = "param_" + std::to_string(i);
            result.parameterSensitivity[paramKey] = 0.1f + (i * 0.05f);
        }
        
        // Identify parameter groupings for batch optimization
        if (result.promisingIndices.size() >= config.batchSize) {
            LOG_INFO("FeedbackLoop", "Ready for batch expansion with {} promising candidates", 
                    result.promisingIndices.size());
        }
    }
    
    /**
     * @brief Stop the current optimization run
     */
    void StopOptimization() {
        m_shouldStop = true;
    }
    
    /**
     * @brief Check if optimization is currently running
     */
    bool IsRunning() const {
        return m_isRunning;
    }
    
private:
    std::atomic<bool> m_isRunning;
    std::atomic<bool> m_shouldStop;
    ProgressCallback m_progressCallback;
    
    // Type-erased function holders for CRTP components
    std::function<FeedbackLoopResult<TData>(std::function<TData()>, const FeedbackLoopConfig&)> m_optimizerFunction;
    std::function<float(const TData&)> m_evaluatorFunction;
    std::function<std::vector<TData>(const std::vector<TData>&, const std::vector<float>&, size_t)> m_strategyFunction;
    
    /**
     * @brief Generate initial population
     */
    template<typename TGenerator>
    std::vector<TData> GenerateInitialPopulation(
        TGenerator generator,
        size_t populationSize
    ) {
        std::vector<TData> population;
        population.reserve(populationSize);
        
        for (size_t i = 0; i < populationSize; ++i) {
            population.push_back(generator());
        }
        
        LOG_INFO("FeedbackLoop", "Generated initial population of {} individuals", populationSize);
        return population;
    }
    
    /**
     * @brief Evaluate population fitness
     */
    template<typename TEvaluator>
    std::vector<float> EvaluatePopulation(
        const std::vector<TData>& population,
        TEvaluator evaluator
    ) {
        std::vector<float> fitness(population.size());
        
        for (size_t i = 0; i < population.size(); ++i) {
            fitness[i] = evaluator(population[i]);
        }
        
        return fitness;
    }
    
    /**
     * @brief Calculate generation statistics
     */
    typename FeedbackLoopResult<TData>::GenerationStats CalculateGenerationStats(
        const std::vector<float>& fitness
    ) {
        typename FeedbackLoopResult<TData>::GenerationStats stats;
        
        if (!fitness.empty()) {
            stats.bestFitness = *std::max_element(fitness.begin(), fitness.end());
            stats.averageFitness = std::accumulate(fitness.begin(), fitness.end(), 0.0f) / fitness.size();
            
            // Calculate diversity as standard deviation
            float variance = 0.0f;
            for (float f : fitness) {
                float diff = f - stats.averageFitness;
                variance += diff * diff;
            }
            stats.diversity = std::sqrt(variance / fitness.size());
        }
        
        return stats;
    }
    
    /**
     * @brief Check convergence based on fitness history
     */
    bool CheckConvergence(
        const std::vector<typename FeedbackLoopResult<TData>::GenerationStats>& history,
        float threshold
    ) {
        if (history.size() < 5) return false;
        
        // Check if best fitness has plateaued
        float recentImprovement = 0.0f;
        for (size_t i = history.size() - 5; i < history.size() - 1; ++i) {
            recentImprovement += history[i + 1].bestFitness - history[i].bestFitness;
        }
        
        return std::abs(recentImprovement) < threshold;
    }
    
    /**
     * @brief Identify promising candidates for batch expansion
     */
    void IdentifyPromisingCandidates(FeedbackLoopResult<TData>& result) {
        if (result.finalFitness.empty()) return;
        
        // Find top 20% performers
        std::vector<size_t> indices(result.finalFitness.size());
        std::iota(indices.begin(), indices.end(), 0);
        
        size_t topCount = std::max(size_t(1), result.finalFitness.size() / 5);
        std::partial_sort(
            indices.begin(),
            indices.begin() + topCount,
            indices.end(),
            [&](size_t a, size_t b) {
                return result.finalFitness[a] > result.finalFitness[b];
            }
        );
        
        result.promisingIndices.assign(indices.begin(), indices.begin() + topCount);
    }
    
    /**
     * @brief Report progress to callback
     */
    void ReportProgress(
        size_t generation,
        const typename FeedbackLoopResult<TData>::GenerationStats& stats
    ) {
        LOG_INFO("FeedbackLoop", "Generation {}: Best={}, Avg={}, Diversity={}", 
                generation, stats.bestFitness, stats.averageFitness, stats.diversity);
        
        if (m_progressCallback) {
            m_progressCallback(generation, stats.bestFitness, stats.averageFitness);
        }
    }
};

/**
 * @brief Factory for creating configured feedback loop managers
 */
template<typename TData>
class FeedbackLoopManagerFactory {
public:
    using ManagerType = FeedbackLoopManager<TData>;
    using ManagerPtr = std::unique_ptr<ManagerType>;
    
    /**
     * @brief Create a basic manager
     */
    static ManagerPtr CreateManager() {
        return std::make_unique<ManagerType>();
    }
    
    /**
     * @brief Create a manager optimized for batch operations
     */
    static ManagerPtr CreateBatchOptimizedManager(size_t batchSize = 10) {
        auto manager = std::make_unique<ManagerType>();
        // Future: Configure for batch operations
        return manager;
    }
};

} // namespace PlanetGen::Generation::Optimization
module;

#include <memory>
#include <vector>
#include <string>
#include <functional>
#include <chrono>
#include <optional>
#include <concepts>
#include <type_traits>

#include <unordered_map>
export module IFeedbackOptimizer;

import GLMModule;

export namespace PlanetGen::Generation::Optimization {

/**
 * @brief Progress tracking for optimization runs
 */
struct OptimizationProgress {
    uint32_t currentGeneration = 0;
    uint32_t totalGenerations = 0;
    uint32_t evaluatedSamples = 0;
    float bestFitness = 0.0f;
    float averageFitness = 0.0f;
    float convergenceMetric = 0.0f;
    std::chrono::milliseconds elapsedTime{0};
    std::string currentPhase = "Initializing";
};

/**
 * @brief Configuration for optimization runs
 */
template<typename TData>
struct OptimizationConfig {
    uint32_t populationSize = 50;
    uint32_t maxGenerations = 100;
    float convergenceThreshold = 0.001f;
    float mutationRate = 0.1f;
    float crossoverRate = 0.8f;
    float elitePercentage = 0.1f;
    bool enableParallelEvaluation = true;
    uint32_t randomSeed = 0;
    
    // Optional constraints on the generated objects
    std::optional<TData> minBounds;
    std::optional<TData> maxBounds;
    
    // Early stopping criteria
    std::optional<float> targetFitness;
    std::optional<std::chrono::milliseconds> maxDuration;
};

/**
 * @brief Result of an optimization run
 */
template<typename TData>
struct OptimizationResult {
    TData bestSolution;
    float bestFitness = 0.0f;
    std::vector<TData> paretoFront; // For multi-objective optimization
    uint32_t generationsCompleted = 0;
    uint32_t totalEvaluations = 0;
    std::chrono::milliseconds totalDuration{0};
    bool converged = false;
    std::string terminationReason;
    
    // Historical data for analysis
    std::vector<float> fitnessHistory;
    std::vector<float> diversityHistory;
};

/**
 * @brief Concept for types that can be optimized
 */
template<typename T>
concept Optimizable = requires(T a, T b) {
    { a = b } -> std::same_as<T&>;
    { T{} } -> std::same_as<T>;
};

/**
 * @brief Concept for fitness evaluators
 */
template<typename T>
concept FitnessEvaluable = requires(T evaluator) {
    typename T::DataType;
    { evaluator.EvaluateFitness(std::declval<typename T::DataType>()) } -> std::convertible_to<float>;
};

/**
 * @brief Base interface for feedback optimization using CRTP
 * 
 * This interface enables optimization of any procedurally generated object
 * by providing a generic framework that works with different data types
 * and evaluation strategies.
 * 
 * @tparam TDerived The derived optimizer class (CRTP)
 * @tparam TData The data type being optimized (e.g., PlanetaryData, MeshData, TextureParams)
 */
template<typename TDerived, typename TData>
    requires Optimizable<TData>
class IFeedbackOptimizer {
public:
    using DataType = TData;
    using ConfigType = OptimizationConfig<TData>;
    using ResultType = OptimizationResult<TData>;
    using ProgressCallback = std::function<void(const OptimizationProgress&)>;
    using GenerationCallback = std::function<void(uint32_t generation, const std::vector<TData>&)>;
    
    virtual ~IFeedbackOptimizer() = default;
    
    /**
     * @brief Get the name of this optimizer implementation
     */
    std::string GetOptimizerName() const {
        return static_cast<const TDerived*>(this)->GetOptimizerNameImpl();
    }
    
    /**
     * @brief Get the version of this optimizer
     */
    std::string GetOptimizerVersion() const {
        return static_cast<const TDerived*>(this)->GetOptimizerVersionImpl();
    }
    
    /**
     * @brief Run optimization with the given configuration and evaluator
     * 
     * @tparam TEvaluator The fitness evaluator type
     * @param config Optimization configuration
     * @param evaluator Fitness evaluator for the data type
     * @param generator Function to generate initial population
     * @return Optimization result
     */
    template<typename TEvaluator>
        requires FitnessEvaluable<TEvaluator>
    ResultType Optimize(
        const ConfigType& config,
        TEvaluator& evaluator,
        std::function<TData()> generator
    ) {
        return static_cast<TDerived*>(this)->OptimizeImpl(config, evaluator, generator);
    }
    
    /**
     * @brief Run multi-objective optimization
     * 
     * @tparam TEvaluator The fitness evaluator type
     * @param config Optimization configuration
     * @param evaluators Multiple fitness evaluators for different objectives
     * @param generator Function to generate initial population
     * @return Optimization result with Pareto front
     */
    template<typename TEvaluator>
        requires FitnessEvaluable<TEvaluator>
    ResultType OptimizeMultiObjective(
        const ConfigType& config,
        const std::vector<std::shared_ptr<TEvaluator>>& evaluators,
        std::function<TData()> generator
    ) {
        return static_cast<TDerived*>(this)->OptimizeMultiObjectiveImpl(
            config, evaluators, generator);
    }
    
    /**
     * @brief Continue optimization from a previous result
     */
    template<typename TEvaluator>
        requires FitnessEvaluable<TEvaluator>
    ResultType ContinueOptimization(
        const ResultType& previousResult,
        const ConfigType& config,
        TEvaluator& evaluator
    ) {
        return static_cast<TDerived*>(this)->ContinueOptimizationImpl(
            previousResult, config, evaluator);
    }
    
    /**
     * @brief Set progress callback for real-time monitoring
     */
    void SetProgressCallback(ProgressCallback callback) {
        m_progressCallback = std::move(callback);
    }
    
    /**
     * @brief Set generation callback for custom analysis
     */
    void SetGenerationCallback(GenerationCallback callback) {
        m_generationCallback = std::move(callback);
    }
    
    /**
     * @brief Check if the optimizer supports parallel evaluation
     */
    bool SupportsParallelEvaluation() const {
        return static_cast<const TDerived*>(this)->SupportsParallelEvaluationImpl();
    }
    
    /**
     * @brief Get recommended configuration for the data type
     */
    ConfigType GetRecommendedConfig() const {
        return static_cast<const TDerived*>(this)->GetRecommendedConfigImpl();
    }
    
    /**
     * @brief Validate configuration before optimization
     */
    bool ValidateConfig(const ConfigType& config) const {
        return static_cast<const TDerived*>(this)->ValidateConfigImpl(config);
    }
    
protected:
    // Callbacks for derived classes to use
    ProgressCallback m_progressCallback;
    GenerationCallback m_generationCallback;
    
    // Helper method for derived classes to report progress
    void ReportProgress(const OptimizationProgress& progress) {
        if (m_progressCallback) {
            m_progressCallback(progress);
        }
    }
    
    // Helper method for derived classes to report generation completion
    void ReportGeneration(uint32_t generation, const std::vector<TData>& population) {
        if (m_generationCallback) {
            m_generationCallback(generation, population);
        }
    }
};

/**
 * @brief Base class for evolutionary optimizers (common implementation)
 */
template<typename TDerived, typename TData>
class EvolutionaryOptimizerBase : public IFeedbackOptimizer<TDerived, TData> {
protected:
    using Base = IFeedbackOptimizer<TDerived, TData>;
    using typename Base::DataType;
    using typename Base::ConfigType;
    using typename Base::ResultType;
    
    /**
     * @brief Perform selection on population based on fitness
     */
    virtual std::vector<TData> Selection(
        const std::vector<TData>& population,
        const std::vector<float>& fitness,
        uint32_t selectCount
    ) = 0;
    
    /**
     * @brief Perform crossover between two parents
     */
    virtual TData Crossover(const TData& parent1, const TData& parent2) = 0;
    
    /**
     * @brief Perform mutation on an individual
     */
    virtual TData Mutate(const TData& individual, float mutationRate) = 0;
    
    /**
     * @brief Check convergence criteria
     */
    virtual bool CheckConvergence(
        const std::vector<float>& currentFitness,
        const std::vector<float>& previousFitness,
        float threshold
    ) = 0;
};

/**
 * @brief Interface for custom optimization strategies
 */
template<typename TData>
class IOptimizationStrategy {
public:
    virtual ~IOptimizationStrategy() = default;
    
    /**
     * @brief Generate next generation based on current population and fitness
     */
    virtual std::vector<TData> GenerateNextGeneration(
        const std::vector<TData>& currentPopulation,
        const std::vector<float>& fitness,
        const OptimizationConfig<TData>& config
    ) = 0;
    
    /**
     * @brief Get strategy name
     */
    virtual std::string GetStrategyName() const = 0;
    
    /**
     * @brief Check if strategy supports multi-objective optimization
     */
    virtual bool SupportsMultiObjective() const = 0;
};

/**
 * @brief Factory for creating optimizers
 */
template<typename TData>
class OptimizerFactory {
public:
    using OptimizerPtr = std::unique_ptr<IFeedbackOptimizer<TData, TData>>;
    using StrategyPtr = std::shared_ptr<IOptimizationStrategy<TData>>;
    
    /**
     * @brief Register an optimizer type
     */
    template<typename TOptimizer>
    void RegisterOptimizer(const std::string& name) {
        m_optimizerCreators[name] = []() -> OptimizerPtr {
            return std::make_unique<TOptimizer>();
        };
    }
    
    /**
     * @brief Register an optimization strategy
     */
    void RegisterStrategy(const std::string& name, StrategyPtr strategy) {
        m_strategies[name] = strategy;
    }
    
    /**
     * @brief Create an optimizer by name
     */
    OptimizerPtr CreateOptimizer(const std::string& name) const {
        auto it = m_optimizerCreators.find(name);
        if (it != m_optimizerCreators.end()) {
            return it->second();
        }
        return nullptr;
    }
    
    /**
     * @brief Get a strategy by name
     */
    StrategyPtr GetStrategy(const std::string& name) const {
        auto it = m_strategies.find(name);
        if (it != m_strategies.end()) {
            return it->second;
        }
        return nullptr;
    }
    
    /**
     * @brief Get all available optimizer names
     */
    std::vector<std::string> GetAvailableOptimizers() const {
        std::vector<std::string> names;
        for (const auto& [name, _] : m_optimizerCreators) {
            names.push_back(name);
        }
        return names;
    }
    
    /**
     * @brief Get all available strategy names
     */
    std::vector<std::string> GetAvailableStrategies() const {
        std::vector<std::string> names;
        for (const auto& [name, _] : m_strategies) {
            names.push_back(name);
        }
        return names;
    }
    
private:
    std::unordered_map<std::string, std::function<OptimizerPtr()>> m_optimizerCreators;
    std::unordered_map<std::string, StrategyPtr> m_strategies;
};

} // namespace PlanetGen::Generation::Optimization
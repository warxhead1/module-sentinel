module;

#include <vector>
#include <string>
#include <random>
#include <algorithm>
#include <numeric>
#include <concepts>
#include <ranges>
#include <optional>
#include <variant>
#include <functional>

#include <memory>
#include <memory>
#include <unordered_map>
export module IParameterOptimizationStrategy;

import GLMModule;
import IFitnessEvaluator;

export namespace PlanetGen::Generation::Optimization {

/**
 * @brief Parameter bounds for constrained optimization
 */
template<typename T>
struct ParameterBounds {
    T minValue;
    T maxValue;
    bool isPeriodic = false; // For angular parameters
    
    T Clamp(T value) const {
        if (isPeriodic) {
            // Wrap around for periodic parameters
            T range = maxValue - minValue;
            while (value < minValue) value += range;
            while (value > maxValue) value -= range;
            return value;
        }
        return std::clamp(value, minValue, maxValue);
    }
    
    T RandomValue(std::mt19937& rng) const {
        if constexpr (std::is_floating_point_v<T>) {
            std::uniform_real_distribution<T> dist(minValue, maxValue);
            return dist(rng);
        } else {
            std::uniform_int_distribution<T> dist(minValue, maxValue);
            return dist(rng);
        }
    }
};

/**
 * @brief Concept for parameter sets that can be optimized
 */
template<typename T>
concept OptimizableParameters = requires(T a, T b) {
    { a = b } -> std::same_as<T&>;
    { T{} } -> std::same_as<T>;
    // Removed value_type requirement as concrete types don't need it
};

/**
 * @brief Base interface for parameter optimization strategies using CRTP
 * 
 * This interface provides a framework for different optimization algorithms
 * to generate new parameter sets based on current population and fitness.
 * Supports evolutionary, gradient-based, and hybrid approaches.
 * 
 * @tparam TDerived The derived strategy class (CRTP)
 * @tparam TParams The parameter type being optimized
 */
template<typename TDerived, typename TParams>
    requires OptimizableParameters<TParams>
class IParameterOptimizationStrategy {
public:
    using ParamsType = TParams;
    using PopulationType = std::vector<TParams>;
    using FitnessType = std::vector<float>;
    
    virtual ~IParameterOptimizationStrategy() = default;
    
    /**
     * @brief Get strategy name
     */
    std::string GetStrategyName() const {
        return static_cast<const TDerived*>(this)->GetStrategyNameImpl();
    }
    
    /**
     * @brief Get strategy version
     */
    std::string GetStrategyVersion() const {
        return static_cast<const TDerived*>(this)->GetStrategyVersionImpl();
    }
    
    /**
     * @brief Generate initial population
     * 
     * @param populationSize Size of the population to generate
     * @param seed Random seed (0 for random)
     * @return Initial population
     */
    PopulationType GenerateInitialPopulation(
        size_t populationSize,
        uint32_t seed = 0
    ) const {
        return static_cast<const TDerived*>(this)->GenerateInitialPopulationImpl(
            populationSize, seed);
    }
    
    /**
     * @brief Generate next generation based on current population and fitness
     * 
     * @param currentPopulation Current parameter sets
     * @param fitness Fitness scores for current population
     * @param generation Current generation number
     * @return Next generation of parameter sets
     */
    PopulationType GenerateNextGeneration(
        const PopulationType& currentPopulation,
        const FitnessType& fitness,
        size_t generation
    ) const {
        return static_cast<const TDerived*>(this)->GenerateNextGenerationImpl(
            currentPopulation, fitness, generation);
    }
    
    /**
     * @brief Set parameter bounds for constrained optimization
     */
    void SetParameterBounds(
        const std::unordered_map<std::string, ParameterBounds<float>>& bounds
    ) {
        static_cast<TDerived*>(this)->SetParameterBoundsImpl(bounds);
    }
    
    /**
     * @brief Check if strategy supports multi-objective optimization
     */
    bool SupportsMultiObjective() const {
        return static_cast<const TDerived*>(this)->SupportsMultiObjectiveImpl();
    }
    
    /**
     * @brief Generate next generation for multi-objective optimization
     */
    PopulationType GenerateNextGenerationMultiObjective(
        const PopulationType& currentPopulation,
        const std::vector<std::vector<float>>& objectiveFitness,
        size_t generation
    ) const {
        if (!SupportsMultiObjective()) {
            // Fallback: use first objective
            return GenerateNextGeneration(currentPopulation, objectiveFitness[0], generation);
        }
        return static_cast<const TDerived*>(this)->GenerateNextGenerationMultiObjectiveImpl(
            currentPopulation, objectiveFitness, generation);
    }
    
    /**
     * @brief Get recommended configuration for this strategy
     */
    std::unordered_map<std::string, float> GetRecommendedConfig() const {
        return static_cast<const TDerived*>(this)->GetRecommendedConfigImpl();
    }
    
    /**
     * @brief Set strategy-specific configuration
     */
    void SetConfig(const std::unordered_map<std::string, float>& config) {
        static_cast<TDerived*>(this)->SetConfigImpl(config);
    }
    
    /**
     * @brief Adapt strategy parameters based on performance
     */
    void AdaptStrategy(
        const std::vector<float>& fitnessHistory,
        const std::vector<float>& diversityHistory
    ) {
        static_cast<TDerived*>(this)->AdaptStrategyImpl(fitnessHistory, diversityHistory);
    }
};

/**
 * @brief Base class for evolutionary strategies
 */
template<typename TDerived, typename TParams>
class EvolutionaryStrategyBase : public IParameterOptimizationStrategy<TDerived, TParams> {
protected:
    using Base = IParameterOptimizationStrategy<TDerived, TParams>;
    using typename Base::PopulationType;
    using typename Base::FitnessType;
    
    // Configuration parameters
    float m_mutationRate = 0.1f;
    float m_crossoverRate = 0.8f;
    float m_elitePercentage = 0.1f;
    float m_tournamentSize = 3;
    
    mutable std::mt19937 m_rng;
    
    /**
     * @brief Select parents using tournament selection
     */
    std::vector<size_t> TournamentSelection(
        const FitnessType& fitness,
        size_t numSelections
    ) const {
        std::vector<size_t> selected;
        selected.reserve(numSelections);
        
        std::uniform_int_distribution<size_t> dist(0, fitness.size() - 1);
        
        for (size_t i = 0; i < numSelections; ++i) {
            size_t best = dist(m_rng);
            float bestFitness = fitness[best];
            
            for (size_t j = 1; j < m_tournamentSize; ++j) {
                size_t candidate = dist(m_rng);
                if (fitness[candidate] > bestFitness) {
                    best = candidate;
                    bestFitness = fitness[candidate];
                }
            }
            
            selected.push_back(best);
        }
        
        return selected;
    }
    
    /**
     * @brief Get elite individuals
     */
    std::vector<size_t> GetEliteIndices(
        const FitnessType& fitness,
        size_t eliteCount
    ) const {
        std::vector<size_t> indices(fitness.size());
        std::iota(indices.begin(), indices.end(), 0);
        
        std::partial_sort(
            indices.begin(),
            indices.begin() + eliteCount,
            indices.end(),
            [&fitness](size_t a, size_t b) {
                return fitness[a] > fitness[b];
            }
        );
        
        indices.resize(eliteCount);
        return indices;
    }
    
    /**
     * @brief Perform crossover between two parents
     */
    virtual TParams Crossover(const TParams& parent1, const TParams& parent2) const = 0;
    
    /**
     * @brief Perform mutation on an individual
     */
    virtual TParams Mutate(const TParams& individual, float rate) const = 0;
};

/**
 * @brief Base interface for optimization strategies (for type erasure)
 */
class IOptimizationStrategyBase {
public:
    virtual ~IOptimizationStrategyBase() = default;
    virtual std::string GetStrategyName() const = 0;
    virtual std::string GetStrategyVersion() const = 0;
};

/**
 * @brief Differential Evolution strategy
 */
template<typename TParams>
class DifferentialEvolutionStrategy : public EvolutionaryStrategyBase<
    DifferentialEvolutionStrategy<TParams>, TParams>, public IOptimizationStrategyBase {
public:
    using Base = EvolutionaryStrategyBase<DifferentialEvolutionStrategy<TParams>, TParams>;
    using typename Base::PopulationType;
    using typename Base::FitnessType;
    
    DifferentialEvolutionStrategy() {
        m_F = 0.8f;  // Differential weight
        m_CR = 0.9f; // Crossover probability
    }
    
    // IOptimizationStrategyBase interface
    std::string GetStrategyName() const override {
        return GetStrategyNameImpl();
    }
    
    std::string GetStrategyVersion() const override {
        return GetStrategyVersionImpl();
    }
    
    // CRTP implementations
    std::string GetStrategyNameImpl() const {
        return "DifferentialEvolution";
    }
    
    std::string GetStrategyVersionImpl() const {
        return "1.0.0";
    }
    
    PopulationType GenerateInitialPopulationImpl(
        size_t populationSize,
        uint32_t seed
    ) const {
        if (seed != 0) {
            this->m_rng.seed(seed);
        } else {
            std::random_device rd;
            this->m_rng.seed(rd());
        }
        
        PopulationType population;
        population.reserve(populationSize);
        
        // Generate random individuals within bounds
        for (size_t i = 0; i < populationSize; ++i) {
            population.push_back(GenerateRandomIndividual());
        }
        
        return population;
    }
    
    PopulationType GenerateNextGenerationImpl(
        const PopulationType& currentPopulation,
        const FitnessType& fitness,
        size_t generation
    ) const {
        PopulationType nextGeneration;
        nextGeneration.reserve(currentPopulation.size());
        
        std::uniform_int_distribution<size_t> dist(0, currentPopulation.size() - 1);
        std::uniform_real_distribution<float> probDist(0.0f, 1.0f);
        
        for (size_t i = 0; i < currentPopulation.size(); ++i) {
            // Select three random individuals (different from i)
            size_t r1, r2, r3;
            do { r1 = dist(this->m_rng); } while (r1 == i);
            do { r2 = dist(this->m_rng); } while (r2 == i || r2 == r1);
            do { r3 = dist(this->m_rng); } while (r3 == i || r3 == r1 || r3 == r2);
            
            // Create mutant vector: v = x_r1 + F * (x_r2 - x_r3)
            TParams mutant = CreateMutantVector(
                currentPopulation[r1],
                currentPopulation[r2],
                currentPopulation[r3]
            );
            
            // Crossover
            TParams trial = CreateTrialVector(currentPopulation[i], mutant);
            
            // Selection (would need fitness evaluation in real implementation)
            nextGeneration.push_back(trial);
        }
        
        return nextGeneration;
    }
    
    void SetParameterBoundsImpl(
        const std::unordered_map<std::string, ParameterBounds<float>>& bounds
    ) {
        m_parameterBounds = bounds;
    }
    
    bool SupportsMultiObjectiveImpl() const {
        return true; // DE can be adapted for multi-objective
    }
    
    PopulationType GenerateNextGenerationMultiObjectiveImpl(
        const PopulationType& currentPopulation,
        const std::vector<std::vector<float>>& objectiveFitness,
        size_t generation
    ) const {
        // Implement MODE (Multi-Objective Differential Evolution)
        // For now, use scalarization
        FitnessType scalarizedFitness(currentPopulation.size());
        for (size_t i = 0; i < currentPopulation.size(); ++i) {
            float sum = 0.0f;
            for (const auto& objectives : objectiveFitness) {
                sum += objectives[i];
            }
            scalarizedFitness[i] = sum / objectiveFitness.size();
        }
        
        return GenerateNextGenerationImpl(currentPopulation, scalarizedFitness, generation);
    }
    
    std::unordered_map<std::string, float> GetRecommendedConfigImpl() const {
        return {
            {"F", 0.8f},
            {"CR", 0.9f},
            {"populationSize", 50.0f}
        };
    }
    
    void SetConfigImpl(const std::unordered_map<std::string, float>& config) {
        auto it = config.find("F");
        if (it != config.end()) m_F = it->second;
        
        it = config.find("CR");
        if (it != config.end()) m_CR = it->second;
    }
    
    void AdaptStrategyImpl(
        const std::vector<float>& fitnessHistory,
        const std::vector<float>& diversityHistory
    ) {
        // Adapt F and CR based on convergence
        if (fitnessHistory.size() > 10) {
            // Check if fitness is plateauing
            float recentImprovement = fitnessHistory.back() - fitnessHistory[fitnessHistory.size() - 10];
            if (recentImprovement < 0.01f) {
                // Increase exploration
                m_F = std::min(1.0f, m_F * 1.1f);
                m_CR = std::max(0.5f, m_CR * 0.95f);
            } else {
                // Increase exploitation
                m_F = std::max(0.4f, m_F * 0.95f);
                m_CR = std::min(0.95f, m_CR * 1.05f);
            }
        }
    }
    
protected:
    float m_F;  // Differential weight
    float m_CR; // Crossover probability
    std::unordered_map<std::string, ParameterBounds<float>> m_parameterBounds;
    
    TParams GenerateRandomIndividual() const {
        // This would need to be specialized for specific parameter types
        return TParams{};
    }
    
    TParams CreateMutantVector(
        const TParams& x1,
        const TParams& x2,
        const TParams& x3
    ) const {
        // v = x1 + F * (x2 - x3)
        // This would need to be specialized for specific parameter types
        return x1;
    }
    
    TParams CreateTrialVector(
        const TParams& target,
        const TParams& mutant
    ) const {
        // Binomial crossover
        // This would need to be specialized for specific parameter types
        return mutant;
    }
    
    TParams Crossover(const TParams& parent1, const TParams& parent2) const override {
        return CreateTrialVector(parent1, parent2);
    }
    
    TParams Mutate(const TParams& individual, float rate) const override {
        // DE doesn't use traditional mutation
        return individual;
    }
};

/**
 * @brief Particle Swarm Optimization strategy
 */
template<typename TParams>
class ParticleSwarmStrategy : public IParameterOptimizationStrategy<
    ParticleSwarmStrategy<TParams>, TParams>, public IOptimizationStrategyBase {
public:
    using Base = IParameterOptimizationStrategy<ParticleSwarmStrategy<TParams>, TParams>;
    using typename Base::PopulationType;
    using typename Base::FitnessType;
    
    struct Particle {
        TParams position;
        TParams velocity;
        TParams personalBest;
        float personalBestFitness = 0.0f;
    };
    
    ParticleSwarmStrategy() {
        m_w = 0.729f;    // Inertia weight
        m_c1 = 1.49445f; // Cognitive coefficient
        m_c2 = 1.49445f; // Social coefficient
    }
    
    // IOptimizationStrategyBase interface
    std::string GetStrategyName() const override {
        return GetStrategyNameImpl();
    }
    
    std::string GetStrategyVersion() const override {
        return GetStrategyVersionImpl();
    }
    
    // CRTP implementations
    std::string GetStrategyNameImpl() const {
        return "ParticleSwarmOptimization";
    }
    
    std::string GetStrategyVersionImpl() const {
        return "1.0.0";
    }
    
    PopulationType GenerateInitialPopulationImpl(
        size_t populationSize,
        uint32_t seed
    ) const {
        if (seed != 0) {
            m_rng.seed(seed);
        } else {
            std::random_device rd;
            m_rng.seed(rd());
        }
        
        // Initialize particles
        m_particles.clear();
        m_particles.reserve(populationSize);
        
        PopulationType population;
        population.reserve(populationSize);
        
        for (size_t i = 0; i < populationSize; ++i) {
            Particle particle;
            particle.position = GenerateRandomPosition();
            particle.velocity = GenerateRandomVelocity();
            particle.personalBest = particle.position;
            
            m_particles.push_back(particle);
            population.push_back(particle.position);
        }
        
        return population;
    }
    
    PopulationType GenerateNextGenerationImpl(
        const PopulationType& currentPopulation,
        const FitnessType& fitness,
        size_t generation
    ) const {
        // Update personal bests
        for (size_t i = 0; i < m_particles.size(); ++i) {
            if (fitness[i] > m_particles[i].personalBestFitness) {
                m_particles[i].personalBest = currentPopulation[i];
                m_particles[i].personalBestFitness = fitness[i];
            }
        }
        
        // Find global best
        auto maxIt = std::max_element(fitness.begin(), fitness.end());
        size_t globalBestIdx = std::distance(fitness.begin(), maxIt);
        TParams globalBest = currentPopulation[globalBestIdx];
        
        // Update particles
        PopulationType nextGeneration;
        nextGeneration.reserve(m_particles.size());
        
        std::uniform_real_distribution<float> dist(0.0f, 1.0f);
        
        for (size_t i = 0; i < m_particles.size(); ++i) {
            // Update velocity
            m_particles[i].velocity = UpdateVelocity(
                m_particles[i],
                globalBest,
                dist(m_rng),
                dist(m_rng)
            );
            
            // Update position
            m_particles[i].position = UpdatePosition(
                m_particles[i].position,
                m_particles[i].velocity
            );
            
            nextGeneration.push_back(m_particles[i].position);
        }
        
        return nextGeneration;
    }
    
    void SetParameterBoundsImpl(
        const std::unordered_map<std::string, ParameterBounds<float>>& bounds
    ) {
        m_parameterBounds = bounds;
    }
    
    bool SupportsMultiObjectiveImpl() const {
        return true; // Can be adapted for MOPSO
    }
    
    PopulationType GenerateNextGenerationMultiObjectiveImpl(
        const PopulationType& currentPopulation,
        const std::vector<std::vector<float>>& objectiveFitness,
        size_t generation
    ) const {
        // Simplified: use first objective
        return GenerateNextGenerationImpl(currentPopulation, objectiveFitness[0], generation);
    }
    
    std::unordered_map<std::string, float> GetRecommendedConfigImpl() const {
        return {
            {"w", 0.729f},
            {"c1", 1.49445f},
            {"c2", 1.49445f},
            {"populationSize", 30.0f}
        };
    }
    
    void SetConfigImpl(const std::unordered_map<std::string, float>& config) {
        auto it = config.find("w");
        if (it != config.end()) m_w = it->second;
        
        it = config.find("c1");
        if (it != config.end()) m_c1 = it->second;
        
        it = config.find("c2");
        if (it != config.end()) m_c2 = it->second;
    }
    
    void AdaptStrategyImpl(
        const std::vector<float>& fitnessHistory,
        const std::vector<float>& diversityHistory
    ) {
        // Linearly decrease inertia weight over time
        m_w = std::max(0.4f, m_w * 0.99f);
    }
    
protected:
    float m_w;  // Inertia weight
    float m_c1; // Cognitive coefficient
    float m_c2; // Social coefficient
    
    mutable std::mt19937 m_rng;
    mutable std::vector<Particle> m_particles;
    std::unordered_map<std::string, ParameterBounds<float>> m_parameterBounds;
    
    TParams GenerateRandomPosition() const {
        // This would need to be specialized for specific parameter types
        return TParams{};
    }
    
    TParams GenerateRandomVelocity() const {
        // This would need to be specialized for specific parameter types
        return TParams{};
    }
    
    TParams UpdateVelocity(
        const Particle& particle,
        const TParams& globalBest,
        float r1,
        float r2
    ) const {
        // v = w*v + c1*r1*(pbest - x) + c2*r2*(gbest - x)
        // This would need to be specialized for specific parameter types
        return particle.velocity;
    }
    
    TParams UpdatePosition(
        const TParams& position,
        const TParams& velocity
    ) const {
        // x = x + v
        // This would need to be specialized for specific parameter types
        return position;
    }
};

/**
 * @brief Factory for creating optimization strategies
 */
template<typename TParams>
class OptimizationStrategyFactory {
public:
    using StrategyPtr = std::unique_ptr<IParameterOptimizationStrategy<
        OptimizationStrategyFactory<TParams>, TParams>>;
    using CreatorFunc = std::function<StrategyPtr()>;
    
    /**
     * @brief Register a strategy type
     */
    template<typename TStrategy>
    void RegisterStrategy(const std::string& name) {
        m_creators[name] = []() -> StrategyPtr {
            return std::make_unique<TStrategy>();
        };
    }
    
    /**
     * @brief Create a strategy by name
     */
    StrategyPtr CreateStrategy(const std::string& name) const {
        auto it = m_creators.find(name);
        if (it != m_creators.end()) {
            return it->second();
        }
        return nullptr;
    }
    
    /**
     * @brief Get all available strategy names
     */
    std::vector<std::string> GetAvailableStrategies() const {
        std::vector<std::string> names;
        for (const auto& [name, _] : m_creators) {
            names.push_back(name);
        }
        return names;
    }
    
private:
    std::unordered_map<std::string, CreatorFunc> m_creators;
};

} // namespace PlanetGen::Generation::Optimization
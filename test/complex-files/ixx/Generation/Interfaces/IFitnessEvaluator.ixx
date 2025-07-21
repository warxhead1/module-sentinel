module;

#include <vector>
#include <string>
#include <concepts>
#include <type_traits>
#include <span>
#include <optional>
#include <unordered_map>
#include <memory>
#include <variant>
#include <chrono>
#include <functional>

#include <utility>
export module IFitnessEvaluator;

import GLMModule;

export namespace PlanetGen::Generation::Evaluation {

/**
 * @brief Fitness evaluation result with multi-objective support
 */
template<typename TData>
struct FitnessResult {
    // Primary fitness score (0-1 range)
    float totalFitness = 0.0f;
    
    // Component scores for multi-objective optimization
    std::unordered_map<std::string, float> componentScores;
    
    // Feature vector for ML/correlation analysis
    std::vector<float> featureVector;
    
    // Raw metrics (no interpretation, just measurements)
    std::unordered_map<std::string, float> metrics;
    
    // Optional gradient information for gradient-based optimization
    std::optional<std::vector<float>> gradient;
    
    // Confidence in the evaluation (0-1)
    float confidence = 1.0f;
    
    // Evaluation metadata
    std::chrono::microseconds evaluationTime;
    std::string evaluatorName;
    std::string evaluatorVersion;
};

/**
 * @brief Detailed fitness report for analysis and debugging
 */
struct FitnessReport {
    std::string summary;
    std::vector<std::pair<std::string, std::string>> details;
    std::vector<std::string> warnings;
    std::vector<std::string> recommendations;
};

/**
 * @brief Concept for types that can be fitness evaluated
 */
template<typename T>
concept FitnessEvaluable = requires(T t) {
    { T{} } -> std::same_as<T>;
    // Removed value_type requirement as concrete types don't need it
};

/**
 * @brief Base interface for fitness evaluation using CRTP
 * 
 * This interface provides a generic framework for evaluating the fitness
 * of any procedurally generated object. It supports single and multi-objective
 * evaluation, batch processing, and extensibility through CRTP.
 * 
 * @tparam TDerived The derived evaluator class (CRTP)
 * @tparam TData The data type being evaluated (e.g., TerrainData, MeshData, TextureData)
 */
template<typename TDerived, typename TData>
    requires FitnessEvaluable<TData>
class IFitnessEvaluator {
public:
    using DataType = TData;
    using ResultType = FitnessResult<TData>;
    using BatchResultType = std::vector<ResultType>;
    
    virtual ~IFitnessEvaluator() = default;
    
    /**
     * @brief Get the evaluator name
     */
    std::string GetEvaluatorName() const {
        return static_cast<const TDerived*>(this)->GetEvaluatorNameImpl();
    }
    
    /**
     * @brief Get the evaluator version
     */
    std::string GetEvaluatorVersion() const {
        return static_cast<const TDerived*>(this)->GetEvaluatorVersionImpl();
    }
    
    /**
     * @brief Evaluate fitness of a single object
     * 
     * @param data The data to evaluate
     * @return Fitness result
     */
    ResultType EvaluateFitness(const TData& data) const {
        auto start = std::chrono::high_resolution_clock::now();
        
        auto result = static_cast<const TDerived*>(this)->EvaluateFitnessImpl(data);
        
        auto end = std::chrono::high_resolution_clock::now();
        result.evaluationTime = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
        result.evaluatorName = GetEvaluatorName();
        result.evaluatorVersion = GetEvaluatorVersion();
        
        return result;
    }
    
    /**
     * @brief Evaluate fitness with a reference target
     * 
     * @param data The data to evaluate
     * @param target The target/reference data
     * @return Fitness result
     */
    ResultType EvaluateFitnessAgainstTarget(
        const TData& data,
        const TData& target
    ) const {
        return static_cast<const TDerived*>(this)->EvaluateFitnessAgainstTargetImpl(data, target);
    }
    
    /**
     * @brief Batch evaluate multiple objects
     * 
     * @param dataSpan Span of data to evaluate
     * @return Vector of fitness results
     */
    BatchResultType EvaluateBatch(std::span<const TData> dataSpan) const {
        return static_cast<const TDerived*>(this)->EvaluateBatchImpl(dataSpan);
    }
    
    /**
     * @brief Get detailed report for the last evaluation
     */
    FitnessReport GetDetailedReport() const {
        return static_cast<const TDerived*>(this)->GetDetailedReportImpl();
    }
    
    /**
     * @brief Get the evaluation criteria this evaluator uses
     */
    std::vector<std::string> GetEvaluationCriteria() const {
        return static_cast<const TDerived*>(this)->GetEvaluationCriteriaImpl();
    }
    
    /**
     * @brief Get the weights for each evaluation criterion
     */
    std::unordered_map<std::string, float> GetCriteriaWeights() const {
        return static_cast<const TDerived*>(this)->GetCriteriaWeightsImpl();
    }
    
    /**
     * @brief Set custom weights for evaluation criteria
     */
    void SetCriteriaWeights(const std::unordered_map<std::string, float>& weights) {
        static_cast<TDerived*>(this)->SetCriteriaWeightsImpl(weights);
    }
    
    /**
     * @brief Check if this evaluator supports gradient computation
     */
    bool SupportsGradient() const {
        return static_cast<const TDerived*>(this)->SupportsGradientImpl();
    }
    
    /**
     * @brief Compute gradient of fitness with respect to parameters
     */
    std::optional<std::vector<float>> ComputeGradient(
        const TData& data,
        float epsilon = 1e-5f
    ) const {
        if (!SupportsGradient()) {
            return std::nullopt;
        }
        return static_cast<const TDerived*>(this)->ComputeGradientImpl(data, epsilon);
    }
    
    /**
     * @brief Get recommended parameter ranges for this evaluator
     */
    std::unordered_map<std::string, std::pair<float, float>> GetRecommendedRanges() const {
        return static_cast<const TDerived*>(this)->GetRecommendedRangesImpl();
    }
};

/**
 * @brief Base evaluator interface for type erasure
 */
template<typename TData>
class IFitnessEvaluatorBase {
public:
    virtual ~IFitnessEvaluatorBase() = default;
    virtual FitnessResult<TData> EvaluateFitness(const TData& data) const = 0;
    virtual FitnessResult<TData> EvaluateFitnessAgainstTarget(const TData& data, const TData& target) const = 0;
    virtual std::string GetEvaluatorName() const = 0;
    virtual std::string GetEvaluatorVersion() const = 0;
};

/**
 * @brief Composite evaluator for multi-criteria evaluation
 */
template<typename TData>
class CompositeEvaluator : public IFitnessEvaluator<CompositeEvaluator<TData>, TData> {
public:
    using Base = IFitnessEvaluator<CompositeEvaluator<TData>, TData>;
    using EvaluatorPtr = std::shared_ptr<IFitnessEvaluatorBase<TData>>;
    
    /**
     * @brief Add a component evaluator with weight
     */
    void AddEvaluator(const std::string& name, EvaluatorPtr evaluator, float weight = 1.0f) {
        m_evaluators[name] = {evaluator, weight};
        m_totalWeight += weight;
    }
    
    /**
     * @brief Remove a component evaluator
     */
    void RemoveEvaluator(const std::string& name) {
        auto it = m_evaluators.find(name);
        if (it != m_evaluators.end()) {
            m_totalWeight -= it->second.weight;
            m_evaluators.erase(it);
        }
    }
    
    // CRTP implementations
    std::string GetEvaluatorNameImpl() const {
        return "CompositeEvaluator";
    }
    
    std::string GetEvaluatorVersionImpl() const {
        return "1.0.0";
    }
    
    typename Base::ResultType EvaluateFitnessImpl(const TData& data) const {
        typename Base::ResultType result;
        
        if (m_evaluators.empty() || m_totalWeight == 0.0f) {
            return result;
        }
        
        // Evaluate each component
        for (const auto& [name, evalPair] : m_evaluators) {
            auto componentResult = evalPair.evaluator->EvaluateFitness(data);
            float normalizedWeight = evalPair.weight / m_totalWeight;
            
            // Accumulate weighted fitness
            result.totalFitness += componentResult.totalFitness * normalizedWeight;
            
            // Store component scores
            result.componentScores[name] = componentResult.totalFitness;
            
            // Merge metrics
            for (const auto& [metric, value] : componentResult.metrics) {
                result.metrics[name + "." + metric] = value;
            }
            
            // Combine feature vectors
            result.featureVector.insert(
                result.featureVector.end(),
                componentResult.featureVector.begin(),
                componentResult.featureVector.end()
            );
        }
        
        result.confidence = 1.0f; // Composite evaluators are always confident
        return result;
    }
    
    typename Base::ResultType EvaluateFitnessAgainstTargetImpl(
        const TData& data,
        const TData& target
    ) const {
        typename Base::ResultType result;
        
        for (const auto& [name, evalPair] : m_evaluators) {
            auto componentResult = evalPair.evaluator->EvaluateFitnessAgainstTarget(data, target);
            float normalizedWeight = evalPair.weight / m_totalWeight;
            
            result.totalFitness += componentResult.totalFitness * normalizedWeight;
            result.componentScores[name] = componentResult.totalFitness;
        }
        
        return result;
    }
    
    typename Base::BatchResultType EvaluateBatchImpl(std::span<const TData> dataSpan) const {
        typename Base::BatchResultType results;
        results.reserve(dataSpan.size());
        
        for (const auto& data : dataSpan) {
            results.push_back(EvaluateFitness(data));
        }
        
        return results;
    }
    
    FitnessReport GetDetailedReportImpl() const {
        FitnessReport report;
        report.summary = "Composite evaluation using " + 
                        std::to_string(m_evaluators.size()) + " evaluators";
        
        for (const auto& [name, evalPair] : m_evaluators) {
            report.details.push_back({
                name,
                "Weight: " + std::to_string(evalPair.weight / m_totalWeight)
            });
        }
        
        return report;
    }
    
    std::vector<std::string> GetEvaluationCriteriaImpl() const {
        std::vector<std::string> criteria;
        for (const auto& [name, _] : m_evaluators) {
            criteria.push_back(name);
        }
        return criteria;
    }
    
    std::unordered_map<std::string, float> GetCriteriaWeightsImpl() const {
        std::unordered_map<std::string, float> weights;
        for (const auto& [name, evalPair] : m_evaluators) {
            weights[name] = evalPair.weight / m_totalWeight;
        }
        return weights;
    }
    
    void SetCriteriaWeightsImpl(const std::unordered_map<std::string, float>& weights) {
        for (const auto& [name, weight] : weights) {
            auto it = m_evaluators.find(name);
            if (it != m_evaluators.end()) {
                m_totalWeight -= it->second.weight;
                it->second.weight = weight;
                m_totalWeight += weight;
            }
        }
    }
    
    bool SupportsGradientImpl() const {
        return false; // Composite evaluators don't support gradient by default
    }
    
    std::optional<std::vector<float>> ComputeGradientImpl(
        const TData& data,
        float epsilon
    ) const {
        return std::nullopt;
    }
    
    std::unordered_map<std::string, std::pair<float, float>> GetRecommendedRangesImpl() const {
        // Return empty - composite evaluators don't have specific ranges
        return {};
    }
    
private:
    struct EvaluatorPair {
        EvaluatorPtr evaluator;
        float weight;
    };
    
    std::unordered_map<std::string, EvaluatorPair> m_evaluators;
    float m_totalWeight = 0.0f;
};

/**
 * @brief Factory for creating fitness evaluators
 */
template<typename TData>
class FitnessEvaluatorFactory {
public:
    using EvaluatorPtr = std::unique_ptr<IFitnessEvaluator<FitnessEvaluatorFactory<TData>, TData>>;
    using CreatorFunc = std::function<EvaluatorPtr()>;
    
    /**
     * @brief Register an evaluator type
     */
    template<typename TEvaluator>
    void RegisterEvaluator(const std::string& name) {
        m_creators[name] = []() -> EvaluatorPtr {
            return std::make_unique<TEvaluator>();
        };
    }
    
    /**
     * @brief Create an evaluator by name
     */
    EvaluatorPtr CreateEvaluator(const std::string& name) const {
        auto it = m_creators.find(name);
        if (it != m_creators.end()) {
            return it->second();
        }
        return nullptr;
    }
    
    /**
     * @brief Get all available evaluator names
     */
    std::vector<std::string> GetAvailableEvaluators() const {
        std::vector<std::string> names;
        for (const auto& [name, _] : m_creators) {
            names.push_back(name);
        }
        return names;
    }
    
    /**
     * @brief Create a composite evaluator from configuration
     */
    std::unique_ptr<CompositeEvaluator<TData>> CreateCompositeEvaluator(
        const std::vector<std::pair<std::string, float>>& components
    ) const {
        auto composite = std::make_unique<CompositeEvaluator<TData>>();
        
        for (const auto& [name, weight] : components) {
            auto evaluator = CreateEvaluator(name);
            if (evaluator) {
                composite->AddEvaluator(name, std::move(evaluator), weight);
            }
        }
        
        return composite;
    }
    
private:
    std::unordered_map<std::string, CreatorFunc> m_creators;
};

/**
 * @brief Pareto dominance checker for multi-objective optimization
 */
template<typename TData>
class ParetoDominanceChecker {
public:
    /**
     * @brief Check if solution A dominates solution B
     */
    static bool Dominates(
        const FitnessResult<TData>& a,
        const FitnessResult<TData>& b
    ) {
        bool atLeastOneBetter = false;
        
        for (const auto& [criterion, scoreA] : a.componentScores) {
            auto itB = b.componentScores.find(criterion);
            if (itB != b.componentScores.end()) {
                if (scoreA < itB->second) {
                    return false; // B is better in this criterion
                } else if (scoreA > itB->second) {
                    atLeastOneBetter = true;
                }
            }
        }
        
        return atLeastOneBetter;
    }
    
    /**
     * @brief Extract Pareto front from a set of solutions
     */
    static std::vector<size_t> GetParetoFront(
        const std::vector<FitnessResult<TData>>& solutions
    ) {
        std::vector<size_t> paretoFront;
        
        for (size_t i = 0; i < solutions.size(); ++i) {
            bool isDominated = false;
            
            for (size_t j = 0; j < solutions.size(); ++j) {
                if (i != j && Dominates(solutions[j], solutions[i])) {
                    isDominated = true;
                    break;
                }
            }
            
            if (!isDominated) {
                paretoFront.push_back(i);
            }
        }
        
        return paretoFront;
    }
};

} // namespace PlanetGen::Generation::Evaluation
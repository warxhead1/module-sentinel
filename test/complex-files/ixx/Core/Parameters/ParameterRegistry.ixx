module;

#include <any>
#include <functional>
#include <limits>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <typeindex>
#include <unordered_map>
#include <vector>
#include <nlohmann/json.hpp>
#include <Core/Logging/LoggerMacros.h>

#include <utility>
export module Core.Parameters.Registry;

import Core.Logging.Logger;

export namespace PlanetGen::Core::Parameters {

template<typename T>
struct Parameter {
    T value;
    T defaultValue;
    T minValue;
    T maxValue;
    bool hasConstraints;
    std::optional<std::function<bool(T)>> validator;
    
    Parameter(T defaultVal, T minVal = std::numeric_limits<T>::min(), 
              T maxVal = std::numeric_limits<T>::max())
        : value(defaultVal)
        , defaultValue(defaultVal)
        , minValue(minVal)
        , maxValue(maxVal)
        , hasConstraints(minVal != std::numeric_limits<T>::min() || 
                         maxVal != std::numeric_limits<T>::max()) {}
    
    bool validate(T val) const {
        if (hasConstraints && (val < minValue || val > maxValue)) {
            return false;
        }
        if (validator && !(*validator)(val)) {
            return false;
        }
        return true;
    }
};

enum class ParameterMergeStrategy {
    OverrideExisting,
    KeepExisting,
    UseHigherPriority
};

class ParameterRegistry {
public:
    ParameterRegistry() = default;
    ~ParameterRegistry() = default;
    
    // Prevent copying but allow moving
    ParameterRegistry(const ParameterRegistry&) = delete;
    ParameterRegistry& operator=(const ParameterRegistry&) = delete;
    ParameterRegistry(ParameterRegistry&&) = default;
    ParameterRegistry& operator=(ParameterRegistry&&) = default;
    
    // Define parameter with constraints
    template<typename T>
    void DefineParameter(const std::string& name, 
                        T defaultValue,
                        T minValue = std::numeric_limits<T>::min(),
                        T maxValue = std::numeric_limits<T>::max()) {
        std::lock_guard<std::mutex> lock(m_mutex);
        
        auto param = std::make_shared<Parameter<T>>(defaultValue, minValue, maxValue);
        m_parameters[name] = param;
        m_typeMap.emplace(name, std::type_index(typeid(T)));
        
        // Note: Can't use LOG_TRACE in template function - will log from non-template code
    }
    
    // Get parameter with fallback chain
    template<typename T>
    T Get(const std::string& name, 
          const std::optional<T>& override = std::nullopt) const {
        std::lock_guard<std::mutex> lock(m_mutex);
        
        // Priority 1: Explicit override
        if (override.has_value()) {
            return override.value();
        }
        
        // Priority 2: Runtime override
        auto runtimeIt = m_runtimeOverrides.find(name);
        if (runtimeIt != m_runtimeOverrides.end()) {
            try {
                return std::any_cast<T>(runtimeIt->second);
            } catch (const std::bad_any_cast&) {
                // Type mismatch for runtime override
                throw std::runtime_error("Type mismatch for runtime override of parameter '" + name + "'");
            }
        }
        
        // Priority 3: Registered parameter value
        auto paramIt = m_parameters.find(name);
        if (paramIt != m_parameters.end()) {
            try {
                auto param = std::any_cast<std::shared_ptr<Parameter<T>>>(paramIt->second);
                return param->value;
            } catch (const std::bad_any_cast&) {
                // Type mismatch for parameter
                throw std::runtime_error("Type mismatch for parameter '" + name + "'");
            }
        }
        
        // Priority 4: Error
        throw std::runtime_error("Unknown parameter: " + name);
    }
    
    // Get with fallback value
    template<typename T>
    T GetOr(const std::string& name, T fallback) const {
        try {
            return Get<T>(name);
        } catch (...) {
            return fallback;
        }
    }
    
    // Set runtime override
    template<typename T>
    void SetRuntimeOverride(const std::string& name, T value) {
        std::lock_guard<std::mutex> lock(m_mutex);
        
        // Validate if parameter is defined
        auto paramIt = m_parameters.find(name);
        if (paramIt != m_parameters.end()) {
            try {
                auto param = std::any_cast<std::shared_ptr<Parameter<T>>>(paramIt->second);
                if (!param->validate(value)) {
                    // Value failed validation
                    return;
                }
            } catch (const std::bad_any_cast&) {
                // Type mismatch when setting override
                return;
            }
        }
        
        m_runtimeOverrides[name] = value;
        
        // Trigger change callbacks
        auto callbackIt = m_changeCallbacks.find(name);
        if (callbackIt != m_changeCallbacks.end()) {
            for (const auto& callback : callbackIt->second) {
                callback(std::any(value));
            }
        }
    }
    
    // Temporary override with RAII guard
    template<typename T>
    class TemporaryOverrideGuard {
    public:
        TemporaryOverrideGuard(ParameterRegistry& registry, const std::string& name, T value)
            : m_registry(registry)
            , m_name(name)
            , m_hadOverride(false) {
            
            auto it = m_registry.m_runtimeOverrides.find(name);
            if (it != m_registry.m_runtimeOverrides.end()) {
                m_hadOverride = true;
                m_previousValue = it->second;
            }
            
            m_registry.SetRuntimeOverride(name, value);
        }
        
        ~TemporaryOverrideGuard() {
            if (m_hadOverride) {
                m_registry.m_runtimeOverrides[m_name] = m_previousValue;
            } else {
                m_registry.m_runtimeOverrides.erase(m_name);
            }
        }
        
    private:
        ParameterRegistry& m_registry;
        std::string m_name;
        bool m_hadOverride;
        std::any m_previousValue;
    };
    
    template<typename T>
    TemporaryOverrideGuard<T> TemporaryOverride(const std::string& name, T value) {
        return TemporaryOverrideGuard<T>(*this, name, value);
    }
    
    // Add custom validator
    template<typename T>
    void AddValidator(const std::string& name, std::function<bool(T)> validator) {
        std::lock_guard<std::mutex> lock(m_mutex);
        
        auto paramIt = m_parameters.find(name);
        if (paramIt != m_parameters.end()) {
            try {
                auto param = std::any_cast<std::shared_ptr<Parameter<T>>>(paramIt->second);
                param->validator = validator;
            } catch (const std::bad_any_cast&) {
                // Type mismatch when adding validator
            }
        }
    }
    
    // Parameter change callbacks
    void OnParameterChange(const std::string& name, std::function<void(const std::any&)> callback) {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_changeCallbacks[name].push_back(callback);
    }
    
    // Serialization
    void LoadFromJson(const nlohmann::json& config);
    nlohmann::json SaveToJson() const;
    
    // Merge configurations
    void MergeFrom(const ParameterRegistry& other, ParameterMergeStrategy strategy);
    
    // Validation
    bool Validate() const;
    std::vector<std::string> GetValidationErrors() const;
    
    // Usage tracking
    void EnableUsageTracking(bool enable) { m_trackUsage = enable; }
    std::vector<std::string> GetUnusedParameters() const;
    void ResetUsageTracking();
    
    // Debugging
    void DumpToLog() const;
    std::unordered_map<std::string, std::pair<std::any, std::any>> Diff(const ParameterRegistry& other) const;
    
    // Query available parameters
    std::vector<std::string> GetParameterNames() const;
    bool HasParameter(const std::string& name) const;
    std::type_index GetParameterType(const std::string& name) const;
    
private:
    mutable std::mutex m_mutex;
    std::unordered_map<std::string, std::any> m_parameters;
    std::unordered_map<std::string, std::any> m_runtimeOverrides;
    std::unordered_map<std::string, std::type_index> m_typeMap;
    std::unordered_map<std::string, std::vector<std::function<void(const std::any&)>>> m_changeCallbacks;
    
    // Usage tracking
    bool m_trackUsage = false;
    mutable std::unordered_map<std::string, size_t> m_usageCount;
    
    // Helper to track parameter access
    template<typename T>
    void trackAccess(const std::string& name) const {
        if (m_trackUsage) {
            m_usageCount[name]++;
        }
    }
};

// Helper class for parameter relationships
class ParameterRelationships {
public:
    using UpdateFunction = std::function<void(ParameterRegistry&, const std::any&)>;
    
    void AddRelationship(const std::string& sourceName, UpdateFunction updateFunc) {
        m_relationships[sourceName].push_back(updateFunc);
    }
    
    void AddCascade(const std::string& sourceName, 
                   const std::vector<std::pair<std::string, float>>& targets) {
        AddRelationship(sourceName, [targets](ParameterRegistry& reg, const std::any& value) {
            try {
                float sourceValue = std::any_cast<float>(value);
                for (const auto& [targetName, factor] : targets) {
                    reg.SetRuntimeOverride(targetName, sourceValue * factor);
                }
            } catch (const std::bad_any_cast&) {
                // Type mismatch in parameter cascade
            }
        });
    }
    
    void ApplyRelationships(ParameterRegistry& registry) {
        for (const auto& [sourceName, updateFuncs] : m_relationships) {
            registry.OnParameterChange(sourceName, [&registry, updateFuncs](const std::any& value) {
                for (const auto& updateFunc : updateFuncs) {
                    updateFunc(registry, value);
                }
            });
        }
    }
    
private:
    std::unordered_map<std::string, std::vector<UpdateFunction>> m_relationships;
};

} // namespace PlanetGen::Core::Parameters
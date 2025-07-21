module;

#include <fstream>
#include <sstream>
#include <algorithm>
#include <any>
#include <mutex>
#include <typeindex>
#include <nlohmann/json.hpp>
#include <Core/Logging/LoggerMacros.h>

module Core.Parameters.Registry;

namespace PlanetGen::Core::Parameters {

void ParameterRegistry::LoadFromJson(const ::nlohmann::json& config) {
    std::lock_guard<std::mutex> lock(m_mutex);
    
    LOG_TRACE("ParameterRegistry", "LoadFromJson called");
    
    if (!config.contains("parameters")) {
        LOG_WARN("ParameterRegistry", "No 'parameters' section found in configuration");
        return;
    }
    
    const auto& params = config["parameters"];
    for (auto it = params.begin(); it != params.end(); ++it) {
        const std::string& name = it.key();
        const auto& value = it.value();
        
        // Try to determine type and set value
        if (value.is_number_integer()) {
            if (value >= 0) {
                SetRuntimeOverride(name, value.get<uint32_t>());
            } else {
                SetRuntimeOverride(name, value.get<int32_t>());
            }
        } else if (value.is_number_float()) {
            SetRuntimeOverride(name, value.get<float>());
        } else if (value.is_boolean()) {
            SetRuntimeOverride(name, value.get<bool>());
        } else if (value.is_string()) {
            SetRuntimeOverride(name, value.get<std::string>());
        } else if (value.is_number_unsigned()) {
            // Handle large unsigned values
            if (value > std::numeric_limits<uint32_t>::max()) {
                SetRuntimeOverride(name, value.get<uint64_t>());
            } else {
                SetRuntimeOverride(name, value.get<uint32_t>());
            }
        }
    }
    
    LOG_INFO("ParameterRegistry", "Loaded {} parameters from JSON configuration", params.size());
}

::nlohmann::json ParameterRegistry::SaveToJson() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    
    ::nlohmann::json result;
    auto& params = result["parameters"];
    
    // Save all parameters with their current values
    for (const auto& [name, paramAny] : m_parameters) {
        // Check for runtime override first
        auto overrideIt = m_runtimeOverrides.find(name);
        if (overrideIt != m_runtimeOverrides.end()) {
            // Use runtime override value
            const auto& value = overrideIt->second;
            const auto& type = m_typeMap.at(name);
            
            // Convert based on type
            if (type == std::type_index(typeid(uint32_t))) {
                params[name] = std::any_cast<uint32_t>(value);
            } else if (type == std::type_index(typeid(int32_t))) {
                params[name] = std::any_cast<int32_t>(value);
            } else if (type == std::type_index(typeid(uint64_t))) {
                params[name] = std::any_cast<uint64_t>(value);
            } else if (type == std::type_index(typeid(float))) {
                params[name] = std::any_cast<float>(value);
            } else if (type == std::type_index(typeid(double))) {
                params[name] = std::any_cast<double>(value);
            } else if (type == std::type_index(typeid(bool))) {
                params[name] = std::any_cast<bool>(value);
            } else if (type == std::type_index(typeid(std::string))) {
                params[name] = std::any_cast<std::string>(value);
            }
        } else {
            // Use parameter's current value
            const auto& type = m_typeMap.at(name);
            
            // Extract value from parameter based on type
            if (type == std::type_index(typeid(uint32_t))) {
                auto param = std::any_cast<std::shared_ptr<Parameter<uint32_t>>>(paramAny);
                params[name] = param->value;
            } else if (type == std::type_index(typeid(int32_t))) {
                auto param = std::any_cast<std::shared_ptr<Parameter<int32_t>>>(paramAny);
                params[name] = param->value;
            } else if (type == std::type_index(typeid(uint64_t))) {
                auto param = std::any_cast<std::shared_ptr<Parameter<uint64_t>>>(paramAny);
                params[name] = param->value;
            } else if (type == std::type_index(typeid(float))) {
                auto param = std::any_cast<std::shared_ptr<Parameter<float>>>(paramAny);
                params[name] = param->value;
            } else if (type == std::type_index(typeid(double))) {
                auto param = std::any_cast<std::shared_ptr<Parameter<double>>>(paramAny);
                params[name] = param->value;
            } else if (type == std::type_index(typeid(bool))) {
                auto param = std::any_cast<std::shared_ptr<Parameter<bool>>>(paramAny);
                params[name] = param->value;
            } else if (type == std::type_index(typeid(std::string))) {
                auto param = std::any_cast<std::shared_ptr<Parameter<std::string>>>(paramAny);
                params[name] = param->value;
            }
        }
    }
    
    // Add metadata
    result["metadata"]["version"] = "1.0";
    result["metadata"]["parameter_count"] = params.size();
    
    return result;
}

void ParameterRegistry::MergeFrom(const ParameterRegistry& other, ParameterMergeStrategy strategy) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::lock_guard<std::mutex> otherLock(other.m_mutex);
    
    LOG_TRACE("ParameterRegistry", "MergeFrom called");
    
    switch (strategy) {
        case ParameterMergeStrategy::OverrideExisting:
            // Copy all parameters from other, overriding existing
            for (const auto& [name, param] : other.m_parameters) {
                m_parameters[name] = param;
                m_typeMap.emplace(name, other.m_typeMap.at(name));
            }
            for (const auto& [name, value] : other.m_runtimeOverrides) {
                m_runtimeOverrides[name] = value;
            }
            break;
            
        case ParameterMergeStrategy::KeepExisting:
            // Only add parameters that don't exist
            for (const auto& [name, param] : other.m_parameters) {
                if (m_parameters.find(name) == m_parameters.end()) {
                    m_parameters[name] = param;
                    m_typeMap.emplace(name, other.m_typeMap.at(name));
                }
            }
            for (const auto& [name, value] : other.m_runtimeOverrides) {
                if (m_runtimeOverrides.find(name) == m_runtimeOverrides.end()) {
                    m_runtimeOverrides[name] = value;
                }
            }
            break;
            
        case ParameterMergeStrategy::UseHigherPriority:
            // Use runtime overrides over base values
            for (const auto& [name, param] : other.m_parameters) {
                if (m_parameters.find(name) == m_parameters.end()) {
                    m_parameters[name] = param;
                    m_typeMap.emplace(name, other.m_typeMap.at(name));
                }
            }
            // Always take runtime overrides from other
            for (const auto& [name, value] : other.m_runtimeOverrides) {
                m_runtimeOverrides[name] = value;
            }
            break;
    }
}

bool ParameterRegistry::Validate() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    
    for (const auto& [name, paramAny] : m_parameters) {
        const auto& type = m_typeMap.at(name);
        
        // Check runtime override validation
        auto overrideIt = m_runtimeOverrides.find(name);
        if (overrideIt != m_runtimeOverrides.end()) {
            // Validate based on type
            if (type == std::type_index(typeid(uint32_t))) {
                auto param = std::any_cast<std::shared_ptr<Parameter<uint32_t>>>(paramAny);
                auto value = std::any_cast<uint32_t>(overrideIt->second);
                if (!param->validate(value)) {
                    return false;
                }
            } else if (type == std::type_index(typeid(float))) {
                auto param = std::any_cast<std::shared_ptr<Parameter<float>>>(paramAny);
                auto value = std::any_cast<float>(overrideIt->second);
                if (!param->validate(value)) {
                    return false;
                }
            }
            // Add other types as needed
        }
    }
    
    return true;
}

std::vector<std::string> ParameterRegistry::GetValidationErrors() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::vector<std::string> errors;
    
    for (const auto& [name, paramAny] : m_parameters) {
        const auto& type = m_typeMap.at(name);
        
        // Check runtime override validation
        auto overrideIt = m_runtimeOverrides.find(name);
        if (overrideIt != m_runtimeOverrides.end()) {
            // Validate based on type
            if (type == std::type_index(typeid(uint32_t))) {
                auto param = std::any_cast<std::shared_ptr<Parameter<uint32_t>>>(paramAny);
                auto value = std::any_cast<uint32_t>(overrideIt->second);
                if (!param->validate(value)) {
                    std::stringstream ss;
                    ss << "Parameter '" << name << "' value " << value 
                       << " is outside valid range [" << param->minValue 
                       << ", " << param->maxValue << "]";
                    errors.push_back(ss.str());
                }
            } else if (type == std::type_index(typeid(float))) {
                auto param = std::any_cast<std::shared_ptr<Parameter<float>>>(paramAny);
                auto value = std::any_cast<float>(overrideIt->second);
                if (!param->validate(value)) {
                    std::stringstream ss;
                    ss << "Parameter '" << name << "' value " << value 
                       << " is outside valid range [" << param->minValue 
                       << ", " << param->maxValue << "]";
                    errors.push_back(ss.str());
                }
            }
            // Add other types as needed
        }
    }
    
    return errors;
}

std::vector<std::string> ParameterRegistry::GetUnusedParameters() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::vector<std::string> unused;
    
    if (!m_trackUsage) {
        LOG_WARN("ParameterRegistry", "Usage tracking is not enabled");
        return unused;
    }
    
    for (const auto& [name, _] : m_parameters) {
        if (m_usageCount.find(name) == m_usageCount.end() || m_usageCount.at(name) == 0) {
            unused.push_back(name);
        }
    }
    
    return unused;
}

void ParameterRegistry::ResetUsageTracking() {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_usageCount.clear();
}

void ParameterRegistry::DumpToLog() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    
    LOG_INFO("ParameterRegistry", "=== Parameter Registry Dump ===");
    LOG_INFO("ParameterRegistry", "Total parameters: {}", m_parameters.size());
    LOG_INFO("ParameterRegistry", "Runtime overrides: {}", m_runtimeOverrides.size());
    
    // Create sorted list for consistent output
    std::vector<std::string> names;
    for (const auto& [name, _] : m_parameters) {
        names.push_back(name);
    }
    std::sort(names.begin(), names.end());
    
    for (const auto& name : names) {
        std::stringstream ss;
        ss << "  " << name << " = ";
        
        // Check for runtime override
        auto overrideIt = m_runtimeOverrides.find(name);
        if (overrideIt != m_runtimeOverrides.end()) {
            ss << "[OVERRIDE] ";
        }
        
        // Output value based on type
        const auto& type = m_typeMap.at(name);
        if (type == std::type_index(typeid(uint32_t))) {
            if (overrideIt != m_runtimeOverrides.end()) {
                ss << std::any_cast<uint32_t>(overrideIt->second);
            } else {
                auto param = std::any_cast<std::shared_ptr<Parameter<uint32_t>>>(m_parameters.at(name));
                ss << param->value;
            }
            auto param = std::any_cast<std::shared_ptr<Parameter<uint32_t>>>(m_parameters.at(name));
            ss << " (range: " << param->minValue << "-" << param->maxValue << ")";
        } else if (type == std::type_index(typeid(float))) {
            if (overrideIt != m_runtimeOverrides.end()) {
                ss << std::any_cast<float>(overrideIt->second);
            } else {
                auto param = std::any_cast<std::shared_ptr<Parameter<float>>>(m_parameters.at(name));
                ss << param->value;
            }
            auto param = std::any_cast<std::shared_ptr<Parameter<float>>>(m_parameters.at(name));
            ss << " (range: " << param->minValue << "-" << param->maxValue << ")";
        }
        // Add other types as needed
        
        if (m_trackUsage && m_usageCount.find(name) != m_usageCount.end()) {
            ss << " [used " << m_usageCount.at(name) << " times]";
        }
        
        LOG_INFO("ParameterRegistry", "{}", ss.str());
    }
    
    LOG_INFO("ParameterRegistry", "=== End Parameter Registry Dump ===");
}

std::unordered_map<std::string, std::pair<std::any, std::any>> 
ParameterRegistry::Diff(const ParameterRegistry& other) const {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::lock_guard<std::mutex> otherLock(other.m_mutex);
    
    std::unordered_map<std::string, std::pair<std::any, std::any>> differences;
    
    // Check all parameters in this registry
    for (const auto& [name, _] : m_parameters) {
        try {
            // Get effective values (with overrides)
            auto thisValue = Get<std::any>(name);
            auto otherValue = other.Get<std::any>(name);
            
            // Compare values - this is simplified, real comparison would be type-aware
            // For now, we'll mark as different if we can't compare
            differences[name] = std::make_pair(thisValue, otherValue);
        } catch (...) {
            // Parameter doesn't exist in other registry
            differences[name] = std::make_pair(std::any{}, std::any{});
        }
    }
    
    // Check for parameters only in other registry
    for (const auto& [name, _] : other.m_parameters) {
        if (m_parameters.find(name) == m_parameters.end()) {
            try {
                auto otherValue = other.Get<std::any>(name);
                differences[name] = std::make_pair(std::any{}, otherValue);
            } catch (...) {
                // Shouldn't happen
            }
        }
    }
    
    return differences;
}

std::vector<std::string> ParameterRegistry::GetParameterNames() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    
    std::vector<std::string> names;
    names.reserve(m_parameters.size());
    
    for (const auto& [name, _] : m_parameters) {
        names.push_back(name);
    }
    
    return names;
}

bool ParameterRegistry::HasParameter(const std::string& name) const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_parameters.find(name) != m_parameters.end();
}

std::type_index ParameterRegistry::GetParameterType(const std::string& name) const {
    std::lock_guard<std::mutex> lock(m_mutex);
    
    auto it = m_typeMap.find(name);
    if (it != m_typeMap.end()) {
        return it->second;
    }
    
    throw std::runtime_error("Unknown parameter: " + name);
}

} // namespace PlanetGen::Core::Parameters
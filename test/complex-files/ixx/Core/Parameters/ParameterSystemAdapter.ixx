module;

#include <memory>
#include <optional>
#include <string>

export module Core.Parameters.ParameterSystemAdapter;

import Core.Parameters.Registry;
import Core.Parameters.PlanetParams;

export namespace PlanetGen::Core::Parameters {

/// Adapter to provide easy access to the parameter system throughout the application
class ParameterSystemAdapter {
private:
    static std::shared_ptr<ParameterRegistry> s_globalRegistry;
    static std::shared_ptr<ParameterRelationships> s_globalRelationships;
    static bool s_initialized;

public:
    /// Initialize the global parameter system
    static void Initialize();
    
    /// Get the global parameter registry
    static std::shared_ptr<ParameterRegistry> GetRegistry();
    
    /// Convenience method to get a parameter value
    template<typename T>
    static T Get(const std::string& name, const std::optional<T>& override = std::nullopt) {
        return GetRegistry()->Get<T>(name, override);
    }
    
    /// Convenience method to set a runtime override
    template<typename T>
    static void SetRuntimeOverride(const std::string& name, T value) {
        GetRegistry()->SetRuntimeOverride(name, value);
    }
    
    /// Apply a quality preset
    static void ApplyQualityPreset(const std::string& preset);
    
    /// Check if the system is initialized
    static bool IsInitialized();
    
    /// Reset the parameter system (mainly for testing)
    static void Reset();
};

// Helper macros for easier parameter access
#define PARAM_GET(type, name) \
    PlanetGen::Core::Parameters::ParameterSystemAdapter::Get<type>(name)

#define PARAM_GET_WITH_OVERRIDE(type, name, override) \
    PlanetGen::Core::Parameters::ParameterSystemAdapter::Get<type>(name, override)

#define PARAM_SET(name, value) \
    PlanetGen::Core::Parameters::ParameterSystemAdapter::SetRuntimeOverride(name, value)

} // namespace PlanetGen::Core::Parameters
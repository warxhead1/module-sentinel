module;

#include <memory>

module Core.Parameters.ParameterSystemAdapter;

import Core.Parameters.PlanetParams;

namespace PlanetGen::Core::Parameters {

// Static member definitions
std::shared_ptr<ParameterRegistry> ParameterSystemAdapter::s_globalRegistry = nullptr;
std::shared_ptr<ParameterRelationships> ParameterSystemAdapter::s_globalRelationships = nullptr;
bool ParameterSystemAdapter::s_initialized = false;

// Method implementations
void ParameterSystemAdapter::Initialize() {
    if (!s_initialized) {
        s_globalRegistry = std::make_shared<ParameterRegistry>();
        s_globalRelationships = std::make_shared<ParameterRelationships>();
        
        // Register all default parameters
        PlanetParams::RegisterDefaults(*s_globalRegistry);
        PlanetParams::SetupParameterRelationships(*s_globalRegistry, *s_globalRelationships);
        
        s_initialized = true;
    }
}

std::shared_ptr<ParameterRegistry> ParameterSystemAdapter::GetRegistry() {
    if (!s_initialized) {
        Initialize();
    }
    return s_globalRegistry;
}

void ParameterSystemAdapter::ApplyQualityPreset(const std::string& preset) {
    PlanetParams::ApplyQualityPreset(*GetRegistry(), preset);
}

bool ParameterSystemAdapter::IsInitialized() {
    return s_initialized;
}

void ParameterSystemAdapter::Reset() {
    s_globalRegistry.reset();
    s_globalRelationships.reset();
    s_initialized = false;
}

} // namespace PlanetGen::Core::Parameters
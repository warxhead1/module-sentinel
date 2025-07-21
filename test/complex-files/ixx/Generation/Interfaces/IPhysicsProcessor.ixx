module;

#include <vector>
#include <memory>
#include <string>
#include <cmath>

#include <utility>
export module IPhysicsProcessor;

import GenerationTypes;
import GLMModule;
import TerrainAnalysisTypes;
import IPhysicsGPUAccelerator;

export namespace PlanetGen::Generation::Physics {

/**
 * Abstract interface for physics processors
 * Allows for modular, extensible physics simulations
 */
class IPhysicsProcessor {
public:
    virtual ~IPhysicsProcessor() = default;
    
    virtual std::string GetProcessorName() const = 0;
    virtual std::string GetProcessorVersion() const = 0;
    
    // Process any celestial body data
    virtual Analysis::TerrainAnalysisResult ProcessTerrain(
        const std::vector<float>& elevationData,
        const std::vector<std::pair<float, float>>& coordinates,
        const Analysis::TerrainAnalysisParams& params) = 0;
    
    // GPU acceleration interface
    virtual bool SupportsGPUAcceleration() const { return false; }
    virtual void SetGPUAccelerator(std::shared_ptr<PlanetGen::Generation::Physics::IPhysicsGPUAccelerator> accelerator) {}
    
    // Validation and diagnostics
    virtual bool ValidateInputData(const std::vector<float>& elevationData, 
                                   const std::vector<std::pair<float, float>>& coordinates) const {
        if (elevationData.empty()) {
            return false;
        }
        
        if (!coordinates.empty() && coordinates.size() != elevationData.size()) {
            return false;
        }
        
        // Check for invalid values
        for (float elevation : elevationData) {
            if (!std::isfinite(elevation)) {
                return false;
            }
        }
        
        return true;
    }
    virtual std::vector<std::string> GetDiagnostics() const { return {}; }
};

} // namespace PlanetGen::Generation::Physics
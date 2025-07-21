module;

#include <memory>
#include <string>

export module IPlanetaryFactory;

import INoiseProvider;
// import IResourceManager;  // Removed - not needed for this interface

export namespace PlanetGen::Generation {

// Forward declarations
class PlanetaryGenerator;

// Pure interface for planetary generation factory - breaks circular dependencies
class IPlanetaryFactory {
public:
    virtual ~IPlanetaryFactory() = default;
    
    // Factory methods - simplified to remove unused resource manager dependency
    virtual std::unique_ptr<PlanetaryGenerator> CreatePlanetaryGenerator(
        INoiseProvider& noiseProvider) = 0;
    
    virtual std::unique_ptr<PlanetaryGenerator> CreateEarthLikePlanet(
        INoiseProvider& noiseProvider) = 0;
    
    virtual std::unique_ptr<PlanetaryGenerator> CreateMarsLikePlanet(
        INoiseProvider& noiseProvider) = 0;
    
    virtual std::unique_ptr<PlanetaryGenerator> CreateWaterWorld(
        INoiseProvider& noiseProvider) = 0;
    
    virtual std::unique_ptr<PlanetaryGenerator> CreateVolcanicPlanet(
        INoiseProvider& noiseProvider) = 0;
    
    virtual std::unique_ptr<PlanetaryGenerator> CreateIceWorld(
        INoiseProvider& noiseProvider) = 0;
    
    virtual std::unique_ptr<PlanetaryGenerator> CreateAlienPlanet(
        INoiseProvider& noiseProvider) = 0;
    
    // Configuration
    virtual void SetDefaultRadius(float radius) = 0;
    virtual void SetDefaultSeed(int seed) = 0;
};

} // namespace PlanetGen::Generation
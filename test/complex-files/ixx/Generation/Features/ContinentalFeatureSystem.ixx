module;

#include <vector>
#include <memory>
#include <string>
#include <functional>
#include <optional>

export module ContinentalFeatureSystem;

import GenerationTypes;
import GLMModule;
import NoiseTypes;

export namespace PlanetGen::Generation::Features {

// Continental feature types that can be composed
enum class ContinentalFeatureType {
    Continental,      // Large continental masses
    Oceanic,         // Ocean basins  
    MountainRange,   // Mountain chains (orogeny)
    ContinentalShelf,// Shallow seas around continents
    RiftValley,      // Continental rifts
    Hotspot,         // Volcanic hotspots
    IslandArc,       // Volcanic island chains
    Plateau,         // High elevation plateaus
    Trench,          // Deep ocean trenches
    Ridge            // Mid-ocean ridges
};

// Parameters for each continental feature
struct ContinentalFeatureParams {
    ContinentalFeatureType type;
    float scale = 1.0f;           // Overall scale of the feature
    float amplitude = 1000.0f;     // Height contribution in meters
    float frequency = 0.001f;      // Spatial frequency
    vec2 center = vec2(0.0f);      // Center position (for localized features)
    float radius = 1.0f;           // Influence radius (for localized features)
    float sharpness = 1.0f;        // Edge sharpness (0=smooth, 1=sharp)
    uint32_t seed = 0;             // Random seed for this feature
    
    // Advanced parameters
    bool useDistanceField = false;  // Use distance-based falloff
    float falloffPower = 2.0f;      // Power for distance falloff
    std::optional<float> minElevation; // Minimum elevation constraint
    std::optional<float> maxElevation; // Maximum elevation constraint
};

// Interface for continental feature generators
class IContinentalFeature {
public:
    virtual ~IContinentalFeature() = default;
    
    // Generate elevation contribution at a given point
    virtual float GenerateElevation(float x, float y, float currentElevation) const = 0;
    
    // Get feature parameters
    virtual const ContinentalFeatureParams& GetParams() const = 0;
    
    // Check if this feature should be applied at this location
    virtual bool ShouldApply(float x, float y, float currentElevation) const {
        const auto& params = GetParams();
        if (params.minElevation && currentElevation < *params.minElevation) return false;
        if (params.maxElevation && currentElevation > *params.maxElevation) return false;
        return true;
    }
};

// Factory for creating continental features
class ContinentalFeatureFactory {
public:
    static std::unique_ptr<IContinentalFeature> CreateFeature(const ContinentalFeatureParams& params);
    
    // Preset feature configurations
    static ContinentalFeatureParams CreateContinentalMass(float scale = 1.0f, uint32_t seed = 0);
    static ContinentalFeatureParams CreateOceanBasin(float scale = 1.0f, uint32_t seed = 0);
    static ContinentalFeatureParams CreateMountainRange(vec2 start, vec2 end, float width = 0.1f, uint32_t seed = 0);
    static ContinentalFeatureParams CreateVolcanicHotspot(vec2 location, float intensity = 1.0f, uint32_t seed = 0);
    static ContinentalFeatureParams CreateIslandArc(vec2 center, float radius, uint32_t count = 5, uint32_t seed = 0);
    static ContinentalFeatureParams CreateContinentalShelf(float depth = -200.0f, float width = 0.05f);
    static ContinentalFeatureParams CreateRiftValley(vec2 start, vec2 end, float depth = -2000.0f, uint32_t seed = 0);
};

// Composition system for combining multiple features
class ContinentalFeatureComposer {
public:
    // Blending modes for combining features
    enum class BlendMode {
        Add,          // Simple addition
        Max,          // Take maximum value
        Min,          // Take minimum value  
        Multiply,     // Multiply values
        Average,      // Average values
        WeightedAdd,  // Weighted addition based on masks
        Replace       // Replace if condition met
    };
    
    struct FeatureLayer {
        std::unique_ptr<IContinentalFeature> feature;
        BlendMode blendMode = BlendMode::Add;
        float weight = 1.0f;
        std::function<float(float, float)> mask; // Optional mask function
    };
    
    // Add a feature to the composition
    void AddFeature(std::unique_ptr<IContinentalFeature> feature, 
                   BlendMode mode = BlendMode::Add,
                   float weight = 1.0f,
                   std::function<float(float, float)> mask = nullptr);
    
    // Generate combined elevation at a point
    float GenerateElevation(float x, float y, float baseElevation) const;
    
    // Clear all features
    void Clear() { m_layers.clear(); }
    
    // Get number of features
    size_t GetFeatureCount() const { return m_layers.size(); }
    
private:
    std::vector<FeatureLayer> m_layers;
    
    // Apply blending mode
    float ApplyBlendMode(float current, float value, BlendMode mode) const;
};

// Continental configuration presets
struct ContinentalConfig {
    std::string name;
    std::vector<ContinentalFeatureParams> features;
    
    // Preset configurations
    static ContinentalConfig EarthLike();
    static ContinentalConfig Pangaea();        // Single supercontinent
    static ContinentalConfig Archipelago();     // Many islands
    static ContinentalConfig RingContinent();   // Ring-shaped continent
    static ContinentalConfig DualContinents();  // Two major continents  
    static ContinentalConfig Waterworld();      // Mostly ocean with small islands
};

// Integration helper for PlanetaryGenerator
class ContinentalFeatureIntegration {
public:
    // Apply continental features to elevation data
    static void ApplyContinentalFeatures(
        std::vector<float>& elevationData,
        uint32_t width, uint32_t height,
        const ContinentalConfig& config,
        float worldScale = 1.0f);
    
    // Create feature composer from config
    static std::unique_ptr<ContinentalFeatureComposer> CreateComposer(
        const ContinentalConfig& config);
    
    // Generate continental mask (1.0 = land, 0.0 = ocean)
    static std::vector<float> GenerateContinentalMask(
        uint32_t width, uint32_t height,
        const ContinentalConfig& config);
};

} // namespace PlanetGen::Generation::Features
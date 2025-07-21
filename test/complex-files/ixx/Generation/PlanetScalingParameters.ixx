module;

#include <algorithm>
#include <cmath>

export module PlanetScalingParameters;

import GLMModule;

export namespace PlanetGen::Generation {

/**
 * Planet Scaling Parameters
 * 
 * Provides a unified approach to planet size and terrain scaling
 * that maintains visual quality across different planet sizes.
 * 
 * Key principle: Visual perception should be consistent regardless
 * of planet size. A mountain should look like a mountain whether
 * on a moon or a gas giant.
 */
struct PlanetScalingParameters {
    // Base planet properties
    float planetRadius = 6371.0f;      // km (Earth default)
    float terrainHeightRange = 20.0f;  // km (Everest + Mariana Trench)
    
    // Visual scaling controls
    float visualExaggeration = 1.0f;   // User-controlled exaggeration
    float autoExaggeration = true;     // Auto-calculate optimal exaggeration
    
    // Target visual parameters
    float targetVisualHeight = 50.0f;  // km - optimal visual height range
    float maxVisualHeight = 100.0f;    // km - maximum allowed visual height
    
    // Scaling mode
    enum class ScalingMode {
        Visual,      // Maintain consistent visual appearance
        Realistic,   // True-to-scale (may be invisible on large planets)
        Hybrid       // Balance between visual and realistic
    };
    ScalingMode mode = ScalingMode::Visual;
    
    /**
     * Calculate the final height scale factor for rendering
     */
    float CalculateHeightScale() const {
        if (mode == ScalingMode::Realistic) {
            return visualExaggeration;
        }
        
        // Calculate auto-exaggeration if enabled
        float exaggeration = visualExaggeration;
        if (autoExaggeration) {
            // Target visual height / actual height range
            exaggeration = targetVisualHeight / std::max(0.1f, terrainHeightRange);
            
            // Apply logarithmic damping for very large planets
            if (planetRadius > 1000.0f) {
                float radiusScale = 1.0f + std::log10(planetRadius / 1000.0f);
                exaggeration /= radiusScale;
            }
            
            // Clamp to reasonable range
            exaggeration = std::clamp(exaggeration, 1.0f, 50.0f);
        }
        
        if (mode == ScalingMode::Hybrid) {
            // Blend between visual and user exaggeration
            exaggeration = (exaggeration + visualExaggeration) * 0.5f;
        }
        
        return exaggeration;
    }
    
    /**
     * Calculate maximum allowed displacement for safety clamping
     */
    float CalculateMaxDisplacement() const {
        if (mode == ScalingMode::Realistic) {
            // Percentage of planet radius
            return planetRadius * 1000.0f * 0.1f; // 10% max
        } else {
            // Fixed visual maximum
            return maxVisualHeight * 1000.0f; // Convert to meters
        }
    }
    
    /**
     * Apply scaling to a height value
     */
    float ApplyScaling(float heightMeters) const {
        float scale = CalculateHeightScale();
        float scaled = heightMeters * scale;
        
        // Apply safety clamping
        float maxDisp = CalculateMaxDisplacement();
        return std::clamp(scaled, -maxDisp, maxDisp);
    }
    
    /**
     * Create parameters for different planet types
     */
    static PlanetScalingParameters Earth() {
        return PlanetScalingParameters{
            .planetRadius = 6371.0f,
            .terrainHeightRange = 20.0f,
            .visualExaggeration = 1.0f,
            .autoExaggeration = true,
            .mode = ScalingMode::Visual
        };
    }
    
    static PlanetScalingParameters Moon() {
        return PlanetScalingParameters{
            .planetRadius = 1737.0f,
            .terrainHeightRange = 18.0f,
            .visualExaggeration = 2.0f,
            .autoExaggeration = true,
            .mode = ScalingMode::Visual
        };
    }
    
    static PlanetScalingParameters Mars() {
        return PlanetScalingParameters{
            .planetRadius = 3390.0f,
            .terrainHeightRange = 30.0f,
            .visualExaggeration = 1.5f,
            .autoExaggeration = true,
            .mode = ScalingMode::Visual
        };
    }
    
    static PlanetScalingParameters SuperEarth(float radiusKm) {
        return PlanetScalingParameters{
            .planetRadius = radiusKm,
            .terrainHeightRange = 25.0f,
            .visualExaggeration = 1.0f,
            .autoExaggeration = true,
            .mode = ScalingMode::Visual
        };
    }
};

/**
 * Integration helper for existing systems
 */
struct ScalingIntegration {
    /**
     * Convert GUI parameters to scaling parameters
     */
    static PlanetScalingParameters FromGUIParameters(
        float radius,
        float maxElevation,
        float heightScale,
        float exaggeration
    ) {
        PlanetScalingParameters params;
        params.planetRadius = radius / 1000.0f; // Convert m to km
        params.terrainHeightRange = maxElevation / 1000.0f; // Convert m to km
        params.visualExaggeration = heightScale * exaggeration;
        params.autoExaggeration = (heightScale == 1.0f); // Auto if no manual scale
        return params;
    }
    
    /**
     * Apply scaling parameters to terrain block
     */
    static void ApplyToTerrainBlock(
        const PlanetScalingParameters& params,
        float& outMaxHeight,
        float& outHeightScale
    ) {
        outMaxHeight = params.terrainHeightRange * 1000.0f; // Convert to meters
        outHeightScale = params.CalculateHeightScale();
    }
};

} // namespace PlanetGen::Generation
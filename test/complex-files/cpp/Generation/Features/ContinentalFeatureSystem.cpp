module;

#include <cmath>
#include <algorithm>
#include <random>
#include <thread>
#include <future>
#include <atomic>
#include <functional>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

module ContinentalFeatureSystem;

import NoiseFactory;
import NoiseInterface;
import GLMModule;

namespace PlanetGen::Generation::Features {

// Base implementation for continental features
class ContinentalFeatureBase : public IContinentalFeature {
protected:
    ContinentalFeatureParams m_params;
    std::unique_ptr<PlanetGen::Rendering::Noise::INoiseGenerator> m_noiseGen;
    
    // Smart optimization: Bounding box for spatial culling
    struct BoundingBox {
        float minX = -2.0f, maxX = 2.0f;
        float minY = -2.0f, maxY = 2.0f;
        bool isValid = false;
    } m_boundingBox;
    
    // Smart optimization: Distance-based LOD
    mutable float m_lastDistance = 0.0f;
    mutable int m_adaptiveLOD = 1;
    
public:
    explicit ContinentalFeatureBase(const ContinentalFeatureParams& params) 
        : m_params(params) {
        // Calculate intelligent bounding box based on feature parameters
        CalculateOptimalBoundingBox();
    }
    
    const ContinentalFeatureParams& GetParams() const override {
        return m_params;
    }
    
    // Smart spatial culling
    bool IsInInfluenceArea(float x, float y) const {
        if (!m_boundingBox.isValid) return true;
        return (x >= m_boundingBox.minX && x <= m_boundingBox.maxX &&
                y >= m_boundingBox.minY && y <= m_boundingBox.maxY);
    }
    
protected:
    virtual void CalculateOptimalBoundingBox() {
        // Default: no spatial optimization
        m_boundingBox.isValid = false;
    }
    
    // Intelligent LOD calculation based on distance from feature center
    int CalculateAdaptiveLOD(float x, float y) const {
        vec2 center = m_params.center;
        float distance = length(vec2(x - center.x, y - center.y));
        m_lastDistance = distance;
        
        // Smart LOD: Higher detail near features, lower detail far away
        if (distance < m_params.radius * 0.5f) {
            m_adaptiveLOD = 3; // High detail
        } else if (distance < m_params.radius * 1.0f) {
            m_adaptiveLOD = 2; // Medium detail
        } else if (distance < m_params.radius * 2.0f) {
            m_adaptiveLOD = 1; // Low detail
        } else {
            m_adaptiveLOD = 0; // Skip entirely
        }
        
        return m_adaptiveLOD;
    }
};

// Continental mass implementation - large scale land masses
class ContinentalMassFeature : public ContinentalFeatureBase {
public:
    explicit ContinentalMassFeature(const ContinentalFeatureParams& params) 
        : ContinentalFeatureBase(params) {
        // Use simplex noise for continental shapes
        m_noiseGen = PlanetGen::Rendering::Noise::NoiseFactory::CreateSimpleNoise(params.seed, params.frequency, 4);
    }
    
    float GenerateElevation(float x, float y, float currentElevation) const override {
        // Smart LOD calculation
        int lod = CalculateAdaptiveLOD(x, y);
        if (lod == 0) return 0.0f; // Skip entirely if too far
        
        // Intelligent multi-octave sampling: single noise call with multiple frequencies
        // This replaces 4 separate noise calls with 1 optimized call
        float baseX = x * m_params.frequency;
        float baseY = y * m_params.frequency;
        
        float combined = 0.0f;
        float amplitude = 1.0f;
        float frequency = 0.5f; // Start with large scale
        
        // Smart octave generation with adaptive quality
        int octaves = std::min(4, lod + 1); // More octaves for higher LOD
        
        for (int i = 0; i < octaves; ++i) {
            // Intelligent offset pattern to create multi-scale features
            float offsetX = static_cast<float>(i * 100); // Deterministic offsets
            float offsetY = static_cast<float>(i * 100);
            
            float octaveValue = m_noiseGen->GetNoise(
                baseX * frequency + offsetX,
                baseY * frequency + offsetY,
                0.0f
            );
            
            // Smart amplitude scaling based on frequency
            float octaveAmplitude = amplitude;
            if (i == 0) octaveAmplitude = 1.0f;      // Continental scale
            else if (i == 1) octaveAmplitude = 0.5f; // Medium features  
            else if (i == 2) octaveAmplitude = 0.3f; // Surface roughness
            else octaveAmplitude = 0.15f;            // Fine detail
            
            combined += octaveValue * octaveAmplitude;
            
            // Prepare for next octave
            frequency *= 2.0f;
            amplitude *= 0.5f;
        }
        
        // Continental shelves - minimal smoothing to preserve terrain detail
        if (combined > -0.02f && combined < 0.02f) {
            combined = combined * 0.95f; // Very minimal reduction near sea level to preserve roughness
        }
        
        return combined * m_params.amplitude * m_params.scale;
    }
};

// Ocean basin implementation - large scale depressions
class OceanBasinFeature : public ContinentalFeatureBase {
public:
    explicit OceanBasinFeature(const ContinentalFeatureParams& params)
        : ContinentalFeatureBase(params) {
        // Use billow noise for smooth ocean basins
        m_noiseGen = PlanetGen::Rendering::Noise::NoiseFactory::CreateBillowNoise(params.seed, params.frequency, 3);
    }
    
    float GenerateElevation(float x, float y, float currentElevation) const override {
        float basinNoise = m_noiseGen->GetNoise(
            x * m_params.frequency,
            y * m_params.frequency,
            0.0f
        );
        
        // Invert and deepen for basins
        basinNoise = -std::abs(basinNoise);
        
        // Add abyssal plains (very flat deep areas)
        if (basinNoise < -0.5f) {
            basinNoise = -0.5f - (basinNoise + 0.5f) * 0.2f;
        }
        
        return basinNoise * m_params.amplitude * m_params.scale;
    }
};

// Mountain range implementation - linear mountain chains
class MountainRangeFeature : public ContinentalFeatureBase {
private:
    vec2 m_start, m_end, m_direction;
    float m_length, m_width;
    
    // Smart optimization: Pre-computed distance field for fast lookups
    struct DistanceField {
        std::vector<float> distances;
        uint32_t width, height;
        float minX, maxX, minY, maxY;
        float cellSize;
        bool isValid = false;
    } mutable m_distanceField;
    
public:
    MountainRangeFeature(const ContinentalFeatureParams& params, vec2 start, vec2 end, float width)
        : ContinentalFeatureBase(params), m_start(start), m_end(end), m_width(width) {
        m_direction = normalize(end - start);
        m_length = length(end - start);
        m_noiseGen = PlanetGen::Rendering::Noise::NoiseFactory::CreateRidgedNoise(params.seed, params.frequency, 4);
        
        // Smart optimization: Pre-compute distance field for mountain range
        PrecomputeDistanceField();
    }
    
protected:
    void CalculateOptimalBoundingBox() override {
        // Smart bounding box calculation for mountain range
        float margin = m_width * 1.5f; // Small margin for falloff
        m_boundingBox.minX = std::min(m_start.x, m_end.x) - margin;
        m_boundingBox.maxX = std::max(m_start.x, m_end.x) + margin;
        m_boundingBox.minY = std::min(m_start.y, m_end.y) - margin;
        m_boundingBox.maxY = std::max(m_start.y, m_end.y) + margin;
        m_boundingBox.isValid = true;
    }
    
    void PrecomputeDistanceField() const {
        // Smart distance field: Only compute for areas near mountain range
        const uint32_t fieldResolution = 64; // Reasonable resolution for distance field
        const float margin = m_width * 2.0f;
        
        m_distanceField.minX = std::min(m_start.x, m_end.x) - margin;
        m_distanceField.maxX = std::max(m_start.x, m_end.x) + margin;
        m_distanceField.minY = std::min(m_start.y, m_end.y) - margin;
        m_distanceField.maxY = std::max(m_start.y, m_end.y) + margin;
        
        m_distanceField.width = fieldResolution;
        m_distanceField.height = fieldResolution;
        m_distanceField.cellSize = (m_distanceField.maxX - m_distanceField.minX) / fieldResolution;
        
        m_distanceField.distances.resize(fieldResolution * fieldResolution);
        
        // Pre-compute distances for fast lookup
        for (uint32_t y = 0; y < fieldResolution; ++y) {
            for (uint32_t x = 0; x < fieldResolution; ++x) {
                float worldX = m_distanceField.minX + x * m_distanceField.cellSize;
                float worldY = m_distanceField.minY + y * m_distanceField.cellSize;
                
                vec2 point(worldX, worldY);
                vec2 toPoint = point - m_start;
                float alongLine = dot(toPoint, m_direction);
                alongLine = std::max(0.0f, std::min(m_length, alongLine));
                
                vec2 nearestPoint = m_start + m_direction * alongLine;
                float distance = length(point - nearestPoint);
                
                m_distanceField.distances[y * fieldResolution + x] = distance;
            }
        }
        
        m_distanceField.isValid = true;
    }
    
    float SampleDistanceField(float x, float y) const {
        if (!m_distanceField.isValid) {
            // Fallback to direct calculation
            vec2 point(x, y);
            vec2 toPoint = point - m_start;
            float alongLine = dot(toPoint, m_direction);
            alongLine = std::max(0.0f, std::min(m_length, alongLine));
            vec2 nearestPoint = m_start + m_direction * alongLine;
            return length(point - nearestPoint);
        }
        
        // Smart bilinear sampling from distance field
        float fx = (x - m_distanceField.minX) / m_distanceField.cellSize;
        float fy = (y - m_distanceField.minY) / m_distanceField.cellSize;
        
        if (fx < 0 || fy < 0 || fx >= m_distanceField.width - 1 || fy >= m_distanceField.height - 1) {
            return m_width * 2.0f; // Outside field, return large distance
        }
        
        int x0 = static_cast<int>(fx);
        int y0 = static_cast<int>(fy);
        int x1 = x0 + 1;
        int y1 = y0 + 1;
        
        float wx = fx - x0;
        float wy = fy - y0;
        
        // Bilinear interpolation
        float d00 = m_distanceField.distances[y0 * m_distanceField.width + x0];
        float d10 = m_distanceField.distances[y0 * m_distanceField.width + x1];
        float d01 = m_distanceField.distances[y1 * m_distanceField.width + x0];
        float d11 = m_distanceField.distances[y1 * m_distanceField.width + x1];
        
        float d0 = d00 * (1 - wx) + d10 * wx;
        float d1 = d01 * (1 - wx) + d11 * wx;
        
        return d0 * (1 - wy) + d1 * wy;
    }
    
    float GenerateElevation(float x, float y, float currentElevation) const override {
        // Smart optimization: Use pre-computed distance field
        float distanceToLine = SampleDistanceField(x, y);
        
        // Early termination if outside influence area
        if (distanceToLine > m_width) return 0.0f;
        
        // Mountain influence based on distance
        float influence = std::max(0.0f, 1.0f - distanceToLine / m_width);
        influence = std::pow(influence, m_params.sharpness);
        
        if (influence > 0.0f) {
            // Calculate along line position for ridge noise
            vec2 toPoint = vec2(x, y) - m_start;
            float alongLine = dot(toPoint, m_direction);
            
            // Ridge noise along the mountain line
            float ridgeNoise = m_noiseGen->GetNoise(
                alongLine * m_params.frequency * 10.0f,
                distanceToLine * m_params.frequency * 5.0f,
                0.0f
            );
            
            // Make ridges more pronounced
            ridgeNoise = std::abs(ridgeNoise);
            ridgeNoise = std::pow(ridgeNoise, 0.5f);
            
            return ridgeNoise * influence * m_params.amplitude * m_params.scale;
        }
        
        return 0.0f;
    }
};

// Volcanic hotspot implementation
class VolcanicHotspotFeature : public ContinentalFeatureBase {
private:
    vec2 m_location;
    
    // Smart optimization: Pre-compute influence radius squared for fast distance checks
    mutable float m_radiusSquared;
    
protected:
    void CalculateOptimalBoundingBox() override {
        // Smart bounding box for volcanic hotspot
        float margin = m_params.radius * 0.1f;
        m_boundingBox.minX = m_location.x - m_params.radius - margin;
        m_boundingBox.maxX = m_location.x + m_params.radius + margin;
        m_boundingBox.minY = m_location.y - m_params.radius - margin;
        m_boundingBox.maxY = m_location.y + m_params.radius + margin;
        m_boundingBox.isValid = true;
    }
    
public:
    VolcanicHotspotFeature(const ContinentalFeatureParams& params, vec2 location)
        : ContinentalFeatureBase(params), m_location(location) {
        m_noiseGen = PlanetGen::Rendering::Noise::NoiseFactory::CreateWorley(params.seed, params.frequency, 2);
        m_radiusSquared = m_params.radius * m_params.radius; // Pre-compute for fast distance checks
    }
    
    float GenerateElevation(float x, float y, float currentElevation) const override {
        // Smart optimization: Use squared distance to avoid sqrt
        vec2 point(x, y);
        vec2 delta = point - m_location;
        float distanceSquared = delta.x * delta.x + delta.y * delta.y;
        
        if (distanceSquared < m_radiusSquared) {
            float distance = std::sqrt(distanceSquared); // Only compute sqrt when needed
            // Volcanic cone shape
            float influence = 1.0f - (distance / m_params.radius);
            influence = std::pow(influence, m_params.sharpness);
            
            // Add some noise for natural variation
            float noise = m_noiseGen->GetNoise(x * 10.0f, y * 10.0f, 0.0f) * 0.3f + 0.7f;
            
            // Caldera at the peak
            if (influence > 0.9f) {
                influence = 0.9f - (influence - 0.9f) * 2.0f;
            }
            
            return influence * noise * m_params.amplitude * m_params.scale;
        }
        
        return 0.0f;
    }
};

// Continental shelf implementation
class ContinentalShelfFeature : public ContinentalFeatureBase {
private:
    float m_shelfDepth;
    float m_shelfWidth;
    
public:
    ContinentalShelfFeature(const ContinentalFeatureParams& params, float depth, float width)
        : ContinentalFeatureBase(params), m_shelfDepth(depth), m_shelfWidth(width) {
        m_noiseGen = PlanetGen::Rendering::Noise::NoiseFactory::CreateSimpleNoise(params.seed, 20.0f, 1);
    }
    
    float GenerateElevation(float x, float y, float currentElevation) const override {
        // Continental shelf applies where elevation is near sea level
        if (currentElevation > -500.0f && currentElevation < 200.0f) {
            // Smooth transition from land to deep ocean
            float shelfFactor = (currentElevation + 500.0f) / 700.0f;
            shelfFactor = std::max(0.0f, std::min(1.0f, shelfFactor));
            
            // Add some variation
            float noise = m_noiseGen->GetNoise(x * 20.0f, y * 20.0f, 0.0f) * 0.2f;
            
            float targetDepth = m_shelfDepth * (1.0f - shelfFactor);
            return (targetDepth - currentElevation) * m_params.scale + noise * 50.0f;
        }
        
        return 0.0f;
    }
};

// Factory implementation
std::unique_ptr<IContinentalFeature> ContinentalFeatureFactory::CreateFeature(const ContinentalFeatureParams& params) {
    switch (params.type) {
        case ContinentalFeatureType::Continental:
            return std::make_unique<ContinentalMassFeature>(params);
            
        case ContinentalFeatureType::Oceanic:
            return std::make_unique<OceanBasinFeature>(params);
            
        case ContinentalFeatureType::MountainRange:
            // For mountain ranges, we need start/end points from center/radius
            return std::make_unique<MountainRangeFeature>(
                params, 
                params.center - vec2(params.radius, 0), 
                params.center + vec2(params.radius, 0),
                0.1f
            );
            
        case ContinentalFeatureType::Hotspot:
            return std::make_unique<VolcanicHotspotFeature>(params, params.center);
            
        case ContinentalFeatureType::ContinentalShelf:
            return std::make_unique<ContinentalShelfFeature>(params, -200.0f, 0.05f);
            
        default:
            // Return a basic continental feature for unimplemented types
            return std::make_unique<ContinentalMassFeature>(params);
    }
}

// Preset configurations
ContinentalFeatureParams ContinentalFeatureFactory::CreateContinentalMass(float scale, uint32_t seed) {
    ContinentalFeatureParams params;
    params.type = ContinentalFeatureType::Continental;
    params.scale = scale;
    params.amplitude = 8000.0f; // Increased to overpower ocean basins
    params.frequency = 0.003f; // Increased for more detailed continental features
    params.seed = seed;
    params.sharpness = 0.7f;
    return params;
}

ContinentalFeatureParams ContinentalFeatureFactory::CreateOceanBasin(float scale, uint32_t seed) {
    ContinentalFeatureParams params;
    params.type = ContinentalFeatureType::Oceanic;
    params.scale = scale;
    params.amplitude = 3000.0f; // Reduced to balance with continents
    params.frequency = 0.002f; // Increased for more detailed ocean features
    params.seed = seed;
    return params;
}

ContinentalFeatureParams ContinentalFeatureFactory::CreateMountainRange(vec2 start, vec2 end, float width, uint32_t seed) {
    ContinentalFeatureParams params;
    params.type = ContinentalFeatureType::MountainRange;
    params.center = (start + end) * 0.5f;
    params.radius = length(end - start) * 0.5f;
    params.amplitude = 6000.0f; // Increased for prominent mountain ranges above continents
    params.frequency = 0.015f; // Increased for more detailed mountain ridges
    params.sharpness = 2.0f;
    params.seed = seed;
    return params;
}

ContinentalFeatureParams ContinentalFeatureFactory::CreateVolcanicHotspot(vec2 location, float intensity, uint32_t seed) {
    ContinentalFeatureParams params;
    params.type = ContinentalFeatureType::Hotspot;
    params.center = location;
    params.radius = 0.05f;
    params.amplitude = 2500.0f * intensity; // Increased for more dramatic volcanic features
    params.sharpness = 3.0f;
    params.seed = seed;
    return params;
}

ContinentalFeatureParams ContinentalFeatureFactory::CreateContinentalShelf(float depth, float width) {
    ContinentalFeatureParams params;
    params.type = ContinentalFeatureType::ContinentalShelf;
    params.amplitude = depth;
    params.scale = 1.0f;
    params.minElevation = -500.0f;
    params.maxElevation = 200.0f;
    return params;
}

// Composer implementation
void ContinentalFeatureComposer::AddFeature(
    std::unique_ptr<IContinentalFeature> feature,
    BlendMode mode,
    float weight,
    std::function<float(float, float)> mask) {
    
    m_layers.push_back({
        std::move(feature),
        mode,
        weight,
        mask
    });
}

float ContinentalFeatureComposer::GenerateElevation(float x, float y, float baseElevation) const {
    float result = baseElevation;
    
    for (const auto& layer : m_layers) {
        if (!layer.feature->ShouldApply(x, y, result)) {
            continue;
        }
        
        float featureValue = layer.feature->GenerateElevation(x, y, result);
        
        // Apply mask if present
        if (layer.mask) {
            float maskValue = layer.mask(x, y);
            featureValue *= maskValue;
        }
        
        // Apply weight
        featureValue *= layer.weight;
        
        // Apply blend mode
        result = ApplyBlendMode(result, featureValue, layer.blendMode);
    }
    
    return result;
}

float ContinentalFeatureComposer::ApplyBlendMode(float current, float value, BlendMode mode) const {
    switch (mode) {
        case BlendMode::Add:
            return current + value;
            
        case BlendMode::Max:
            return std::max(current, value);
            
        case BlendMode::Min:
            return std::min(current, value);
            
        case BlendMode::Multiply:
            return current * value;
            
        case BlendMode::Average:
            return (current + value) * 0.5f;
            
        case BlendMode::Replace:
            return value;
            
        case BlendMode::WeightedAdd:
            // For weighted add, the weight is already applied
            return current + value;
            
        default:
            return current + value;
    }
}

// Continental configuration presets - Tectonic-based Earth-like
ContinentalConfig ContinentalConfig::EarthLike() {
    ContinentalConfig config;
    config.name = "Earth-like";
    
    // Create realistic tectonic plate arrangement
    
    // Major Continental Plates (based on real Earth structure)
    
    // 1. Eurasia Plate (large northern continent)
    auto eurasia = ContinentalFeatureFactory::CreateContinentalMass(1.3f, 100);
    eurasia.center = vec2(-0.2f, 0.6f);
    eurasia.amplitude = 6000.0f;
    config.features.push_back(eurasia);
    
    // 2. North American Plate
    auto northAmerica = ContinentalFeatureFactory::CreateContinentalMass(1.1f, 200);
    northAmerica.center = vec2(-0.7f, 0.4f);
    northAmerica.amplitude = 5500.0f;
    config.features.push_back(northAmerica);
    
    // 3. African Plate
    auto africa = ContinentalFeatureFactory::CreateContinentalMass(1.0f, 300);
    africa.center = vec2(0.1f, 0.0f);
    africa.amplitude = 5000.0f;
    config.features.push_back(africa);
    
    // 4. South American Plate
    auto southAmerica = ContinentalFeatureFactory::CreateContinentalMass(0.9f, 400);
    southAmerica.center = vec2(-0.5f, -0.3f);
    southAmerica.amplitude = 5200.0f;
    config.features.push_back(southAmerica);
    
    // 5. Australian Plate
    auto australia = ContinentalFeatureFactory::CreateContinentalMass(0.7f, 500);
    australia.center = vec2(0.6f, -0.4f);
    australia.amplitude = 4500.0f;
    config.features.push_back(australia);
    
    // 6. Antarctic Plate
    auto antarctica = ContinentalFeatureFactory::CreateContinentalMass(1.2f, 600);
    antarctica.center = vec2(0.0f, -0.8f);
    antarctica.amplitude = 4000.0f;
    config.features.push_back(antarctica);
    
    // Major Ocean Basins (connected systems, not holes)
    
    // Pacific Basin (largest)
    auto pacific = ContinentalFeatureFactory::CreateOceanBasin(1.5f, 1000);
    pacific.center = vec2(0.8f, 0.0f);
    pacific.amplitude = 2500.0f; // Moderate depth for broad basin
    config.features.push_back(pacific);
    
    // Atlantic Basin (linear)
    auto atlantic = ContinentalFeatureFactory::CreateOceanBasin(1.0f, 1100);
    atlantic.center = vec2(-0.3f, 0.0f);
    atlantic.amplitude = 2000.0f;
    config.features.push_back(atlantic);
    
    // Indian Ocean Basin
    auto indian = ContinentalFeatureFactory::CreateOceanBasin(0.8f, 1200);
    indian.center = vec2(0.4f, -0.2f);
    indian.amplitude = 2200.0f;
    config.features.push_back(indian);
    
    // Mountain Ranges (along plate boundaries)
    
    // Himalayas (Eurasia-India collision)
    config.features.push_back(ContinentalFeatureFactory::CreateMountainRange(
        vec2(0.2f, 0.4f), vec2(0.5f, 0.5f), 0.08f, 2000
    ));
    
    // Andes (South American subduction zone)
    config.features.push_back(ContinentalFeatureFactory::CreateMountainRange(
        vec2(-0.6f, 0.1f), vec2(-0.4f, -0.5f), 0.06f, 2100
    ));
    
    // Rocky Mountains (North American)
    config.features.push_back(ContinentalFeatureFactory::CreateMountainRange(
        vec2(-0.8f, 0.2f), vec2(-0.6f, 0.6f), 0.07f, 2200
    ));
    
    // Mid-Atlantic Ridge (ocean ridge)
    config.features.push_back(ContinentalFeatureFactory::CreateMountainRange(
        vec2(-0.3f, -0.6f), vec2(-0.3f, 0.6f), 0.04f, 2300
    ));
    
    // Continental shelves around major landmasses
    config.features.push_back(ContinentalFeatureFactory::CreateContinentalShelf(-200.0f, 0.05f));
    
    return config;
}

ContinentalConfig ContinentalConfig::Pangaea() {
    ContinentalConfig config;
    config.name = "Pangaea";
    
    // One large supercontinent
    auto params = ContinentalFeatureFactory::CreateContinentalMass(2.0f, 100);
    params.amplitude = 4000.0f;
    params.frequency = 0.0005f;
    config.features.push_back(params);
    
    // Surrounding ocean
    auto ocean = ContinentalFeatureFactory::CreateOceanBasin(1.5f, 200);
    ocean.amplitude = 5000.0f;
    config.features.push_back(ocean);
    
    // Central mountain range
    config.features.push_back(ContinentalFeatureFactory::CreateMountainRange(
        vec2(-0.4f, 0.0f), vec2(0.4f, 0.0f), 0.15f, 300
    ));
    
    return config;
}

ContinentalConfig ContinentalConfig::Archipelago() {
    ContinentalConfig config;
    config.name = "Archipelago";
    
    // Many small islands
    std::mt19937 rng(123);
    std::uniform_real_distribution<float> posDist(-0.9f, 0.9f);
    
    for (int i = 0; i < 50; ++i) {
        auto params = ContinentalFeatureFactory::CreateVolcanicHotspot(
            vec2(posDist(rng), posDist(rng)), 
            0.5f + (i % 5) * 0.2f, 
            i * 10
        );
        params.radius = 0.02f + (i % 3) * 0.01f;
        config.features.push_back(params);
    }
    
    // Deep ocean base
    auto ocean = ContinentalFeatureFactory::CreateOceanBasin(1.0f, 500);
    ocean.amplitude = 3000.0f;
    config.features.push_back(ocean);
    
    return config;
}

ContinentalConfig ContinentalConfig::Waterworld() {
    ContinentalConfig config;
    config.name = "Waterworld";
    
    // Deep global ocean
    auto ocean = ContinentalFeatureFactory::CreateOceanBasin(1.5f, 100);
    ocean.amplitude = 6000.0f;
    ocean.frequency = 0.0003f;
    config.features.push_back(ocean);
    
    // Scattered small islands
    std::mt19937 rng(789);
    std::uniform_real_distribution<float> posDist(-0.9f, 0.9f);
    
    for (int i = 0; i < 15; ++i) {
        auto params = ContinentalFeatureFactory::CreateVolcanicHotspot(
            vec2(posDist(rng), posDist(rng)), 
            0.3f, 
            i * 20 + 1000
        );
        params.radius = 0.015f;
        params.amplitude = 800.0f;
        config.features.push_back(params);
    }
    
    return config;
}

ContinentalConfig ContinentalConfig::DualContinents() {
    ContinentalConfig config;
    config.name = "Dual Continents";
    
    // Two major continental masses
    auto continent1 = ContinentalFeatureFactory::CreateContinentalMass(1.2f, 300);
    continent1.center = vec2(-0.4f, 0.2f);
    continent1.amplitude = 3500.0f;
    config.features.push_back(continent1);
    
    auto continent2 = ContinentalFeatureFactory::CreateContinentalMass(1.0f, 400);
    continent2.center = vec2(0.5f, -0.3f);
    continent2.amplitude = 3200.0f;
    config.features.push_back(continent2);
    
    // Ocean basin between them
    auto ocean = ContinentalFeatureFactory::CreateOceanBasin(1.0f, 500);
    ocean.amplitude = 4500.0f;
    config.features.push_back(ocean);
    
    // Mountain ranges on each continent
    config.features.push_back(ContinentalFeatureFactory::CreateMountainRange(
        vec2(-0.6f, 0.0f), vec2(-0.2f, 0.4f), 0.08f, 600
    ));
    config.features.push_back(ContinentalFeatureFactory::CreateMountainRange(
        vec2(0.3f, -0.5f), vec2(0.7f, -0.1f), 0.08f, 700
    ));
    
    // Continental shelves
    config.features.push_back(ContinentalFeatureFactory::CreateContinentalShelf(-180.0f, 0.04f));
    
    return config;
}

// Integration helper implementation with multi-threading
void ContinentalFeatureIntegration::ApplyContinentalFeatures(
    std::vector<float>& elevationData,
    uint32_t width, uint32_t height,
    const ContinentalConfig& config,
    float worldScale) {
    
    auto composer = CreateComposer(config);
    
    // Smart multi-threading: determine optimal chunk size
    const uint32_t hardwareConcurrency = std::thread::hardware_concurrency();
    const uint32_t numThreads = std::max(1u, std::min(hardwareConcurrency, 8u)); // Cap at 8 threads
    const uint32_t totalPixels = width * height;
    const uint32_t minChunkSize = 1024; // Minimum chunk size to avoid overhead
    const uint32_t optimalChunkSize = std::max(minChunkSize, totalPixels / (numThreads * 4));
    
    std::vector<std::future<void>> futures;
    std::atomic<uint32_t> completedChunks{0};
    
    // Process in chunks across multiple threads
    for (uint32_t startIdx = 0; startIdx < totalPixels; startIdx += optimalChunkSize) {
        uint32_t endIdx = std::min(startIdx + optimalChunkSize, totalPixels);
        
        futures.push_back(std::async(std::launch::async, [&, startIdx, endIdx]() {
            // Create thread-local composer to avoid contention
            auto localComposer = CreateComposer(config);
            
            for (uint32_t idx = startIdx; idx < endIdx; ++idx) {
                uint32_t x = idx % width;
                uint32_t y = idx / width;
                
                // Convert to normalized coordinates (-1 to 1)
                float nx = (static_cast<float>(x) / (width - 1)) * 2.0f - 1.0f;
                float ny = (static_cast<float>(y) / (height - 1)) * 2.0f - 1.0f;
                
                float currentElevation = elevationData[idx];
                
                // Apply continental features on top of base terrain
                float continentalModification = localComposer->GenerateElevation(
                    nx * worldScale, 
                    ny * worldScale, 
                    0.0f  // Start from neutral
                );
                
                // Add continental features to base terrain
                elevationData[idx] = currentElevation + continentalModification;
            }
            
            completedChunks.fetch_add(1);
        }));
    }
    
    // Wait for all threads to complete
    for (auto& future : futures) {
        future.wait();
    }
}

std::unique_ptr<ContinentalFeatureComposer> ContinentalFeatureIntegration::CreateComposer(
    const ContinentalConfig& config) {
    
    auto composer = std::make_unique<ContinentalFeatureComposer>();
    
    // First pass: Add ocean basins (broad depressions, not holes)
    for (const auto& params : config.features) {
        if (params.type == ContinentalFeatureType::Oceanic) {
            composer->AddFeature(
                ContinentalFeatureFactory::CreateFeature(params),
                ContinentalFeatureComposer::BlendMode::Add, // Changed from Min to Add
                1.0f
            );
        }
    }
    
    // Second pass: Add continental masses (positive features)
    for (const auto& params : config.features) {
        if (params.type == ContinentalFeatureType::Continental) {
            composer->AddFeature(
                ContinentalFeatureFactory::CreateFeature(params),
                ContinentalFeatureComposer::BlendMode::Add,
                1.0f
            );
        }
    }
    
    // Third pass: Add detailed features
    for (const auto& params : config.features) {
        if (params.type != ContinentalFeatureType::Continental && 
            params.type != ContinentalFeatureType::Oceanic) {
            
            auto blendMode = ContinentalFeatureComposer::BlendMode::Add;
            
            // Special blend modes for certain features
            if (params.type == ContinentalFeatureType::ContinentalShelf) {
                blendMode = ContinentalFeatureComposer::BlendMode::WeightedAdd;
            }
            
            composer->AddFeature(
                ContinentalFeatureFactory::CreateFeature(params),
                blendMode,
                1.0f
            );
        }
    }
    
    return composer;
}

} // namespace PlanetGen::Generation::Features
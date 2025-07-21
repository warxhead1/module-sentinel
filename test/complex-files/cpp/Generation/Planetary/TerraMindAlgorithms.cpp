module;

#include <vector>
#include <memory>
#include <algorithm>
#include <cmath>
#include <random>
#include <iostream>
#include <unordered_map>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

module PlanetaryGenerator;

import GLMModule;
import GenerationTypes;
import NoiseTypes;

// PlanetaryModality method implementations at module level
void PlanetaryModality::normalize() {
    if (data.empty()) return;
    
    auto minMax = std::minmax_element(data.begin(), data.end());
    minValue = *minMax.first;
    maxValue = *minMax.second;
    
    if (maxValue > minValue) {
        for (float& value : data) {
            value = (value - minValue) / (maxValue - minValue);
        }
        minValue = 0.0f;
        maxValue = 1.0f;
    }
}

void PlanetaryModality::scale(float newMin, float newMax) {
    if (data.empty()) return;
    
    // First normalize to 0-1
    normalize();
    
    // Then scale to new range
    for (float& value : data) {
        value = newMin + value * (newMax - newMin);
    }
    
    minValue = newMin;
    maxValue = newMax;
}

float PlanetaryModality::sample(float x, float y) const {
    if (data.empty() || width == 0 || height == 0) return 0.0f;
    
    // Clamp coordinates to valid range
    x = std::max(0.0f, std::min(static_cast<float>(width - 1), x));
    y = std::max(0.0f, std::min(static_cast<float>(height - 1), y));
    
    // Get integer coordinates
    uint32_t x0 = static_cast<uint32_t>(x);
    uint32_t y0 = static_cast<uint32_t>(y);
    uint32_t x1 = std::min(x0 + 1, width - 1);
    uint32_t y1 = std::min(y0 + 1, height - 1);
    
    // Get fractional parts
    float fx = x - x0;
    float fy = y - y0;
    
    // Sample the four corners
    float val00 = data[y0 * width + x0];
    float val10 = data[y0 * width + x1];
    float val01 = data[y1 * width + x0];
    float val11 = data[y1 * width + x1];
    
    // Bilinear interpolation
    float val0 = val00 * (1.0f - fx) + val10 * fx;
    float val1 = val01 * (1.0f - fx) + val11 * fx;
    
    return val0 * (1.0f - fy) + val1 * fy;
}

namespace PlanetGen::Generation {

// Additional implementations for PlanetaryGenerator inspired by TerraMind's approach

// TerraMind-inspired modality processing functions
PlanetaryModality PlanetaryGenerator::GenerateFromModality(const PlanetaryModality& input, 
                                                         const std::string& targetModalityType) {
    PlanetaryModality output;
    output.name = targetModalityType;
    output.width = input.width;
    output.height = input.height;
    output.data.resize(input.data.size());
    
    std::cout << "[PlanetaryGenerator] Generating " << targetModalityType 
              << " from " << input.name << " using TerraMind-inspired algorithms" << std::endl;
    
    // TerraMind-inspired transformation rules
    if (input.name == "elevation" && targetModalityType == "temperature") {
        // Elevation-to-temperature transformation
        for (size_t i = 0; i < input.data.size(); ++i) {
            uint32_t y = i / input.width;
            float latitude = (static_cast<float>(y) / (input.height - 1) - 0.5f) * 180.0f;
            float elevation = input.data[i];
            
            // Base temperature from latitude
            float baseTemp = 288.0f - std::abs(latitude) * 0.5f;
            // Lapse rate (6.5°C per 1000m)
            baseTemp -= elevation * 0.0065f;
            
            output.data[i] = std::max(200.0f, baseTemp);  // Minimum 200K
        }
    }
    else if (input.name == "elevation" && targetModalityType == "precipitation") {
        // Elevation-to-precipitation transformation (orographic effects)
        for (size_t i = 0; i < input.data.size(); ++i) {
            float elevation = input.data[i];
            
            // More precipitation at higher elevations (up to a point)
            float basePrecip = 500.0f;  // Base precipitation
            if (elevation > 0.0f && elevation < 3000.0f) {
                basePrecip += elevation * 0.3f;  // Increase with elevation
            } else if (elevation >= 3000.0f) {
                basePrecip = 1400.0f - (elevation - 3000.0f) * 0.1f;  // Decrease at very high elevations
            }
            
            output.data[i] = std::max(0.0f, basePrecip);
        }
    }
    else if (input.name == "temperature" && targetModalityType == "vegetation") {
        // Temperature-to-vegetation transformation
        for (size_t i = 0; i < input.data.size(); ++i) {
            float temp = input.data[i];
            
            // Vegetation density based on temperature (bell curve around 20°C = 293K)
            float optimalTemp = 293.0f;
            float tempRange = 30.0f;
            float vegDensity = std::exp(-std::pow((temp - optimalTemp) / tempRange, 2.0f));
            
            output.data[i] = std::max(0.0f, std::min(1.0f, vegDensity));
        }
    }
    else {
        // Generic transformation using statistical relationships
        std::cout << "[PlanetaryGenerator] Using generic transformation for " 
                  << input.name << " -> " << targetModalityType << std::endl;
        
        // Apply a learned transformation (simplified version of TerraMind's approach)
        for (size_t i = 0; i < input.data.size(); ++i) {
            float value = input.data[i];
            
            // Normalize input value
            float normalizedInput = (value - input.minValue) / (input.maxValue - input.minValue);
            
            // Apply non-linear transformation
            float transformedValue = std::sin(normalizedInput * M_PI) * 0.8f + 
                                   normalizedInput * 0.2f;
            
            output.data[i] = transformedValue;
        }
    }
    
    // Calculate output statistics
    auto minMax = std::minmax_element(output.data.begin(), output.data.end());
    output.minValue = *minMax.first;
    output.maxValue = *minMax.second;
    
    return output;
}

// Multi-modal generation (TerraMind's strength)
std::vector<PlanetaryModality> PlanetaryGenerator::GenerateMultiModal(
    const std::vector<std::string>& modalityTypes, 
    uint32_t resolution, uint32_t seed) {
    
    std::vector<PlanetaryModality> modalities;
    modalities.reserve(modalityTypes.size());
    
    std::cout << "[PlanetaryGenerator] Generating " << modalityTypes.size() 
              << " modalities simultaneously" << std::endl;
    
    // Start with elevation as the base modality
    PlanetaryModality elevation = GenerateElevation(resolution, seed);
    modalities.push_back(elevation);
    
    // Generate other modalities using any-to-any approach
    for (const std::string& modalityType : modalityTypes) {
        if (modalityType == "elevation") continue;  // Already generated
        
        PlanetaryModality modality;
        
        if (modalityType == "temperature") {
            modality = GenerateTemperature(elevation, resolution);
        }
        else if (modalityType == "precipitation") {
            // Use both elevation and temperature if temperature is available
            auto tempIt = std::find_if(modalities.begin(), modalities.end(),
                [](const PlanetaryModality& m) { return m.name == "temperature"; });
            
            if (tempIt != modalities.end()) {
                modality = GeneratePrecipitation(elevation, *tempIt, resolution);
            } else {
                // Generate temperature first, then precipitation
                auto temp = GenerateTemperature(elevation, resolution);
                modality = GeneratePrecipitation(elevation, temp, resolution);
            }
        }
        else if (modalityType == "vegetation") {
            // Requires both temperature and precipitation
            auto tempIt = std::find_if(modalities.begin(), modalities.end(),
                [](const PlanetaryModality& m) { return m.name == "temperature"; });
            auto precipIt = std::find_if(modalities.begin(), modalities.end(),
                [](const PlanetaryModality& m) { return m.name == "precipitation"; });
            
            if (tempIt != modalities.end() && precipIt != modalities.end()) {
                modality = GenerateVegetationDensity(*tempIt, *precipIt, elevation);
            } else {
                // Generate dependencies first
                modality = GenerateFromModality(elevation, modalityType);
            }
        }
        else {
            // Use any-to-any generation for other modalities
            modality = GenerateFromModality(elevation, modalityType);
        }
        
        modalities.push_back(modality);
    }
    
    return modalities;
}

// Additional advanced layer processing methods
void PlanetaryGenerator::AddContinentalLayer(float amplitude, float frequency) {
    PlanetaryNoiseLayer layer;
    layer.type = Rendering::Noise::NoiseType::Simplex;
    layer.amplitude = amplitude;
    layer.frequency = frequency;
    layer.octaves = 4;
    layer.persistence = 0.6f;
    layer.lacunarity = 2.0f;
    layer.seed = m_seed + 1;
    layer.useRidgedNoise = false;
    
    m_noiseLayers.push_back(layer);
}

void PlanetaryGenerator::AddMountainRidges(float amplitude, float frequency) {
    PlanetaryNoiseLayer layer;
    layer.type = Rendering::Noise::NoiseType::Simplex;
    layer.amplitude = amplitude;
    layer.frequency = frequency;
    layer.octaves = 6;
    layer.persistence = 0.5f;
    layer.lacunarity = 2.2f;
    layer.seed = m_seed + 2;
    layer.useRidgedNoise = true;
    
    m_noiseLayers.push_back(layer);
}

void PlanetaryGenerator::AddOceanBasins(float amplitude, float frequency) {
    PlanetaryNoiseLayer layer;
    layer.type = Rendering::Noise::NoiseType::Simplex;
    layer.amplitude = amplitude;
    layer.frequency = frequency;
    layer.octaves = 3;
    layer.persistence = 0.4f;
    layer.lacunarity = 2.0f;
    layer.seed = m_seed + 3;
    layer.useRidgedNoise = false;
    
    m_noiseLayers.push_back(layer);
}

void PlanetaryGenerator::AddVolcanicHotspots(uint32_t count, float intensity) {
    // Generate random volcanic hotspots
    std::mt19937 gen(m_seed + 4);
    std::uniform_real_distribution<float> dis(0.0f, 1.0f);
    
    for (uint32_t i = 0; i < count; ++i) {
        PlanetaryNoiseLayer layer;
        layer.type = Rendering::Noise::NoiseType::Simplex;
        layer.amplitude = intensity;
        layer.frequency = 0.1f;
        layer.octaves = 2;
        layer.persistence = 0.8f;
        layer.lacunarity = 3.0f;
        layer.seed = m_seed + 10 + i;
        layer.offset = vec2(dis(gen), dis(gen));
        layer.useRidgedNoise = true;
        
        m_noiseLayers.push_back(layer);
    }
}

void PlanetaryGenerator::AddRiverSystems(uint32_t count, float depth) {
    // Simplified river system generation
    std::mt19937 gen(m_seed + 5);
    std::uniform_real_distribution<float> dis(0.0f, 1.0f);
    
    for (uint32_t i = 0; i < count; ++i) {
        PlanetaryNoiseLayer layer;
        layer.type = Rendering::Noise::NoiseType::Simplex;
        layer.amplitude = -depth;  // Negative for carving
        layer.frequency = 0.05f;
        layer.octaves = 1;
        layer.persistence = 1.0f;
        layer.lacunarity = 2.0f;
        layer.seed = m_seed + 20 + i;
        layer.offset = vec2(dis(gen), dis(gen));
        layer.useDomainWarping = true;
        layer.warpStrength = 10.0f;
        layer.warpFrequency = 0.02f;
        
        m_noiseLayers.push_back(layer);
    }
}

// Apply seasonal variation to modalities
void PlanetaryGenerator::ApplySeasonalVariation(PlanetaryModality& modality, float dayOfYear) {
    for (uint32_t y = 0; y < modality.height; ++y) {
        float latitude = (static_cast<float>(y) / (modality.height - 1) - 0.5f) * 180.0f;
        
        // Calculate seasonal effect based on latitude and day of year
        float seasonalEffect = std::sin((dayOfYear - 80.0f) * 2.0f * M_PI / 365.25f) * 
                              std::sin(latitude * M_PI / 180.0f) * 0.2f;
        
        for (uint32_t x = 0; x < modality.width; ++x) {
            size_t idx = y * modality.width + x;
            modality.data[idx] *= (1.0f + seasonalEffect);
        }
    }
}

} // namespace PlanetGen::Generation
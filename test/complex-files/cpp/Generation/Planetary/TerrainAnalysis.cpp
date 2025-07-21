module;
#include <cmath>
#include <algorithm>
#include <vector>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

module PlanetaryGenerator;

import GLMModule;
import GenerationTypes;
namespace PlanetGen::Generation {

// Terrain Analysis Methods - these implement advanced terrain feature detection
PlanetaryModality PlanetaryGenerator::GenerateSlope(const PlanetaryModality& elevation) {
    PlanetaryModality slope;
    slope.name = "slope";
    slope.width = elevation.width;
    slope.height = elevation.height;
    slope.data.resize(elevation.data.size(), 0.0f);
    
    for (uint32_t y = 1; y < elevation.height - 1; ++y) {
        for (uint32_t x = 1; x < elevation.width - 1; ++x) {
            uint32_t idx = y * elevation.width + x;
            
            // Calculate gradients using Sobel operator
            float dzdx = (elevation.data[idx + 1] - elevation.data[idx - 1]) / 2.0f;
            float dzdy = (elevation.data[(y + 1) * elevation.width + x] - elevation.data[(y - 1) * elevation.width + x]) / 2.0f;
            
            // Calculate slope magnitude
            slope.data[idx] = std::sqrt(dzdx * dzdx + dzdy * dzdy);
        }
    }
    
    auto minMax = std::minmax_element(slope.data.begin(), slope.data.end());
    slope.minValue = *minMax.first;
    slope.maxValue = *minMax.second;
    
    return slope;
}

PlanetaryModality PlanetaryGenerator::GenerateAspect(const PlanetaryModality& elevation) {
    PlanetaryModality aspect;
    aspect.name = "aspect";
    aspect.width = elevation.width;
    aspect.height = elevation.height;
    aspect.data.resize(elevation.data.size(), 0.0f);
    
    for (uint32_t y = 1; y < elevation.height - 1; ++y) {
        for (uint32_t x = 1; x < elevation.width - 1; ++x) {
            uint32_t idx = y * elevation.width + x;
            
            // Calculate gradients
            float dzdx = (elevation.data[idx + 1] - elevation.data[idx - 1]) / 2.0f;
            float dzdy = (elevation.data[(y + 1) * elevation.width + x] - elevation.data[(y - 1) * elevation.width + x]) / 2.0f;
            
            // Calculate aspect (direction of steepest descent)
            float aspectValue = std::atan2(dzdy, -dzdx);
            aspect.data[idx] = aspectValue;
        }
    }
    
    auto minMax = std::minmax_element(aspect.data.begin(), aspect.data.end());
    aspect.minValue = *minMax.first;
    aspect.maxValue = *minMax.second;
    
    return aspect;
}

PlanetaryModality PlanetaryGenerator::GenerateDrainage(const PlanetaryModality& elevation, const PlanetaryModality& slope) {
    PlanetaryModality drainage;
    drainage.name = "drainage";
    drainage.width = elevation.width;
    drainage.height = elevation.height;
    drainage.data.resize(elevation.data.size(), 0.0f);
    
    // Simple flow accumulation algorithm
    for (uint32_t y = 1; y < elevation.height - 1; ++y) {
        for (uint32_t x = 1; x < elevation.width - 1; ++x) {
            uint32_t idx = y * elevation.width + x;
            float currentHeight = elevation.data[idx];
            
            // Count how many neighbors flow into this cell
            int flowCount = 0;
            for (int dy = -1; dy <= 1; ++dy) {
                for (int dx = -1; dx <= 1; ++dx) {
                    if (dx == 0 && dy == 0) continue;
                    
                    uint32_t neighborIdx = (y + dy) * elevation.width + (x + dx);
                    if (elevation.data[neighborIdx] > currentHeight) {
                        flowCount++;
                    }
                }
            }
            
            drainage.data[idx] = static_cast<float>(flowCount) / 8.0f;
        }
    }
    
    auto minMax = std::minmax_element(drainage.data.begin(), drainage.data.end());
    drainage.minValue = *minMax.first;
    drainage.maxValue = *minMax.second;
    
    return drainage;
}

PlanetaryModality PlanetaryGenerator::GenerateHumidity(const PlanetaryModality& temperature,
                                                     const PlanetaryModality& precipitation) {
    PlanetaryModality humidity;
    humidity.name = "humidity";
    humidity.width = temperature.width;
    humidity.height = temperature.height;
    humidity.data.resize(temperature.data.size());
    
    for (size_t i = 0; i < temperature.data.size(); ++i) {
        float temp = temperature.data[i];
        float precip = precipitation.data[i];
        
        // Calculate relative humidity based on temperature and precipitation
        // Higher precipitation generally means higher humidity
        // But temperature affects the air's capacity to hold moisture
        
        float baseHumidity = std::min(1.0f, precip / 1500.0f); // Normalize precipitation to 1500mm
        
        // Temperature effect: warmer air can hold more moisture
        // But if there's no precipitation, it will be dry
        float tempEffect = 1.0f;
        if (temp > 273.0f && temp < 313.0f) { // 0°C to 40°C
            tempEffect = 0.5f + 0.5f * std::sin((temp - 273.0f) / 40.0f * M_PI);
        } else if (temp <= 273.0f) {
            tempEffect = 0.3f; // Cold air holds less moisture
        } else {
            tempEffect = 0.8f; // Very hot air can be dry despite capacity
        }
        
        // Combine effects
        float finalHumidity = baseHumidity * tempEffect;
        
        // Clamp to reasonable values
        humidity.data[i] = std::max(0.1f, std::min(1.0f, finalHumidity));
    }
    
    auto minMax = std::minmax_element(humidity.data.begin(), humidity.data.end());
    humidity.minValue = *minMax.first;
    humidity.maxValue = *minMax.second;
    
    return humidity;
}

PlanetaryModality PlanetaryGenerator::GenerateWindSpeed(const PlanetaryModality& elevation,
                                                      const PlanetaryModality& temperature) {
    PlanetaryModality windSpeed;
    windSpeed.name = "windSpeed";
    windSpeed.width = elevation.width;
    windSpeed.height = elevation.height;
    windSpeed.data.resize(elevation.data.size());
    
    for (uint32_t y = 0; y < elevation.height; ++y) {
        for (uint32_t x = 0; x < elevation.width; ++x) {
            uint32_t idx = y * elevation.width + x;
            
            float latitude = 90.0f - (180.0f * y / elevation.height);
            float elev = elevation.data[idx];
            
            // Base wind speed from latitude
            float baseWind = 5.0f + std::abs(latitude - 30.0f) * 0.1f;
            
            // Elevation increases wind speed
            float elevationEffect = elev / 1000.0f;
            
            windSpeed.data[idx] = baseWind + elevationEffect;
        }
    }
    
    auto minMax = std::minmax_element(windSpeed.data.begin(), windSpeed.data.end());
    windSpeed.minValue = *minMax.first;
    windSpeed.maxValue = *minMax.second;
    
    return windSpeed;
}

PlanetaryModality PlanetaryGenerator::GenerateGeology(const PlanetaryModality& elevation, const PlanetaryModality& slope) {
    PlanetaryModality geology;
    geology.name = "geology";
    geology.width = elevation.width;
    geology.height = elevation.height;
    geology.data.resize(elevation.data.size());
    
    for (size_t i = 0; i < elevation.data.size(); ++i) {
        float elev = elevation.data[i];
        float slopeValue = slope.data[i];
        
        // Simple geological classification based on elevation
        float geologicalType = 0.0f;
        if (elev < -1000.0f) {
            geologicalType = 1.0f; // Oceanic crust
        } else if (elev < 500.0f) {
            geologicalType = 2.0f; // Sedimentary
        } else if (elev < 2000.0f) {
            geologicalType = 3.0f; // Metamorphic
        } else {
            geologicalType = 4.0f; // Igneous
        }
        
        // Modify by slope - steeper areas more likely to be igneous
        if (slopeValue > 0.3f) {
            geologicalType = std::min(4.0f, geologicalType + 1.0f);
        }
        
        geology.data[i] = geologicalType;
    }
    
    auto minMax = std::minmax_element(geology.data.begin(), geology.data.end());
    geology.minValue = *minMax.first;
    geology.maxValue = *minMax.second;
    
    return geology;
}

PlanetaryModality PlanetaryGenerator::GenerateLandUse(const PlanetaryModality& elevation,
                                                    const PlanetaryModality& vegetation,
                                                    const PlanetaryModality& temperature) {
    PlanetaryModality landUse;
    landUse.name = "landUse";
    landUse.width = elevation.width;
    landUse.height = elevation.height;
    landUse.data.resize(elevation.data.size());
    
    for (size_t i = 0; i < elevation.data.size(); ++i) {
        float elev = elevation.data[i];
        float veg = vegetation.data[i];
        float temp = temperature.data[i];
        
        // Classify land use based on environmental conditions
        float landUseType = 0.0f;
        
        if (elev < 0.0f) {
            landUseType = 0.0f; // Water
        } else if (temp < 273.0f) {
            landUseType = 1.0f; // Ice/Snow
        } else if (veg < 0.1f && temp > 303.0f) {
            landUseType = 2.0f; // Desert
        } else if (temp > 298.0f && veg > 0.7f) {
            landUseType = 3.0f; // Tropical forest
        } else if (temp > 283.0f && veg > 0.5f) {
            landUseType = 4.0f; // Temperate forest
        } else if (elev > 3000.0f) {
            landUseType = 5.0f; // Mountain/Alpine
        } else {
            landUseType = 6.0f; // Grassland/Plains
        }
        
        landUse.data[i] = landUseType;
    }
    
    auto minMax = std::minmax_element(landUse.data.begin(), landUse.data.end());
    landUse.minValue = *minMax.first;
    landUse.maxValue = *minMax.second;
    
    return landUse;
}

PlanetaryModality PlanetaryGenerator::GenerateErosion(const PlanetaryModality& slope,
                                                    const PlanetaryModality& precipitation,
                                                    const PlanetaryModality& vegetation) {
    PlanetaryModality erosion;
    erosion.name = "erosion";
    erosion.width = slope.width;
    erosion.height = slope.height;
    erosion.data.resize(slope.data.size());
    
    for (size_t i = 0; i < slope.data.size(); ++i) {
        float slopeValue = slope.data[i];
        float precip = precipitation.data[i];
        float veg = vegetation.data[i];
        
        // Higher slope and precipitation increase erosion
        float erosionRate = slopeValue * 0.01f + (precip / 1000.0f) * 0.5f;
        
        // Vegetation reduces erosion
        erosionRate *= (1.0f - veg * 0.8f);
        
        erosion.data[i] = std::max(0.0f, std::min(1.0f, erosionRate));
    }
    
    auto minMax = std::minmax_element(erosion.data.begin(), erosion.data.end());
    erosion.minValue = *minMax.first;
    erosion.maxValue = *minMax.second;
    
    return erosion;
}

// Utility functions for slope and aspect calculation
float PlanetaryGenerator::CalculateSlope(const PlanetaryModality& elevation, uint32_t x, uint32_t y) {
    if (x == 0 || y == 0 || x >= elevation.width - 1 || y >= elevation.height - 1) {
        return 0.0f;
    }
    
    float left = elevation.data[y * elevation.width + (x - 1)];
    float right = elevation.data[y * elevation.width + (x + 1)];
    float up = elevation.data[(y - 1) * elevation.width + x];
    float down = elevation.data[(y + 1) * elevation.width + x];
    
    float dx = (right - left) / 2.0f;
    float dy = (down - up) / 2.0f;
    
    return std::sqrt(dx * dx + dy * dy);
}

float PlanetaryGenerator::CalculateAspect(const PlanetaryModality& elevation, uint32_t x, uint32_t y) {
    if (x == 0 || y == 0 || x >= elevation.width - 1 || y >= elevation.height - 1) {
        return 0.0f;
    }
    
    float left = elevation.data[y * elevation.width + (x - 1)];
    float right = elevation.data[y * elevation.width + (x + 1)];
    float up = elevation.data[(y - 1) * elevation.width + x];
    float down = elevation.data[(y + 1) * elevation.width + x];
    
    float dx = (right - left) / 2.0f;
    float dy = (down - up) / 2.0f;
    
    if (dx == 0.0f && dy == 0.0f) return 0.0f;
    
    float aspect = std::atan2(dy, dx) * 180.0f / M_PI;
    if (aspect < 0.0f) aspect += 360.0f;
    
    return aspect;
}

// Coordinate conversion utilities
vec2 PlanetaryGenerator::SphericalToCartesian(float latitude, float longitude) {
    float lat = latitude * M_PI / 180.0f;
    float lon = longitude * M_PI / 180.0f;
    
    float x = std::cos(lat) * std::cos(lon);
    float y = std::cos(lat) * std::sin(lon);
    
    return vec2(x, y);
}

vec2 PlanetaryGenerator::CartesianToSpherical(float x, float y) {
    float longitude = std::atan2(y, x) * 180.0f / M_PI;
    float latitude = std::asin(std::sqrt(x * x + y * y)) * 180.0f / M_PI;
    
    return vec2(latitude, longitude);
}

} // namespace PlanetGen::Generation
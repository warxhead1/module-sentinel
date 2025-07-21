module;

#include <memory>
#include <vector>
#include <unordered_map>
#include <algorithm>
#include <cmath>
#include <functional>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

module BiomeClassifier;

import GLMModule;
import TerrainAnalysisTypes;

namespace PlanetGen::Generation::Analysis {

BiomeClassifier::BiomeClassifier() {
    m_classificationAlgorithm = [this](float elevation, float temperature, float precipitation, 
                                     float slope, float latitude, float longitude) {
        return DefaultClassificationAlgorithm(elevation, temperature, precipitation, slope, latitude, longitude);
    };
}

bool BiomeClassifier::Initialize() {
    InitializeDefaultBiomes();
    return true;
}

BiomeType BiomeClassifier::ClassifyPoint(float elevation, float temperature, float precipitation, 
                                       float slope, float latitude, float longitude) const {
    return m_classificationAlgorithm(elevation, temperature, precipitation, slope, latitude, longitude);
}

std::vector<std::pair<BiomeType, float>> BiomeClassifier::CalculateBiomeTransitions(
    float elevation, float temperature, float precipitation, 
    float slope, float latitude, float longitude) const {
    
    std::vector<std::pair<BiomeType, float>> transitions;
    
    // Calculate scores for each possible biome based on environmental conditions
    struct BiomeScore {
        BiomeType biome;
        float score;
        float distance; // Environmental distance from ideal conditions
    };
    
    std::vector<BiomeScore> scores;
    
    // Ocean transitions based on depth
    if (elevation < 200.0f) {
        float oceanScore = 1.0f / (1.0f + std::exp((elevation + 100.0f) * 0.01f));
        if (oceanScore > 0.1f) {
            scores.push_back({BiomeType::Ocean, oceanScore, std::abs(elevation)});
        }
    }
    
    // Desert transitions based on aridity
    float aridity = temperature / (precipitation + 1.0f);
    if (aridity > 0.1f || precipitation < 400.0f) {
        float desertScore = 1.0f / (1.0f + std::exp(-(aridity - 0.2f) * 10.0f));
        scores.push_back({BiomeType::Desert, desertScore, std::abs(aridity - 0.3f)});
    }
    
    // Forest transitions based on moisture and temperature
    if (precipitation > 400.0f && temperature > 0.0f) {
        float moistureScore = precipitation / 2000.0f;
        float tempScore = 1.0f - std::abs(temperature - 20.0f) / 40.0f;
        float forestScore = moistureScore * tempScore;
        
        if (temperature > 20.0f && std::abs(latitude) < 30.0f) {
            scores.push_back({BiomeType::TropicalRainforest, forestScore * 1.2f, 
                            std::abs(temperature - 25.0f) + std::abs(precipitation - 2000.0f) / 1000.0f});
        } else {
            scores.push_back({BiomeType::TemperateForest, forestScore, 
                            std::abs(temperature - 15.0f) + std::abs(precipitation - 1000.0f) / 1000.0f});
        }
    }
    
    // Grassland transitions
    if (precipitation > 200.0f && precipitation < 1000.0f) {
        float grassScore = 1.0f - std::abs(precipitation - 500.0f) / 500.0f;
        scores.push_back({BiomeType::Grassland, grassScore, std::abs(precipitation - 500.0f) / 500.0f});
    }
    
    // Mountain transitions based on elevation and slope
    if (elevation > 1000.0f || slope > 0.2f) {
        float mountainScore = (elevation / 4000.0f + slope) * 0.5f;
        scores.push_back({BiomeType::Mountain, mountainScore, std::abs(elevation - 2000.0f) / 1000.0f});
    }
    
    // Tundra transitions based on temperature
    if (temperature < 5.0f || std::abs(latitude) > 60.0f) {
        float tundraScore = 1.0f / (1.0f + std::exp((temperature - 0.0f) * 0.2f));
        scores.push_back({BiomeType::Tundra, tundraScore, std::abs(temperature)});
    }
    
    // Glacier transitions
    if ((elevation > 3000.0f && temperature < 0.0f) || temperature < -15.0f) {
        float glacierScore = 1.0f / (1.0f + std::exp((temperature + 10.0f) * 0.1f));
        scores.push_back({BiomeType::Glacier, glacierScore, std::abs(temperature + 20.0f)});
    }
    
    // Sort by score and normalize
    std::sort(scores.begin(), scores.end(), [](const BiomeScore& a, const BiomeScore& b) {
        return a.score > b.score;
    });
    
    // Calculate transition weights based on environmental distance
    float totalWeight = 0.0f;
    for (const auto& score : scores) {
        totalWeight += score.score;
    }
    
    if (totalWeight > 0.0f) {
        for (const auto& score : scores) {
            float weight = score.score / totalWeight;
            if (weight > 0.05f) { // Only include significant transitions
                transitions.push_back({score.biome, weight});
            }
        }
    }
    
    return transitions;
}

std::vector<BiomeType> BiomeClassifier::ClassifyPoints(
    const std::vector<float>& elevations,
    const std::vector<float>& temperatures,
    const std::vector<float>& precipitations,
    const std::vector<float>& slopes,
    const std::vector<std::pair<float, float>>& coordinates) const {
    
    std::vector<BiomeType> results(elevations.size());
    
    if (!m_useParallelProcessing || elevations.size() < m_chunkSize) {
        // Sequential processing for small datasets
        for (size_t i = 0; i < elevations.size(); ++i) {
            auto [lat, lon] = coordinates[i];
            results[i] = ClassifyPoint(elevations[i], temperatures[i], precipitations[i], 
                                     slopes[i], lat, lon);
        }
    } else {
        // Parallel processing would go here, but for now use sequential
        // The TerrainAnalysisProcessor will handle parallel processing at a higher level
        for (size_t i = 0; i < elevations.size(); ++i) {
            auto [lat, lon] = coordinates[i];
            results[i] = ClassifyPoint(elevations[i], temperatures[i], precipitations[i], 
                                     slopes[i], lat, lon);
        }
    }
    
    return results;
}

TerrainAnalysisPoint BiomeClassifier::AnalyzePoint(float elevation, float temperature, float precipitation,
                                                  float slope, float latitude, float longitude, 
                                                  const TerrainAnalysisParams& params) const {
    TerrainAnalysisPoint point;
    
    // Basic properties
    point.elevation = elevation;
    point.slope = slope;
    
    // Climate calculations (integrated from existing TerrainAnalysis.cpp)
    point.temperature = temperature;
    point.precipitation = precipitation;
    
    // Calculate humidity (from existing algorithm)
    float baseHumidity = std::min(1.0f, precipitation / 1500.0f);
    float tempEffect = 1.0f;
    if (temperature > 0.0f && temperature < 40.0f) {
        tempEffect = 0.5f + 0.5f * std::sin(temperature / 40.0f * M_PI);
    } else if (temperature <= 0.0f) {
        tempEffect = 0.3f;
    } else {
        tempEffect = 0.8f;
    }
    point.humidity = std::max(0.1f, std::min(1.0f, baseHumidity * tempEffect));
    
    // Wind exposure calculation (based on latitude and elevation)
    float baseWind = 5.0f + std::abs(latitude - 30.0f) * 0.1f;
    float elevationEffect = elevation / 1000.0f;
    point.windExposure = std::min(1.0f, (baseWind + elevationEffect) / 20.0f);
    
    // Enhanced biome classification with transitions
    // First, get the primary biome
    point.primaryBiome = ClassifyPoint(elevation, temperature, precipitation, slope, latitude, longitude);
    
    // Calculate transition scores for neighboring biomes
    auto transitionBiomes = CalculateBiomeTransitions(elevation, temperature, precipitation, slope, latitude, longitude);
    if (!transitionBiomes.empty() && transitionBiomes[0].second > 0.2f) {
        // We have a significant secondary biome influence
        point.secondaryBiome = transitionBiomes[0].first;
        point.biomeBlend = transitionBiomes[0].second;
    } else {
        point.secondaryBiome = point.primaryBiome;
        point.biomeBlend = 0.0f;
    }
    
    point.climateZone = DetermineClimateZone(latitude, temperature, precipitation);
    point.geology = DetermineGeology(elevation, slope, point.primaryBiome);
    
    // Get blended biome color
    point.color = GetBiomeColor(point.primaryBiome, point.secondaryBiome, point.biomeBlend, params);
    
    // Calculate additional properties with biome blending
    float vegPrimary = CalculateVegetation(point.primaryBiome, temperature, precipitation, elevation);
    float vegSecondary = CalculateVegetation(point.secondaryBiome, temperature, precipitation, elevation);
    point.vegetation = mix(vegPrimary, vegSecondary, point.biomeBlend);
    
    float habPrimary = CalculateHabitability(point.primaryBiome, temperature, precipitation);
    float habSecondary = CalculateHabitability(point.secondaryBiome, temperature, precipitation);
    point.habitability = mix(habPrimary, habSecondary, point.biomeBlend);
    
    // Rock exposure (based on slope and vegetation)
    point.rockExposure = std::min(1.0f, slope * 2.0f + (1.0f - point.vegetation) * 0.5f);
    
    // Stability (from erosion algorithm in existing code)
    float erosionRate = slope * 0.01f + (precipitation / 1000.0f) * 0.5f;
    erosionRate *= (1.0f - point.vegetation * 0.8f);
    point.stability = 1.0f - std::max(0.0f, std::min(1.0f, erosionRate));
    
    return point;
}

std::vector<TerrainAnalysisPoint> BiomeClassifier::AnalyzePoints(
    const std::vector<float>& elevations,
    const std::vector<std::pair<float, float>>& coordinates,
    const TerrainAnalysisParams& params) const {
    
    std::vector<TerrainAnalysisPoint> results;
    results.reserve(elevations.size());
    
    // Calculate temperatures and precipitations based on coordinates and elevation
    std::vector<float> temperatures(elevations.size());
    std::vector<float> precipitations(elevations.size());
    std::vector<float> humidities(elevations.size());
    
    for (size_t i = 0; i < elevations.size(); ++i) {
        auto [lat, lon] = coordinates[i];
        CalculateClimate(lat, lon, elevations[i], params, 
                        temperatures[i], precipitations[i], humidities[i]);
    }
    
    if (!m_useParallelProcessing || elevations.size() < m_chunkSize) {
        // Sequential processing
        for (size_t i = 0; i < elevations.size(); ++i) {
            auto [lat, lon] = coordinates[i];
            float slope = 0.0f; // Will be calculated by CalculateTopography if needed
            results.push_back(AnalyzePoint(elevations[i], temperatures[i], precipitations[i],
                                         slope, lat, lon, params));
        }
    } else {
        // Parallel processing
        results.resize(elevations.size());
        auto processedResults = ProcessChunk(elevations, coordinates, params, 0, elevations.size());
        results = std::move(processedResults);
    }
    
    return results;
}

void BiomeClassifier::CalculateClimate(float latitude, float longitude, float elevation,
                                     const TerrainAnalysisParams& params,
                                     float& temperature, float& precipitation, float& humidity) const {
    // Temperature calculation based on latitude and elevation
    float latitudeFactor = std::cos(latitude * M_PI / 180.0f);
    float baseTemp = params.equatorTemperature * latitudeFactor + 
                     params.poleTemperature * (1.0f - latitudeFactor);
    
    // Elevation lapse rate
    float elevationEffect = -elevation * params.elevationTemperatureLapse / 1000.0f;
    temperature = baseTemp + elevationEffect;
    
    // Precipitation calculation (simplified but realistic)
    float basePrecip = 1000.0f; // mm/year base precipitation
    float latEffect = std::max(0.0f, 1.0f - std::abs(latitude) / 90.0f); // More rain near equator
    float elevationPrecip = std::max(0.0f, elevation / 2000.0f); // Orographic precipitation
    
    precipitation = basePrecip * (0.5f + latEffect + elevationPrecip * 0.5f) * 
                   (1.0f + params.precipitationVariability * (std::sin(longitude * M_PI / 180.0f) - 0.5f));
    precipitation = std::max(50.0f, std::min(4000.0f, precipitation));
    
    // Humidity (reusing existing algorithm)
    float baseHumidity = std::min(1.0f, precipitation / 1500.0f);
    float tempEffect = 1.0f;
    if (temperature > 0.0f && temperature < 40.0f) {
        tempEffect = 0.5f + 0.5f * std::sin(temperature / 40.0f * M_PI);
    } else if (temperature <= 0.0f) {
        tempEffect = 0.3f;
    } else {
        tempEffect = 0.8f;
    }
    humidity = std::max(0.1f, std::min(1.0f, baseHumidity * tempEffect));
}

void BiomeClassifier::CalculateTopography(const std::vector<float>& elevations,
                                        const std::vector<std::pair<float, float>>& coordinates,
                                        uint32_t width, uint32_t height,
                                        std::vector<float>& slopes, std::vector<float>& aspects) const {
    slopes.resize(elevations.size(), 0.0f);
    aspects.resize(elevations.size(), 0.0f);
    
    // Calculate slopes and aspects using Sobel operator (from existing TerrainAnalysis.cpp)
    for (uint32_t y = 1; y < height - 1; ++y) {
        for (uint32_t x = 1; x < width - 1; ++x) {
            uint32_t idx = y * width + x;
            
            // Calculate gradients using Sobel operator
            float dzdx = (elevations[idx + 1] - elevations[idx - 1]) / 2.0f;
            float dzdy = (elevations[(y + 1) * width + x] - elevations[(y - 1) * width + x]) / 2.0f;
            
            // Calculate slope magnitude
            slopes[idx] = std::sqrt(dzdx * dzdx + dzdy * dzdy);
            
            // Calculate aspect (direction of steepest descent)
            if (dzdx != 0.0f || dzdy != 0.0f) {
                float aspectValue = std::atan2(dzdy, -dzdx) * 180.0f / M_PI;
                if (aspectValue < 0.0f) aspectValue += 360.0f;
                aspects[idx] = aspectValue;
            }
        }
    }
}

const BiomeDefinition& BiomeClassifier::GetBiomeDefinition(BiomeType type) const {
    static BiomeDefinition fallback{BiomeType::Grassland, "Unknown", TerrainColor{}};
    auto it = m_biomeDefinitions.find(type);
    return (it != m_biomeDefinitions.end()) ? it->second : fallback;
}

void BiomeClassifier::RegisterBiomeDefinition(const BiomeDefinition& definition) {
    m_biomeDefinitions[definition.type] = definition;
}

TerrainColor BiomeClassifier::GetBiomeColor(BiomeType primaryBiome, BiomeType secondaryBiome,
                                          float blend, const TerrainAnalysisParams& params) const {
    const auto& primaryDef = GetBiomeDefinition(primaryBiome);
    
    if (blend <= 0.0f || secondaryBiome == primaryBiome) {
        return primaryDef.baseColor;
    }
    
    const auto& secondaryDef = GetBiomeDefinition(secondaryBiome);
    
    // Blend colors
    TerrainColor result;
    result.baseColor = mix(primaryDef.baseColor.baseColor, secondaryDef.baseColor.baseColor, blend);
    result.highlightColor = mix(primaryDef.baseColor.highlightColor, secondaryDef.baseColor.highlightColor, blend);
    result.shadowColor = mix(primaryDef.baseColor.shadowColor, secondaryDef.baseColor.shadowColor, blend);
    result.roughness = mix(primaryDef.baseColor.roughness, secondaryDef.baseColor.roughness, blend);
    result.metallic = mix(primaryDef.baseColor.metallic, secondaryDef.baseColor.metallic, blend);
    result.specular = mix(primaryDef.baseColor.specular, secondaryDef.baseColor.specular, blend);
    
    return result;
}

void BiomeClassifier::SetClassificationAlgorithm(std::function<BiomeType(float, float, float, float, float, float)> algorithm) {
    m_classificationAlgorithm = algorithm;
}

std::unordered_map<BiomeType, uint32_t> BiomeClassifier::GetBiomeStatistics(const std::vector<BiomeType>& biomes) const {
    std::unordered_map<BiomeType, uint32_t> stats;
    for (BiomeType biome : biomes) {
        stats[biome]++;
    }
    return stats;
}

void BiomeClassifier::InitializeDefaultBiomes() {
    // Ocean biomes
    RegisterBiomeDefinition(BiomeDefinition{
        BiomeType::Ocean, "Ocean",
        TerrainColor{vec3(0.1f, 0.3f, 0.7f), vec3(0.2f, 0.4f, 0.8f), vec3(0.05f, 0.2f, 0.5f), 0.1f, 0.0f, 0.9f}
    });
    
    RegisterBiomeDefinition(BiomeDefinition{
        BiomeType::DeepOcean, "Deep Ocean",
        TerrainColor{vec3(0.05f, 0.1f, 0.3f), vec3(0.1f, 0.2f, 0.4f), vec3(0.02f, 0.05f, 0.2f), 0.05f, 0.0f, 0.95f}
    });
    
    // Desert biomes
    RegisterBiomeDefinition(BiomeDefinition{
        BiomeType::Desert, "Desert",
        TerrainColor{vec3(0.9f, 0.7f, 0.4f), vec3(1.0f, 0.8f, 0.5f), vec3(0.7f, 0.5f, 0.3f), 0.8f, 0.0f, 0.3f}
    });
    
    // Forest biomes
    RegisterBiomeDefinition(BiomeDefinition{
        BiomeType::TemperateForest, "Temperate Forest",
        TerrainColor{vec3(0.2f, 0.6f, 0.2f), vec3(0.3f, 0.7f, 0.3f), vec3(0.1f, 0.4f, 0.1f), 0.7f, 0.0f, 0.2f}
    });
    
    RegisterBiomeDefinition(BiomeDefinition{
        BiomeType::TropicalRainforest, "Tropical Rainforest",
        TerrainColor{vec3(0.1f, 0.5f, 0.1f), vec3(0.2f, 0.6f, 0.2f), vec3(0.05f, 0.3f, 0.05f), 0.9f, 0.0f, 0.1f}
    });
    
    // Mountain biomes
    RegisterBiomeDefinition(BiomeDefinition{
        BiomeType::Mountain, "Mountain",
        TerrainColor{vec3(0.5f, 0.4f, 0.3f), vec3(0.6f, 0.5f, 0.4f), vec3(0.3f, 0.2f, 0.2f), 0.9f, 0.1f, 0.4f}
    });
    
    // Grassland
    RegisterBiomeDefinition(BiomeDefinition{
        BiomeType::Grassland, "Grassland",
        TerrainColor{vec3(0.4f, 0.6f, 0.2f), vec3(0.5f, 0.7f, 0.3f), vec3(0.3f, 0.4f, 0.1f), 0.6f, 0.0f, 0.3f}
    });
    
    // Tundra
    RegisterBiomeDefinition(BiomeDefinition{
        BiomeType::Tundra, "Tundra",
        TerrainColor{vec3(0.6f, 0.5f, 0.4f), vec3(0.7f, 0.6f, 0.5f), vec3(0.4f, 0.3f, 0.2f), 0.8f, 0.0f, 0.2f}
    });
    
    // Ice
    RegisterBiomeDefinition(BiomeDefinition{
        BiomeType::Glacier, "Glacier",
        TerrainColor{vec3(0.9f, 0.95f, 1.0f), vec3(1.0f, 1.0f, 1.0f), vec3(0.7f, 0.8f, 0.9f), 0.1f, 0.0f, 0.8f}
    });
}

BiomeType BiomeClassifier::DefaultClassificationAlgorithm(float elevation, float temperature, 
                                                        float precipitation, float slope,
                                                        float latitude, float longitude) const {
    // Water bodies with depth-based classification
    if (elevation < 0.0f) {
        if (elevation < -4000.0f) return BiomeType::DeepOcean;
        else if (elevation < -2000.0f) return BiomeType::Ocean;
        else if (elevation < -500.0f) return BiomeType::Ocean;  // Continental shelf
        else return BiomeType::Ocean;  // Shallow coastal waters
    }
    
    // Calculate aridity index for better biome transitions
    float aridity = temperature / (precipitation + 1.0f);  // Simple aridity index
    float absLatitude = std::abs(latitude);
    
    // Polar regions with latitude-based transitions
    if (absLatitude > 70.0f || temperature < -15.0f) {
        if (elevation > 2000.0f || temperature < -20.0f) {
            return BiomeType::Glacier;
        }
        return BiomeType::Tundra;
    }
    
    // Alpine zones - elevation and temperature based
    if (elevation > 3500.0f) {
        return BiomeType::Glacier;
    } else if (elevation > 2500.0f) {
        if (temperature < 5.0f) return BiomeType::Tundra;
        return BiomeType::Mountain;
    } else if (elevation > 1500.0f && slope > 0.3f) {
        return BiomeType::Mountain;
    }
    
    // Arid regions with multiple desert types
    if (aridity > 0.2f || precipitation < 250.0f) {
        if (temperature > 30.0f && precipitation < 100.0f) {
            return BiomeType::Desert;  // Hot desert
        } else if (temperature < 10.0f && precipitation < 200.0f) {
            return BiomeType::Tundra;  // Cold desert
        } else if (precipitation < 400.0f) {
            return BiomeType::Grassland;  // Semi-arid steppe
        }
    }
    
    // Tropical regions with rainforest gradients
    if (absLatitude < 25.0f && temperature > 20.0f) {
        if (precipitation > 2000.0f) {
            return BiomeType::TropicalRainforest;
        } else if (precipitation > 1000.0f) {
            return BiomeType::TemperateForest;  // Tropical dry forest
        } else if (precipitation > 600.0f) {
            return BiomeType::Grassland;  // Savanna
        } else {
            return BiomeType::Desert;  // Tropical desert
        }
    }
    
    // Temperate regions with varied forest types
    if (temperature > 5.0f && temperature < 25.0f) {
        if (precipitation > 1000.0f) {
            return BiomeType::TemperateForest;  // Temperate rainforest
        } else if (precipitation > 600.0f) {
            if (elevation > 800.0f) {
                return BiomeType::TemperateForest;  // Mountain forest
            }
            return BiomeType::TemperateForest;  // Deciduous forest
        } else if (precipitation > 300.0f) {
            return BiomeType::Grassland;  // Prairie
        }
    }
    
    // Boreal regions
    if (temperature > -5.0f && temperature < 10.0f && precipitation > 400.0f) {
        return BiomeType::TemperateForest;  // Taiga/Boreal forest
    }
    
    // Default based on moisture
    if (precipitation > 500.0f) {
        return BiomeType::Grassland;  // Moist grassland
    } else {
        return BiomeType::Desert;  // Dry scrubland
    }
}

ClimateZone BiomeClassifier::DetermineClimateZone(float latitude, float temperature, float precipitation) const {
    float absLat = std::abs(latitude);
    
    if (absLat > 66.5f) return ClimateZone::Polar;
    if (absLat < 23.5f && temperature > 18.0f) return ClimateZone::Tropical;
    if (precipitation < 300.0f) return ClimateZone::Arid;
    if (absLat > 40.0f) return ClimateZone::Continental;
    return ClimateZone::Temperate;
}

GeologyType BiomeClassifier::DetermineGeology(float elevation, float slope, BiomeType biome) const {
    // High slope areas are more likely to be igneous
    if (slope > 0.3f) return GeologyType::Igneous;
    
    // Deep ocean areas
    if (elevation < -2000.0f) return GeologyType::Volcanic;
    
    // Mountain areas
    if (elevation > 2000.0f) return GeologyType::Metamorphic;
    
    // Coastal and low-lying areas
    if (elevation < 500.0f) return GeologyType::Sedimentary;
    
    return GeologyType::Sedimentary; // Default
}

float BiomeClassifier::CalculateHabitability(BiomeType biome, float temperature, float precipitation) const {
    float habitability = 0.5f;
    
    // Temperature factor
    if (temperature >= 0.0f && temperature <= 35.0f) {
        habitability += 0.3f;
    } else if (temperature >= -10.0f && temperature <= 45.0f) {
        habitability += 0.1f;
    }
    
    // Precipitation factor
    if (precipitation >= 300.0f && precipitation <= 2000.0f) {
        habitability += 0.2f;
    }
    
    return std::max(0.0f, std::min(1.0f, habitability));
}

float BiomeClassifier::CalculateVegetation(BiomeType biome, float temperature, float precipitation, float elevation) const {
    switch (biome) {
        case BiomeType::TropicalRainforest: return 0.9f;
        case BiomeType::TemperateForest: return 0.7f;
        case BiomeType::Grassland: return 0.5f;
        case BiomeType::Desert: return 0.1f;
        case BiomeType::Tundra: return 0.2f;
        case BiomeType::Mountain: return std::max(0.0f, 0.4f - elevation / 5000.0f);
        case BiomeType::Ocean:
        case BiomeType::DeepOcean: return 0.0f;
        case BiomeType::Glacier: return 0.0f;
        default: return 0.3f;
    }
}

std::vector<TerrainAnalysisPoint> BiomeClassifier::ProcessChunk(
    const std::vector<float>& elevations,
    const std::vector<std::pair<float, float>>& coordinates,
    const TerrainAnalysisParams& params,
    uint32_t startIndex, uint32_t endIndex) const {
    
    std::vector<TerrainAnalysisPoint> results;
    results.reserve(endIndex - startIndex);
    
    for (uint32_t i = startIndex; i < endIndex; ++i) {
        auto [lat, lon] = coordinates[i];
        float temperature, precipitation, humidity;
        CalculateClimate(lat, lon, elevations[i], params, temperature, precipitation, humidity);
        
        float slope = 0.0f; // Simplified for chunk processing
        results.push_back(AnalyzePoint(elevations[i], temperature, precipitation, slope, lat, lon, params));
    }
    
    return results;
}

// Factory implementations
std::unique_ptr<BiomeClassifier> BiomeClassifierFactory::CreateEarthLikeClassifier() {
    auto classifier = std::make_unique<BiomeClassifier>();
    classifier->Initialize();
    return classifier;
}

std::unique_ptr<BiomeClassifier> BiomeClassifierFactory::CreateMarsLikeClassifier() {
    auto classifier = std::make_unique<BiomeClassifier>();
    classifier->Initialize();
    
    // Override with Mars-specific biomes
    classifier->RegisterBiomeDefinition(BiomeDefinition{
        BiomeType::Desert, "Martian Desert",
        TerrainColor{vec3(0.8f, 0.4f, 0.2f), vec3(0.9f, 0.5f, 0.3f), vec3(0.6f, 0.3f, 0.1f), 0.9f, 0.1f, 0.2f}
    });
    
    return classifier;
}

std::unique_ptr<BiomeClassifier> BiomeClassifierFactory::CreateArcticClassifier() {
    auto classifier = std::make_unique<BiomeClassifier>();
    classifier->Initialize();
    
    // Override with arctic-specific biomes
    classifier->RegisterBiomeDefinition(BiomeDefinition{
        BiomeType::Tundra, "Arctic Tundra",
        TerrainColor{vec3(0.7f, 0.8f, 0.9f), vec3(0.8f, 0.9f, 1.0f), vec3(0.5f, 0.6f, 0.7f), 0.6f, 0.0f, 0.4f}
    });
    
    return classifier;
}

std::unique_ptr<BiomeClassifier> BiomeClassifierFactory::CreateDesertClassifier() {
    auto classifier = std::make_unique<BiomeClassifier>();
    classifier->Initialize();
    return classifier;
}

std::unique_ptr<BiomeClassifier> BiomeClassifierFactory::CreateOceanWorldClassifier() {
    auto classifier = std::make_unique<BiomeClassifier>();
    classifier->Initialize();
    return classifier;
}

std::unique_ptr<BiomeClassifier> BiomeClassifierFactory::CreateVolcanicClassifier() {
    auto classifier = std::make_unique<BiomeClassifier>();
    classifier->Initialize();
    return classifier;
}

std::unique_ptr<BiomeClassifier> BiomeClassifierFactory::CreateCustomClassifier(
    const std::vector<BiomeDefinition>& biomes) {
    auto classifier = std::make_unique<BiomeClassifier>();
    classifier->Initialize();
    
    for (const auto& biome : biomes) {
        classifier->RegisterBiomeDefinition(biome);
    }
    
    return classifier;
}

} // namespace PlanetGen::Generation::Analysis
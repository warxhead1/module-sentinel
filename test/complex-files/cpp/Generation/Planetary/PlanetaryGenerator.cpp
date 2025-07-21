module;

#include <stdexcept>
#include <algorithm>
#include <cmath>
#include <future>
#include <Core/Logging/LoggerMacros.h>

module PlanetaryGenerator;

import Core.Logging.Logger;
import GLMModule;

namespace PlanetGen::Generation {

PlanetaryGenerator::PlanetaryGenerator(INoiseProvider& noiseProvider) 
    : m_noiseProvider(&noiseProvider) {
    if (!m_noiseProvider) {
        throw std::invalid_argument("NoiseProvider cannot be null");
    }
    
    LOG_INFO("PlanetaryGenerator", "Initialized with noise provider");
}

PlanetaryData PlanetaryGenerator::GeneratePlanet(const PlanetaryDesignTemplate& designTemplate, 
                                                uint32_t resolution, 
                                                uint32_t seed) {
    if (m_isGenerating) {
        throw std::runtime_error("Generation already in progress");
    }
    
    return GeneratePlanetImpl(designTemplate, resolution, seed);
}

std::future<PlanetaryData> PlanetaryGenerator::GeneratePlanetAsync(const PlanetaryDesignTemplate& designTemplate,
                                                                  uint32_t resolution, 
                                                                  uint32_t seed) {
    if (m_isGenerating) {
        throw std::runtime_error("Generation already in progress");
    }
    
    return std::async(std::launch::async, [this, designTemplate, resolution, seed]() {
        return GeneratePlanetImpl(designTemplate, resolution, seed);
    });
}

void PlanetaryGenerator::CancelGeneration() {
    m_cancellationRequested = true;
    LOG_INFO("PlanetaryGenerator", "Generation cancellation requested");
}

PlanetaryData PlanetaryGenerator::GeneratePlanetImpl(const PlanetaryDesignTemplate& designTemplate,
                                                    uint32_t resolution, 
                                                    uint32_t seed) {
    m_isGenerating = true;
    m_cancellationRequested = false;
    m_progress = 0.0f;
    
    try {
        LOG_INFO("PlanetaryGenerator", "Starting planet generation - resolution: {}, seed: {}", resolution, seed);
        
        // Validate input parameters
        ValidateDesignTemplate(designTemplate);
        UpdateProgress(0.1f);
        
        if (ShouldCancelGeneration()) {
            throw std::runtime_error("Generation cancelled");
        }
        
        // Phase 1: Generate elevation data
        LOG_INFO("PlanetaryGenerator", "Phase 1: Generating elevation data");
        auto elevation = GenerateElevation(designTemplate, resolution, seed);
        UpdateProgress(0.3f);
        
        if (ShouldCancelGeneration()) {
            throw std::runtime_error("Generation cancelled");
        }
        
        // Phase 2: Generate temperature data
        LOG_INFO("PlanetaryGenerator", "Phase 2: Generating temperature data");
        auto temperature = GenerateTemperature(designTemplate, elevation, resolution);
        UpdateProgress(0.5f);
        
        if (ShouldCancelGeneration()) {
            throw std::runtime_error("Generation cancelled");
        }
        
        // Phase 3: Generate precipitation data
        LOG_INFO("PlanetaryGenerator", "Phase 3: Generating precipitation data");
        auto precipitation = GeneratePrecipitation(designTemplate, elevation, temperature, resolution);
        UpdateProgress(0.7f);
        
        if (ShouldCancelGeneration()) {
            throw std::runtime_error("Generation cancelled");
        }
        
        // Phase 4: Generate vegetation data
        LOG_INFO("PlanetaryGenerator", "Phase 4: Generating vegetation data");
        auto vegetation = GenerateVegetation(designTemplate, elevation, temperature, precipitation, resolution);
        UpdateProgress(0.9f);
        
        if (ShouldCancelGeneration()) {
            throw std::runtime_error("Generation cancelled");
        }
        
        // Phase 5: Assemble final planetary data
        LOG_INFO("PlanetaryGenerator", "Phase 5: Assembling planetary data");
        auto planetaryData = AssemblePlanetaryData(designTemplate, elevation, temperature, precipitation, vegetation);
        UpdateProgress(1.0f);
        
        LOG_INFO("PlanetaryGenerator", "Planet generation completed successfully");
        
        m_isGenerating = false;
        return planetaryData;
        
    } catch (const std::exception& e) {
        LOG_ERROR("PlanetaryGenerator", "Generation failed: {}", e.what());
        m_isGenerating = false;
        throw;
    }
}

PlanetaryModality PlanetaryGenerator::GenerateElevation(const PlanetaryDesignTemplate& designTemplate,
                                                       uint32_t resolution, 
                                                       uint32_t seed) {
    if (!m_noiseProvider) {
        throw std::runtime_error("NoiseProvider is null");
    }
    
    PlanetaryModality elevation;
    elevation.name = "elevation";
    elevation.width = resolution;
    elevation.height = resolution;
    elevation.data.resize(resolution * resolution);
    
    // Configure noise parameters from design template
    NoiseParameters noiseParams;
    noiseParams.frequency = designTemplate.noiseConfig.primaryNoise.frequency;
    noiseParams.amplitude = designTemplate.noiseConfig.primaryNoise.amplitude;
    noiseParams.octaves = designTemplate.noiseConfig.primaryNoise.octaves;
    noiseParams.persistence = designTemplate.noiseConfig.primaryNoise.persistence;
    noiseParams.lacunarity = designTemplate.noiseConfig.primaryNoise.lacunarity;
    noiseParams.seed = seed;
    
    // Configure noise provider
    m_noiseProvider->SetSeed(seed);
    m_noiseProvider->SetFrequency(noiseParams.frequency);
    m_noiseProvider->SetAmplitude(noiseParams.amplitude);
    m_noiseProvider->SetOctaves(noiseParams.octaves);
    m_noiseProvider->SetPersistence(noiseParams.persistence);
    m_noiseProvider->SetLacunarity(noiseParams.lacunarity);
    
    // Generate noise data using batch sampling
    std::vector<vec3> positions;
    positions.reserve(resolution * resolution);
    
    for (uint32_t y = 0; y < resolution; ++y) {
        for (uint32_t x = 0; x < resolution; ++x) {
            float u = static_cast<float>(x) / static_cast<float>(resolution - 1);
            float v = static_cast<float>(y) / static_cast<float>(resolution - 1);
            positions.emplace_back(u, v, 0.0f);
        }
    }
    
    auto noiseData = m_noiseProvider->SampleBatch(positions);
    
    // Apply planetary scaling and constraints
    float planetRadius = designTemplate.planetRadius;
    float maxElevation = designTemplate.maxElevation;
    float heightScale = designTemplate.heightScale;
    
    for (uint32_t i = 0; i < resolution * resolution; ++i) {
        if (ShouldCancelGeneration()) {
            throw std::runtime_error("Generation cancelled");
        }
        
        // Scale noise to elevation range
        float normalizedNoise = (noiseData[i] + 1.0f) * 0.5f; // Convert from [-1,1] to [0,1]
        float elevationValue = normalizedNoise * maxElevation * heightScale;
        
        // Apply water coverage constraint
        float waterThreshold = designTemplate.waterCoverage;
        if (normalizedNoise < waterThreshold) {
            elevationValue = std::min(elevationValue, 0.0f); // Below sea level
        }
        
        elevation.data[i] = elevationValue;
    }
    
    LOG_INFO("PlanetaryGenerator", "Generated elevation data with {} samples", elevation.data.size());
    return elevation;
}

PlanetaryModality PlanetaryGenerator::GenerateTemperature(const PlanetaryDesignTemplate& designTemplate,
                                                         const PlanetaryModality& elevation,
                                                         uint32_t resolution) {
    PlanetaryModality temperature;
    temperature.name = "temperature";
    temperature.width = resolution;
    temperature.height = resolution;
    temperature.data.resize(resolution * resolution);
    
    float avgTemp = designTemplate.averageTemperature;
    float tempRange = designTemplate.temperatureRange;
    
    for (uint32_t y = 0; y < resolution; ++y) {
        for (uint32_t x = 0; x < resolution; ++x) {
            if (ShouldCancelGeneration()) {
                throw std::runtime_error("Generation cancelled");
            }
            
            uint32_t index = y * resolution + x;
            
            // Latitude-based temperature (equator is warmer)
            float latitude = (static_cast<float>(y) / resolution - 0.5f) * 2.0f; // [-1, 1]
            float latitudeTemp = avgTemp - (std::abs(latitude) * tempRange * 0.5f);
            
            // Elevation-based temperature (higher is colder)
            float elevationEffect = elevation.data[index] * -0.006f; // 6°C per km
            
            // Atmospheric effects
            float atmosphereEffect = designTemplate.atmosphereDensity * 2.0f;
            float greenhouseEffect = designTemplate.greenhouseEffect * 3.0f;
            
            temperature.data[index] = latitudeTemp + elevationEffect + atmosphereEffect + greenhouseEffect;
        }
    }
    
    LOG_INFO("PlanetaryGenerator", "Generated temperature data with {} samples", temperature.data.size());
    return temperature;
}

PlanetaryModality PlanetaryGenerator::GeneratePrecipitation(const PlanetaryDesignTemplate& designTemplate,
                                                           const PlanetaryModality& elevation,
                                                           const PlanetaryModality& temperature,
                                                           uint32_t resolution) {
    PlanetaryModality precipitation;
    precipitation.name = "precipitation";
    precipitation.width = resolution;
    precipitation.height = resolution;
    precipitation.data.resize(resolution * resolution);
    
    float basePrecipitation = designTemplate.precipitationLevel;
    
    for (uint32_t y = 0; y < resolution; ++y) {
        for (uint32_t x = 0; x < resolution; ++x) {
            if (ShouldCancelGeneration()) {
                throw std::runtime_error("Generation cancelled");
            }
            
            uint32_t index = y * resolution + x;
            
            // Temperature-based precipitation (warmer air holds more moisture)
            float tempEffect = std::max(0.0f, temperature.data[index] / 30.0f); // Normalize to ~30°C
            
            // Elevation-based precipitation (orographic effect)
            float elevationEffect = std::max(0.0f, elevation.data[index] / 1000.0f); // Per km
            
            // Distance from equator (tropical rain belt)
            float latitude = (static_cast<float>(y) / resolution - 0.5f) * 2.0f; // [-1, 1]
            float latitudeEffect = 1.0f - std::abs(latitude);
            
            precipitation.data[index] = basePrecipitation * tempEffect * (1.0f + elevationEffect * 0.3f) * latitudeEffect;
        }
    }
    
    LOG_INFO("PlanetaryGenerator", "Generated precipitation data with {} samples", precipitation.data.size());
    return precipitation;
}

PlanetaryModality PlanetaryGenerator::GenerateVegetation(const PlanetaryDesignTemplate& designTemplate,
                                                        const PlanetaryModality& elevation,
                                                        const PlanetaryModality& temperature,
                                                        const PlanetaryModality& precipitation,
                                                        uint32_t resolution) {
    PlanetaryModality vegetation;
    vegetation.name = "vegetation";
    vegetation.width = resolution;
    vegetation.height = resolution;
    vegetation.data.resize(resolution * resolution);
    
    float baseVegetation = designTemplate.vegetationCoverage;
    
    for (uint32_t i = 0; i < resolution * resolution; ++i) {
        if (ShouldCancelGeneration()) {
            throw std::runtime_error("Generation cancelled");
        }
        
        // Water areas have no vegetation
        if (elevation.data[i] <= 0.0f) {
            vegetation.data[i] = 0.0f;
            continue;
        }
        
        // Temperature suitability (optimal around 20-25°C)
        float tempSuitability = 1.0f - std::abs(temperature.data[i] - 22.5f) / 40.0f;
        tempSuitability = std::max(0.0f, std::min(1.0f, tempSuitability));
        
        // Precipitation suitability (more rain = more vegetation)
        float precipSuitability = std::min(1.0f, precipitation.data[i] / 1000.0f);
        
        // Elevation suitability (too high = less vegetation)
        float elevSuitability = std::max(0.0f, 1.0f - elevation.data[i] / 4000.0f);
        
        vegetation.data[i] = baseVegetation * tempSuitability * precipSuitability * elevSuitability;
    }
    
    LOG_INFO("PlanetaryGenerator", "Generated vegetation data with {} samples", vegetation.data.size());
    return vegetation;
}

void PlanetaryGenerator::UpdateProgress(float progress) {
    m_progress = std::max(0.0f, std::min(1.0f, progress));
}

bool PlanetaryGenerator::ShouldCancelGeneration() const {
    return m_cancellationRequested;
}

void PlanetaryGenerator::ValidateDesignTemplate(const PlanetaryDesignTemplate& designTemplate) const {
    if (designTemplate.planetRadius <= 0.0f) {
        throw std::invalid_argument("Planet radius must be positive");
    }
    
    if (designTemplate.maxElevation <= 0.0f) {
        throw std::invalid_argument("Max elevation must be positive");
    }
    
    if (designTemplate.heightScale <= 0.0f) {
        throw std::invalid_argument("Height scale must be positive");
    }
    
    if (designTemplate.waterCoverage < 0.0f || designTemplate.waterCoverage > 1.0f) {
        throw std::invalid_argument("Water coverage must be between 0 and 1");
    }
    
    LOG_DEBUG("PlanetaryGenerator", "Design template validation passed");
}

PlanetaryData PlanetaryGenerator::AssemblePlanetaryData(const PlanetaryDesignTemplate& designTemplate,
                                                       const PlanetaryModality& elevation,
                                                       const PlanetaryModality& temperature,
                                                       const PlanetaryModality& precipitation,
                                                       const PlanetaryModality& vegetation) const {
    PlanetaryData data;
    
    // Copy basic properties from template
    data.planetRadius = static_cast<uint32_t>(designTemplate.planetRadius);
    data.seaLevel = 0.0f; // Standard sea level
    data.axialTilt = vec3(23.5f, 0.0f, 0.0f); // Earth-like axial tilt
    
    // Assign the modalities to the structure
    data.elevation = elevation;
    data.temperature = temperature;
    data.precipitation = precipitation;
    data.vegetation = vegetation;
    
    // Initialize other modalities with empty data
    data.humidity = PlanetaryModality{"humidity", {}, elevation.width, elevation.height, 0.0f, 100.0f};
    data.windSpeed = PlanetaryModality{"windSpeed", {}, elevation.width, elevation.height, 0.0f, 50.0f};
    data.geology = PlanetaryModality{"geology", {}, elevation.width, elevation.height, 0.0f, 1.0f};
    data.landUse = PlanetaryModality{"landUse", {}, elevation.width, elevation.height, 0.0f, 1.0f};
    data.slope = PlanetaryModality{"slope", {}, elevation.width, elevation.height, 0.0f, 90.0f};
    data.aspect = PlanetaryModality{"aspect", {}, elevation.width, elevation.height, 0.0f, 360.0f};
    data.drainage = PlanetaryModality{"drainage", {}, elevation.width, elevation.height, 0.0f, 1.0f};
    data.erosion = PlanetaryModality{"erosion", {}, elevation.width, elevation.height, 0.0f, 1.0f};
    
    // Initialize empty data for the empty modalities
    size_t dataSize = elevation.width * elevation.height;
    data.humidity.data.resize(dataSize, 50.0f); // Default humidity
    data.windSpeed.data.resize(dataSize, 0.0f);
    data.geology.data.resize(dataSize, 0.5f);
    data.landUse.data.resize(dataSize, 0.0f);
    data.slope.data.resize(dataSize, 0.0f);
    data.aspect.data.resize(dataSize, 0.0f);
    data.drainage.data.resize(dataSize, 0.0f);
    data.erosion.data.resize(dataSize, 0.0f);
    
    LOG_INFO("PlanetaryGenerator", "Assembled planetary data with {}x{} resolution", elevation.width, elevation.height);
    return data;
}

// Factory implementation
std::unique_ptr<PlanetaryGenerator> PlanetaryGeneratorFactory::Create(INoiseProvider& noiseProvider) {
    return std::make_unique<PlanetaryGenerator>(noiseProvider);
}

} // namespace PlanetGen::Generation
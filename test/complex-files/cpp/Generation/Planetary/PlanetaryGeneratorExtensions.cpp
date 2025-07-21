module;

#include <vector>
#include <memory>
#include <algorithm>
#include <cmath>
#include <random>
#include <iostream>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

module PlanetaryGenerator;

import GLMModule;
import GenerationTypes;
import NoiseTypes;
import PlanetaryConfigurationManager;

namespace PlanetGen::Generation {

// Import types from PlanetaryConfigurationManager
using PlanetGen::Generation::Configuration::PlanetaryPreset;

// Factory method implementations
std::unique_ptr<PlanetaryGenerator> PlanetaryGeneratorFactory::CreateEarthlike(uint32_t seed) {
    PlanetaryPreset preset;
    preset.name = "earth_like";
    preset.category = "Terrestrial";
    preset.description = "Earth-like terrestrial planet";
    preset.baseRadius = 6371.0f; // km
    preset.minElevation = -10.0f; // km  
    preset.maxElevation = 10.0f; // km
    preset.gravity = 9.81f; // m/s^2
    preset.rotationPeriod = 24.0f; // hours
    preset.baseColor = vec3(0.4f, 0.3f, 0.2f);
    preset.roughness = 0.8f;
    preset.metallic = 0.0f;
    
    // Configure atmosphere
    preset.atmosphere.enabled = true;
    preset.atmosphere.density = 1.0f;
    preset.atmosphere.scaleHeight = 8.0f;
    
    // Configure oceans
    preset.ocean.enabled = true;
    preset.ocean.level = 0.0f;
    
    auto generator = std::make_unique<PlanetaryGenerator>();
    generator->Initialize(preset);
    return generator;
}

std::unique_ptr<PlanetaryGenerator> PlanetaryGeneratorFactory::CreateMarslike(uint32_t seed) {
    PlanetaryPreset preset;
    preset.name = "mars_like";
    preset.category = "Desert World";
    preset.description = "Mars-like desert planet";
    preset.baseRadius = 3389.5f; // km (Mars radius)
    preset.minElevation = -8.0f; // km
    preset.maxElevation = 21.0f; // km (Olympus Mons height)
    preset.gravity = 3.71f; // m/s^2 (Mars gravity)
    preset.rotationPeriod = 24.6f; // hours (Mars sol)
    preset.baseColor = vec3(0.7f, 0.4f, 0.2f); // Reddish-brown
    preset.roughness = 0.9f;
    preset.metallic = 0.1f;
    
    // Configure thin atmosphere
    preset.atmosphere.enabled = true;
    preset.atmosphere.density = 0.01f; // Very thin
    preset.atmosphere.scaleHeight = 11.0f; // km
    
    // No oceans
    preset.ocean.enabled = false;
    
    auto generator = std::make_unique<PlanetaryGenerator>();
    generator->Initialize(preset);
    return generator;
}

std::unique_ptr<PlanetaryGenerator> PlanetaryGeneratorFactory::CreateWaterWorld(uint32_t seed) {
    PlanetaryPreset preset;
    preset.name = "water_world";
    preset.category = "Ocean World";
    preset.description = "Ocean-dominated water world";
    preset.baseRadius = 7000.0f; // km (larger than Earth)
    preset.minElevation = -15.0f; // km (deep oceans)
    preset.maxElevation = 2.0f; // km (small land masses)
    preset.gravity = 10.8f; // m/s^2 (higher gravity)
    preset.baseColor = vec3(0.1f, 0.3f, 0.6f); // Blue-green
    
    preset.atmosphere.enabled = true;
    preset.atmosphere.density = 1.2f;
    preset.ocean.enabled = true;
    preset.ocean.level = 1000.0f; // High sea level
    
    auto generator = std::make_unique<PlanetaryGenerator>();
    generator->Initialize(preset);
    return generator;
}

std::unique_ptr<PlanetaryGenerator> PlanetaryGeneratorFactory::CreateDesertWorld(uint32_t seed) {
    PlanetaryPreset preset;
    preset.name = "desert_world";
    preset.category = "Desert World";
    preset.description = "Hot arid desert planet";
    preset.baseRadius = 5100.0f; // km (smaller than Earth)
    preset.baseColor = vec3(0.8f, 0.6f, 0.3f); // Sandy color
    preset.atmosphere.enabled = true;
    preset.atmosphere.density = 0.3f;
    preset.ocean.enabled = false;
    
    auto generator = std::make_unique<PlanetaryGenerator>();
    generator->Initialize(preset);
    return generator;
}

std::unique_ptr<PlanetaryGenerator> PlanetaryGeneratorFactory::CreateIceWorld(uint32_t seed) {
    PlanetaryPreset preset;
    preset.name = "ice_world";
    preset.category = "Ice World";
    preset.description = "Frozen ice planet";
    preset.baseRadius = 5700.0f; // km
    preset.baseColor = vec3(0.9f, 0.95f, 1.0f); // Icy white-blue
    preset.atmosphere.enabled = true;
    preset.atmosphere.density = 0.1f;
    preset.ocean.enabled = false; // Frozen solid
    
    auto generator = std::make_unique<PlanetaryGenerator>();
    generator->Initialize(preset);
    return generator;
}

std::unique_ptr<PlanetaryGenerator> PlanetaryGeneratorFactory::CreateVolcanicWorld(uint32_t seed) {
    PlanetaryPreset preset;
    preset.name = "volcanic_world";
    preset.category = "Volcanic World";
    preset.description = "Volcanic planet with active geology";
    preset.baseRadius = 6371.0f; // km (Earth-sized)
    preset.gravity = 12.7f; // m/s^2 (higher gravity due to dense core)
    preset.baseColor = vec3(0.3f, 0.1f, 0.0f); // Dark volcanic rock
    preset.atmosphere.enabled = true;
    preset.atmosphere.density = 2.0f; // Thick volcanic atmosphere
    preset.ocean.enabled = false;
    
    auto generator = std::make_unique<PlanetaryGenerator>();
    generator->Initialize(preset);
    return generator;
}

std::unique_ptr<PlanetaryGenerator> PlanetaryGeneratorFactory::CreateAlienWorld(uint32_t seed) {
    PlanetaryPreset preset;
    preset.name = "alien_world";
    preset.category = "Exotic";
    preset.description = "Exotic alien planet with unusual properties";
    preset.baseRadius = 8281.0f; // km (larger than Earth)
    preset.gravity = 15.8f; // m/s^2 (very high gravity)
    preset.baseColor = vec3(0.5f, 0.2f, 0.7f); // Purple alien color
    preset.atmosphere.enabled = true;
    preset.atmosphere.density = 1.5f;
    preset.ocean.enabled = true;
    
    auto generator = std::make_unique<PlanetaryGenerator>();
    generator->Initialize(preset);
    return generator;
}

std::unique_ptr<PlanetaryGenerator> PlanetaryGeneratorFactory::CreateCustomPlanet(
    const PlanetaryPreset& preset, uint32_t seed) {
    auto generator = std::make_unique<PlanetaryGenerator>();
    generator->Initialize(preset);
    return generator;
}

} // namespace PlanetGen::Generation
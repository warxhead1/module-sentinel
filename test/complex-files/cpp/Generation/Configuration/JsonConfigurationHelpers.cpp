module;

#include <string>
#include <sstream>
#include <fstream>
#include <vector>
#include <unordered_map>
#include <variant>
#include <iomanip>
#include <cctype>
#include <iostream>

module JsonConfigurationHelpers;

namespace PlanetGen::Generation::Configuration {

// JsonUtil implementation
std::string JsonUtil::SerializeToString(const JsonValue& value, int indent) {
    std::ostringstream oss;
    
    switch (value.type) {
        case ValueType::String:
            oss << SerializeString(value.stringValue);
            break;
            
        case ValueType::Number:
            oss << std::fixed << std::setprecision(6) << value.numberValue;
            break;
            
        case ValueType::Boolean:
            oss << (value.boolValue ? "true" : "false");
            break;
            
        case ValueType::Array:
            oss << "[\n";
            for (size_t i = 0; i < value.arrayValue.size(); ++i) {
                oss << GetIndentation(indent + 1);
                oss << SerializeToString(value.arrayValue[i], indent + 1);
                if (i < value.arrayValue.size() - 1) oss << ",";
                oss << "\n";
            }
            oss << GetIndentation(indent) << "]";
            break;
            
        case ValueType::Object: {
            oss << "{\n";
            size_t count = 0;
            for (const auto& [key, val] : value.objectValue) {
                oss << GetIndentation(indent + 1);
                oss << SerializeString(key) << ": ";
                oss << SerializeToString(val, indent + 1);
                if (count < value.objectValue.size() - 1) oss << ",";
                oss << "\n";
                ++count;
            }
            oss << GetIndentation(indent) << "}";
            break;
        }
            
        case ValueType::Null:
            oss << "null";
            break;
    }
    
    return oss.str();
}

JsonUtil::JsonValue JsonUtil::ParseFromString(const std::string& json) {
    size_t pos = 0;
    SkipWhitespace(json, pos);
    return ParseValue(json, pos);
}

JsonUtil::JsonValue JsonUtil::SerializeVec3(const vec3& v) {
    JsonValue obj;
    obj.type = ValueType::Object;
    obj.objectValue["x"] = JsonValue(v.x);
    obj.objectValue["y"] = JsonValue(v.y);
    obj.objectValue["z"] = JsonValue(v.z);
    return obj;
}

vec3 JsonUtil::DeserializeVec3(const JsonValue& value) {
    if (value.type != ValueType::Object) {
        return vec3(0.0f);
    }
    
    vec3 result;
    auto xIt = value.objectValue.find("x");
    auto yIt = value.objectValue.find("y");
    auto zIt = value.objectValue.find("z");
    
    if (xIt != value.objectValue.end() && xIt->second.type == ValueType::Number) {
        result.x = static_cast<float>(xIt->second.numberValue);
    }
    if (yIt != value.objectValue.end() && yIt->second.type == ValueType::Number) {
        result.y = static_cast<float>(yIt->second.numberValue);
    }
    if (zIt != value.objectValue.end() && zIt->second.type == ValueType::Number) {
        result.z = static_cast<float>(zIt->second.numberValue);
    }
    
    return result;
}

JsonUtil::JsonValue JsonUtil::SerializeNoiseLayer(const NoiseLayerConfig& layer) {
    JsonValue obj;
    obj.type = ValueType::Object;
    
    obj.objectValue["noiseType"] = JsonValue(layer.noiseType);
    obj.objectValue["scale"] = JsonValue(layer.scale);
    obj.objectValue["amplitude"] = JsonValue(layer.amplitude);
    obj.objectValue["frequency"] = JsonValue(layer.frequency);
    obj.objectValue["octaves"] = JsonValue(static_cast<int>(layer.octaves));
    obj.objectValue["persistence"] = JsonValue(layer.persistence);
    obj.objectValue["lacunarity"] = JsonValue(layer.lacunarity);
    obj.objectValue["seed"] = JsonValue(static_cast<int>(layer.seed));
    obj.objectValue["offset"] = SerializeVec3(layer.offset);
    
    // Serialize extra parameters
    if (!layer.extraParams.empty()) {
        JsonValue extraObj;
        extraObj.type = ValueType::Object;
        for (const auto& [key, value] : layer.extraParams) {
            extraObj.objectValue[key] = JsonValue(value);
        }
        obj.objectValue["extraParams"] = extraObj;
    }
    
    return obj;
}

NoiseLayerConfig JsonUtil::DeserializeNoiseLayer(const JsonValue& value) {
    NoiseLayerConfig layer;
    
    if (value.type != ValueType::Object) {
        return layer;
    }
    
    const auto& obj = value.objectValue;
    
    if (auto it = obj.find("noiseType"); it != obj.end() && it->second.type == ValueType::String) {
        layer.noiseType = it->second.stringValue;
    }
    if (auto it = obj.find("scale"); it != obj.end() && it->second.type == ValueType::Number) {
        layer.scale = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("amplitude"); it != obj.end() && it->second.type == ValueType::Number) {
        layer.amplitude = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("frequency"); it != obj.end() && it->second.type == ValueType::Number) {
        layer.frequency = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("octaves"); it != obj.end() && it->second.type == ValueType::Number) {
        layer.octaves = static_cast<int>(it->second.numberValue);
    }
    if (auto it = obj.find("persistence"); it != obj.end() && it->second.type == ValueType::Number) {
        layer.persistence = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("lacunarity"); it != obj.end() && it->second.type == ValueType::Number) {
        layer.lacunarity = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("seed"); it != obj.end() && it->second.type == ValueType::Number) {
        layer.seed = static_cast<uint32_t>(it->second.numberValue);
    }
    if (auto it = obj.find("offset"); it != obj.end()) {
        layer.offset = DeserializeVec3(it->second);
    }
    
    // Deserialize extra parameters
    if (auto it = obj.find("extraParams"); it != obj.end() && it->second.type == ValueType::Object) {
        for (const auto& [key, val] : it->second.objectValue) {
            if (val.type == ValueType::Number) {
                layer.extraParams[key] = static_cast<float>(val.numberValue);
            }
        }
    }
    
    return layer;
}

JsonUtil::JsonValue JsonUtil::SerializeBiome(const BiomeConfig& biome) {
    JsonValue obj;
    obj.type = ValueType::Object;
    
    obj.objectValue["name"] = JsonValue(biome.name);
    obj.objectValue["elevationMin"] = JsonValue(biome.elevationMin);
    obj.objectValue["elevationMax"] = JsonValue(biome.elevationMax);
    obj.objectValue["moistureMin"] = JsonValue(biome.moistureMin);
    obj.objectValue["moistureMax"] = JsonValue(biome.moistureMax);
    obj.objectValue["temperatureMin"] = JsonValue(biome.temperatureMin);
    obj.objectValue["temperatureMax"] = JsonValue(biome.temperatureMax);
    obj.objectValue["baseColor"] = SerializeVec3(biome.baseColor);
    obj.objectValue["slopeColor"] = SerializeVec3(biome.slopeColor);
    obj.objectValue["roughness"] = JsonValue(biome.roughness);
    obj.objectValue["metallic"] = JsonValue(biome.metallic);
    
    return obj;
}

BiomeConfig JsonUtil::DeserializeBiome(const JsonValue& value) {
    BiomeConfig biome;
    
    if (value.type != ValueType::Object) {
        return biome;
    }
    
    const auto& obj = value.objectValue;
    
    if (auto it = obj.find("name"); it != obj.end() && it->second.type == ValueType::String) {
        biome.name = it->second.stringValue;
    }
    if (auto it = obj.find("elevationMin"); it != obj.end() && it->second.type == ValueType::Number) {
        biome.elevationMin = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("elevationMax"); it != obj.end() && it->second.type == ValueType::Number) {
        biome.elevationMax = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("moistureMin"); it != obj.end() && it->second.type == ValueType::Number) {
        biome.moistureMin = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("moistureMax"); it != obj.end() && it->second.type == ValueType::Number) {
        biome.moistureMax = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("temperatureMin"); it != obj.end() && it->second.type == ValueType::Number) {
        biome.temperatureMin = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("temperatureMax"); it != obj.end() && it->second.type == ValueType::Number) {
        biome.temperatureMax = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("baseColor"); it != obj.end()) {
        biome.baseColor = DeserializeVec3(it->second);
    }
    if (auto it = obj.find("slopeColor"); it != obj.end()) {
        biome.slopeColor = DeserializeVec3(it->second);
    }
    if (auto it = obj.find("roughness"); it != obj.end() && it->second.type == ValueType::Number) {
        biome.roughness = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("metallic"); it != obj.end() && it->second.type == ValueType::Number) {
        biome.metallic = static_cast<float>(it->second.numberValue);
    }
    
    return biome;
}

JsonUtil::JsonValue JsonUtil::SerializeAtmosphere(const AtmosphereConfig& atmosphere) {
    JsonValue obj;
    obj.type = ValueType::Object;
    
    obj.objectValue["enabled"] = JsonValue(atmosphere.enabled);
    obj.objectValue["density"] = JsonValue(atmosphere.density);
    obj.objectValue["scaleHeight"] = JsonValue(atmosphere.scaleHeight);
    obj.objectValue["scatteringCoefficients"] = SerializeVec3(atmosphere.scatteringCoefficients);
    obj.objectValue["planetRadius"] = JsonValue(atmosphere.planetRadius);
    obj.objectValue["atmosphereRadius"] = JsonValue(atmosphere.atmosphereRadius);
    
    return obj;
}

AtmosphereConfig JsonUtil::DeserializeAtmosphere(const JsonValue& value) {
    AtmosphereConfig atmosphere;
    
    if (value.type != ValueType::Object) {
        return atmosphere;
    }
    
    const auto& obj = value.objectValue;
    
    if (auto it = obj.find("enabled"); it != obj.end() && it->second.type == ValueType::Boolean) {
        atmosphere.enabled = it->second.boolValue;
    }
    if (auto it = obj.find("density"); it != obj.end() && it->second.type == ValueType::Number) {
        atmosphere.density = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("scaleHeight"); it != obj.end() && it->second.type == ValueType::Number) {
        atmosphere.scaleHeight = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("scatteringCoefficients"); it != obj.end()) {
        atmosphere.scatteringCoefficients = DeserializeVec3(it->second);
    }
    if (auto it = obj.find("planetRadius"); it != obj.end() && it->second.type == ValueType::Number) {
        atmosphere.planetRadius = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("atmosphereRadius"); it != obj.end() && it->second.type == ValueType::Number) {
        atmosphere.atmosphereRadius = static_cast<float>(it->second.numberValue);
    }
    
    return atmosphere;
}

JsonUtil::JsonValue JsonUtil::SerializeOcean(const OceanConfig& ocean) {
    JsonValue obj;
    obj.type = ValueType::Object;
    
    obj.objectValue["enabled"] = JsonValue(ocean.enabled);
    obj.objectValue["level"] = JsonValue(ocean.level);
    obj.objectValue["shallowColor"] = SerializeVec3(ocean.shallowColor);
    obj.objectValue["deepColor"] = SerializeVec3(ocean.deepColor);
    obj.objectValue["depthScale"] = JsonValue(ocean.depthScale);
    obj.objectValue["waveScale"] = JsonValue(ocean.waveScale);
    obj.objectValue["waveSpeed"] = JsonValue(ocean.waveSpeed);
    
    return obj;
}

OceanConfig JsonUtil::DeserializeOcean(const JsonValue& value) {
    OceanConfig ocean;
    
    if (value.type != ValueType::Object) {
        return ocean;
    }
    
    const auto& obj = value.objectValue;
    
    if (auto it = obj.find("enabled"); it != obj.end() && it->second.type == ValueType::Boolean) {
        ocean.enabled = it->second.boolValue;
    }
    if (auto it = obj.find("level"); it != obj.end() && it->second.type == ValueType::Number) {
        ocean.level = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("shallowColor"); it != obj.end()) {
        ocean.shallowColor = DeserializeVec3(it->second);
    }
    if (auto it = obj.find("deepColor"); it != obj.end()) {
        ocean.deepColor = DeserializeVec3(it->second);
    }
    if (auto it = obj.find("depthScale"); it != obj.end() && it->second.type == ValueType::Number) {
        ocean.depthScale = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("waveScale"); it != obj.end() && it->second.type == ValueType::Number) {
        ocean.waveScale = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("waveSpeed"); it != obj.end() && it->second.type == ValueType::Number) {
        ocean.waveSpeed = static_cast<float>(it->second.numberValue);
    }
    
    return ocean;
}

JsonUtil::JsonValue JsonUtil::SerializeRingSystem(const RingSystemConfig& rings) {
    JsonValue obj;
    obj.type = ValueType::Object;
    
    obj.objectValue["enabled"] = JsonValue(rings.enabled);
    obj.objectValue["innerRadius"] = JsonValue(rings.innerRadius);
    obj.objectValue["outerRadius"] = JsonValue(rings.outerRadius);
    obj.objectValue["color"] = SerializeVec3(rings.color);
    obj.objectValue["opacity"] = JsonValue(rings.opacity);
    obj.objectValue["rotation"] = JsonValue(rings.rotation);
    obj.objectValue["normal"] = SerializeVec3(rings.normal);
    
    return obj;
}

RingSystemConfig JsonUtil::DeserializeRingSystem(const JsonValue& value) {
    RingSystemConfig rings;
    
    if (value.type != ValueType::Object) {
        return rings;
    }
    
    const auto& obj = value.objectValue;
    
    if (auto it = obj.find("enabled"); it != obj.end() && it->second.type == ValueType::Boolean) {
        rings.enabled = it->second.boolValue;
    }
    if (auto it = obj.find("innerRadius"); it != obj.end() && it->second.type == ValueType::Number) {
        rings.innerRadius = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("outerRadius"); it != obj.end() && it->second.type == ValueType::Number) {
        rings.outerRadius = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("color"); it != obj.end()) {
        rings.color = DeserializeVec3(it->second);
    }
    if (auto it = obj.find("opacity"); it != obj.end() && it->second.type == ValueType::Number) {
        rings.opacity = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("rotation"); it != obj.end() && it->second.type == ValueType::Number) {
        rings.rotation = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("normal"); it != obj.end()) {
        rings.normal = DeserializeVec3(it->second);
    }
    
    return rings;
}

JsonUtil::JsonValue JsonUtil::SerializePhysics(const PhysicsConfig& physics) {
    JsonValue obj;
    obj.type = ValueType::Object;
    
    obj.objectValue["enabled"] = JsonValue(physics.enabled);
    
    // Enabled processors
    obj.objectValue["enableGravitationalSettling"] = JsonValue(physics.enableGravitationalSettling);
    obj.objectValue["enableAtmosphericErosion"] = JsonValue(physics.enableAtmosphericErosion);
    obj.objectValue["enableTectonicActivity"] = JsonValue(physics.enableTectonicActivity);
    obj.objectValue["enableAdvancedErosion"] = JsonValue(physics.enableAdvancedErosion);
    
    // Simulation parameters
    obj.objectValue["simulationSteps"] = JsonValue(static_cast<int>(physics.simulationSteps));
    obj.objectValue["timeStep"] = JsonValue(physics.timeStep);
    obj.objectValue["useGPUAcceleration"] = JsonValue(physics.useGPUAcceleration);
    
    // Gravitational settings
    obj.objectValue["settlingStrength"] = JsonValue(physics.settlingStrength);
    obj.objectValue["minimumStableSlope"] = JsonValue(physics.minimumStableSlope);
    
    // Atmospheric settings
    obj.objectValue["atmosphericStrength"] = JsonValue(physics.atmosphericStrength);
    obj.objectValue["windErosionFactor"] = JsonValue(physics.windErosionFactor);
    
    // Tectonic settings
    obj.objectValue["tectonicActivity"] = JsonValue(physics.tectonicActivity);
    
    // Processor weights
    obj.objectValue["gravitationalWeight"] = JsonValue(physics.gravitationalWeight);
    obj.objectValue["atmosphericWeight"] = JsonValue(physics.atmosphericWeight);
    obj.objectValue["tectonicWeight"] = JsonValue(physics.tectonicWeight);
    obj.objectValue["erosionWeight"] = JsonValue(physics.erosionWeight);
    
    // Celestial body type
    obj.objectValue["celestialBodyType"] = JsonValue(physics.celestialBodyType);
    
    return obj;
}

PhysicsConfig JsonUtil::DeserializePhysics(const JsonValue& value) {
    PhysicsConfig physics;
    
    if (value.type != ValueType::Object) {
        return physics;
    }
    
    const auto& obj = value.objectValue;
    
    if (auto it = obj.find("enabled"); it != obj.end() && it->second.type == ValueType::Boolean) {
        physics.enabled = it->second.boolValue;
    }
    
    // Enabled processors
    if (auto it = obj.find("enableGravitationalSettling"); it != obj.end() && it->second.type == ValueType::Boolean) {
        physics.enableGravitationalSettling = it->second.boolValue;
    }
    if (auto it = obj.find("enableAtmosphericErosion"); it != obj.end() && it->second.type == ValueType::Boolean) {
        physics.enableAtmosphericErosion = it->second.boolValue;
    }
    if (auto it = obj.find("enableTectonicActivity"); it != obj.end() && it->second.type == ValueType::Boolean) {
        physics.enableTectonicActivity = it->second.boolValue;
    }
    if (auto it = obj.find("enableAdvancedErosion"); it != obj.end() && it->second.type == ValueType::Boolean) {
        physics.enableAdvancedErosion = it->second.boolValue;
    }
    
    // Simulation parameters
    if (auto it = obj.find("simulationSteps"); it != obj.end() && it->second.type == ValueType::Number) {
        physics.simulationSteps = static_cast<uint32_t>(it->second.numberValue);
    }
    if (auto it = obj.find("timeStep"); it != obj.end() && it->second.type == ValueType::Number) {
        physics.timeStep = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("useGPUAcceleration"); it != obj.end() && it->second.type == ValueType::Boolean) {
        physics.useGPUAcceleration = it->second.boolValue;
    }
    
    // Gravitational settings
    if (auto it = obj.find("settlingStrength"); it != obj.end() && it->second.type == ValueType::Number) {
        physics.settlingStrength = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("minimumStableSlope"); it != obj.end() && it->second.type == ValueType::Number) {
        physics.minimumStableSlope = static_cast<float>(it->second.numberValue);
    }
    
    // Atmospheric settings
    if (auto it = obj.find("atmosphericStrength"); it != obj.end() && it->second.type == ValueType::Number) {
        physics.atmosphericStrength = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("windErosionFactor"); it != obj.end() && it->second.type == ValueType::Number) {
        physics.windErosionFactor = static_cast<float>(it->second.numberValue);
    }
    
    // Tectonic settings
    if (auto it = obj.find("tectonicActivity"); it != obj.end() && it->second.type == ValueType::Number) {
        physics.tectonicActivity = static_cast<float>(it->second.numberValue);
    }
    
    // Processor weights
    if (auto it = obj.find("gravitationalWeight"); it != obj.end() && it->second.type == ValueType::Number) {
        physics.gravitationalWeight = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("atmosphericWeight"); it != obj.end() && it->second.type == ValueType::Number) {
        physics.atmosphericWeight = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("tectonicWeight"); it != obj.end() && it->second.type == ValueType::Number) {
        physics.tectonicWeight = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("erosionWeight"); it != obj.end() && it->second.type == ValueType::Number) {
        physics.erosionWeight = static_cast<float>(it->second.numberValue);
    }
    
    // Celestial body type
    if (auto it = obj.find("celestialBodyType"); it != obj.end() && it->second.type == ValueType::String) {
        physics.celestialBodyType = it->second.stringValue;
    }
    
    return physics;
}

JsonUtil::JsonValue JsonUtil::SerializePreset(const PlanetaryPreset& preset) {
    JsonValue obj;
    obj.type = ValueType::Object;
    
    // Basic properties
    obj.objectValue["name"] = JsonValue(preset.name);
    obj.objectValue["category"] = JsonValue(preset.category);
    obj.objectValue["description"] = JsonValue(preset.description);
    
    // Physical properties
    obj.objectValue["baseRadius"] = JsonValue(preset.baseRadius);
    obj.objectValue["minElevation"] = JsonValue(preset.minElevation);
    obj.objectValue["maxElevation"] = JsonValue(preset.maxElevation);
    obj.objectValue["gravity"] = JsonValue(preset.gravity);
    obj.objectValue["rotationPeriod"] = JsonValue(preset.rotationPeriod);
    obj.objectValue["axialTilt"] = JsonValue(preset.axialTilt);
    obj.objectValue["orbitalPeriod"] = JsonValue(preset.orbitalPeriod);
    obj.objectValue["atmosphereDensity"] = JsonValue(preset.atmosphereDensity);
    obj.objectValue["hasAtmosphere"] = JsonValue(preset.hasAtmosphere);
    obj.objectValue["hasWater"] = JsonValue(preset.hasWater);
    obj.objectValue["hasClouds"] = JsonValue(preset.hasClouds);
    
    // Noise layers
    JsonValue noiseLayersArray;
    noiseLayersArray.type = ValueType::Array;
    for (const auto& layer : preset.noiseLayers) {
        noiseLayersArray.arrayValue.push_back(SerializeNoiseLayer(layer));
    }
    obj.objectValue["noiseLayers"] = noiseLayersArray;
    
    // Biomes
    JsonValue biomesArray;
    biomesArray.type = ValueType::Array;
    for (const auto& biome : preset.biomes) {
        biomesArray.arrayValue.push_back(SerializeBiome(biome));
    }
    obj.objectValue["biomes"] = biomesArray;
    
    // Sub-configurations
    obj.objectValue["atmosphere"] = SerializeAtmosphere(preset.atmosphere);
    obj.objectValue["ocean"] = SerializeOcean(preset.ocean);
    obj.objectValue["rings"] = SerializeRingSystem(preset.rings);
    obj.objectValue["physics"] = SerializePhysics(preset.physics);
    
    // Visual properties
    obj.objectValue["baseColor"] = SerializeVec3(preset.baseColor);
    obj.objectValue["roughness"] = JsonValue(preset.roughness);
    obj.objectValue["metallic"] = JsonValue(preset.metallic);
    
    return obj;
}

PlanetaryPreset JsonUtil::DeserializePreset(const JsonValue& value) {
    PlanetaryPreset preset;
    
    if (value.type != ValueType::Object) {
        return preset;
    }
    
    const auto& obj = value.objectValue;
    
    // Basic properties
    if (auto it = obj.find("name"); it != obj.end() && it->second.type == ValueType::String) {
        preset.name = it->second.stringValue;
    }
    if (auto it = obj.find("category"); it != obj.end() && it->second.type == ValueType::String) {
        preset.category = it->second.stringValue;
    }
    if (auto it = obj.find("description"); it != obj.end() && it->second.type == ValueType::String) {
        preset.description = it->second.stringValue;
    }
    
    // Physical properties
    if (auto it = obj.find("baseRadius"); it != obj.end() && it->second.type == ValueType::Number) {
        preset.baseRadius = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("minElevation"); it != obj.end() && it->second.type == ValueType::Number) {
        preset.minElevation = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("maxElevation"); it != obj.end() && it->second.type == ValueType::Number) {
        preset.maxElevation = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("gravity"); it != obj.end() && it->second.type == ValueType::Number) {
        preset.gravity = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("rotationPeriod"); it != obj.end() && it->second.type == ValueType::Number) {
        preset.rotationPeriod = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("axialTilt"); it != obj.end() && it->second.type == ValueType::Number) {
        preset.axialTilt = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("orbitalPeriod"); it != obj.end() && it->second.type == ValueType::Number) {
        preset.orbitalPeriod = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("atmosphereDensity"); it != obj.end() && it->second.type == ValueType::Number) {
        preset.atmosphereDensity = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("hasAtmosphere"); it != obj.end() && it->second.type == ValueType::Boolean) {
        preset.hasAtmosphere = it->second.boolValue;
    }
    if (auto it = obj.find("hasWater"); it != obj.end() && it->second.type == ValueType::Boolean) {
        preset.hasWater = it->second.boolValue;
    }
    if (auto it = obj.find("hasClouds"); it != obj.end() && it->second.type == ValueType::Boolean) {
        preset.hasClouds = it->second.boolValue;
    }
    
    // Noise layers
    if (auto it = obj.find("noiseLayers"); it != obj.end() && it->second.type == ValueType::Array) {
        for (const auto& layerValue : it->second.arrayValue) {
            preset.noiseLayers.push_back(DeserializeNoiseLayer(layerValue));
        }
    }
    
    // Biomes
    if (auto it = obj.find("biomes"); it != obj.end() && it->second.type == ValueType::Array) {
        for (const auto& biomeValue : it->second.arrayValue) {
            preset.biomes.push_back(DeserializeBiome(biomeValue));
        }
    }
    
    // Sub-configurations
    if (auto it = obj.find("atmosphere"); it != obj.end()) {
        preset.atmosphere = DeserializeAtmosphere(it->second);
    }
    if (auto it = obj.find("ocean"); it != obj.end()) {
        preset.ocean = DeserializeOcean(it->second);
    }
    if (auto it = obj.find("rings"); it != obj.end()) {
        preset.rings = DeserializeRingSystem(it->second);
    }
    if (auto it = obj.find("physics"); it != obj.end()) {
        preset.physics = DeserializePhysics(it->second);
    }
    
    // Visual properties
    if (auto it = obj.find("baseColor"); it != obj.end()) {
        preset.baseColor = DeserializeVec3(it->second);
    }
    if (auto it = obj.find("roughness"); it != obj.end() && it->second.type == ValueType::Number) {
        preset.roughness = static_cast<float>(it->second.numberValue);
    }
    if (auto it = obj.find("metallic"); it != obj.end() && it->second.type == ValueType::Number) {
        preset.metallic = static_cast<float>(it->second.numberValue);
    }
    
    return preset;
}

// Internal parsing helpers
JsonUtil::JsonValue JsonUtil::ParseValue(const std::string& json, size_t& pos) {
    SkipWhitespace(json, pos);
    
    if (pos >= json.length()) {
        return JsonValue(); // null
    }
    
    char ch = json[pos];
    if (ch == '"') {
        return ParseString(json, pos);
    } else if (ch == '{') {
        return ParseObject(json, pos);
    } else if (ch == '[') {
        return ParseArray(json, pos);
    } else if (ch == 't' || ch == 'f') {
        return ParseBoolean(json, pos);
    } else if (ch == 'n') {
        // null
        pos += 4; // Skip "null"
        return JsonValue();
    } else if (std::isdigit(ch) || ch == '-' || ch == '+') {
        return ParseNumber(json, pos);
    }
    
    return JsonValue(); // null
}

JsonUtil::JsonValue JsonUtil::ParseString(const std::string& json, size_t& pos) {
    if (json[pos] != '"') {
        return JsonValue();
    }
    
    ++pos; // Skip opening quote
    std::string str;
    
    while (pos < json.length() && json[pos] != '"') {
        if (json[pos] == '\\' && pos + 1 < json.length()) {
            ++pos; // Skip backslash
            char escaped = json[pos];
            switch (escaped) {
                case 'n': str += '\n'; break;
                case 't': str += '\t'; break;
                case 'r': str += '\r'; break;
                case '\\': str += '\\'; break;
                case '"': str += '"'; break;
                default: str += escaped; break;
            }
        } else {
            str += json[pos];
        }
        ++pos;
    }
    
    if (pos < json.length()) {
        ++pos; // Skip closing quote
    }
    
    return JsonValue(str);
}

JsonUtil::JsonValue JsonUtil::ParseNumber(const std::string& json, size_t& pos) {
    size_t start = pos;
    
    if (json[pos] == '-' || json[pos] == '+') {
        ++pos;
    }
    
    while (pos < json.length() && (std::isdigit(json[pos]) || json[pos] == '.')) {
        ++pos;
    }
    
    std::string numStr = json.substr(start, pos - start);
    double value = std::stod(numStr);
    
    return JsonValue(value);
}

JsonUtil::JsonValue JsonUtil::ParseBoolean(const std::string& json, size_t& pos) {
    if (json.substr(pos, 4) == "true") {
        pos += 4;
        return JsonValue(true);
    } else if (json.substr(pos, 5) == "false") {
        pos += 5;
        return JsonValue(false);
    }
    
    return JsonValue();
}

JsonUtil::JsonValue JsonUtil::ParseArray(const std::string& json, size_t& pos) {
    JsonValue array;
    array.type = ValueType::Array;
    
    if (json[pos] != '[') {
        return array;
    }
    
    ++pos; // Skip opening bracket
    SkipWhitespace(json, pos);
    
    // Handle empty array
    if (pos < json.length() && json[pos] == ']') {
        ++pos;
        return array;
    }
    
    while (pos < json.length()) {
        array.arrayValue.push_back(ParseValue(json, pos));
        SkipWhitespace(json, pos);
        
        if (pos < json.length() && json[pos] == ',') {
            ++pos; // Skip comma
            SkipWhitespace(json, pos);
        } else if (pos < json.length() && json[pos] == ']') {
            ++pos; // Skip closing bracket
            break;
        }
    }
    
    return array;
}

JsonUtil::JsonValue JsonUtil::ParseObject(const std::string& json, size_t& pos) {
    JsonValue object;
    object.type = ValueType::Object;
    
    if (json[pos] != '{') {
        return object;
    }
    
    ++pos; // Skip opening brace
    SkipWhitespace(json, pos);
    
    // Handle empty object
    if (pos < json.length() && json[pos] == '}') {
        ++pos;
        return object;
    }
    
    while (pos < json.length()) {
        // Parse key
        JsonValue keyValue = ParseString(json, pos);
        if (keyValue.type != ValueType::String) {
            break;
        }
        
        SkipWhitespace(json, pos);
        
        // Skip colon
        if (pos < json.length() && json[pos] == ':') {
            ++pos;
            SkipWhitespace(json, pos);
        }
        
        // Parse value
        JsonValue value = ParseValue(json, pos);
        object.objectValue[keyValue.stringValue] = value;
        
        SkipWhitespace(json, pos);
        
        if (pos < json.length() && json[pos] == ',') {
            ++pos; // Skip comma
            SkipWhitespace(json, pos);
        } else if (pos < json.length() && json[pos] == '}') {
            ++pos; // Skip closing brace
            break;
        }
    }
    
    return object;
}

void JsonUtil::SkipWhitespace(const std::string& json, size_t& pos) {
    while (pos < json.length() && std::isspace(json[pos])) {
        ++pos;
    }
}

std::string JsonUtil::SerializeString(const std::string& str) {
    std::ostringstream oss;
    oss << '"';
    
    for (char ch : str) {
        switch (ch) {
            case '\n': oss << "\\n"; break;
            case '\t': oss << "\\t"; break;
            case '\r': oss << "\\r"; break;
            case '\\': oss << "\\\\"; break;
            case '"': oss << "\\\""; break;
            default: oss << ch; break;
        }
    }
    
    oss << '"';
    return oss.str();
}

std::string JsonUtil::GetIndentation(int indent) {
    return std::string(indent * 2, ' ');
}

// JsonConfigurationSerializer implementation
bool JsonConfigurationSerializer::SavePresetToFile(const std::string& filepath, const PlanetaryPreset& preset) {
    try {
        JsonUtil::JsonValue presetJson = JsonUtil::SerializePreset(preset);
        std::string jsonString = JsonUtil::SerializeToString(presetJson, 0);
        
        std::ofstream file(filepath);
        if (!file.is_open()) {
            std::cerr << "[JsonConfigurationSerializer] Failed to open file for writing: " << filepath << std::endl;
            return false;
        }
        
        file << jsonString;
        file.close();
        
        return true;
    } catch (const std::exception& e) {
        std::cerr << "[JsonConfigurationSerializer] Exception saving preset: " << e.what() << std::endl;
        return false;
    }
}

bool JsonConfigurationSerializer::LoadPresetFromFile(const std::string& filepath, PlanetaryPreset& preset) {
    try {
        std::ifstream file(filepath);
        if (!file.is_open()) {
            std::cerr << "[JsonConfigurationSerializer] Failed to open file for reading: " << filepath << std::endl;
            return false;
        }
        
        std::string jsonString((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
        file.close();
        
        JsonUtil::JsonValue presetJson = JsonUtil::ParseFromString(jsonString);
        
        if (!ValidateJsonPreset(presetJson)) {
            std::cerr << "[JsonConfigurationSerializer] Invalid JSON preset: " << GetValidationErrors(presetJson) << std::endl;
            return false;
        }
        
        preset = JsonUtil::DeserializePreset(presetJson);
        return true;
        
    } catch (const std::exception& e) {
        std::cerr << "[JsonConfigurationSerializer] Exception loading preset: " << e.what() << std::endl;
        return false;
    }
}

bool JsonConfigurationSerializer::ValidateJsonPreset(const JsonUtil::JsonValue& json) {
    if (json.type != JsonUtil::ValueType::Object) {
        return false;
    }
    
    const auto& obj = json.objectValue;
    
    // Check required fields
    if (obj.find("name") == obj.end() || obj.at("name").type != JsonUtil::ValueType::String) {
        return false;
    }
    if (obj.find("category") == obj.end() || obj.at("category").type != JsonUtil::ValueType::String) {
        return false;
    }
    
    // Validate arrays if present
    if (auto it = obj.find("noiseLayers"); it != obj.end()) {
        if (it->second.type != JsonUtil::ValueType::Array) {
            return false;
        }
        for (const auto& layer : it->second.arrayValue) {
            if (!ValidateNoiseLayerJson(layer)) {
                return false;
            }
        }
    }
    
    if (auto it = obj.find("biomes"); it != obj.end()) {
        if (it->second.type != JsonUtil::ValueType::Array) {
            return false;
        }
        for (const auto& biome : it->second.arrayValue) {
            if (!ValidateBiomeJson(biome)) {
                return false;
            }
        }
    }
    
    return true;
}

std::string JsonConfigurationSerializer::GetValidationErrors(const JsonUtil::JsonValue& json) {
    std::ostringstream errors;
    
    if (json.type != JsonUtil::ValueType::Object) {
        errors << "Root must be an object; ";
        return errors.str();
    }
    
    const auto& obj = json.objectValue;
    
    if (obj.find("name") == obj.end()) {
        errors << "Missing required field 'name'; ";
    } else if (obj.at("name").type != JsonUtil::ValueType::String) {
        errors << "Field 'name' must be a string; ";
    }
    
    if (obj.find("category") == obj.end()) {
        errors << "Missing required field 'category'; ";
    } else if (obj.at("category").type != JsonUtil::ValueType::String) {
        errors << "Field 'category' must be a string; ";
    }
    
    return errors.str();
}

bool JsonConfigurationSerializer::ValidateNoiseLayerJson(const JsonUtil::JsonValue& json) {
    if (json.type != JsonUtil::ValueType::Object) {
        return false;
    }
    
    // Basic validation - could be expanded
    return true;
}

bool JsonConfigurationSerializer::ValidateBiomeJson(const JsonUtil::JsonValue& json) {
    if (json.type != JsonUtil::ValueType::Object) {
        return false;
    }
    
    // Basic validation - could be expanded
    return true;
}

bool JsonConfigurationSerializer::ValidateAtmosphereJson(const JsonUtil::JsonValue& json) {
    if (json.type != JsonUtil::ValueType::Object) {
        return false;
    }
    
    // Basic validation - could be expanded
    return true;
}

bool JsonConfigurationSerializer::ValidateOceanJson(const JsonUtil::JsonValue& json) {
    if (json.type != JsonUtil::ValueType::Object) {
        return false;
    }
    
    // Basic validation - could be expanded
    return true;
}

bool JsonConfigurationSerializer::ValidateRingSystemJson(const JsonUtil::JsonValue& json) {
    if (json.type != JsonUtil::ValueType::Object) {
        return false;
    }
    
    // Basic validation - could be expanded
    return true;
}

} // namespace PlanetGen::Generation::Configuration
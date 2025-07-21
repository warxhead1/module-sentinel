module;

#include <nlohmann/json.hpp>
#include <string>
#include <vector>
#include <unordered_map>
#include <memory>
#include <optional>
#include <fstream>
#include <filesystem>
#include <iostream>
#include <algorithm>

module ParameterImporter;

using json = nlohmann::json;

namespace PlanetGen::Generation::Configuration {

// ============================================================================
// JSONParameterImporter Implementation
// ============================================================================

JSONParameterImporter::JSONParameterImporter() = default;
JSONParameterImporter::~JSONParameterImporter() = default;

std::optional<ParameterSet> JSONParameterImporter::ImportFromFile(const std::string& filePath) {
    try {
        std::ifstream file(filePath);
        if (!file.is_open()) {
            std::cerr << "[JSONParameterImporter] Could not open file: " << filePath << std::endl;
            return std::nullopt;
        }
        
        json j;
        file >> j;
        
        return ImportFromJSON(j);
        
    } catch (const std::exception& e) {
        std::cerr << "[JSONParameterImporter] Error loading from " << filePath << ": " << e.what() << std::endl;
        return std::nullopt;
    }
}

bool JSONParameterImporter::ExportToFile(const ParameterSet& parameters, const std::string& filePath) {
    try {
        json j = ExportToJSON(parameters);
        
        std::ofstream file(filePath);
        if (!file.is_open()) {
            std::cerr << "[JSONParameterImporter] Could not create file: " << filePath << std::endl;
            return false;
        }
        
        if (m_prettyPrint) {
            file << j.dump(m_indentationSpaces);
        } else {
            file << j.dump();
        }
        
        return true;
        
    } catch (const std::exception& e) {
        std::cerr << "[JSONParameterImporter] Error saving to " << filePath << ": " << e.what() << std::endl;
        return false;
    }
}

bool JSONParameterImporter::ValidateParameters(const ParameterSet& parameters, 
                                               const std::vector<ParameterConstraint>& constraints) {
    for (const auto& constraint : constraints) {
        if (constraint.required) {
            auto it = parameters.floatParameters.find(constraint.parameterName);
            if (it == parameters.floatParameters.end()) {
                std::cerr << "[JSONParameterImporter] Missing required parameter: " 
                         << constraint.parameterName << std::endl;
                return false;
            }
            
            float value = it->second;
            if (value < constraint.minValue || value > constraint.maxValue) {
                std::cerr << "[JSONParameterImporter] Parameter " << constraint.parameterName 
                         << " value " << value << " outside range [" 
                         << constraint.minValue << ", " << constraint.maxValue << "]" << std::endl;
                return false;
            }
        }
    }
    return true;
}

std::vector<std::string> JSONParameterImporter::GetSupportedExtensions() const {
    return {".json", ".jsonc"};
}

void JSONParameterImporter::SetIndentationSpaces(int spaces) {
    m_indentationSpaces = std::max(0, spaces);
}

void JSONParameterImporter::EnablePrettyPrint(bool enabled) {
    m_prettyPrint = enabled;
}

std::optional<ParameterSet> JSONParameterImporter::ImportFromString(const std::string& jsonString) {
    try {
        json j = json::parse(jsonString);
        return ImportFromJSON(j);
    } catch (const std::exception& e) {
        std::cerr << "[JSONParameterImporter] Error parsing JSON string: " << e.what() << std::endl;
        return std::nullopt;
    }
}

std::string JSONParameterImporter::ExportToString(const ParameterSet& parameters) {
    try {
        json j = ExportToJSON(parameters);
        return m_prettyPrint ? j.dump(m_indentationSpaces) : j.dump();
    } catch (const std::exception& e) {
        std::cerr << "[JSONParameterImporter] Error exporting to JSON string: " << e.what() << std::endl;
        return "{}";
    }
}

std::optional<ParameterSet> JSONParameterImporter::ImportFromJSON(const json& j) {
    ParameterSet params;
    
    // Extract basic info
    params.name = j.value("name", "Unnamed");
    params.description = j.value("description", "");
    
    // Extract parameters section
    if (j.contains("parameters")) {
        const auto& paramSection = j["parameters"];
        
        // Float parameters
        if (paramSection.contains("terrain")) {
            for (const auto& [key, value] : paramSection["terrain"].items()) {
                if (value.is_number()) {
                    params.floatParameters[key] = value.get<float>();
                }
            }
        }
        
        if (paramSection.contains("physics")) {
            for (const auto& [key, value] : paramSection["physics"].items()) {
                if (value.is_number()) {
                    params.floatParameters[key] = value.get<float>();
                } else if (value.is_boolean()) {
                    params.boolParameters[key] = value.get<bool>();
                }
            }
        }
        
        if (paramSection.contains("climate")) {
            for (const auto& [key, value] : paramSection["climate"].items()) {
                if (value.is_number()) {
                    params.floatParameters[key] = value.get<float>();
                }
            }
        }
        
        // String parameters
        if (paramSection.contains("general")) {
            for (const auto& [key, value] : paramSection["general"].items()) {
                if (value.is_string()) {
                    params.stringParameters[key] = value.get<std::string>();
                }
            }
        }
        
        // Array parameters (for noise layers, etc.)
        if (paramSection.contains("arrays")) {
            for (const auto& [key, value] : paramSection["arrays"].items()) {
                if (value.is_array()) {
                    std::vector<float> arr;
                    for (const auto& item : value) {
                        if (item.is_number()) {
                            arr.push_back(item.get<float>());
                        }
                    }
                    if (!arr.empty()) {
                        params.arrayParameters[key] = arr;
                    }
                }
            }
        }
    }
    
    return params;
}

json JSONParameterImporter::ExportToJSON(const ParameterSet& parameters) {
    json j;
    
    j["name"] = parameters.name;
    j["description"] = parameters.description;
    
    // Group parameters by category for organization
    json& paramSection = j["parameters"];
    
    // Terrain parameters
    json& terrain = paramSection["terrain"];
    for (const auto& [key, value] : parameters.floatParameters) {
        if (key.find("water") != std::string::npos || 
            key.find("mountain") != std::string::npos ||
            key.find("vegetation") != std::string::npos ||
            key.find("elevation") != std::string::npos) {
            terrain[key] = value;
        }
    }
    
    // Physics parameters
    json& physics = paramSection["physics"];
    for (const auto& [key, value] : parameters.floatParameters) {
        if (key.find("physics") != std::string::npos || 
            key.find("settling") != std::string::npos ||
            key.find("erosion") != std::string::npos ||
            key.find("tectonic") != std::string::npos) {
            physics[key] = value;
        }
    }
    
    for (const auto& [key, value] : parameters.boolParameters) {
        if (key.find("enable") != std::string::npos) {
            physics[key] = value;
        }
    }
    
    // Climate parameters
    json& climate = paramSection["climate"];
    for (const auto& [key, value] : parameters.floatParameters) {
        if (key.find("temperature") != std::string::npos || 
            key.find("precipitation") != std::string::npos ||
            key.find("climate") != std::string::npos) {
            climate[key] = value;
        }
    }
    
    // General string parameters
    json& general = paramSection["general"];
    for (const auto& [key, value] : parameters.stringParameters) {
        general[key] = value;
    }
    
    // Array parameters
    if (!parameters.arrayParameters.empty()) {
        json& arrays = paramSection["arrays"];
        for (const auto& [key, value] : parameters.arrayParameters) {
            arrays[key] = value;
        }
    }
    
    return j;
}

// ============================================================================
// ParameterImporterFactory Implementation
// ============================================================================

std::unique_ptr<IParameterImporter> ParameterImporterFactory::CreateForFile(const std::string& filePath) {
    std::filesystem::path path(filePath);
    std::string extension = path.extension().string();
    std::transform(extension.begin(), extension.end(), extension.begin(), ::tolower);
    
    if (extension == ".json" || extension == ".jsonc") {
        return CreateJSONImporter();
    }
    
    // Default to JSON if unknown extension
    return CreateJSONImporter();
}

std::unique_ptr<JSONParameterImporter> ParameterImporterFactory::CreateJSONImporter() {
    return std::make_unique<JSONParameterImporter>();
}

std::vector<std::string> ParameterImporterFactory::GetAllSupportedExtensions() {
    return {".json", ".jsonc"};
}

// ============================================================================
// ParameterUtils Implementation
// ============================================================================

namespace ParameterUtils {

TerrainParameters ExtractTerrainParameters(const ParameterSet& params) {
    TerrainParameters terrain;
    
    auto getFloat = [&](const std::string& key, float defaultValue) -> float {
        auto it = params.floatParameters.find(key);
        return (it != params.floatParameters.end()) ? it->second : defaultValue;
    };
    
    terrain.waterCoverage = getFloat("waterCoverage", 0.7f);
    terrain.mountainDensity = getFloat("mountainDensity", 0.3f);
    terrain.vegetationCoverage = getFloat("vegetationCoverage", 0.6f);
    terrain.temperatureRange = getFloat("temperatureRange", 60.0f);
    terrain.averageTemperature = getFloat("averageTemperature", 15.0f);
    terrain.precipitationLevel = getFloat("precipitationLevel", 1.0f);
    terrain.tectonicActivity = getFloat("tectonicActivity", 0.5f);
    terrain.erosionRate = getFloat("erosionRate", 0.5f);
    terrain.randomSeed = static_cast<uint32_t>(getFloat("randomSeed", 0.0f));
    
    return terrain;
}

PhysicsParameters ExtractPhysicsParameters(const ParameterSet& params) {
    PhysicsParameters physics;
    
    auto getBool = [&](const std::string& key, bool defaultValue) -> bool {
        auto it = params.boolParameters.find(key);
        return (it != params.boolParameters.end()) ? it->second : defaultValue;
    };
    
    auto getFloat = [&](const std::string& key, float defaultValue) -> float {
        auto it = params.floatParameters.find(key);
        return (it != params.floatParameters.end()) ? it->second : defaultValue;
    };
    
    physics.enableGravitationalSettling = getBool("enableGravitationalSettling", true);
    physics.enableAtmosphericErosion = getBool("enableAtmosphericErosion", true);
    physics.enableTectonicActivity = getBool("enableTectonicActivity", true);
    physics.settlingStrength = getFloat("settlingStrength", 1.0f);
    physics.atmosphericStrength = getFloat("atmosphericStrength", 1.0f);
    physics.simulationSteps = static_cast<int>(getFloat("simulationSteps", 50.0f));
    physics.timeStep = getFloat("timeStep", 1000.0f);
    
    return physics;
}

ParameterSet CreateParameterSet(const TerrainParameters& terrain, const PhysicsParameters& physics) {
    ParameterSet params;
    params.name = "Generated Parameter Set";
    params.description = "Parameter set created from terrain and physics parameters";
    
    // Terrain parameters
    params.floatParameters["waterCoverage"] = terrain.waterCoverage;
    params.floatParameters["mountainDensity"] = terrain.mountainDensity;
    params.floatParameters["vegetationCoverage"] = terrain.vegetationCoverage;
    params.floatParameters["temperatureRange"] = terrain.temperatureRange;
    params.floatParameters["averageTemperature"] = terrain.averageTemperature;
    params.floatParameters["precipitationLevel"] = terrain.precipitationLevel;
    params.floatParameters["tectonicActivity"] = terrain.tectonicActivity;
    params.floatParameters["erosionRate"] = terrain.erosionRate;
    params.floatParameters["randomSeed"] = static_cast<float>(terrain.randomSeed);
    
    // Physics parameters
    params.boolParameters["enableGravitationalSettling"] = physics.enableGravitationalSettling;
    params.boolParameters["enableAtmosphericErosion"] = physics.enableAtmosphericErosion;
    params.boolParameters["enableTectonicActivity"] = physics.enableTectonicActivity;
    params.floatParameters["settlingStrength"] = physics.settlingStrength;
    params.floatParameters["atmosphericStrength"] = physics.atmosphericStrength;
    params.floatParameters["simulationSteps"] = static_cast<float>(physics.simulationSteps);
    params.floatParameters["timeStep"] = physics.timeStep;
    
    return params;
}

std::vector<ParameterConstraint> GetTerrainConstraints() {
    return {
        {"waterCoverage", 0.0f, 1.0f, true, "Percentage of surface covered by water"},
        {"mountainDensity", 0.0f, 1.0f, true, "Density of mountainous terrain"},
        {"vegetationCoverage", 0.0f, 1.0f, false, "Percentage of land covered by vegetation"},
        {"temperatureRange", 10.0f, 100.0f, false, "Temperature difference between equator and poles"},
        {"averageTemperature", -50.0f, 50.0f, false, "Global average temperature in Celsius"},
        {"precipitationLevel", 0.0f, 5.0f, false, "Global precipitation multiplier"},
        {"tectonicActivity", 0.0f, 1.0f, false, "Intensity of tectonic activity"},
        {"erosionRate", 0.0f, 1.0f, false, "Rate of erosion processes"}
    };
}

std::vector<ParameterConstraint> GetPhysicsConstraints() {
    return {
        {"settlingStrength", 0.0f, 5.0f, false, "Strength of gravitational settling"},
        {"atmosphericStrength", 0.0f, 5.0f, false, "Strength of atmospheric effects"},
        {"simulationSteps", 1.0f, 1000.0f, false, "Number of physics simulation steps"},
        {"timeStep", 100.0f, 10000.0f, false, "Time step for physics simulation"}
    };
}

} // namespace ParameterUtils

} // namespace PlanetGen::Generation::Configuration
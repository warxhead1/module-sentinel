module;

#include <nlohmann/json.hpp>
#include <string>
#include <iostream>
#include <sstream>

module SimpleJSONTest;

using json = nlohmann::json;

namespace PlanetGen::Generation::Orchestration {

bool SimpleJSONTest::TestBasicJSON() {
    try {
        // Create a simple JSON object
        json testObj;
        testObj["name"] = "test_planet";
        testObj["radius"] = 6371.0;
        testObj["water_coverage"] = 0.71;
        testObj["enabled"] = true;
        
        // Convert to string
        std::string jsonStr = testObj.dump(2);
        std::cout << "[SimpleJSONTest] Created JSON: " << jsonStr << std::endl;
        
        // Parse it back
        json parsed = json::parse(jsonStr);
        
        // Verify values
        if (parsed["name"] != "test_planet") return false;
        if (parsed["radius"] != 6371.0) return false;
        if (parsed["water_coverage"] != 0.71) return false;
        if (parsed["enabled"] != true) return false;
        
        std::cout << "[SimpleJSONTest] Basic JSON test passed!" << std::endl;
        return true;
        
    } catch (const std::exception& e) {
        std::cout << "[SimpleJSONTest] JSON test failed: " << e.what() << std::endl;
        return false;
    }
}

std::string SimpleJSONTest::CreateTestJSON() {
    try {
        json planetConfig;
        
        // Basic planet properties
        planetConfig["planet"]["name"] = "earth_like_test";
        planetConfig["planet"]["category"] = "Terrestrial";
        planetConfig["planet"]["baseRadius"] = 6371.0;
        
        // Noise configuration
        planetConfig["noise"]["frequency"] = 0.002;
        planetConfig["noise"]["amplitude"] = 0.5;
        planetConfig["noise"]["octaves"] = 4;
        
        // Physical properties
        planetConfig["physics"]["gravity"] = 9.81;
        planetConfig["physics"]["rotationPeriod"] = 24.0;
        
        // Environmental settings
        planetConfig["environment"]["waterCoverage"] = 0.71;
        planetConfig["environment"]["mountainDensity"] = 0.3;
        planetConfig["environment"]["averageTemperature"] = 15.0;
        
        return planetConfig.dump(2);
        
    } catch (const std::exception& e) {
        std::cout << "[SimpleJSONTest] Failed to create test JSON: " << e.what() << std::endl;
        return "{}";
    }
}

bool SimpleJSONTest::ParseTestJSON(const std::string& jsonStr) {
    try {
        json parsed = json::parse(jsonStr);
        
        // Check that we can access nested values
        if (!parsed.contains("planet")) {
            std::cout << "[SimpleJSONTest] Missing 'planet' section" << std::endl;
            return false;
        }
        
        if (!parsed.contains("noise")) {
            std::cout << "[SimpleJSONTest] Missing 'noise' section" << std::endl;
            return false;
        }
        
        // Access some values to verify parsing worked
        std::string name = parsed["planet"]["name"];
        double radius = parsed["planet"]["baseRadius"];
        double waterCoverage = parsed["environment"]["waterCoverage"];
        
        std::cout << "[SimpleJSONTest] Parsed planet: " << name 
                  << ", radius: " << radius << "km"
                  << ", water: " << (waterCoverage * 100) << "%" << std::endl;
        
        return true;
        
    } catch (const std::exception& e) {
        std::cout << "[SimpleJSONTest] Failed to parse JSON: " << e.what() << std::endl;
        return false;
    }
}

} // namespace PlanetGen::Generation::Orchestration
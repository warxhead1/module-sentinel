module;
// SimpleJSONTest.ixx
// Basic test to see if nlohmann/json can be integrated into our module system

// Move includes BEFORE module declaration to avoid ICE
#include <nlohmann/json.hpp>
#include <string>
#include <iostream>

export module SimpleJSONTest;

export namespace PlanetGen::Generation::Orchestration {

class SimpleJSONTest {
public:
    // Simple test function to verify JSON functionality
    static bool TestBasicJSON();
    
    // Test loading a simple JSON structure
    static std::string CreateTestJSON();
    
    // Test parsing a simple JSON structure
    static bool ParseTestJSON(const std::string& jsonStr);
};

} // namespace PlanetGen::Generation::Orchestration
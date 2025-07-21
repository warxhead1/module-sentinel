module;
// ParameterImporter.ixx
// Generalized parameter import system for various configuration formats

// Include JSON before module declaration to avoid ICE
#include <nlohmann/json.hpp>
#include <string>
#include <vector>
#include <unordered_map>
#include <memory>
#include <optional>

export module ParameterImporter;

export namespace PlanetGen::Generation::Configuration {

/**
 * Generic parameter container for configuration data
 */
struct ParameterSet {
    std::string name;
    std::string description;
    std::unordered_map<std::string, float> floatParameters;
    std::unordered_map<std::string, std::string> stringParameters;
    std::unordered_map<std::string, bool> boolParameters;
    std::unordered_map<std::string, std::vector<float>> arrayParameters;
};

/**
 * Parameter constraint for validation
 */
struct ParameterConstraint {
    std::string parameterName;
    float minValue = 0.0f;
    float maxValue = 1.0f;
    bool required = false;
    std::string description;
};

/**
 * Base interface for parameter importers
 */
class IParameterImporter {
public:
    virtual ~IParameterImporter() = default;
    
    // Import parameters from file
    virtual std::optional<ParameterSet> ImportFromFile(const std::string& filePath) = 0;
    
    // Export parameters to file
    virtual bool ExportToFile(const ParameterSet& parameters, const std::string& filePath) = 0;
    
    // Validate parameter set against constraints
    virtual bool ValidateParameters(const ParameterSet& parameters, 
                                   const std::vector<ParameterConstraint>& constraints) = 0;
    
    // Get supported file extensions
    virtual std::vector<std::string> GetSupportedExtensions() const = 0;
};

/**
 * JSON-based parameter importer
 */
class JSONParameterImporter : public IParameterImporter {
public:
    JSONParameterImporter();
    ~JSONParameterImporter() override;
    
    // IParameterImporter interface
    std::optional<ParameterSet> ImportFromFile(const std::string& filePath) override;
    bool ExportToFile(const ParameterSet& parameters, const std::string& filePath) override;
    bool ValidateParameters(const ParameterSet& parameters, 
                           const std::vector<ParameterConstraint>& constraints) override;
    std::vector<std::string> GetSupportedExtensions() const override;
    
    // JSON-specific methods
    void SetIndentationSpaces(int spaces);
    void EnablePrettyPrint(bool enabled);
    
    // Import from JSON string
    std::optional<ParameterSet> ImportFromString(const std::string& jsonString);
    
    // Export to JSON string
    std::string ExportToString(const ParameterSet& parameters);

private:
    // JSON conversion helpers
    std::optional<ParameterSet> ImportFromJSON(const nlohmann::json& j);
    nlohmann::json ExportToJSON(const ParameterSet& parameters);
    
    int m_indentationSpaces = 2;
    bool m_prettyPrint = true;
};

/**
 * Factory for creating parameter importers
 */
class ParameterImporterFactory {
public:
    // Create importer based on file extension
    static std::unique_ptr<IParameterImporter> CreateForFile(const std::string& filePath);
    
    // Create specific importer types
    static std::unique_ptr<JSONParameterImporter> CreateJSONImporter();
    
    // Get all supported file extensions
    static std::vector<std::string> GetAllSupportedExtensions();
};

/**
 * Utility functions for parameter conversion
 */
namespace ParameterUtils {
    // Convert parameter set to specific configuration types
    struct TerrainParameters {
        float waterCoverage = 0.7f;
        float mountainDensity = 0.3f;
        float vegetationCoverage = 0.6f;
        float temperatureRange = 60.0f;
        float averageTemperature = 15.0f;
        float precipitationLevel = 1.0f;
        float tectonicActivity = 0.5f;
        float erosionRate = 0.5f;
        uint32_t randomSeed = 0;
    };
    
    struct PhysicsParameters {
        bool enableGravitationalSettling = true;
        bool enableAtmosphericErosion = true;
        bool enableTectonicActivity = true;
        float settlingStrength = 1.0f;
        float atmosphericStrength = 1.0f;
        int simulationSteps = 50;
        float timeStep = 1000.0f;
    };
    
    // Conversion functions
    TerrainParameters ExtractTerrainParameters(const ParameterSet& params);
    PhysicsParameters ExtractPhysicsParameters(const ParameterSet& params);
    ParameterSet CreateParameterSet(const TerrainParameters& terrain, 
                                           const PhysicsParameters& physics);
    
    // Validation constraint sets
    std::vector<ParameterConstraint> GetTerrainConstraints();
    std::vector<ParameterConstraint> GetPhysicsConstraints();
}

} // namespace PlanetGen::Generation::Configuration
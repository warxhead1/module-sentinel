module;

#include <string>
#include <sstream>
#include <vector>
#include <unordered_map>
#include <variant>
#include <iomanip>

export module JsonConfigurationHelpers;

import GLMModule;
import PlanetaryConfigurationManager;

export namespace PlanetGen::Generation::Configuration {

// Simple JSON utility class for serialization/deserialization
class JsonUtil {
public:
    // Basic JSON value types
    enum class ValueType {
        String,
        Number,
        Boolean,
        Array,
        Object,
        Null
    };
    
    // JSON value wrapper
    struct JsonValue {
        ValueType type;
        std::string stringValue;
        double numberValue = 0.0;
        bool boolValue = false;
        std::vector<JsonValue> arrayValue;
        std::unordered_map<std::string, JsonValue> objectValue;
        
        JsonValue() : type(ValueType::Null) {}
        JsonValue(const std::string& str) : type(ValueType::String), stringValue(str) {}
        JsonValue(double num) : type(ValueType::Number), numberValue(num) {}
        JsonValue(float num) : type(ValueType::Number), numberValue(static_cast<double>(num)) {}
        JsonValue(int num) : type(ValueType::Number), numberValue(static_cast<double>(num)) {}
        JsonValue(uint32_t num) : type(ValueType::Number), numberValue(static_cast<double>(num)) {}
        JsonValue(bool val) : type(ValueType::Boolean), boolValue(val) {}
    };
    
    // Serialization methods
    static std::string SerializeToString(const JsonValue& value, int indent = 0);
    static JsonValue ParseFromString(const std::string& json);
    
    // Helper methods for common types
    static JsonValue SerializeVec3(const vec3& v);
    static vec3 DeserializeVec3(const JsonValue& value);
    
    static JsonValue SerializeNoiseLayer(const NoiseLayerConfig& layer);
    static NoiseLayerConfig DeserializeNoiseLayer(const JsonValue& value);
    
    static JsonValue SerializeBiome(const BiomeConfig& biome);
    static BiomeConfig DeserializeBiome(const JsonValue& value);
    
    static JsonValue SerializeAtmosphere(const AtmosphereConfig& atmosphere);
    static AtmosphereConfig DeserializeAtmosphere(const JsonValue& value);
    
    static JsonValue SerializeOcean(const OceanConfig& ocean);
    static OceanConfig DeserializeOcean(const JsonValue& value);
    
    static JsonValue SerializeRingSystem(const RingSystemConfig& rings);
    static RingSystemConfig DeserializeRingSystem(const JsonValue& value);
    
    static JsonValue SerializePhysics(const PhysicsConfig& physics);
    static PhysicsConfig DeserializePhysics(const JsonValue& value);
    
    static JsonValue SerializePreset(const PlanetaryPreset& preset);
    static PlanetaryPreset DeserializePreset(const JsonValue& value);

private:
    // Internal parsing helpers
    static JsonValue ParseValue(const std::string& json, size_t& pos);
    static JsonValue ParseString(const std::string& json, size_t& pos);
    static JsonValue ParseNumber(const std::string& json, size_t& pos);
    static JsonValue ParseBoolean(const std::string& json, size_t& pos);
    static JsonValue ParseArray(const std::string& json, size_t& pos);
    static JsonValue ParseObject(const std::string& json, size_t& pos);
    static void SkipWhitespace(const std::string& json, size_t& pos);
    
    // Internal serialization helpers
    static std::string SerializeString(const std::string& str);
    static std::string GetIndentation(int indent);
};

// High-level serialization functions for file I/O
class JsonConfigurationSerializer {
public:
    static bool SavePresetToFile(const std::string& filepath, const PlanetaryPreset& preset);
    static bool LoadPresetFromFile(const std::string& filepath, PlanetaryPreset& preset);
    
    // Validation functions
    static bool ValidateJsonPreset(const JsonUtil::JsonValue& json);
    static std::string GetValidationErrors(const JsonUtil::JsonValue& json);
    
private:
    // Helper functions for validation
    static bool ValidateNoiseLayerJson(const JsonUtil::JsonValue& json);
    static bool ValidateBiomeJson(const JsonUtil::JsonValue& json);
    static bool ValidateAtmosphereJson(const JsonUtil::JsonValue& json);
    static bool ValidateOceanJson(const JsonUtil::JsonValue& json);
    static bool ValidateRingSystemJson(const JsonUtil::JsonValue& json);
};

} // namespace PlanetGen::Generation::Configuration
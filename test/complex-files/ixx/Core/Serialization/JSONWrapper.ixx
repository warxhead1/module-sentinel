module;

#include <string>
#include <unordered_map>

#include <memory>
#include <vector>
export module JSONWrapper;

export namespace PlanetGen::Core::Serialization {

/**
 * Simple JSON wrapper that hides nlohmann implementation details
 */
class JSONValue {
public:
    JSONValue();
    ~JSONValue();
    
    // String operations
    bool LoadFromString(const std::string& jsonString);
    std::string ToString() const;
    
    // File operations  
    bool LoadFromFile(const std::string& filePath);
    bool SaveToFile(const std::string& filePath) const;
    
    // Value access
    bool HasKey(const std::string& key) const;
    std::string GetString(const std::string& key, const std::string& defaultValue = "") const;
    float GetFloat(const std::string& key, float defaultValue = 0.0f) const;
    bool GetBool(const std::string& key, bool defaultValue = false) const;
    
    // Value setting
    void SetString(const std::string& key, const std::string& value);
    void SetFloat(const std::string& key, float value);
    void SetBool(const std::string& key, bool value);
    
    // Nested object access
    JSONValue GetObject(const std::string& key) const;
    void SetObject(const std::string& key, const JSONValue& value);
    
    // Array access
    std::vector<std::string> GetKeys() const;
    
private:
    class Impl; // PIMPL to hide nlohmann details
    std::unique_ptr<Impl> m_impl;
};

} // namespace PlanetGen::Core::Serialization
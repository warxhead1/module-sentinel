// Test file for namespace parsing
namespace PlanetGen::Rendering {

class BufferFactory {
public:
    BufferFactory();
    ~BufferFactory();
    
    void CreateBuffer();
    static void CreateStandardUniformBuffer();
};

void CreateStandardUniformBuffer() {
    // Implementation
}

} // namespace PlanetGen::Rendering
// Test file for namespace parsing
namespace PlanetGen::Rendering {

class BufferFactory {
public:
    BufferFactory();
    ~BufferFactory();
    
    void CreateBuffer();
    static void CreateStandardUniformBuffer();
};

namespace Internal {
    class Helper {
        void process();
    };
}

} // namespace PlanetGen::Rendering

// Global namespace
class GlobalClass {
    void globalMethod();
};
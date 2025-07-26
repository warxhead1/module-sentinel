// Test file for analyzing struct method AST representation

struct ResourceDesc {
    int width;
    int height;
    
    // Method inside struct
    void ToGeneric() {
        width = 0;
        height = 0;
    }
    
    // Another method with parameters
    int GetArea(int multiplier) const {
        return width * height * multiplier;
    }
    
    // Static method
    static ResourceDesc CreateDefault() {
        return ResourceDesc{1920, 1080};
    }
};

// For comparison, a class with methods
class ImageProcessor {
public:
    void Process() {
        // Do something
    }
    
private:
    int data;
};
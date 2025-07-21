// Test file for multi-level namespace handling
namespace A::B::C {
    class DeepClass {
        void deepMethod();
    };
} // This should exit all three levels: C, B, and A

// Back in global namespace
class GlobalAfterDeep {
    void globalMethod();
};

namespace Single {
    class SingleClass {};
}

// Global again
void globalFunction() {}
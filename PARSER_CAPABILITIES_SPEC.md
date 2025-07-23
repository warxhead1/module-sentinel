# Module Sentinel Parser Capabilities Specification

## Overview

This specification defines the comprehensive requirements for Module Sentinel's multi-language parser system. It serves as both a reference for expected capabilities and a test specification for validating parser coverage.

## Database Schema Reference

### Core Tables
- **`universal_symbols`**: All symbols with rich metadata (signatures, language features)
- **`universal_relationships`**: Calls, inheritance, field access between symbols  
- **`languages`**: Language definitions with proper file extension detection
- **`cpp_features`**: C++-specific features (templates, virtual methods, etc.)

### Symbol Kinds (from UniversalSymbolKind enum)
```typescript
// Types
Class, Interface, Struct, Enum, Union, Typedef, TypeAlias

// Functions  
Function, Method, Constructor, Destructor, Operator, Property

// Variables
Variable, Constant, Parameter, Field

// Modules
Module, Namespace, Package

// Others
Import, Export, Decorator, Annotation, Macro, Label, Unknown
```

### Relationship Types (from UniversalRelationshipType enum)
```typescript
// Inheritance and implementation
Inherits, Implements, Extends

// Usage relationships  
Uses, Calls, References

// Containment
Contains, MemberOf

// Type relationships
TypeOf, Returns, Takes

// Module relationships
Imports, Exports, Depends

// Field access (our recent addition)
Reads, Writes // e.g., reads_field, writes_field

// And many more specialized types...
```

## Symbol Extraction Requirements

### 1. Classes and Structs ✅ (Implemented)
**Current Status**: ✅ Working
- [x] Class/struct declarations with proper `kind` classification
- [x] Member variables as `field` symbols with parent relationships
- [x] Method declarations as `method` symbols  
- [x] Constructor/destructor detection
- [x] Visibility (public/private/protected) - **Needs verification**
- [ ] **Gap**: Template class detection and template parameters
- [ ] **Gap**: Inheritance relationships (base classes)
- [ ] **Gap**: Virtual method detection and override relationships

**Test Requirements**:
```cpp
// Should detect: class TestClass, inherits from BaseClass
// Should detect: public/private sections
// Should detect: virtual methods and overrides
class TestClass : public BaseClass {
public:
    virtual void virtualMethod() override;
    template<typename T> void templateMethod(T param);
private:
    int memberVar;
    static const int staticConst = 42;
};
```

### 2. Functions and Methods ✅ (Partially Implemented)
**Current Status**: ✅ Working, needs enhancement
- [x] Function declarations with complexity calculation
- [x] Parameter detection (basic)
- [x] Return type extraction (basic)
- [ ] **Gap**: Complete parameter list with types and names
- [ ] **Gap**: Template function parameters
- [ ] **Gap**: Function overloading detection
- [ ] **Gap**: Operator overloading
- [ ] **Gap**: Lambda expressions

**Test Requirements**:
```cpp
// Should detect: function signature, parameters, return type, complexity
template<typename T, typename U>
std::unique_ptr<T> complexFunction(const T& param1, U&& param2, 
                                   std::function<bool(T)> predicate = nullptr) {
    // Complex logic for complexity calculation
    if (predicate && predicate(param1)) {
        for (auto& item : collection) {
            if (condition) return std::make_unique<T>(param1);
        }
    }
    return nullptr;
}

// Should detect: operator overloading
Vector3 operator+(const Vector3& other) const;

// Should detect: lambda expressions  
auto lambda = [capture](int param) -> int { return param * 2; };
```

### 3. Variables and Fields ✅ (Implemented)
**Current Status**: ✅ Working well
- [x] Member variables with types and parent relationships
- [x] Local variables (basic)
- [x] Static members
- [x] Const qualifiers
- [ ] **Gap**: Template variable detection
- [ ] **Gap**: Initialization expressions
- [ ] **Gap**: Reference and pointer qualifiers

### 4. Namespaces and Modules ✅ (Implemented) 
**Current Status**: ✅ Working
- [x] Namespace declarations
- [x] C++20 module declarations (`export module`, `import`)
- [x] Nested namespace support
- [ ] **Gap**: Module interface vs implementation distinction
- [ ] **Gap**: Module partition support

### 5. Modern C++ Features (Major Gaps)
**Current Status**: ❌ Major gaps
- [ ] **Gap**: Template specializations and instantiations
- [ ] **Gap**: Concept definitions and constraints
- [ ] **Gap**: Coroutine functions (co_await, co_yield, co_return)
- [ ] **Gap**: Constexpr/consteval functions
- [ ] **Gap**: Requires clauses
- [ ] **Gap**: Structured bindings: `auto [a, b] = tuple;`
- [ ] **Gap**: Range-based for loops with concepts

**Test Requirements**:
```cpp
// Template concepts
template<typename T>
concept Printable = requires(T t) {
    std::cout << t;
};

// Coroutines
std::generator<int> fibonacci() {
    int a = 0, b = 1;
    while (true) {
        co_yield a;
        auto tmp = a + b;
        a = b; b = tmp;
    }
}

// Constexpr functions
constexpr int factorial(int n) {
    return n <= 1 ? 1 : n * factorial(n - 1);
}
```

## Relationship Extraction Requirements

### 1. Function Calls ✅ (Working)
**Current Status**: ✅ Working
- [x] Direct function calls
- [x] Method invocations  
- [ ] **Gap**: Virtual function calls (dynamic dispatch)
- [ ] **Gap**: Template function instantiation
- [ ] **Gap**: Operator calls (operator+, etc.)

### 2. Inheritance Relationships (Major Gap)
**Current Status**: ❌ Major gap
- [ ] **Gap**: Class inheritance (`inherits` relationship)
- [ ] **Gap**: Interface implementation
- [ ] **Gap**: Virtual method overrides
- [ ] **Gap**: Multiple inheritance

**Test Requirements**:
```cpp
// Should create: Derived --inherits--> Base relationship
// Should create: Derived::method --overrides--> Base::method
class Base {
    virtual void method() = 0;
};

class Derived : public Base {
    void method() override { }
};
```

### 3. Field Access ✅ (Recently Implemented)
**Current Status**: ✅ Working well
- [x] Field writes: `object.field = value` → `writes_field` relationship
- [x] Field reads: `value = object.field` → `reads_field` relationship  
- [x] Pointer access: `obj->field`
- [x] Proper field symbol resolution

### 4. Include/Import Relationships ✅ (Working)
**Current Status**: ✅ Working
- [x] `#include` statements → `imports` relationship
- [x] C++20 `import` statements  
- [x] Module dependencies
- [ ] **Gap**: Transitive dependency analysis
- [ ] **Gap**: Cross-language imports (e.g., Python calling C++)

### 5. Template Relationships (Major Gap)
**Current Status**: ❌ Major gap
- [ ] **Gap**: Template instantiation relationships
- [ ] **Gap**: Template specialization
- [ ] **Gap**: Type deduction relationships

## Language Feature Detection

### 1. C++ Language Features
**Current Status**: ❌ Needs major enhancement

#### Templates (High Priority Gap)
- [ ] Template class declarations
- [ ] Template function declarations  
- [ ] Template parameters (type and non-type)
- [ ] Template instantiation detection
- [ ] Template specialization

#### Object-Oriented Features
- [ ] Virtual method detection (`virtual` keyword)
- [ ] Pure virtual methods (`= 0`)
- [ ] Method override detection (`override` keyword)
- [ ] Method hiding vs overriding
- [ ] Multiple inheritance

#### Modern C++ (C++11-C++23)
- [ ] `auto` type deduction
- [ ] Range-based for loops
- [ ] Lambda expressions  
- [ ] Smart pointers (`std::unique_ptr`, etc.)
- [ ] Move semantics (`std::move`, `&&`)
- [ ] Constexpr functions
- [ ] Concepts (C++20)
- [ ] Coroutines (C++20)
- [ ] Modules (C++20)

#### GPU/Parallel Computing Hints
- [ ] CUDA kernel functions (`__global__`, `__device__`)
- [ ] OpenMP pragmas (`#pragma omp`)
- [ ] GPU memory qualifiers

### 2. Python Language Features (Future)
- [ ] Async/await functions
- [ ] Decorators (@decorator)
- [ ] Type hints (typing module)
- [ ] Context managers (with statements)

### 3. TypeScript Features (Future)
- [ ] Generic types and functions
- [ ] Interface declarations
- [ ] Decorators
- [ ] Union and intersection types

## Rich Metadata Requirements

### 1. Function Signatures ✅ (Partially Implemented)
**Current Status**: ✅ Basic working, needs enhancement
- [x] Basic function signatures
- [ ] **Gap**: Complete parameter lists with types and names
- [ ] **Gap**: Template parameters in signatures
- [ ] **Gap**: Const/volatile qualifiers
- [ ] **Gap**: Exception specifications
- [ ] **Gap**: Trailing return types: `auto func() -> int`

**Expected Format**:
```
// Current: ToGeneric()
// Desired: GenericResourceDesc ToGeneric() const
// Desired: template<typename T> std::unique_ptr<T> create(Args&&... args)
```

### 2. Type Information Enhancement
**Current Status**: ❌ Major gaps
- [x] Basic return types
- [ ] **Gap**: Complex template types: `std::vector<std::unique_ptr<T>>`
- [ ] **Gap**: Function pointer types
- [ ] **Gap**: Auto-deduced types
- [ ] **Gap**: Typedef resolution

### 3. Complexity Metrics ✅ (Working)
**Current Status**: ✅ Working
- [x] Basic cyclomatic complexity calculation
- [x] Function body analysis
- [ ] **Enhancement**: More sophisticated complexity metrics
- [ ] **Enhancement**: Cognitive complexity
- [ ] **Enhancement**: Parameter complexity

### 4. Language Features Metadata
**Current Status**: ❌ Major gaps
- [ ] Template metadata (parameters, constraints)
- [ ] Virtual method metadata (pure virtual, override)
- [ ] Constexpr/consteval markers
- [ ] Coroutine metadata (generator, task, etc.)
- [ ] GPU execution markers

## Test Implementation Strategy

### 1. Test File Structure
Create test files that comprehensively cover all features:

```
/workspace/test/parser-capabilities/
├── cpp/
│   ├── modern-cpp-features.cpp      # Templates, concepts, coroutines
│   ├── object-oriented.cpp          # Inheritance, virtual methods
│   ├── field-access.cpp             # Member access patterns
│   └── complex-signatures.cpp       # Function overloading, templates
├── ixx/  
│   ├── modules.ixx                  # C++20 modules
│   └── templates.ixx                # Template specializations
└── expected-results/
    ├── symbols.json                 # Expected symbol counts and types
    ├── relationships.json           # Expected relationship counts
    └── metadata.json                # Expected metadata completeness
```

### 2. Test Categories

#### A. Symbol Extraction Tests
For each symbol kind, verify:
- Symbol is detected and stored
- Correct `kind` classification  
- Proper parent-child relationships
- Complete metadata (signature, type, etc.)

#### B. Relationship Extraction Tests  
For each relationship type, verify:
- Relationship is detected and stored
- Correct source and target symbol resolution
- Proper relationship type classification
- Accurate context information

#### C. Metadata Completeness Tests
- Signature completeness and accuracy
- Type information completeness
- Language feature detection
- Complexity metric accuracy

#### D. Cross-Language Tests
- Multi-language project parsing
- Cross-language relationship resolution
- Language detection accuracy

### 3. Gap Analysis Reporting

The test should generate a comprehensive report:

```json
{
  "summary": {
    "total_symbols_expected": 150,
    "total_symbols_found": 142,
    "coverage_percentage": 94.7,
    "critical_gaps": 3,
    "total_relationships_expected": 89,
    "total_relationships_found": 76,
    "relationship_coverage": 85.4
  },
  "symbol_gaps": [
    {
      "kind": "template_class",
      "expected": 5,
      "found": 0,
      "priority": "high",
      "examples": ["template<typename T> class Vector"]
    }
  ],
  "relationship_gaps": [
    {
      "type": "inherits", 
      "expected": 8,
      "found": 0,
      "priority": "high",
      "examples": ["Derived -> Base inheritance"]
    }
  ],
  "metadata_gaps": [
    {
      "field": "complete_signature",
      "completeness": 60,
      "priority": "medium",
      "issues": ["Missing template parameters", "Missing const qualifiers"]
    }
  ]
}
```

## Success Criteria

1. **95%+ Symbol Coverage**: Detect 95% of expected symbols across all test files
2. **90%+ Relationship Coverage**: Detect 90% of expected relationships
3. **Complete Metadata**: 100% of functions have complete signatures
4. **Language Feature Detection**: All major C++ language features detected
5. **Zero False Positives**: No incorrect symbol classifications
6. **Performance**: Parse 100+ files in under 30 seconds

## Implementation Priority

### Phase 1: Critical Gaps (High Priority)
1. Template class and function detection
2. Inheritance relationship extraction  
3. Virtual method and override relationships
4. Complete function signatures with parameters

### Phase 2: Important Enhancements (Medium Priority)  
1. Modern C++ features (concepts, coroutines)
2. Enhanced complexity metrics
3. Better type information extraction
4. Cross-language relationship resolution

### Phase 3: Advanced Features (Low Priority)
1. Advanced pattern detection
2. Performance optimizations  
3. Additional language support
4. Real-time incremental parsing
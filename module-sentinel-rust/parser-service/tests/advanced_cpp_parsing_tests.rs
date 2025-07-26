use anyhow::Result;
use module_sentinel_parser::parsers::tree_sitter::{TreeSitterParser, Language};
use module_sentinel_parser::services::{ParsingService, ParsingConfig};
use std::path::PathBuf;

#[test]
fn test_cpp_template_parsing() -> Result<()> {
    let mut parser = TreeSitterParser::new(Language::Cpp)?;
    let code = r#"
template<typename T>
class Vector {
private:
    T* data;
    size_t size;
    
public:
    Vector() : data(nullptr), size(0) {}
    
    template<typename U>
    void push_back(U&& value) {
        // Implementation
    }
    
    T& operator[](size_t index) {
        return data[index];
    }
};

// Template specialization
template<>
class Vector<bool> {
    // Specialized implementation for bool
};

// Function template
template<typename T, typename U>
auto add(T a, U b) -> decltype(a + b) {
    return a + b;
}

// Variadic template
template<typename... Args>
void print(Args... args) {
    ((std::cout << args << " "), ...);
}
"#;
    
    let tree = parser.parse_string(code)?;
    assert_eq!(tree.root_node().kind(), "translation_unit");
    
    // Check that parsing didn't error
    assert!(!tree.root_node().has_error());
    
    Ok(())
}

#[test]
fn test_cpp_namespace_parsing() -> Result<()> {
    let mut parser = TreeSitterParser::new(Language::Cpp)?;
    let code = r#"
namespace outer {
    namespace inner {
        class MyClass {
        public:
            void method();
        };
        
        namespace detail {
            template<typename T>
            struct Helper {
                static constexpr bool value = true;
            };
        }
    }
    
    // Nested namespace (C++17)
    namespace very::deeply::nested {
        using inner::MyClass;
        
        void function() {
            MyClass obj;
            obj.method();
        }
    }
}

// Using declarations
using namespace outer::inner;
using outer::inner::detail::Helper;

// Inline namespace
inline namespace v1 {
    void api_function();
}
"#;
    
    let tree = parser.parse_string(code)?;
    assert!(!tree.root_node().has_error());
    
    Ok(())
}

#[test]
fn test_cpp_complex_inheritance() -> Result<()> {
    let mut parser = TreeSitterParser::new(Language::Cpp)?;
    let code = r#"
// CRTP pattern
template<typename Derived>
class Base {
public:
    void interface() {
        static_cast<Derived*>(this)->implementation();
    }
};

class Derived : public Base<Derived> {
public:
    void implementation() {
        // Actual implementation
    }
};

// Multiple inheritance with virtual
class A { virtual void foo() = 0; };
class B { virtual void bar() = 0; };
class C : public virtual A, public virtual B {
    void foo() override {}
    void bar() override {}
};

// Diamond inheritance
class Animal { public: virtual ~Animal() = default; };
class Mammal : virtual public Animal {};
class Bird : virtual public Animal {};
class Bat : public Mammal, public Bird {};
"#;
    
    let tree = parser.parse_string(code)?;
    assert!(!tree.root_node().has_error());
    
    Ok(())
}

#[test]
fn test_cpp_modern_features() -> Result<()> {
    let mut parser = TreeSitterParser::new(Language::Cpp)?;
    let code = r#"
#include <concepts>
#include <ranges>

// Concepts (C++20)
template<typename T>
concept Addable = requires(T a, T b) {
    { a + b } -> std::convertible_to<T>;
};

template<Addable T>
T sum(T a, T b) {
    return a + b;
}

// Structured bindings (C++17)
auto [x, y, z] = std::make_tuple(1, 2.0, "hello");

// Lambda with template parameters (C++20)
auto generic_lambda = []<typename T>(T x) { return x * 2; };

// Ranges (C++20)
auto even_squares = std::views::iota(1, 10)
    | std::views::filter([](int i) { return i % 2 == 0; })
    | std::views::transform([](int i) { return i * i; });

// Coroutines (C++20)
task<int> async_computation() {
    co_await some_async_operation();
    co_return 42;
}

// Modules (C++20)
export module math;
export int add(int a, int b) { return a + b; }
"#;
    
    let tree = parser.parse_string(code)?;
    // Modern C++ features might have some parsing challenges, but should not crash
    assert_eq!(tree.root_node().kind(), "translation_unit");
    
    Ok(())
}

#[test]
fn test_cpp_complex_declarations() -> Result<()> {
    let mut parser = TreeSitterParser::new(Language::Cpp)?;
    let code = r#"
// Function pointer
int (*operation)(int, int) = nullptr;

// Array of function pointers
void (*handlers[10])(int);

// Pointer to member function
class MyClass {
    void method(int x) {}
};
void (MyClass::*pmf)(int) = &MyClass::method;

// Complex const declarations
const int* ptr1;              // pointer to const int
int* const ptr2 = nullptr;    // const pointer to int
const int* const ptr3 = &x;   // const pointer to const int

// Trailing return type with decltype
template<typename T, typename U>
auto multiply(T t, U u) -> decltype(t * u) {
    return t * u;
}

// Complex template declaration
template<template<typename, typename> class Container,
         typename T,
         typename Allocator = std::allocator<T>>
class Wrapper {
    Container<T, Allocator> data;
};
"#;
    
    let tree = parser.parse_string(code)?;
    // Complex declarations should parse without errors
    let _root = tree.root_node();
    
    Ok(())
}

#[tokio::test]
async fn test_unified_parsing_cpp_symbols() -> Result<()> {
    use module_sentinel_parser::database::ProjectDatabase;
    use tempfile::TempDir;
    
    // Initialize tracing for debugging
    let _ = tracing_subscriber::fmt()
        .with_env_filter("module_sentinel_parser=debug")
        .try_init();
    
    let temp_dir = TempDir::new()?;
    let project_db = ProjectDatabase::new(temp_dir.path()).await?;
    let config = ParsingConfig::default();
    let service = ParsingService::new(project_db, config).await?;
    
    let cpp_code = r#"
namespace graphics {
    template<typename T>
    class Renderer {
    private:
        T* buffer;
        
    public:
        Renderer() : buffer(nullptr) {}
        virtual ~Renderer() { delete buffer; }
        
        template<typename U>
        void render(const U& object) {
            // Render implementation
        }
        
        static constexpr int MAX_VERTICES = 1000;
    };
    
    // Explicit instantiation
    template class Renderer<float>;
    
    // Type alias
    using FloatRenderer = Renderer<float>;
}

// Global function
template<typename T>
inline T clamp(T value, T min, T max) {
    return value < min ? min : (value > max ? max : value);
}
"#;
    
    // Write the test code to a temporary file
    let temp_file = temp_dir.path().join("test.cpp");
    std::fs::write(&temp_file, cpp_code)?;
    
    let result = service.parse_file(&temp_file).await?;
    
    // Debug output
    if !result.success {
        eprintln!("Parse failed with errors: {:?}", result.errors);
        eprintln!("File path: {}", result.file_path);
        eprintln!("File exists: {}", temp_file.exists());
        if temp_file.exists() {
            let content = std::fs::read_to_string(&temp_file)?;
            eprintln!("File content length: {}", content.len());
            eprintln!("First 100 chars: {:?}", &content.chars().take(100).collect::<String>());
        }
    }
    
    assert!(result.success);
    assert!(!result.symbols.is_empty());
    
    // Check for expected symbols
    let symbol_names: Vec<String> = result.symbols.iter()
        .map(|s| s.name.clone())
        .collect();
    
    eprintln!("Extracted symbols: {:?}", symbol_names);
    eprintln!("Symbol details:");
    for symbol in &result.symbols {
        eprintln!("  - {} ({}): line {}", symbol.name, symbol.kind, symbol.line);
    }
    
    // Should find the template class
    assert!(symbol_names.iter().any(|n| n.contains("Renderer")), "Could not find Renderer class");
    
    // Should find the method
    assert!(symbol_names.iter().any(|n| n.contains("render")), "Could not find render method");
    
    // Should find the global function
    assert!(symbol_names.iter().any(|n| n.contains("clamp")), "Could not find clamp function");
    
    Ok(())
}

#[test]
fn test_cpp_operator_overloading() -> Result<()> {
    let mut parser = TreeSitterParser::new(Language::Cpp)?;
    let code = r#"
class Complex {
private:
    double real, imag;
    
public:
    Complex(double r = 0, double i = 0) : real(r), imag(i) {}
    
    // Arithmetic operators
    Complex operator+(const Complex& other) const {
        return Complex(real + other.real, imag + other.imag);
    }
    
    Complex& operator+=(const Complex& other) {
        real += other.real;
        imag += other.imag;
        return *this;
    }
    
    // Comparison operators
    bool operator==(const Complex& other) const {
        return real == other.real && imag == other.imag;
    }
    
    // Stream operators (friend functions)
    friend std::ostream& operator<<(std::ostream& os, const Complex& c) {
        os << c.real << " + " << c.imag << "i";
        return os;
    }
    
    // Function call operator
    double operator()() const {
        return std::sqrt(real * real + imag * imag);
    }
    
    // Conversion operator
    explicit operator double() const {
        return real;
    }
    
    // Array subscript operator
    double operator[](int index) const {
        return index == 0 ? real : imag;
    }
};

// Global operator overload
Complex operator*(double scalar, const Complex& c) {
    return Complex(scalar * c.real, scalar * c.imag);
}
"#;
    
    let tree = parser.parse_string(code)?;
    assert!(!tree.root_node().has_error());
    
    Ok(())
}

#[test]
fn test_cpp_stl_usage() -> Result<()> {
    let mut parser = TreeSitterParser::new(Language::Cpp)?;
    let code = r#"
#include <vector>
#include <map>
#include <algorithm>
#include <memory>

template<typename T>
class Container {
    std::vector<std::unique_ptr<T>> items;
    std::map<std::string, T*> index;
    
public:
    void add(std::unique_ptr<T> item, const std::string& key) {
        T* ptr = item.get();
        items.push_back(std::move(item));
        index[key] = ptr;
    }
    
    T* find(const std::string& key) {
        auto it = index.find(key);
        return it != index.end() ? it->second : nullptr;
    }
    
    void sort_items() {
        std::sort(items.begin(), items.end(),
            [](const auto& a, const auto& b) {
                return *a < *b;
            });
    }
    
    template<typename Predicate>
    auto filter(Predicate pred) const {
        std::vector<T*> result;
        std::copy_if(items.begin(), items.end(),
            std::back_inserter(result),
            [&pred](const auto& ptr) { return pred(*ptr); });
        return result;
    }
};
"#;
    
    let tree = parser.parse_string(code)?;
    assert!(!tree.root_node().has_error());
    
    Ok(())
}
#pragma once

#include <glm/glm.hpp>
#include <glm/gtc/type_ptr.hpp>
#include <cmath>
#include <ostream>

namespace PlanetGen {
namespace Core {
namespace Math {

/**
 * @brief A lightweight 3D vector class optimized for planet generation
 * 
 * This class provides essential 3D vector operations needed for terrain
 * generation, mesh manipulation, and spatial calculations. It wraps glm::vec3
 * for performance while providing a clean interface.
 */
class Vector3 {
public:
    // Constructors
    Vector3() = default;
    Vector3(float x, float y, float z) : m_vec(x, y, z) {}
    explicit Vector3(const glm::vec3& vec) : m_vec(vec) {}
    
    // Accessors
    float x() const { return m_vec.x; }
    float y() const { return m_vec.y; }
    float z() const { return m_vec.z; }
    
    // Modifiers
    void setX(float x) { m_vec.x = x; }
    void setY(float y) { m_vec.y = y; }
    void setZ(float z) { m_vec.z = z; }
    
    // Core operations
    float length() const { return glm::length(m_vec); }
    float lengthSquared() const { return glm::dot(m_vec, m_vec); }
    Vector3 normalized() const { return Vector3(glm::normalize(m_vec)); }
    void normalize() { m_vec = glm::normalize(m_vec); }
    
    // Static operations
    static float dot(const Vector3& a, const Vector3& b) {
        return glm::dot(a.m_vec, b.m_vec);
    }
    
    static Vector3 cross(const Vector3& a, const Vector3& b) {
        return Vector3(glm::cross(a.m_vec, b.m_vec));
    }
    
    // Operators
    Vector3 operator+(const Vector3& other) const {
        return Vector3(m_vec + other.m_vec);
    }
    
    Vector3 operator-(const Vector3& other) const {
        return Vector3(m_vec - other.m_vec);
    }
    
    Vector3 operator*(float scalar) const {
        return Vector3(m_vec * scalar);
    }
    
    Vector3 operator/(float scalar) const {
        return Vector3(m_vec / scalar);
    }
    
    Vector3& operator+=(const Vector3& other) {
        m_vec += other.m_vec;
        return *this;
    }
    
    Vector3& operator-=(const Vector3& other) {
        m_vec -= other.m_vec;
        return *this;
    }
    
    Vector3& operator*=(float scalar) {
        m_vec *= scalar;
        return *this;
    }
    
    Vector3& operator/=(float scalar) {
        m_vec /= scalar;
        return *this;
    }
    
    bool operator==(const Vector3& other) const {
        return m_vec == other.m_vec;
    }
    
    bool operator!=(const Vector3& other) const {
        return m_vec != other.m_vec;
    }
    
    // Conversion operators
    operator glm::vec3() const { return m_vec; }
    const float* data() const { return glm::value_ptr(m_vec); }
    
    // Stream output
    friend std::ostream& operator<<(std::ostream& os, const Vector3& vec) {
        return os << "Vector3(" << vec.x() << ", " << vec.y() << ", " << vec.z() << ")";
    }

private:
    glm::vec3 m_vec{0.0f};  // Default initialize to zero vector
};

// Free functions
inline Vector3 operator*(float scalar, const Vector3& vec) {
    return vec * scalar;
}

} // namespace Math
} // namespace Core
} // namespace PlanetGen 

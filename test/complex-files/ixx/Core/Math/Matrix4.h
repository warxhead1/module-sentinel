#pragma once

#include "Core/Math/Vector3.h"
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>
#include <array>
#include <ostream>

namespace PlanetGen {
namespace Core {
namespace Math {

/**
 * @brief A 4x4 matrix class optimized for planet generation transformations
 * 
 * This class provides essential matrix operations needed for:
 * - Coordinate transformations
 * - Camera/view matrices
 * - Model transformations
 * - Projection matrices
 * 
 * It wraps glm::mat4 for performance while providing a clean interface.
 */
class Matrix4 {
public:
    // Constructors
    Matrix4() = default;
    explicit Matrix4(const glm::mat4& mat) : m_mat(mat) {}
    
    // Static factory methods for common transformations
    static Matrix4 identity() {
        return Matrix4(glm::mat4(1.0f));
    }
    
    static Matrix4 translation(const Vector3& translation) {
        return Matrix4(glm::translate(glm::mat4(1.0f), glm::vec3(translation)));
    }
    
    static Matrix4 rotation(float angle, const Vector3& axis) {
        return Matrix4(glm::rotate(glm::mat4(1.0f), angle, glm::vec3(axis)));
    }
    
    static Matrix4 scale(const Vector3& scale) {
        return Matrix4(glm::scale(glm::mat4(1.0f), glm::vec3(scale)));
    }
    
    static Matrix4 perspective(float fov, float aspect, float near, float far) {
        return Matrix4(glm::perspective(fov, aspect, near, far));
    }
    
    static Matrix4 orthographic(float left, float right, float bottom, float top, float near, float far) {
        return Matrix4(glm::ortho(left, right, bottom, top, near, far));
    }
    
    static Matrix4 lookAt(const Vector3& eye, const Vector3& center, const Vector3& up) {
        return Matrix4(glm::lookAt(
            glm::vec3(eye),
            glm::vec3(center),
            glm::vec3(up)
        ));
    }
    
    // Core operations
    Matrix4 transpose() const {
        return Matrix4(glm::transpose(m_mat));
    }
    
    Matrix4 inverse() const {
        return Matrix4(glm::inverse(m_mat));
    }
    
    float determinant() const {
        return glm::determinant(m_mat);
    }
    
    // Matrix multiplication
    Matrix4 operator*(const Matrix4& other) const {
        return Matrix4(m_mat * other.m_mat);
    }
    
    Vector3 operator*(const Vector3& vec) const {
        glm::vec4 result = m_mat * glm::vec4(glm::vec3(vec), 1.0f);
        return Vector3(result.x, result.y, result.z);
    }
    
    // Component-wise operations
    Matrix4& operator*=(float scalar) {
        m_mat *= scalar;
        return *this;
    }
    
    Matrix4& operator/=(float scalar) {
        m_mat /= scalar;
        return *this;
    }
    
    // Comparison
    bool operator==(const Matrix4& other) const {
        return m_mat == other.m_mat;
    }
    
    bool operator!=(const Matrix4& other) const {
        return m_mat != other.m_mat;
    }
    
    // Accessors
    float operator()(int row, int col) const {
        return m_mat[col][row];  // GLM is column-major
    }
    
    float& operator()(int row, int col) {
        return m_mat[col][row];  // GLM is column-major
    }
    
    // Conversion operators
    operator glm::mat4() const { return m_mat; }
    const float* data() const { return glm::value_ptr(m_mat); }
    
    // Stream output
    friend std::ostream& operator<<(std::ostream& os, const Matrix4& mat) {
        os << "Matrix4(\n";
        for (int row = 0; row < 4; ++row) {
            os << "  ";
            for (int col = 0; col < 4; ++col) {
                os << mat(row, col);
                if (col < 3) os << ", ";
            }
            if (row < 3) os << "\n";
        }
        os << "\n)";
        return os;
    }

private:
    glm::mat4 m_mat{1.0f};  // Default initialize to identity matrix
};

// Free functions
inline Matrix4 operator*(float scalar, const Matrix4& mat) {
    return Matrix4(scalar * glm::mat4(mat));
}

} // namespace Math
} // namespace Core
} // namespace PlanetGen 

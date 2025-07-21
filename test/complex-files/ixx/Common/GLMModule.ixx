module;

// Force rebuild with C++20 - timestamp: 20250105
// Enable experimental GLM features
#define GLM_ENABLE_EXPERIMENTAL

// Include all GLM headers we need
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>
#include <glm/gtx/quaternion.hpp>
#include <glm/gtx/transform.hpp>
#include <glm/gtx/euler_angles.hpp>
#include <glm/gtc/constants.hpp>
#include <glm/exponential.hpp>

export module GLMModule;

// Export the entire glm namespace for broader compatibility
export namespace glm {}

// Explicitly export GLM types we use
// export using glm::vec2;
// export using glm::vec3;
// export using glm::vec4;
// export using glm::ivec2;
// export using glm::ivec3;
// export using glm::ivec4;
// export using glm::uvec2;
// export using glm::uvec3;
// export using glm::uvec4;
// export using glm::dvec3;
// export using glm::dvec4;
// export using glm::mat3;
// export using glm::mat4;
// export using glm::quat;

// For GCC compatibility - also export types in global namespace
export {
    using vec2 = glm::vec2;
    using vec3 = glm::vec3;
    using vec4 = glm::vec4;
    using ivec2 = glm::ivec2;
    using ivec3 = glm::ivec3;
    using ivec4 = glm::ivec4;
    using uvec2 = glm::uvec2;
    using uvec3 = glm::uvec3;
    using uvec4 = glm::uvec4;
    using dvec3 = glm::dvec3;
    using dvec4 = glm::dvec4;
    using mat3 = glm::mat3;
    using mat4 = glm::mat4;
    using quat = glm::quat;
}
// Provide operator< for glm::vec3 to enable use with std::min/std::max and STL algorithms
namespace glm {
    inline bool operator<(const glm::vec3& a, const glm::vec3& b) noexcept {
        if (a.x != b.x) return a.x < b.x;
        if (a.y != b.y) return a.y < b.y;
        return a.z < b.z;
    }
}

// Export common GLM functions
using glm::dot;
using glm::cross;
using glm::normalize;
using glm::length;
using glm::min;
using glm::max;
using glm::mix;
using glm::radians;
using glm::degrees;
using glm::lookAt;
using glm::perspective;
using glm::rotate;
using glm::translate;
using glm::scale;
using glm::ortho;
using glm::transpose;
using glm::inverse;
using glm::yawPitchRoll;
using glm::exp;
using glm::clamp;
// Export vector arithmetic operators
using glm::operator+;
using glm::operator-;
using glm::operator*;
using glm::operator/;

// For GCC compatibility - also export functions in global namespace
export {
    using glm::dot;
    using glm::cross;
    using glm::normalize;
    using glm::length;
    using glm::min;
    using glm::max;
    using glm::mix;
    using glm::radians;
    using glm::degrees;
    using glm::lookAt;
    using glm::perspective;
    using glm::rotate;
    using glm::translate;
    using glm::scale;
    using glm::ortho;
    using glm::transpose;
    using glm::inverse;
    using glm::yawPitchRoll;
    using glm::exp;
    using glm::clamp;
    // Operators
    using glm::operator+;
    using glm::operator-;
    using glm::operator*;
    using glm::operator/;
}

// Common GLM operations we use frequently
export namespace GLMUtils
{
  // Convert degrees to radians
  inline float ToRadians(float degrees) { return glm::radians(degrees); }

  // Convert radians to degrees
  inline float ToDegrees(float radians) { return glm::degrees(radians); }

  // Vector arithmetic convenience functions
  inline vec3 Add(const vec3 &a, const vec3 &b) { return a + b; }
  inline vec3 Subtract(const vec3 &a, const vec3 &b) { return a - b; }
  inline vec3 Multiply(const vec3 &a, float scalar) { return a * scalar; }
  inline vec3 Divide(const vec3 &a, float scalar) { return a / scalar; }
  inline mat4 Scale(const mat4& m, const vec3& v) { return glm::scale(m, v); }

  // Create a look-at matrix
  inline mat4 LookAt(const vec3 &eye, const vec3 &center, const vec3 &up)
  {
    return glm::lookAt(eye, center, up);
  }

  // Create a perspective matrix
  inline mat4 Perspective(float fovy, float aspect, float near, float far)
  {
    return glm::perspective(fovy, aspect, near, far);
  }

  // Create a rotation matrix from euler angles (in degrees)
  inline mat4 Rotation(float x, float y, float z)
  {
    return glm::rotate(mat4(1.0f), ToRadians(x), vec3(1, 0, 0)) *
           glm::rotate(mat4(1.0f), ToRadians(y), vec3(0, 1, 0)) *
           glm::rotate(mat4(1.0f), ToRadians(z), vec3(0, 0, 1));
  }

  // Component-wise exponential for vec3
  inline vec3 Exp(const vec3& v) {
    return vec3(std::exp(v.x), std::exp(v.y), std::exp(v.z));
  }

  // Component-wise clamp for vec3  
  inline vec3 Clamp(const vec3& v, float minVal, float maxVal) {
    auto clampValue = [](float val, float min, float max) { return (val < min) ? min : (val > max) ? max : val; };
    return vec3(clampValue(v.x, minVal, maxVal), clampValue(v.y, minVal, maxVal), clampValue(v.z, minVal, maxVal));
  }
} // namespace GLMUtils
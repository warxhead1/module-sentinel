#pragma once

#include "Core/Math/Vector3.h"
#include <glm/glm.hpp>
#include <cmath>
#include <random>
#include <type_traits>

namespace PlanetGen {
namespace Core {
namespace Math {

/**
 * @brief Mathematical utilities for planet generation
 * 
 * This namespace provides essential mathematical functions needed for:
 * - Interpolation and smoothing
 * - Spherical coordinate conversions
 * - Random number generation
 * - Noise utilities
 * - Common mathematical operations
 */
namespace MathUtils {

// Constants
constexpr float PI = glm::pi<float>();
constexpr float TWO_PI = 2.0f * PI;
constexpr float HALF_PI = PI / 2.0f;
constexpr float DEG_TO_RAD = PI / 180.0f;
constexpr float RAD_TO_DEG = 180.0f / PI;

// Interpolation functions
template<typename T>
T lerp(T a, T b, float t) {
    return a + (b - a) * t;
}

template<typename T>
T smoothstep(T edge0, T edge1, T x) {
    T t = glm::clamp((x - edge0) / (edge1 - edge0), T(0), T(1));
    return t * t * (T(3) - T(2) * t);
}

// Spherical coordinate conversions
struct SphericalCoords {
    float radius;    // Distance from origin
    float theta;     // Azimuthal angle (longitude) in radians [0, 2π]
    float phi;       // Polar angle (latitude) in radians [0, π]
};

inline Vector3 sphericalToCartesian(const SphericalCoords& coords) {
    float sinPhi = std::sin(coords.phi);
    return Vector3(
        coords.radius * sinPhi * std::cos(coords.theta),
        coords.radius * std::cos(coords.phi),
        coords.radius * sinPhi * std::sin(coords.theta)
    );
}

inline SphericalCoords cartesianToSpherical(const Vector3& vec) {
    float radius = vec.length();
    if (radius < 1e-6f) {
        return {0.0f, 0.0f, 0.0f};
    }
    
    float theta = std::atan2(vec.z(), vec.x());
    float phi = std::acos(vec.y() / radius);
    
    return {radius, theta, phi};
}

// Random number generation
class Random {
public:
    explicit Random(uint32_t seed = std::random_device{}()) 
        : m_engine(seed) {}
    
    void setSeed(uint32_t seed) {
        m_engine.seed(seed);
    }
    
    // Generate random float in [0, 1)
    float nextFloat() {
        return std::uniform_real_distribution<float>(0.0f, 1.0f)(m_engine);
    }
    
    // Generate random float in [min, max)
    float nextFloat(float min, float max) {
        return std::uniform_real_distribution<float>(min, max)(m_engine);
    }
    
    // Generate random int in [min, max]
    int nextInt(int min, int max) {
        return std::uniform_int_distribution<int>(min, max)(m_engine);
    }
    
    // Generate random point on unit sphere
    Vector3 nextPointOnSphere() {
        float theta = nextFloat(0.0f, TWO_PI);
        float phi = std::acos(nextFloat(-1.0f, 1.0f));
        return sphericalToCartesian({1.0f, theta, phi});
    }
    
    // Generate random point in unit sphere
    Vector3 nextPointInSphere() {
        float radius = std::cbrt(nextFloat());  // Cube root for uniform distribution
        return nextPointOnSphere() * radius;
    }

private:
    std::mt19937 m_engine;
};

// Noise utilities
inline float fade(float t) {
    return t * t * t * (t * (t * 6.0f - 15.0f) + 10.0f);
}

inline float grad(int hash, float x, float y, float z) {
    // Convert lower 4 bits of hash code into 12 gradient directions
    int h = hash & 15;
    float u = h < 8 ? x : y;
    float v = h < 4 ? y : h == 12 || h == 14 ? x : z;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}

// Common mathematical operations
template<typename T>
T clamp(T value, T min, T max) {
    return glm::clamp(value, min, max);
}

template<typename T>
T saturate(T value) {
    return clamp(value, T(0), T(1));
}

// Fast approximations
inline float fastInvSqrt(float x) {
    // Quake III's fast inverse square root
    float xhalf = 0.5f * x;
    int i = *reinterpret_cast<int*>(&x);
    i = 0x5f3759df - (i >> 1);
    x = *reinterpret_cast<float*>(&i);
    x = x * (1.5f - xhalf * x * x);
    return x;
}

// Spherical harmonics basis functions (useful for atmospheric scattering)
float sphericalHarmonicY00(const Vector3& dir);
float sphericalHarmonicY1m1(const Vector3& dir);
float sphericalHarmonicY10(const Vector3& dir);
float sphericalHarmonicY11(const Vector3& dir);

} // namespace MathUtils
} // namespace Math
} // namespace Core
} // namespace PlanetGen 

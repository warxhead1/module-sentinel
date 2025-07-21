module;

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#include <vector>
#include <functional>
#include <cmath>
#include <algorithm>
#include <string>
#include <utility>

export module PlanetaryModalityProcessor;

import GenerationTypes;
import GLMModule;

export namespace PlanetGen::Generation {

struct GridUtils {
    // Iterate over a 2D grid and apply a function (row-major)
    static void ForEach(uint32_t width, uint32_t height, const std::function<void(uint32_t, uint32_t)>& fn) {
        for (uint32_t y = 0; y < height; ++y)
            for (uint32_t x = 0; x < width; ++x)
                fn(x, y);
    }

    // Apply a stencil to each cell (neighborhood operation)
    template<typename T, typename F>
    static void ApplyStencil(const std::vector<T>& data, uint32_t width, uint32_t height, F&& fn) {
        for (uint32_t y = 1; y < height - 1; ++y)
            for (uint32_t x = 1; x < width - 1; ++x)
                fn(x, y, [&](int dx, int dy) {
                    return data[(y + dy) * width + (x + dx)];
                });
    }
};

struct CoordinateUtils {
    static std::pair<float, float> IndexToLatLon(uint32_t x, uint32_t y, uint32_t width, uint32_t height) {
        // FIXED: Proper coordinate mapping for seamless sphere wrapping
        
        // Latitude: Linear mapping from -90 to +90 (centered on pixels)
        float lat = -90.0f + 180.0f * (static_cast<float>(y) + 0.5f) / static_cast<float>(height);
        
        // Longitude: Linear mapping from -180 to +180
        float lon = -180.0f + 360.0f * static_cast<float>(x) / static_cast<float>(width);
        
        // Only clamp latitude to avoid exact poles (which cause singularities)
        lat = std::max(-89.99f, std::min(89.99f, lat));
        
        return {lat, lon};
    }
    
    // Convert lat/lon/height to 3D spherical coordinates
    static void LatLonToSphere(float lat, float lon, float height, float radius, float& outX, float& outY, float& outZ) {
        float latRad = lat * M_PI / 180.0f;
        float lonRad = lon * M_PI / 180.0f;
        float r = radius + height;
        float cosLat = std::cos(latRad);
        outX = r * cosLat * std::cos(lonRad);
        outY = r * std::sin(latRad);
        outZ = r * cosLat * std::sin(lonRad);
    }
    
    // FIXED: Improved spherical conversion with proper edge case handling
    static vec3 LatLonToSphere(float lat, float lon, float height, float radius) {
        // Clamp inputs to valid ranges
        lat = std::max(-90.0f, std::min(90.0f, lat));
        
        // Normalize longitude to [-180, 180] range
        while (lon > 180.0f) lon -= 360.0f;
        while (lon < -180.0f) lon += 360.0f;
        
        float latRad = lat * M_PI / 180.0f;
        float lonRad = lon * M_PI / 180.0f;
        
        float r = radius + height;
        float cosLat = std::cos(latRad);
        
        // Handle pole singularities - at poles, longitude becomes irrelevant
        if (std::abs(lat) > 89.9f) {
            float poleSign = (lat > 0.0f) ? 1.0f : -1.0f;
            return vec3(0.0f, r * poleSign, 0.0f);
        }
        
        return vec3(
            r * cosLat * std::cos(lonRad),
            r * std::sin(latRad),
            r * cosLat * std::sin(lonRad)
        );
    }
    
    // Generate equal-area spherical grid
    static std::vector<std::pair<float, float>> GenerateSphericalGrid(uint32_t resolution) {
        std::vector<std::pair<float, float>> grid;
        grid.reserve(resolution * resolution);
        
        for (uint32_t y = 0; y < resolution; ++y) {
            // Latitude from -90 to +90 degrees
            float lat = -90.0f + 180.0f * (static_cast<float>(y) + 0.5f) / resolution;
            
            // Equal-area approach: adjust longitude steps based on latitude
            float cosLat = std::cos(lat * M_PI / 180.0f);
            uint32_t lonSteps = std::max(1u, static_cast<uint32_t>(resolution * cosLat));
            
            for (uint32_t x = 0; x < lonSteps; ++x) {
                float lon = -180.0f + 360.0f * (static_cast<float>(x) + 0.5f) / lonSteps;
                grid.emplace_back(lat, lon);
            }
        }
        
        return grid;
    }
    
    // FIXED: Generate improved spherical grid with better pole handling
    static std::vector<std::pair<float, float>> GenerateUniformSphericalGrid(uint32_t resolution) {
        std::vector<std::pair<float, float>> grid;
        grid.reserve(resolution * resolution);
        
        for (uint32_t y = 0; y < resolution; ++y) {
            for (uint32_t x = 0; x < resolution; ++x) {
                auto latlon = IndexToLatLon(x, y, resolution, resolution);
                
                // Simple, safe coordinate mapping - no jitter to avoid edge cases
                float lat = latlon.first;
                float lon = latlon.second;
                
                grid.emplace_back(lat, lon);
            }
        }
        
        return grid;
    }
};

struct PlanetaryModalityProcessor {
    // Normalize modality data to [0, 1]
    static void Normalize(std::vector<float>& data, float& minValue, float& maxValue) {
        if (data.empty()) return;
        auto minMax = std::minmax_element(data.begin(), data.end());
        minValue = *minMax.first;
        maxValue = *minMax.second;
        if (maxValue > minValue) {
            for (auto& v : data)
                v = (v - minValue) / (maxValue - minValue);
            minValue = 0.0f;
            maxValue = 1.0f;
        }
    }

    // Scale modality data to [newMin, newMax]
    static void Scale(std::vector<float>& data, float newMin, float newMax, float& minValue, float& maxValue) {
        Normalize(data, minValue, maxValue);
        for (auto& v : data)
            v = newMin + v * (newMax - newMin);
        minValue = newMin;
        maxValue = newMax;
    }

    // Generic transformation: input → output via lambda
    static void Transform(const std::vector<float>& input, std::vector<float>& output, std::function<float(float)> fn) {
        output.resize(input.size());
        for (size_t i = 0; i < input.size(); ++i)
            output[i] = fn(input[i]);
    }

    // Multi-input transformation (e.g., vegetation from temp, precip, elev)
    static void TransformMulti(const std::vector<std::vector<float>>& inputs, std::vector<float>& output, std::function<float(const std::vector<float>&)> fn) {
        if (inputs.empty()) return;
        size_t N = inputs[0].size();
        output.resize(N);
        for (size_t i = 0; i < N; ++i) {
            std::vector<float> vals;
            for (const auto& in : inputs) vals.push_back(in[i]);
            output[i] = fn(vals);
        }
    }
};

} // namespace PlanetGen::Generation
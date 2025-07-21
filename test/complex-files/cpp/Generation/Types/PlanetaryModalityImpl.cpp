module;

#include <algorithm>
#include <cmath>

module GenerationTypes;

namespace PlanetGen::Generation {

void PlanetaryModality::normalize() {
    if (data.empty()) return;
    
    float currentMin = *std::min_element(data.begin(), data.end());
    float currentMax = *std::max_element(data.begin(), data.end());
    float range = currentMax - currentMin;
    
    if (range > 0.0f) {
        for (auto& value : data) {
            value = (value - currentMin) / range;
        }
    }
    
    minValue = 0.0f;
    maxValue = 1.0f;
}

void PlanetaryModality::scale(float newMin, float newMax) {
    if (data.empty()) return;
    
    // First normalize to 0-1
    normalize();
    
    // Then scale to new range
    float range = newMax - newMin;
    for (auto& value : data) {
        value = value * range + newMin;
    }
    
    minValue = newMin;
    maxValue = newMax;
}

float PlanetaryModality::sample(float x, float y) const {
    if (data.empty() || width == 0 || height == 0) return 0.0f;
    
    // Convert normalized coordinates (0-1) to pixel coordinates
    float px = x * static_cast<float>(width - 1);
    float py = y * static_cast<float>(height - 1);
    
    // Clamp coordinates to valid range
    px = std::max(0.0f, std::min(static_cast<float>(width - 1), px));
    py = std::max(0.0f, std::min(static_cast<float>(height - 1), py));
    
    // Get integer coordinates
    uint32_t x0 = static_cast<uint32_t>(px);
    uint32_t y0 = static_cast<uint32_t>(py);
    uint32_t x1 = std::min(x0 + 1, width - 1);
    uint32_t y1 = std::min(y0 + 1, height - 1);
    
    // Get fractional parts
    float fx = px - static_cast<float>(x0);
    float fy = py - static_cast<float>(y0);
    
    // Sample the four corners
    float val00 = data[y0 * width + x0];
    float val10 = data[y0 * width + x1];
    float val01 = data[y1 * width + x0];
    float val11 = data[y1 * width + x1];
    
    // Bilinear interpolation
    float val0 = val00 * (1.0f - fx) + val10 * fx;
    float val1 = val01 * (1.0f - fx) + val11 * fx;
    return val0 * (1.0f - fy) + val1 * fy;
}

} // namespace PlanetGen::Generation
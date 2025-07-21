module;

#include <numeric>
#include <algorithm>
#include <cmath>
#include <vector>

module ITerrainMetric;

import AnalysisTypes;

namespace PlanetGen::Generation::Analysis {

float TerrainMetricBase::CalculateVariance(const std::vector<float>& data) {
    if (data.empty()) return 0.0f;
    
    const float mean = CalculateMean(data);
    float variance = 0.0f;
    
    for (const float value : data) {
        const float diff = value - mean;
        variance += diff * diff;
    }
    
    return variance / static_cast<float>(data.size());
}

float TerrainMetricBase::CalculateStandardDeviation(const std::vector<float>& data) {
    return std::sqrt(CalculateVariance(data));
}

float TerrainMetricBase::CalculateMean(const std::vector<float>& data) {
    if (data.empty()) return 0.0f;
    
    const double sum = std::accumulate(data.begin(), data.end(), 0.0);
    return static_cast<float>(sum / data.size());
}

float TerrainMetricBase::CalculateRange(const std::vector<float>& data) {
    if (data.empty()) return 0.0f;
    
    auto [minIt, maxIt] = std::minmax_element(data.begin(), data.end());
    return *maxIt - *minIt;
}

float TerrainMetricBase::CalculatePercentileValue(const std::vector<float>& data, float percentile) {
    if (data.empty()) return 0.0f;
    
    // Create a copy for sorting
    std::vector<float> sortedData = data;
    std::sort(sortedData.begin(), sortedData.end());
    
    // Calculate the index for the percentile
    const float index = (percentile / 100.0f) * (sortedData.size() - 1);
    const size_t lowerIndex = static_cast<size_t>(std::floor(index));
    const size_t upperIndex = static_cast<size_t>(std::ceil(index));
    
    if (lowerIndex == upperIndex) {
        return sortedData[lowerIndex];
    }
    
    // Linear interpolation between two values
    const float fraction = index - lowerIndex;
    return sortedData[lowerIndex] * (1.0f - fraction) + sortedData[upperIndex] * fraction;
}

} // namespace PlanetGen::Generation::Analysis
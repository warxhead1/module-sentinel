module;

#include <vector>
#include <string>
#include <memory>
#include <unordered_map>
#include <chrono>
#include <algorithm>
#include <cmath>

#include <limits>
#include <utility>
export module TerrainDataSnapshot;

import AnalysisTypes;
import GLMModule;
import GenerationTypes;

export namespace PlanetGen::Generation::Analysis {

/**
 * @brief Concrete implementation of TerrainDataSnapshot
 * 
 * Efficiently stores and provides access to multi-modal terrain data
 * with cached statistical summaries for performance.
 */
class ConcreteTerrainDataSnapshot : public TerrainDataSnapshot {
public:
    ConcreteTerrainDataSnapshot(const SnapshotMetadata& metadata)
        : TerrainDataSnapshot(metadata) {}
    
    ~ConcreteTerrainDataSnapshot() override = default;
    
    // Data presence checks
    bool HasElevationData() const override { return !m_elevationData.empty(); }
    bool HasTemperatureData() const override { return !m_temperatureData.empty(); }
    bool HasPrecipitationData() const override { return !m_precipitationData.empty(); }
    bool HasVegetationData() const override { return !m_vegetationData.empty(); }
    
    // Data access
    const std::vector<float>& GetElevationData() const override { return m_elevationData; }
    const std::vector<float>& GetTemperatureData() const override { return m_temperatureData; }
    const std::vector<float>& GetPrecipitationData() const override { return m_precipitationData; }
    const std::vector<float>& GetVegetationData() const override { return m_vegetationData; }
    
    const std::vector<std::pair<float, float>>& GetCoordinates() const override { return m_coordinates; }
    
    // Statistical summaries (cached for performance)
    float GetDataMin(const std::string& modalityType) const override {
        auto it = m_statistics.find(modalityType);
        return it != m_statistics.end() ? it->second.min : 0.0f;
    }
    
    float GetDataMax(const std::string& modalityType) const override {
        auto it = m_statistics.find(modalityType);
        return it != m_statistics.end() ? it->second.max : 0.0f;
    }
    
    float GetDataMean(const std::string& modalityType) const override {
        auto it = m_statistics.find(modalityType);
        return it != m_statistics.end() ? it->second.mean : 0.0f;
    }
    
    float GetDataStdDev(const std::string& modalityType) const override {
        auto it = m_statistics.find(modalityType);
        return it != m_statistics.end() ? it->second.stdDev : 0.0f;
    }
    
    // Custom data support
    bool HasCustomData(const std::string& dataType) const override {
        return m_customData.find(dataType) != m_customData.end();
    }
    
    const std::vector<float>& GetCustomData(const std::string& dataType) const override {
        auto it = m_customData.find(dataType);
        if (it != m_customData.end()) {
            return it->second;
        }
        static std::vector<float> empty;
        return empty;
    }
    
    // Data modification (for snapshot creation)
    void SetElevationData(const std::vector<float>& data) {
        m_elevationData = data;
        ComputeStatistics("elevation", data);
    }
    
    void SetTemperatureData(const std::vector<float>& data) {
        m_temperatureData = data;
        ComputeStatistics("temperature", data);
    }
    
    void SetPrecipitationData(const std::vector<float>& data) {
        m_precipitationData = data;
        ComputeStatistics("precipitation", data);
    }
    
    void SetVegetationData(const std::vector<float>& data) {
        m_vegetationData = data;
        ComputeStatistics("vegetation", data);
    }
    
    void SetCoordinates(const std::vector<std::pair<float, float>>& coords) {
        m_coordinates = coords;
    }
    
    void SetCustomData(const std::string& dataType, const std::vector<float>& data) {
        m_customData[dataType] = data;
        ComputeStatistics(dataType, data);
    }
    
    // Advanced analysis methods
    float GetDataVariance(const std::string& modalityType) const {
        auto it = m_statistics.find(modalityType);
        return it != m_statistics.end() ? it->second.variance : 0.0f;
    }
    
    float GetDataRange(const std::string& modalityType) const {
        auto it = m_statistics.find(modalityType);
        return it != m_statistics.end() ? (it->second.max - it->second.min) : 0.0f;
    }
    
    float GetDataPercentile(const std::string& modalityType, float percentile) const {
        const auto& data = GetDataByType(modalityType);
        if (data.empty()) return 0.0f;
        
        std::vector<float> sortedData = data;
        std::sort(sortedData.begin(), sortedData.end());
        
        float index = (percentile / 100.0f) * (sortedData.size() - 1);
        size_t lowIndex = static_cast<size_t>(std::floor(index));
        size_t highIndex = static_cast<size_t>(std::ceil(index));
        
        if (lowIndex == highIndex) {
            return sortedData[lowIndex];
        }
        
        float weight = index - lowIndex;
        return sortedData[lowIndex] * (1.0f - weight) + sortedData[highIndex] * weight;
    }
    
    // Spatial analysis
    struct SpatialStatistics {
        float spatialAutocorrelation;  // Moran's I
        float localVariance;           // Average local variance
        float gradientMagnitude;       // Average gradient magnitude
        float roughnessIndex;          // Terrain roughness measure
    };
    
    SpatialStatistics ComputeSpatialStatistics(const std::string& modalityType) const {
        const auto& data = GetDataByType(modalityType);
        if (data.empty() || m_coordinates.empty()) {
            return {};
        }
        
        SpatialStatistics stats{};
        
        // Estimate grid dimensions (assume roughly square grid)
        uint32_t width = static_cast<uint32_t>(std::sqrt(data.size()));
        uint32_t height = (data.size() + width - 1) / width;
        
        if (width < 2 || height < 2) {
            return stats;
        }
        
        // Compute spatial autocorrelation (simplified Moran's I)
        stats.spatialAutocorrelation = ComputeMoransI(data, width, height);
        
        // Compute local variance
        stats.localVariance = ComputeLocalVariance(data, width, height);
        
        // Compute gradient magnitude
        stats.gradientMagnitude = ComputeGradientMagnitude(data, width, height);
        
        // Compute roughness index
        stats.roughnessIndex = ComputeRoughnessIndex(data, width, height);
        
        return stats;
    }
    
    // Quality assessment
    struct DataQualityMetrics {
        float completeness;      // Percentage of non-NaN/finite values
        float consistency;       // Measure of data consistency
        float plausibility;      // Are values within expected ranges?
        uint32_t outlierCount;   // Number of statistical outliers
        std::vector<std::string> qualityIssues;
    };
    
    DataQualityMetrics AssessDataQuality(const std::string& modalityType) const {
        const auto& data = GetDataByType(modalityType);
        DataQualityMetrics quality{};
        
        if (data.empty()) {
            quality.qualityIssues.push_back("No data available");
            return quality;
        }
        
        // Assess completeness
        uint32_t validCount = 0;
        for (float value : data) {
            if (std::isfinite(value)) {
                validCount++;
            }
        }
        quality.completeness = static_cast<float>(validCount) / data.size();
        
        if (quality.completeness < 0.95f) {
            quality.qualityIssues.push_back("Low data completeness: " + 
                std::to_string(quality.completeness * 100.0f) + "%");
        }
        
        // Assess plausibility based on modality type
        AssessModalityPlausibility(modalityType, data, quality);
        
        // Count outliers (values beyond 3 standard deviations)
        auto it = m_statistics.find(modalityType);
        if (it != m_statistics.end()) {
            float mean = it->second.mean;
            float stdDev = it->second.stdDev;
            float threshold = 3.0f * stdDev;
            
            for (float value : data) {
                if (std::isfinite(value) && std::abs(value - mean) > threshold) {
                    quality.outlierCount++;
                }
            }
        }
        
        // Overall consistency score (simplified)
        quality.consistency = quality.completeness * 
            (quality.outlierCount < data.size() * 0.05f ? 1.0f : 0.5f);
        
        return quality;
    }

private:
    // Data storage
    std::vector<float> m_elevationData;
    std::vector<float> m_temperatureData;
    std::vector<float> m_precipitationData;
    std::vector<float> m_vegetationData;
    std::vector<std::pair<float, float>> m_coordinates;
    std::unordered_map<std::string, std::vector<float>> m_customData;
    
    // Cached statistics
    struct Statistics {
        float min, max, mean, stdDev, variance;
    };
    mutable std::unordered_map<std::string, Statistics> m_statistics;
    
    // Helper methods
    void ComputeStatistics(const std::string& modalityType, const std::vector<float>& data) {
        if (data.empty()) return;
        
        Statistics stats{};
        
        // Find min/max and compute mean
        stats.min = *std::min_element(data.begin(), data.end());
        stats.max = *std::max_element(data.begin(), data.end());
        
        double sum = 0.0;
        uint32_t validCount = 0;
        for (float value : data) {
            if (std::isfinite(value)) {
                sum += value;
                validCount++;
            }
        }
        stats.mean = validCount > 0 ? static_cast<float>(sum / validCount) : 0.0f;
        
        // Compute variance and standard deviation
        double varianceSum = 0.0;
        for (float value : data) {
            if (std::isfinite(value)) {
                double diff = value - stats.mean;
                varianceSum += diff * diff;
            }
        }
        stats.variance = validCount > 1 ? static_cast<float>(varianceSum / (validCount - 1)) : 0.0f;
        stats.stdDev = std::sqrt(stats.variance);
        
        m_statistics[modalityType] = stats;
    }
    
    const std::vector<float>& GetDataByType(const std::string& modalityType) const {
        if (modalityType == "elevation") return m_elevationData;
        if (modalityType == "temperature") return m_temperatureData;
        if (modalityType == "precipitation") return m_precipitationData;
        if (modalityType == "vegetation") return m_vegetationData;
        
        auto it = m_customData.find(modalityType);
        if (it != m_customData.end()) {
            return it->second;
        }
        
        static std::vector<float> empty;
        return empty;
    }
    
    float ComputeMoransI(const std::vector<float>& data, uint32_t width, uint32_t height) const {
        // Simplified Moran's I computation for spatial autocorrelation
        float mean = 0.0f;
        uint32_t validCount = 0;
        
        for (float value : data) {
            if (std::isfinite(value)) {
                mean += value;
                validCount++;
            }
        }
        if (validCount == 0) return 0.0f;
        mean /= validCount;
        
        float numerator = 0.0f;
        float denominator = 0.0f;
        uint32_t pairCount = 0;
        
        for (uint32_t y = 0; y < height; ++y) {
            for (uint32_t x = 0; x < width; ++x) {
                uint32_t idx = y * width + x;
                if (idx >= data.size() || !std::isfinite(data[idx])) continue;
                
                float xi = data[idx] - mean;
                denominator += xi * xi;
                
                // Check neighbors (4-connectivity)
                std::vector<std::pair<int, int>> neighbors = {{0,1}, {0,-1}, {1,0}, {-1,0}};
                for (auto [dx, dy] : neighbors) {
                    int nx = static_cast<int>(x) + dx;
                    int ny = static_cast<int>(y) + dy;
                    
                    if (nx >= 0 && nx < static_cast<int>(width) && 
                        ny >= 0 && ny < static_cast<int>(height)) {
                        uint32_t nidx = ny * width + nx;
                        if (nidx < data.size() && std::isfinite(data[nidx])) {
                            float xj = data[nidx] - mean;
                            numerator += xi * xj;
                            pairCount++;
                        }
                    }
                }
            }
        }
        
        return (pairCount > 0 && denominator > 0.0f) ? (numerator / pairCount) / (denominator / validCount) : 0.0f;
    }
    
    float ComputeLocalVariance(const std::vector<float>& data, uint32_t width, uint32_t height) const {
        float totalVariance = 0.0f;
        uint32_t validCells = 0;
        
        for (uint32_t y = 1; y < height - 1; ++y) {
            for (uint32_t x = 1; x < width - 1; ++x) {
                uint32_t idx = y * width + x;
                if (idx >= data.size() || !std::isfinite(data[idx])) continue;
                
                // Compute local variance in 3x3 neighborhood
                std::vector<float> neighborhood;
                for (int dy = -1; dy <= 1; ++dy) {
                    for (int dx = -1; dx <= 1; ++dx) {
                        uint32_t nidx = (y + dy) * width + (x + dx);
                        if (nidx < data.size() && std::isfinite(data[nidx])) {
                            neighborhood.push_back(data[nidx]);
                        }
                    }
                }
                
                if (neighborhood.size() >= 4) {
                    float localMean = 0.0f;
                    for (float val : neighborhood) localMean += val;
                    localMean /= neighborhood.size();
                    
                    float localVar = 0.0f;
                    for (float val : neighborhood) {
                        float diff = val - localMean;
                        localVar += diff * diff;
                    }
                    localVar /= neighborhood.size();
                    
                    totalVariance += localVar;
                    validCells++;
                }
            }
        }
        
        return validCells > 0 ? totalVariance / validCells : 0.0f;
    }
    
    float ComputeGradientMagnitude(const std::vector<float>& data, uint32_t width, uint32_t height) const {
        float totalGradient = 0.0f;
        uint32_t validCells = 0;
        
        for (uint32_t y = 1; y < height - 1; ++y) {
            for (uint32_t x = 1; x < width - 1; ++x) {
                uint32_t idx = y * width + x;
                if (idx >= data.size() || !std::isfinite(data[idx])) continue;
                
                // Compute gradient using central differences
                uint32_t leftIdx = y * width + (x - 1);
                uint32_t rightIdx = y * width + (x + 1);
                uint32_t upIdx = (y - 1) * width + x;
                uint32_t downIdx = (y + 1) * width + x;
                
                if (leftIdx < data.size() && rightIdx < data.size() &&
                    upIdx < data.size() && downIdx < data.size() &&
                    std::isfinite(data[leftIdx]) && std::isfinite(data[rightIdx]) &&
                    std::isfinite(data[upIdx]) && std::isfinite(data[downIdx])) {
                    
                    float dx = (data[rightIdx] - data[leftIdx]) / 2.0f;
                    float dy = (data[downIdx] - data[upIdx]) / 2.0f;
                    float magnitude = std::sqrt(dx * dx + dy * dy);
                    
                    totalGradient += magnitude;
                    validCells++;
                }
            }
        }
        
        return validCells > 0 ? totalGradient / validCells : 0.0f;
    }
    
    float ComputeRoughnessIndex(const std::vector<float>& data, uint32_t width, uint32_t height) const {
        // Terrain roughness as standard deviation of slopes
        std::vector<float> slopes;
        
        for (uint32_t y = 1; y < height - 1; ++y) {
            for (uint32_t x = 1; x < width - 1; ++x) {
                uint32_t idx = y * width + x;
                if (idx >= data.size() || !std::isfinite(data[idx])) continue;
                
                uint32_t leftIdx = y * width + (x - 1);
                uint32_t rightIdx = y * width + (x + 1);
                uint32_t upIdx = (y - 1) * width + x;
                uint32_t downIdx = (y + 1) * width + x;
                
                if (leftIdx < data.size() && rightIdx < data.size() &&
                    upIdx < data.size() && downIdx < data.size() &&
                    std::isfinite(data[leftIdx]) && std::isfinite(data[rightIdx]) &&
                    std::isfinite(data[upIdx]) && std::isfinite(data[downIdx])) {
                    
                    float dx = (data[rightIdx] - data[leftIdx]) / 2.0f;
                    float dy = (data[downIdx] - data[upIdx]) / 2.0f;
                    float slope = std::sqrt(dx * dx + dy * dy);
                    slopes.push_back(slope);
                }
            }
        }
        
        if (slopes.empty()) return 0.0f;
        
        float mean = 0.0f;
        for (float slope : slopes) mean += slope;
        mean /= slopes.size();
        
        float variance = 0.0f;
        for (float slope : slopes) {
            float diff = slope - mean;
            variance += diff * diff;
        }
        variance /= slopes.size();
        
        return std::sqrt(variance);
    }
    
    void AssessModalityPlausibility(const std::string& modalityType, 
                                   const std::vector<float>& data, 
                                   DataQualityMetrics& quality) const {
        // Define plausible ranges for different data types
        std::pair<float, float> plausibleRange{-std::numeric_limits<float>::max(), 
                                              std::numeric_limits<float>::max()};
        
        if (modalityType == "elevation") {
            plausibleRange = {-11000.0f, 9000.0f}; // Mariana Trench to Everest
        } else if (modalityType == "temperature") {
            plausibleRange = {-100.0f, 60.0f}; // Celsius
        } else if (modalityType == "precipitation") {
            plausibleRange = {0.0f, 15000.0f}; // mm/year
        } else if (modalityType == "vegetation") {
            plausibleRange = {0.0f, 1.0f}; // Normalized vegetation density
        }
        
        uint32_t implausibleCount = 0;
        for (float value : data) {
            if (std::isfinite(value) && 
                (value < plausibleRange.first || value > plausibleRange.second)) {
                implausibleCount++;
            }
        }
        
        quality.plausibility = 1.0f - (static_cast<float>(implausibleCount) / data.size());
        
        if (quality.plausibility < 0.9f) {
            quality.qualityIssues.push_back("Implausible values detected: " + 
                std::to_string(implausibleCount) + " out of " + std::to_string(data.size()));
        }
    }
};

/**
 * @brief Factory for creating terrain data snapshots from various sources
 */
class TerrainSnapshotFactory {
public:
    // Create snapshot from PlanetaryData
    static std::unique_ptr<ConcreteTerrainDataSnapshot> CreateFromPlanetaryData(
        const PlanetaryData& planetData,
        const std::string& stageName,
        uint32_t stageId
    ) {
        TerrainDataSnapshot::SnapshotMetadata metadata{};
        metadata.stageName = stageName;
        metadata.stageId = stageId;
        metadata.timestamp = std::chrono::steady_clock::now();
        metadata.dataResolution = static_cast<uint32_t>(std::sqrt(planetData.elevation.data.size()));
        metadata.seed = 0; // TODO: Get seed from generation context
        metadata.processingParameters = ""; // Could be populated with actual parameters
        
        auto snapshot = std::make_unique<ConcreteTerrainDataSnapshot>(metadata);
        
        // Extract elevation data
        if (!planetData.elevation.data.empty()) {
            snapshot->SetElevationData(planetData.elevation.data);
        }
        
        // Extract other modalities if available
        if (!planetData.temperature.data.empty()) {
            snapshot->SetTemperatureData(planetData.temperature.data);
        }
        
        if (!planetData.precipitation.data.empty()) {
            snapshot->SetPrecipitationData(planetData.precipitation.data);
        }
        
        if (!planetData.vegetation.data.empty()) {
            snapshot->SetVegetationData(planetData.vegetation.data);
        }
        
        // Generate coordinates (assume spherical grid)
        std::vector<std::pair<float, float>> coordinates;
        uint32_t resolution = metadata.dataResolution;
        coordinates.reserve(resolution * resolution);
        
        for (uint32_t y = 0; y < resolution; ++y) {
            for (uint32_t x = 0; x < resolution; ++x) {
                float lat = (static_cast<float>(y) / (resolution - 1)) * 180.0f - 90.0f;
                float lon = (static_cast<float>(x) / (resolution - 1)) * 360.0f - 180.0f;
                coordinates.emplace_back(lat, lon);
            }
        }
        snapshot->SetCoordinates(coordinates);
        
        return snapshot;
    }
    
    // Create snapshot from raw elevation data
    static std::unique_ptr<ConcreteTerrainDataSnapshot> CreateFromElevationData(
        const std::vector<float>& elevationData,
        uint32_t resolution,
        const std::string& stageName,
        uint32_t stageId
    ) {
        TerrainDataSnapshot::SnapshotMetadata metadata{};
        metadata.stageName = stageName;
        metadata.stageId = stageId;
        metadata.timestamp = std::chrono::steady_clock::now();
        metadata.dataResolution = resolution;
        metadata.seed = 0; // Unknown
        
        auto snapshot = std::make_unique<ConcreteTerrainDataSnapshot>(metadata);
        snapshot->SetElevationData(elevationData);
        
        // Generate coordinates
        std::vector<std::pair<float, float>> coordinates;
        coordinates.reserve(resolution * resolution);
        
        for (uint32_t y = 0; y < resolution; ++y) {
            for (uint32_t x = 0; x < resolution; ++x) {
                float lat = (static_cast<float>(y) / (resolution - 1)) * 180.0f - 90.0f;
                float lon = (static_cast<float>(x) / (resolution - 1)) * 360.0f - 180.0f;
                coordinates.emplace_back(lat, lon);
            }
        }
        snapshot->SetCoordinates(coordinates);
        
        return snapshot;
    }
};

} // namespace PlanetGen::Generation::Analysis
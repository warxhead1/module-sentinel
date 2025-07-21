module;

#include <vector>
#include <string>
#include <complex>
#include <cmath>
#include <algorithm>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

export module FrequencyDomainMetrics;

import ITerrainMetric;
import AnalysisTypes;

export namespace PlanetGen::Generation::Analysis {

/**
 * @brief Frequency domain analysis for detecting noise injection and feature loss
 * 
 * Analyzes terrain data in frequency domain to detect:
 * - High-frequency noise injection (spikiness increase)
 * - Low-frequency feature loss (smoothing/detail loss)
 * - Frequency spectrum shifts between pipeline stages
 * - Scale-inappropriate processing artifacts
 */
class FrequencyDomainMetrics : public TerrainMetricBase {
public:
    FrequencyDomainMetrics() 
        : TerrainMetricBase("FrequencyDomain", 
                           "Analyzes frequency spectrum changes to detect noise injection and feature loss") {
        SetThresholds(50.0f, 200.0f); // 50% and 200% frequency changes as thresholds
    }
    
    bool CanAnalyzeTransition(const std::string& fromStage, const std::string& toStage) const override {
        // Can analyze any transition that involves elevation data
        return true;
    }
    
    TerrainMetricResult AnalyzeTransition(
        const TerrainDataSnapshot& beforeSnapshot,
        const TerrainDataSnapshot& afterSnapshot
    ) const override {
        if (!beforeSnapshot.HasElevationData() || !afterSnapshot.HasElevationData()) {
            TerrainMetricResult result{};
            result.metricName = GetMetricName();
            result.status = TerrainMetricResult::Status::Warning;
            result.interpretation = "Insufficient elevation data for frequency analysis";
            return result;
        }
        
        const auto& beforeData = beforeSnapshot.GetElevationData();
        const auto& afterData = afterSnapshot.GetElevationData();
        
        if (beforeData.size() != afterData.size()) {
            TerrainMetricResult result{};
            result.metricName = GetMetricName();
            result.status = TerrainMetricResult::Status::Warning;
            result.interpretation = "Data size mismatch - cannot perform frequency analysis";
            return result;
        }
        
        // Perform frequency domain analysis
        auto beforeSpectrum = ComputePowerSpectrum(beforeData);
        auto afterSpectrum = ComputePowerSpectrum(afterData);
        
        return AnalyzeSpectrumChanges(beforeSpectrum, afterSpectrum, 
                                    beforeSnapshot.GetMetadata().stageName,
                                    afterSnapshot.GetMetadata().stageName);
    }
    
    std::vector<std::string> GetDependencies() const override {
        return {"elevation"};
    }

private:
    struct FrequencyBand {
        std::string name;
        float minFreq, maxFreq;
        float energyBefore, energyAfter;
        float energyChange;
        std::string interpretation;
    };
    
    struct PowerSpectrum {
        std::vector<float> frequencies;
        std::vector<float> magnitudes;
        float totalEnergy;
        float peakFrequency;
        float spectralCentroid;
        std::vector<FrequencyBand> bands;
    };
    
    PowerSpectrum ComputePowerSpectrum(const std::vector<float>& data) const {
        PowerSpectrum spectrum{};
        
        // Determine grid dimensions (assume square grid)
        size_t n = data.size();
        size_t width = static_cast<size_t>(std::sqrt(n));
        size_t height = n / width;
        
        if (width < 4 || height < 4) {
            return spectrum; // Too small for meaningful frequency analysis
        }
        
        // Compute 1D FFT for each row and column (simplified 2D FFT)
        std::vector<float> rowMagnitudes, colMagnitudes;
        
        // Analyze rows
        for (size_t y = 0; y < height; ++y) {
            std::vector<float> rowData;
            for (size_t x = 0; x < width; ++x) {
                size_t idx = y * width + x;
                if (idx < data.size()) {
                    rowData.push_back(data[idx]);
                }
            }
            if (!rowData.empty()) {
                auto rowSpectrum = Compute1DFFT(rowData);
                rowMagnitudes.insert(rowMagnitudes.end(), rowSpectrum.begin(), rowSpectrum.end());
            }
        }
        
        // Analyze columns
        for (size_t x = 0; x < width; ++x) {
            std::vector<float> colData;
            for (size_t y = 0; y < height; ++y) {
                size_t idx = y * width + x;
                if (idx < data.size()) {
                    colData.push_back(data[idx]);
                }
            }
            if (!colData.empty()) {
                auto colSpectrum = Compute1DFFT(colData);
                colMagnitudes.insert(colMagnitudes.end(), colSpectrum.begin(), colSpectrum.end());
            }
        }
        
        // Combine row and column spectra
        std::vector<float> combinedMagnitudes;
        combinedMagnitudes.reserve(rowMagnitudes.size() + colMagnitudes.size());
        combinedMagnitudes.insert(combinedMagnitudes.end(), rowMagnitudes.begin(), rowMagnitudes.end());
        combinedMagnitudes.insert(combinedMagnitudes.end(), colMagnitudes.begin(), colMagnitudes.end());
        
        if (combinedMagnitudes.empty()) {
            return spectrum;
        }
        
        // Create frequency bins
        size_t numBins = combinedMagnitudes.size() / 2; // Only positive frequencies
        spectrum.frequencies.resize(numBins);
        spectrum.magnitudes.resize(numBins);
        
        for (size_t i = 0; i < numBins; ++i) {
            spectrum.frequencies[i] = static_cast<float>(i) / numBins; // Normalized frequency
            spectrum.magnitudes[i] = combinedMagnitudes[i];
        }
        
        // Compute derived metrics
        spectrum.totalEnergy = 0.0f;
        float weightedFreqSum = 0.0f;
        
        for (size_t i = 0; i < numBins; ++i) {
            float power = spectrum.magnitudes[i] * spectrum.magnitudes[i];
            spectrum.totalEnergy += power;
            weightedFreqSum += spectrum.frequencies[i] * power;
        }
        
        spectrum.spectralCentroid = spectrum.totalEnergy > 0.0f ? 
            weightedFreqSum / spectrum.totalEnergy : 0.0f;
        
        // Find peak frequency
        auto maxIt = std::max_element(spectrum.magnitudes.begin(), spectrum.magnitudes.end());
        if (maxIt != spectrum.magnitudes.end()) {
            size_t peakIdx = std::distance(spectrum.magnitudes.begin(), maxIt);
            spectrum.peakFrequency = spectrum.frequencies[peakIdx];
        }
        
        // Analyze frequency bands
        spectrum.bands = AnalyzeFrequencyBands(spectrum);
        
        return spectrum;
    }
    
    std::vector<float> Compute1DFFT(const std::vector<float>& signal) const {
        // Simplified FFT implementation for magnitude spectrum
        size_t n = signal.size();
        if (n < 2) return {};
        
        // Find next power of 2
        size_t fftSize = 1;
        while (fftSize < n) fftSize <<= 1;
        
        // Pad signal to power of 2
        std::vector<std::complex<float>> fftInput(fftSize, 0.0f);
        for (size_t i = 0; i < n; ++i) {
            fftInput[i] = std::complex<float>(signal[i], 0.0f);
        }
        
        // Simple DFT (not optimized FFT, but sufficient for analysis)
        std::vector<std::complex<float>> fftOutput(fftSize);
        
        for (size_t k = 0; k < fftSize; ++k) {
            fftOutput[k] = std::complex<float>(0.0f, 0.0f);
            for (size_t j = 0; j < fftSize; ++j) {
                float angle = -2.0f * M_PI * k * j / fftSize;
                std::complex<float> w(std::cos(angle), std::sin(angle));
                fftOutput[k] += fftInput[j] * w;
            }
        }
        
        // Compute magnitudes
        std::vector<float> magnitudes;
        magnitudes.reserve(fftSize / 2);
        
        for (size_t i = 0; i < fftSize / 2; ++i) {
            magnitudes.push_back(std::abs(fftOutput[i]));
        }
        
        return magnitudes;
    }
    
    std::vector<FrequencyBand> AnalyzeFrequencyBands(const PowerSpectrum& spectrum) const {
        std::vector<FrequencyBand> bands;
        
        // Define frequency bands for terrain analysis
        bands.push_back({"Low (Continental)", 0.0f, 0.1f, 0.0f, 0.0f, 0.0f, ""});      // Large-scale features
        bands.push_back({"Mid (Regional)", 0.1f, 0.3f, 0.0f, 0.0f, 0.0f, ""});        // Regional features
        bands.push_back({"High (Local)", 0.3f, 0.6f, 0.0f, 0.0f, 0.0f, ""});         // Local features
        bands.push_back({"Very High (Noise)", 0.6f, 1.0f, 0.0f, 0.0f, 0.0f, ""});    // High-freq noise
        
        // Calculate energy in each band
        for (auto& band : bands) {
            for (size_t i = 0; i < spectrum.frequencies.size(); ++i) {
                float freq = spectrum.frequencies[i];
                if (freq >= band.minFreq && freq < band.maxFreq) {
                    band.energyBefore += spectrum.magnitudes[i] * spectrum.magnitudes[i];
                }
            }
        }
        
        return bands;
    }
    
    TerrainMetricResult AnalyzeSpectrumChanges(
        const PowerSpectrum& beforeSpectrum,
        const PowerSpectrum& afterSpectrum,
        const std::string& fromStage,
        const std::string& toStage
    ) const {
        TerrainMetricResult result{};
        result.metricName = GetMetricName();
        
        if (beforeSpectrum.frequencies.empty() || afterSpectrum.frequencies.empty()) {
            result.status = TerrainMetricResult::Status::Warning;
            result.interpretation = "Cannot compute frequency spectrum";
            return result;
        }
        
        // Analyze total energy change
        float energyChange = afterSpectrum.totalEnergy - beforeSpectrum.totalEnergy;
        float energyChangePercentage = beforeSpectrum.totalEnergy > 0.0f ? 
            (energyChange / beforeSpectrum.totalEnergy) * 100.0f : 0.0f;
        
        result.primaryValue = afterSpectrum.totalEnergy;
        result.deltaValue = energyChange;
        result.deltaPercentage = energyChangePercentage;
        result.status = DetermineStatus(energyChangePercentage);
        
        // Analyze spectral centroid shift
        float centroidShift = afterSpectrum.spectralCentroid - beforeSpectrum.spectralCentroid;
        float centroidShiftPercentage = beforeSpectrum.spectralCentroid > 0.0f ?
            (centroidShift / beforeSpectrum.spectralCentroid) * 100.0f : 0.0f;
        
        result.additionalValues.emplace_back("spectralCentroidShift", centroidShiftPercentage);
        result.additionalValues.emplace_back("peakFrequencyBefore", beforeSpectrum.peakFrequency);
        result.additionalValues.emplace_back("peakFrequencyAfter", afterSpectrum.peakFrequency);
        
        // Analyze frequency band changes
        auto beforeBands = AnalyzeFrequencyBands(beforeSpectrum);
        auto afterBands = AnalyzeFrequencyBands(afterSpectrum);
        
        std::vector<std::string> bandAnalysis;
        
        for (size_t i = 0; i < beforeBands.size() && i < afterBands.size(); ++i) {
            float bandEnergyChange = afterBands[i].energyBefore - beforeBands[i].energyBefore;
            float bandEnergyChangePercentage = beforeBands[i].energyBefore > 0.0f ?
                (bandEnergyChange / beforeBands[i].energyBefore) * 100.0f : 0.0f;
            
            result.additionalValues.emplace_back(beforeBands[i].name + "EnergyChange", bandEnergyChangePercentage);
            
            if (std::abs(bandEnergyChangePercentage) > 50.0f) {
                std::string change = bandEnergyChangePercentage > 0 ? "increased" : "decreased";
                bandAnalysis.push_back(beforeBands[i].name + " energy " + change + " by " + 
                                     std::to_string(std::abs(bandEnergyChangePercentage)) + "%");
            }
        }
        
        // Generate interpretation
        std::string interpretation = "Frequency analysis " + fromStage + " → " + toStage + ": ";
        
        if (result.status == TerrainMetricResult::Status::Critical) {
            interpretation += "CRITICAL - ";
        } else if (result.status == TerrainMetricResult::Status::Warning) {
            interpretation += "WARNING - ";
        }
        
        if (energyChangePercentage > 100.0f) {
            interpretation += "Significant energy increase (" + std::to_string(energyChangePercentage) + "%) suggests noise injection";
        } else if (energyChangePercentage < -50.0f) {
            interpretation += "Significant energy loss (" + std::to_string(std::abs(energyChangePercentage)) + "%) suggests over-smoothing";
        } else if (centroidShiftPercentage > 50.0f) {
            interpretation += "Spectral centroid shifted higher - high-frequency content increased";
        } else if (centroidShiftPercentage < -50.0f) {
            interpretation += "Spectral centroid shifted lower - low-frequency emphasis";
        } else {
            interpretation += "Frequency spectrum stable";
        }
        
        // Add band-specific analysis
        if (!bandAnalysis.empty()) {
            interpretation += ". Band changes: ";
            for (size_t i = 0; i < bandAnalysis.size() && i < 2; ++i) {
                if (i > 0) interpretation += ", ";
                interpretation += bandAnalysis[i];
            }
        }
        
        result.interpretation = interpretation;
        
        // Add diagnostic messages for detailed analysis
        if (result.status != TerrainMetricResult::Status::Normal) {
            result.diagnosticMessages.push_back("Total energy: " + std::to_string(beforeSpectrum.totalEnergy) + 
                                               " → " + std::to_string(afterSpectrum.totalEnergy));
            result.diagnosticMessages.push_back("Spectral centroid: " + std::to_string(beforeSpectrum.spectralCentroid) + 
                                               " → " + std::to_string(afterSpectrum.spectralCentroid));
            result.diagnosticMessages.push_back("Peak frequency: " + std::to_string(beforeSpectrum.peakFrequency) + 
                                               " → " + std::to_string(afterSpectrum.peakFrequency));
        }
        
        return result;
    }
};

} // namespace PlanetGen::Generation::Analysis
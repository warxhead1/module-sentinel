module;

#include <memory>
#include <vector>
#include <string>
#include <functional>

#include <utility>
export module TerrainAnalysisProcessor;

import GLMModule;
import IPhysicsProcessor;
import IPhysicsGPUAccelerator;
import TerrainAnalysisTypes;
import GenerationTypes;
import BiomeClassifier;
import Core.Threading.JobSystem;

export namespace PlanetGen::Generation::Analysis {

/**
 * Advanced terrain analysis processor that integrates with the physics system
 * Provides comprehensive biome classification, color mapping, and terraforming capabilities
 */
class TerrainAnalysisProcessor : public PlanetGen::Generation::Physics::IPhysicsProcessor {
public:
    TerrainAnalysisProcessor();
    explicit TerrainAnalysisProcessor(const TerrainAnalysisParams& params);
    ~TerrainAnalysisProcessor() = default;
    
    // IPhysicsProcessor interface
    std::string GetProcessorName() const override { return "TerrainAnalysisProcessor"; }
    std::string GetProcessorVersion() const override { return "2.0.0"; }
    
    PlanetGen::Generation::Analysis::TerrainAnalysisResult ProcessTerrain(
        const std::vector<float>& elevationData,
        const std::vector<std::pair<float, float>>& coordinates,
        const PlanetGen::Generation::Analysis::TerrainAnalysisParams& params) override;
    
    bool SupportsGPUAcceleration() const override { return true; }
    void SetGPUAccelerator(std::shared_ptr<PlanetGen::Generation::Physics::IPhysicsGPUAccelerator> accelerator) override {
        m_gpuAccelerator = accelerator;
    }
    
    std::vector<std::string> GetDiagnostics() const override { return m_diagnostics; }
    
    /**
     * Comprehensive terrain analysis for a region
     */
    TerrainAnalysisResult AnalyzeTerrainRegion(
        const std::vector<float>& elevationData,
        const std::vector<std::pair<float, float>>& coordinates,
        uint32_t width, uint32_t height,
        const TerrainAnalysisParams& params = {});
    
    /**
     * Parallel terrain analysis using JobSystem with chunked processing
     */
    TerrainAnalysisResult AnalyzeTerrainParallel(
        const std::vector<float>& elevationData,
        const std::vector<std::pair<float, float>>& coordinates,
        uint32_t width, uint32_t height,
        const TerrainAnalysisParams& params = {});
    
    /**
     * Generate color and texture data for terrain rendering
     */
    void GenerateTerrainColors(
        const TerrainAnalysisResult& analysisResult,
        std::vector<vec3>& colors,
        std::vector<vec3>& normals,
        std::vector<float>& materialProperties) const;
    
    /**
     * Apply terraforming operations to specific terrain regions
     */
    TerrainAnalysisResult ApplyTerraforming(
        const TerrainAnalysisResult& originalTerrain,
        const std::vector<TerraformingOperation>& operations);
    
    /**
     * Configuration and setup
     */
    void SetAnalysisParameters(const TerrainAnalysisParams& params) { m_params = params; }
    TerrainAnalysisParams GetAnalysisParameters() const { return m_params; }
    
    void SetBiomeClassifier(std::unique_ptr<BiomeClassifier> classifier) { 
        m_biomeClassifier = std::move(classifier); 
    }
    BiomeClassifier* GetBiomeClassifier() const { return m_biomeClassifier.get(); }
    
    /**
     * Advanced analysis features
     */
    std::vector<TerrainChunk> CreateAnalysisChunks(
        const std::vector<float>& elevationData,
        const std::vector<std::pair<float, float>>& coordinates,
        uint32_t width, uint32_t height,
        uint32_t chunkSize = 64) const;
    
    TerrainAnalysisResult ProcessAnalysisChunks(
        const std::vector<TerrainChunk>& chunks,
        const TerrainAnalysisParams& params = {});
    
    /**
     * Biome distribution analysis
     */
    void AnalyzeBiomeDistribution(TerrainAnalysisResult& result) const;
    
    /**
     * Calculate biodiversity and habitability indices
     */
    void CalculateEcosystemIndices(TerrainAnalysisResult& result) const;
    
    /**
     * Generate detailed reports
     */
    std::string GenerateAnalysisReport(const TerrainAnalysisResult& result) const;
    std::string GenerateTerraformingReport(const std::vector<TerraformingOperation>& operations) const;
    
    /**
     * Enable/disable specific analysis features
     */
    void EnableDetailedAnalysis(bool enable) { m_enableDetailedAnalysis = enable; }
    void EnableParallelProcessing(bool enable) { m_enableParallelProcessing = enable; }
    void SetMaxThreads(uint32_t maxThreads) { m_maxThreads = maxThreads; }
    void SetChunkSize(uint32_t chunkSize) { m_chunkSize = chunkSize; }
    
    /**
     * Statistical analysis
     */
    void CalculateTerrainStatistics(TerrainAnalysisResult& result) const;
    std::vector<float> GetElevationHistogram(const std::vector<float>& elevations, uint32_t bins = 100) const;
    std::vector<float> GetSlopeHistogram(const std::vector<float>& slopes, uint32_t bins = 100) const;
    
    /**
     * Build noise packets for GPU erosion integration
     */
    std::vector<PlanetGen::Generation::Physics::NoisePacket> BuildNoisePackets(
        const std::vector<float>& elevationData,
        const std::vector<std::pair<float, float>>& coordinates,
        const TerrainAnalysisResult* analysisResultPtr = nullptr) const;
    
private:
    TerrainAnalysisParams m_params;
    std::unique_ptr<BiomeClassifier> m_biomeClassifier;
    std::shared_ptr<PlanetGen::Generation::Physics::IPhysicsGPUAccelerator> m_gpuAccelerator;
    mutable std::vector<std::string> m_diagnostics;
    
    // Processing configuration
    bool m_enableDetailedAnalysis = true;
    bool m_enableParallelProcessing = true;
    uint32_t m_maxThreads = 0; // 0 = use hardware concurrency
    uint32_t m_chunkSize = 1024;
    
    // Internal processing methods
    void ProcessTerrainChunk(TerrainChunk& chunk) const;
    void CalculateSlopesAndAspects(
        const std::vector<float>& elevations,
        uint32_t width, uint32_t height,
        std::vector<float>& slopes,
        std::vector<float>& aspects) const;
    
    void ApplyTerraformingToPoint(
        TerrainAnalysisPoint& point,
        const TerraformingOperation& operation,
        float distance) const;
    
    float CalculateOperationDistance(
        const vec2& pointCoord,
        const TerraformingOperation& operation) const;
    
    // GPU acceleration helpers
    bool ProcessWithGPU(
        const std::vector<float>& elevationData,
        const std::vector<std::pair<float, float>>& coordinates,
        TerrainAnalysisResult& result) const;
    
    // Utility methods
    bool ValidateInputData(
        const std::vector<float>& elevationData,
        const std::vector<std::pair<float, float>>& coordinates) const override;
    
    void UpdateDiagnostics(const std::string& message) const {
        m_diagnostics.push_back(message);
    }
};

/**
 * Factory for creating terrain analysis processors for different planet types
 */
class TerrainAnalysisProcessorFactory {
public:
    /**
     * Create processor configured for Earth-like planets
     */
    static std::unique_ptr<TerrainAnalysisProcessor> CreateEarthLikeProcessor();
    
    /**
     * Create processor configured for Mars-like planets
     */
    static std::unique_ptr<TerrainAnalysisProcessor> CreateMarsLikeProcessor();
    
    /**
     * Create processor configured for arctic/frozen planets
     */
    static std::unique_ptr<TerrainAnalysisProcessor> CreateArcticProcessor();
    
    /**
     * Create processor configured for desert planets
     */
    static std::unique_ptr<TerrainAnalysisProcessor> CreateDesertProcessor();
    
    /**
     * Create processor configured for ocean worlds
     */
    static std::unique_ptr<TerrainAnalysisProcessor> CreateOceanWorldProcessor();
    
    /**
     * Create processor configured for volcanic worlds
     */
    static std::unique_ptr<TerrainAnalysisProcessor> CreateVolcanicProcessor();
    
    /**
     * Create high-performance processor optimized for large datasets
     */
    static std::unique_ptr<TerrainAnalysisProcessor> CreateHighPerformanceProcessor();
    
    /**
     * Create custom processor with user-defined parameters
     */
    static std::unique_ptr<TerrainAnalysisProcessor> CreateCustomProcessor(
        const TerrainAnalysisParams& params,
        std::unique_ptr<BiomeClassifier> classifier = nullptr);
};

/**
 * Terraforming engine for selective terrain modification
 */
class TerraformingEngine {
public:
    TerraformingEngine();
    ~TerraformingEngine() = default;
    
    /**
     * Apply terraforming operations with undo/redo support
     */
    TerrainAnalysisResult ApplyOperations(
        const TerrainAnalysisResult& originalTerrain,
        const std::vector<TerraformingOperation>& operations);
    
    /**
     * Preview terraforming effects without applying them
     */
    TerrainAnalysisResult PreviewOperations(
        const TerrainAnalysisResult& originalTerrain,
        const std::vector<TerraformingOperation>& operations) const;
    
    /**
     * Undo/Redo functionality
     */
    bool CanUndo() const { return !m_undoStack.empty(); }
    bool CanRedo() const { return !m_redoStack.empty(); }
    
    TerrainAnalysisResult Undo();
    TerrainAnalysisResult Redo();
    
    void ClearHistory();
    
    /**
     * Operation management
     */
    void AddOperation(const TerraformingOperation& operation);
    void RemoveOperation(size_t index);
    void ClearOperations();
    
    const std::vector<TerraformingOperation>& GetOperations() const { return m_operations; }
    
    /**
     * Advanced terraforming features
     */
    TerraformingOperation CreateCircularOperation(
        const vec2& center, float radius,
        TerraformingOperation::OperationType type,
        float intensity = 1.0f) const;
    
    TerraformingOperation CreatePolygonalOperation(
        const std::vector<vec2>& polygon,
        TerraformingOperation::OperationType type,
        float intensity = 1.0f) const;
    
    /**
     * Ecosystem simulation for complex terraforming
     */
    void EnableEcosystemSimulation(bool enable) { m_enableEcosystemSimulation = enable; }
    void SetSimulationSteps(uint32_t steps) { m_simulationSteps = steps; }
    
private:
    std::vector<TerraformingOperation> m_operations;
    std::vector<TerrainAnalysisResult> m_undoStack;
    std::vector<TerrainAnalysisResult> m_redoStack;
    
    bool m_enableEcosystemSimulation = false;
    uint32_t m_simulationSteps = 10;
    
    // Helper methods
    void ApplyOperation(
        TerrainAnalysisResult& terrain,
        const TerraformingOperation& operation) const;
    
    void SimulateEcosystemChanges(TerrainAnalysisResult& terrain) const;
    
    float CalculateInfluence(
        const vec2& point,
        const TerraformingOperation& operation) const;
};

} // namespace PlanetGen::Generation::Analysis
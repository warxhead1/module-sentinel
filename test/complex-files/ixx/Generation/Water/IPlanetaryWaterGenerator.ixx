module;

#include <vector>
#include <memory>

// Include GLM headers directly in the global module fragment
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>

#include <string>
#include <utility>
export module IPlanetaryWaterGenerator;

import GenerationTypes;
import RenderingTypes;

export namespace PlanetGen::Generation::Water {

    using namespace PlanetGen::Generation;
    using namespace PlanetGen::Rendering;
    using vec2 = glm::vec2;
    using vec3 = glm::vec3;
    using vec4 = glm::vec4;

    /**
     * @brief Water body types for different celestial bodies
     */
    enum class WaterBodyType {
        Ocean,          // Large continuous water body
        Sea,            // Medium-sized water body
        Lake,           // Enclosed water body
        River,          // Flowing water channel
        Pond,           // Small water body
        Ice,            // Frozen water surface
        Lava,           // Molten rock (treated as liquid)
        Methane,        // Liquid methane (for Titan-like bodies)
        Subsurface      // Underground liquid
    };

    /**
     * @brief Water generation quality levels
     */
    enum class WaterMeshQuality {
        Low,            // Basic flat plane
        Medium,         // Terrain-aware with basic boundaries
        High,           // Detailed coastlines and depth variations
        Ultra           // Maximum detail with micro-features
    };

    /**
     * @brief Water boundary detection parameters
     */
    struct WaterBoundaryParams {
        float seaLevel = 0.0f;              // Base water level
        float shorelineThreshold = 1.0f;    // Distance threshold for shoreline detection
        float minWaterDepth = 0.5f;         // Minimum depth to generate water
        float maxWaterDepth = 1000.0f;      // Maximum depth for water bodies
        bool detectRivers = false;          // Enable river detection
        bool detectLakes = true;            // Enable lake detection
        float riverWidth = 10.0f;           // Minimum river width
        float lakeMinSize = 100.0f;         // Minimum lake size (square meters)
    };

    /**
     * @brief Adaptive mesh parameters for water generation
     */
    struct WaterMeshParams {
        WaterMeshQuality quality = WaterMeshQuality::Medium;
        uint32_t baseResolution = 64;       // Base grid resolution
        uint32_t maxResolution = 512;       // Maximum resolution for detailed areas
        float adaptiveLOD = true;           // Use adaptive level-of-detail
        float coastlineDetailFactor = 2.0f; // Resolution multiplier near coastlines
        float deepWaterSimplification = 0.5f; // Simplification factor for deep water
    };

    /**
     * @brief Water generation result
     */
    struct WaterGenerationResult {
        std::vector<TerrainVertexAttributes> vertices;
        std::vector<uint32_t> indices;
        
        // Metadata
        uint32_t totalVertices = 0;
        uint32_t totalTriangles = 0;
        float waterSurfaceArea = 0.0f;
        float averageDepth = 0.0f;
        float maxDepth = 0.0f;
        WaterBodyType dominantWaterType = WaterBodyType::Ocean;
        
        // Water bodies detected
        struct WaterBody {
            WaterBodyType type;
            vec3 centerPosition;
            float area;
            float averageDepth;
            float maxDepth;
        };
        std::vector<WaterBody> waterBodies;
        
        bool IsValid() const {
            return !vertices.empty() && !indices.empty() && 
                   indices.size() % 3 == 0 && totalVertices > 0;
        }
    };

    /**
     * @brief Interface for planetary water mesh generation
     * 
     * This interface provides a standardized way to generate water meshes
     * for different types of celestial bodies (Earth-like, Mars-like, alien worlds, etc.)
     */
    class IPlanetaryWaterGenerator {
    public:
        virtual ~IPlanetaryWaterGenerator() = default;

        /**
         * @brief Generate water mesh based on planetary data
         * @param planetaryData The planetary elevation and environmental data
         * @param boundaryParams Parameters for water boundary detection
         * @param meshParams Parameters for mesh generation
         * @return Water generation result with vertex/index data and metadata
         */
        virtual WaterGenerationResult GenerateWaterMesh(
            const PlanetaryData& planetaryData,
            const WaterBoundaryParams& boundaryParams,
            const WaterMeshParams& meshParams
        ) = 0;

        /**
         * @brief Analyze water coverage for the given planetary data
         * @param planetaryData The planetary data to analyze
         * @param seaLevel The sea level to use for analysis
         * @return Water coverage percentage (0.0 to 1.0)
         */
        virtual float AnalyzeWaterCoverage(
            const PlanetaryData& planetaryData,
            float seaLevel
        ) = 0;

        /**
         * @brief Detect water boundaries and coastlines
         * @param planetaryData The planetary elevation data
         * @param boundaryParams Parameters for boundary detection
         * @return Vector of boundary points and their types
         */
        virtual std::vector<std::pair<vec2, WaterBodyType>> DetectWaterBoundaries(
            const PlanetaryData& planetaryData,
            const WaterBoundaryParams& boundaryParams
        ) = 0;

        /**
         * @brief Get supported water body types for this generator
         * @return Vector of supported water body types
         */
        virtual std::vector<WaterBodyType> GetSupportedWaterTypes() const = 0;

        /**
         * @brief Get generator name for debugging/logging
         * @return Generator name
         */
        virtual std::string GetGeneratorName() const = 0;

        /**
         * @brief Check if this generator can handle the given planetary type
         * @param planetType The planetary type to check
         * @return true if this generator supports the planet type
         */
        virtual bool SupportsPlanetyType(const std::string& planetType) const = 0;
    };

    /**
     * @brief Factory for creating planetary water generators
     */
    class PlanetaryWaterGeneratorFactory {
    public:
        /**
         * @brief Available water generator types
         */
        enum class GeneratorType {
            TerrainBased,       // Uses terrain height data
            Procedural,         // Purely procedural generation
            Hybrid,             // Combination of terrain and procedural
            SpecializedAlien    // For alien world types
        };

        /**
         * @brief Create a water generator for the specified type
         * @param type The generator type to create
         * @param planetType Optional planet type for specialized generators
         * @return Unique pointer to the created generator
         */
        static std::unique_ptr<IPlanetaryWaterGenerator> CreateGenerator(
            GeneratorType type,
            const std::string& planetType = "Earth-like"
        );

        /**
         * @brief Get the best generator type for a given planet type
         * @param planetType The planet type string
         * @return Recommended generator type
         */
        static GeneratorType GetRecommendedGeneratorType(const std::string& planetType);
    };

} // namespace PlanetGen::Generation::Water
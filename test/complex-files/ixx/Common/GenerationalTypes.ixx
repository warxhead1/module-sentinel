module;

export module GenerationalTypes;
export namespace PlanetGen::Rendering {
    enum class NoiseType {
        Simplex,      // Basic Simplex noise
        Worley,       // Worley/Cellular noise
        SimpleNoise,  // Our custom noise implementation
        GPU           // GPU-accelerated noise 
    };
}
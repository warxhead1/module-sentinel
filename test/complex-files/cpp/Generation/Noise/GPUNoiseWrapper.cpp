module;
#include <memory>
#include <vector>
#include <iostream>
#include <unordered_map>

module GPUNoiseWrapper;

import VulkanNoiseGenerator;
import NoiseFactory;
import RidgedNoise;
import StarFieldNoise;
import DomainWarpedNoise;
import SimpleNoiseWrapper;
import WorleyNoise;
import GPUNoiseTypes;
import GLMModule;
import VulkanResourceManager;

namespace PlanetGen::Rendering::Noise {

class GPUNoiseWrapper::Impl {
public:
    Impl(int seed, float frequency, int octaves, Rendering::VulkanResourceManager* resourceManager)
        : m_seed(seed),
          m_frequency(frequency),
          m_octaves(octaves),
          m_initialized(false),
          m_currentNoiseType(NoiseType::Simplex),
          m_preferGPU(true),
          m_resourceManager(resourceManager),
          m_computeGeneratorHandle(0) {
        
        // Initialize GPU noise parameters with simple offset
        m_gpuParams.seed = seed;
        m_gpuParams.frequency = frequency;
        m_gpuParams.octaves = octaves;
        m_gpuParams.persistence = 0.5f;
        m_gpuParams.lacunarity = 2.0f;
        m_gpuParams.amplitude = 1.0f;
        m_gpuParams.offset.x = 0.0f;
        m_gpuParams.offset.y = 0.0f;
        m_gpuParams.type = NoiseType::Simplex;
    }

    bool Initialize() {
        if (m_initialized) return true;

        try {
            // Get the compute generator from the resource manager
            if (m_resourceManager) {
                m_computeGeneratorHandle = m_resourceManager->CreateComputeGenerator("NoiseWrapperCompute");
                if (m_computeGeneratorHandle == 0) {
                     std::cerr << "[GPUNoiseWrapper] Failed to get compute generator, using CPU fallback" << std::endl;
                     m_preferGPU = false;
                }
            } else {
                m_preferGPU = false;
            }

            // Always initialize CPU noise generators as fallback
            InitializeCPUNoiseGenerators();

            m_initialized = true;
            return true;
        } catch (const std::exception& e) {
            std::cerr << "[GPUNoiseWrapper] Initialization failed: " << e.what() << std::endl;
            m_preferGPU = false;
            InitializeCPUNoiseGenerators();
            m_initialized = true;
            return true; // Still return true for CPU fallback
        }
    }

    float GetNoise(float x, float y, float z) const {
        if (!m_initialized) return 0.0f;

        // For single point queries, always use CPU as GPU is optimized for bulk operations
        auto cpuGenerator = GetCPUGenerator(m_currentNoiseType);
        if (cpuGenerator) {
            return cpuGenerator->GetNoise(x, y, z);
        }

        std::cerr << "[GPUNoiseWrapper] No suitable noise generator found" << std::endl;
        return 0.0f;
    }

    std::vector<float> GenerateNoiseMap(float startX, float startZ, int width,
                                       int depth, float stepSize) const {
        if (!m_initialized) return std::vector<float>(width * depth, 0.0f);

        // Try GPU generation first for supported types
        if (m_preferGPU && IsGPUSupported(m_currentNoiseType)) {
            auto result = GenerateNoiseMapGPU(startX, startZ, width, depth, stepSize);
            if (!result.empty()) {
                return result;
            }
            std::cerr << "[GPUNoiseWrapper] GPU generation failed, falling back to CPU" << std::endl;
        }

        // CPU fallback
        return GenerateNoiseMapCPU(startX, startZ, width, depth, stepSize);
    }

    void SetSeed(int seed) { 
        m_seed = seed; 
        m_gpuParams.seed = seed;
        
        // Update all CPU generators
        for (auto& [type, generator] : m_cpuGenerators) {
            if (generator) {
                generator->SetSeed(seed);
            }
        }
    }
    
    void SetFrequency(float freq) { 
        m_frequency = freq; 
        m_gpuParams.frequency = freq;
        
        // Update all CPU generators
        for (auto& [type, generator] : m_cpuGenerators) {
            if (generator) {
                generator->SetFrequency(freq);
            }
        }
    }
    
    void SetOctaves(int octaves) { 
        m_octaves = std::max(1, octaves); 
        m_gpuParams.octaves = m_octaves;
        
        // Update all CPU generators
        for (auto& [type, generator] : m_cpuGenerators) {
            if (generator) {
                generator->SetOctaves(m_octaves);
            }
        }
    }

    void SetNoiseType(NoiseType type) {
        if (m_currentNoiseType == type) return;
        
        m_currentNoiseType = type;
        m_gpuParams.type = type;
        
        // With the new design, we don't switch the GPU generator's type.
        // We just ensure a CPU fallback exists for the selected type.
        EnsureCPUGenerator(type);
    }

    NoiseType GetNoiseType() const {
        return m_currentNoiseType;
    }

    void SetPersistence(float persistence) {
        m_gpuParams.persistence = persistence;
    }

    void SetLacunarity(float lacunarity) {
        m_gpuParams.lacunarity = lacunarity;
    }

    void SetAmplitude(float amplitude) {
        m_gpuParams.amplitude = amplitude;
    }

private:
    // Core parameters
    int m_seed;
    float m_frequency;
    int m_octaves;
    bool m_initialized;
    NoiseType m_currentNoiseType;
    bool m_preferGPU;

    // GPU infrastructure
    Rendering::VulkanResourceManager* m_resourceManager;
    uint32_t m_computeGeneratorHandle;
    PlanetGen::Rendering::GPUNoiseParameters m_gpuParams;

    // CPU noise generators cache
    std::unordered_map<NoiseType, std::unique_ptr<INoiseGenerator>> m_cpuGenerators;

    bool IsGPUSupported(NoiseType type) const {
        // Currently, VulkanNoiseGenerator supports Simplex and Worley on GPU
        return (type == NoiseType::Simplex || 
                type == NoiseType::Worley || 
                type == NoiseType::SimpleNoise);
    }

    void InitializeCPUNoiseGenerators() {
        // Initialize commonly used CPU generators
        EnsureCPUGenerator(NoiseType::Simplex);
        EnsureCPUGenerator(NoiseType::Worley);
        EnsureCPUGenerator(NoiseType::SimpleNoise);
        EnsureCPUGenerator(NoiseType::RidgedNoise);
        EnsureCPUGenerator(NoiseType::StarFieldNoise);
        EnsureCPUGenerator(NoiseType::DomainWarpedSimplex);
        EnsureCPUGenerator(NoiseType::DomainWarpedWorley);
        EnsureCPUGenerator(NoiseType::FlowNoise);
    }

    void EnsureCPUGenerator(NoiseType type) {
        if (m_cpuGenerators.find(type) != m_cpuGenerators.end()) {
            return; // Already exists
        }

        try {
            std::unique_ptr<INoiseGenerator> generator;
            
            switch (type) {
                case NoiseType::Simplex:
                case NoiseType::SimpleNoise:
                    generator = NoiseFactory::CreateSimpleNoise(m_seed, m_frequency, m_octaves);
                    break;
                
                case NoiseType::Worley:
                    generator = NoiseFactory::CreateWorley(m_seed, m_frequency, m_octaves);
                    break;
                
                case NoiseType::RidgedNoise:
                    generator = NoiseFactory::CreateRidgedNoise(m_seed, m_frequency, m_octaves);
                    break;
                
                case NoiseType::StarFieldNoise:
                    generator = NoiseFactory::CreateStarFieldNoise(m_seed, m_frequency, m_octaves);
                    break;
                
                case NoiseType::DomainWarpedSimplex:
                    generator = NoiseFactory::CreateDomainWarpedSimplex(m_seed, m_frequency, m_octaves);
                    break;
                
                case NoiseType::DomainWarpedWorley:
                    generator = NoiseFactory::CreateDomainWarpedWorley(m_seed, m_frequency, m_octaves);
                    break;
                
                case NoiseType::FlowNoise:
                    generator = NoiseFactory::CreateFlowNoise(m_seed, m_frequency, m_octaves);
                    break;
                
                default:
                    // For unsupported types, fall back to SimpleNoise
                    std::cerr << "[GPUNoiseWrapper] Noise type " << static_cast<int>(type) 
                             << " not implemented, using SimpleNoise fallback" << std::endl;
                    generator = NoiseFactory::CreateSimpleNoise(m_seed, m_frequency, m_octaves);
                    break;
            }

            if (generator) {
                m_cpuGenerators[type] = std::move(generator);
            }
        } catch (const std::exception& e) {
            std::cerr << "[GPUNoiseWrapper] Failed to create CPU generator for type " 
                     << static_cast<int>(type) << ": " << e.what() << std::endl;
        }
    }

    INoiseGenerator* GetCPUGenerator(NoiseType type) const {
        auto it = m_cpuGenerators.find(type);
        return (it != m_cpuGenerators.end()) ? it->second.get() : nullptr;
    }

    std::vector<float> GenerateNoiseMapGPU(float startX, float startZ, int width,
                                          int depth, float stepSize) const {
        if (!m_resourceManager || m_computeGeneratorHandle == 0) {
            return {};
        }

        auto* vulkanGenerator = m_resourceManager->GetNoiseGenerator(m_computeGeneratorHandle);
        if (!vulkanGenerator || !vulkanGenerator->IsInitialized()) {
            return {};
        }

        PlanetGen::Rendering::GPUNoiseParameters params = m_gpuParams;
        params.offset.x += startX;
        params.offset.y += startZ;
        params.frequency = m_frequency * stepSize;
        
        std::vector<float> output(width * depth);
        if (vulkanGenerator->GenerateNoise2D(params, output.data(), width, depth)) {
            return output;
        }

        return {};
    }

    std::vector<float> GenerateNoiseMapCPU(float startX, float startZ, int width,
                                          int depth, float stepSize) const {
        auto generator = GetCPUGenerator(m_currentNoiseType);
        if (!generator) {
            std::cerr << "[GPUNoiseWrapper] No CPU generator available for type " 
                     << static_cast<int>(m_currentNoiseType) << std::endl;
            return std::vector<float>(width * depth, 0.0f);
        }

        std::vector<float> result(width * depth);
        
        for (int z = 0; z < depth; ++z) {
            for (int x = 0; x < width; ++x) {
                float worldX = startX + x * stepSize;
                float worldZ = startZ + z * stepSize;
                
                float value = generator->GetNoise(worldX, 0.0f, worldZ);
                result[z * width + x] = value;
            }
        }

        return result;
    }
};

// GPUNoiseWrapper implementation
GPUNoiseWrapper::GPUNoiseWrapper(int seed, float frequency, int octaves)
{
    // This constructor will be problematic. It needs the resource manager.
    // For now, let's assume it can't be used for GPU generation.
    // A better solution would be to get the resource manager from a singleton.
    m_pimpl = std::make_unique<Impl>(seed, frequency, octaves, nullptr);
    m_pimpl->Initialize();
}

GPUNoiseWrapper::GPUNoiseWrapper(int seed, float frequency, int octaves, Rendering::VulkanResourceManager* resourceManager)
{
    m_pimpl = std::make_unique<Impl>(seed, frequency, octaves, resourceManager);
}

GPUNoiseWrapper::~GPUNoiseWrapper() = default;

bool GPUNoiseWrapper::Initialize()
{
    return m_pimpl->Initialize();
}

float GPUNoiseWrapper::GetNoise(float x, float y, float z) {
    return m_pimpl->GetNoise(x, y, z);
}

float GPUNoiseWrapper::GetNoise(const vec3& pos) {
    return m_pimpl->GetNoise(pos.x, pos.y, pos.z);
}

void GPUNoiseWrapper::SetSeed(int seed) { 
    m_pimpl->SetSeed(seed); 
}

void GPUNoiseWrapper::SetFrequency(float freq) { 
    m_pimpl->SetFrequency(freq); 
}

void GPUNoiseWrapper::SetOctaves(int octaves) { 
    m_pimpl->SetOctaves(octaves); 
}

std::vector<float> GPUNoiseWrapper::GenerateNoiseMap(float startX, float startZ,
                                                     int width, int depth,
                                                     float stepSize) const {
    return m_pimpl->GenerateNoiseMap(startX, startZ, width, depth, stepSize);
}

// Enhanced API methods
void GPUNoiseWrapper::SetNoiseType(NoiseType type) {
    m_pimpl->SetNoiseType(type);
}

NoiseType GPUNoiseWrapper::GetNoiseType() const {
    return m_pimpl->GetNoiseType();
}

void GPUNoiseWrapper::SetPersistence(float persistence) {
    m_pimpl->SetPersistence(persistence);
}

void GPUNoiseWrapper::SetLacunarity(float lacunarity) {
    m_pimpl->SetLacunarity(lacunarity);
}

void GPUNoiseWrapper::SetAmplitude(float amplitude) {
    m_pimpl->SetAmplitude(amplitude);
}

bool GPUNoiseWrapper::IsGPUSupported(NoiseType type) const {
    return (type == NoiseType::Simplex || 
            type == NoiseType::Worley || 
            type == NoiseType::SimpleNoise);
}

// Helper function implementations
const char* GPUNoiseWrapper::GetNoiseTypeName(NoiseType type) {
    return ::PlanetGen::Rendering::Noise::GetNoiseTypeName(type);
}

const char* GPUNoiseWrapper::GetNoiseCategory(NoiseType type) {
    return ::PlanetGen::Rendering::Noise::GetNoiseCategory(type);
}

// Global helper function implementations
const char* GetNoiseTypeName(NoiseType type) {
    switch (type) {
        case NoiseType::Simplex: return "Simplex";
        case NoiseType::Worley: return "Worley";
        case NoiseType::SimpleNoise: return "SimpleNoise";
        case NoiseType::RidgedNoise: return "RidgedNoise";
        case NoiseType::BillowNoise: return "BillowNoise";
        case NoiseType::TurbulenceNoise: return "TurbulenceNoise";
        case NoiseType::FractalBrownian: return "FractalBrownian";
        case NoiseType::HybridMultifractal: return "HybridMultifractal";
        case NoiseType::VoronoiF1: return "VoronoiF1";
        case NoiseType::VoronoiF2: return "VoronoiF2";
        case NoiseType::VoronoiF2MinusF1: return "VoronoiF2MinusF1";
        case NoiseType::VoronoiCrackle: return "VoronoiCrackle";
        case NoiseType::VoronoiManhattan: return "VoronoiManhattan";
        case NoiseType::VoronoiChebyshev: return "VoronoiChebyshev";
        case NoiseType::DomainWarpedSimplex: return "DomainWarpedSimplex";
        case NoiseType::DomainWarpedWorley: return "DomainWarpedWorley";
        case NoiseType::FlowNoise: return "FlowNoise";
        case NoiseType::CurlNoise: return "CurlNoise";
        case NoiseType::StarFieldNoise: return "StarFieldNoise";
        case NoiseType::NebulaHotnoise: return "NebulaHotnoise";
        case NoiseType::GalaxySpiral: return "GalaxySpiral";
        case NoiseType::ClusteredNoise: return "ClusteredNoise";
        case NoiseType::ContinentalNoise: return "ContinentalNoise";
        case NoiseType::MountainRidge: return "MountainRidge";
        case NoiseType::RiverNetwork: return "RiverNetwork";
        case NoiseType::CraterField: return "CraterField";
        case NoiseType::VolcanicNoise: return "VolcanicNoise";
        case NoiseType::CloudLayers: return "CloudLayers";
        case NoiseType::WeatherFronts: return "WeatherFronts";
        case NoiseType::AuroralNoise: return "AuroralNoise";
        case NoiseType::LayeredNoise: return "LayeredNoise";
        case NoiseType::MaskedNoise: return "MaskedNoise";
        case NoiseType::DistanceField: return "DistanceField";
        case NoiseType::GradientNoise: return "GradientNoise";
        case NoiseType::GPU: return "GPU";
        default: return "Unknown";
    }
}

const char* GetNoiseCategory(NoiseType type) {
    switch (type) {
        case NoiseType::Simplex:
        case NoiseType::SimpleNoise:
            return "Basic";
            
        case NoiseType::RidgedNoise:
        case NoiseType::BillowNoise:
        case NoiseType::TurbulenceNoise:
        case NoiseType::FractalBrownian:
        case NoiseType::HybridMultifractal:
            return "Fractal";
            
        case NoiseType::Worley:
        case NoiseType::VoronoiF1:
        case NoiseType::VoronoiF2:
        case NoiseType::VoronoiF2MinusF1:
        case NoiseType::VoronoiCrackle:
        case NoiseType::VoronoiManhattan:
        case NoiseType::VoronoiChebyshev:
            return "Cellular";
            
        case NoiseType::DomainWarpedSimplex:
        case NoiseType::DomainWarpedWorley:
        case NoiseType::FlowNoise:
        case NoiseType::CurlNoise:
            return "Warped";
            
        case NoiseType::StarFieldNoise:
        case NoiseType::NebulaHotnoise:
        case NoiseType::GalaxySpiral:
        case NoiseType::ClusteredNoise:
            return "Cosmic";
            
        case NoiseType::ContinentalNoise:
        case NoiseType::MountainRidge:
        case NoiseType::RiverNetwork:
        case NoiseType::CraterField:
        case NoiseType::VolcanicNoise:
            return "Planetary";
            
        case NoiseType::CloudLayers:
        case NoiseType::WeatherFronts:
        case NoiseType::AuroralNoise:
            return "Atmospheric";
            
        case NoiseType::LayeredNoise:
        case NoiseType::MaskedNoise:
        case NoiseType::DistanceField:
        case NoiseType::GradientNoise:
            return "Composite";
            
        case NoiseType::GPU:
            return "GPU";
            
        default:
            return "Unknown";
    }
}

bool IsNoiseTypeGPUAccelerated(NoiseType type) {
    return (type == NoiseType::Simplex || 
            type == NoiseType::Worley || 
            type == NoiseType::SimpleNoise);
}

}  // namespace PlanetGen::Rendering::Noise

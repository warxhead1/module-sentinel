module;
#define _SILENCE_CXX17_ITERATOR_BASE_CLASS_DEPRECATION_WARNING
#include <algorithm>
#include <cctype>
#include <memory>
#include <stdexcept>
#include <string>
#include <iostream>

module NoiseFactory;
import NoiseInterface;
import NoiseTypes;
import SimpleNoiseWrapper;
import WorleyNoise;
import RidgedNoise;
import BillowNoise;
import VolcanicNoise;
import StarFieldNoise;
import DomainWarpedNoise;

namespace PlanetGen::Rendering::Noise {

std::unique_ptr<INoiseGenerator> NoiseFactory::Create(NoiseType type, int seed,
                                                      float frequency,
                                                      int octaves) {
  // CPU-only implementations
  switch (type) {
    case NoiseType::SimpleNoise:
      return CreateSimpleNoise(seed, frequency, octaves);
    case NoiseType::Worley:
      return CreateWorley(seed, frequency, octaves);
    case NoiseType::Simplex:
      return CreateSimpleNoise(seed, frequency, octaves);
    case NoiseType::RidgedNoise:
      return CreateRidgedNoise(seed, frequency, octaves);
    case NoiseType::BillowNoise:
      return CreateBillowNoise(seed, frequency, octaves);
    case NoiseType::VolcanicNoise:
      return CreateVolcanicNoise(seed, frequency, octaves);
    case NoiseType::StarFieldNoise:
      return CreateStarFieldNoise(seed, frequency, octaves);
    case NoiseType::DomainWarpedSimplex:
      return CreateDomainWarpedSimplex(seed, frequency, octaves);
    case NoiseType::DomainWarpedWorley:
      return CreateDomainWarpedWorley(seed, frequency, octaves);
    case NoiseType::FlowNoise:
      return CreateFlowNoise(seed, frequency, octaves);
    case NoiseType::GPU:
      throw std::invalid_argument(
          "GPU noise type should not be created through factory");
    default:
      throw std::invalid_argument("Unsupported noise type");
  }
}

std::unique_ptr<INoiseGenerator> NoiseFactory::CreateSimpleNoise(
    int seed, float frequency, int octaves) {
  return std::make_unique<SimpleNoiseWrapper>(seed, frequency, octaves);
}

std::unique_ptr<INoiseGenerator> NoiseFactory::CreateWorley(int seed,
                                                            float frequency,
                                                            int octaves) {
  return std::make_unique<WorleyNoise>(seed, frequency, octaves);
}

std::unique_ptr<INoiseGenerator> NoiseFactory::CreateRidgedNoise(
    int seed, float frequency, int octaves) {
  return std::make_unique<RidgedNoise>(seed, frequency, octaves);
}

std::unique_ptr<INoiseGenerator> NoiseFactory::CreateBillowNoise(
    int seed, float frequency, int octaves) {
  return std::make_unique<BillowNoise>(seed, frequency, octaves);
}

std::unique_ptr<INoiseGenerator> NoiseFactory::CreateVolcanicNoise(
    int seed, float frequency, int octaves) {
  return std::make_unique<VolcanicNoise>(seed, frequency, octaves);
}

std::unique_ptr<INoiseGenerator> NoiseFactory::CreateStarFieldNoise(
    int seed, float frequency, int octaves) {
  return std::make_unique<StarFieldNoise>(seed, frequency, octaves);
}

std::unique_ptr<INoiseGenerator> NoiseFactory::CreateDomainWarpedSimplex(
    int seed, float frequency, int octaves) {
  return DomainWarpedNoiseFactory::CreateWarpedSimplex(seed, frequency, octaves, 0.1f);
}

std::unique_ptr<INoiseGenerator> NoiseFactory::CreateDomainWarpedWorley(
    int seed, float frequency, int octaves) {
  return DomainWarpedNoiseFactory::CreateWarpedWorley(seed, frequency, octaves, 0.1f);
}

std::unique_ptr<INoiseGenerator> NoiseFactory::CreateFlowNoise(
    int seed, float frequency, int octaves) {
  return DomainWarpedNoiseFactory::CreateFlowNoise(seed, frequency, octaves, 0.2f);
}

std::unique_ptr<INoiseGenerator> NoiseFactory::CreateFromString(
    const std::string& name, int seed, float frequency, int octaves) {
  try {
    NoiseType type = StringToNoiseType(name);
    return Create(type, seed, frequency, octaves);
  } catch (const std::invalid_argument&) {
    throw std::invalid_argument("Unknown noise type: " + name);
  }
}

NoiseType NoiseFactory::StringToNoiseType(const std::string& type) {
  std::string lowerStr = type;
  std::transform(lowerStr.begin(), lowerStr.end(), lowerStr.begin(), ::tolower);

  if (lowerStr == "simplenoise" || lowerStr == "simple") {
    return NoiseType::SimpleNoise;
  } else if (lowerStr == "worley" || lowerStr == "cellular") {
    return NoiseType::Worley;
  } else if (lowerStr == "simplex") {
    return NoiseType::Simplex;
  } else if (lowerStr == "ridged" || lowerStr == "ridgednoise") {
    return NoiseType::RidgedNoise;
  } else if (lowerStr == "billow" || lowerStr == "billownoise") {
    return NoiseType::BillowNoise;
  } else if (lowerStr == "volcanic" || lowerStr == "volcanicnoise") {
    return NoiseType::VolcanicNoise;
  } else if (lowerStr == "starfield" || lowerStr == "starfieldnoise") {
    return NoiseType::StarFieldNoise;
  } else if (lowerStr == "domainwarpedsimplex" || lowerStr == "warpedsimplex") {
    return NoiseType::DomainWarpedSimplex;
  } else if (lowerStr == "domainwarpedworley" || lowerStr == "warpedworley") {
    return NoiseType::DomainWarpedWorley;
  } else if (lowerStr == "flow" || lowerStr == "flownoise") {
    return NoiseType::FlowNoise;
  } else {
    throw std::invalid_argument("Unknown noise type: " + type);
  }
}

std::string NoiseFactory::NoiseTypeToString(NoiseType type) {
  switch (type) {
    case NoiseType::SimpleNoise:
      return "SimpleNoise";
    case NoiseType::Worley:
      return "Worley";
    case NoiseType::Simplex:
      return "Simplex";
    case NoiseType::RidgedNoise:
      return "RidgedNoise";
    case NoiseType::BillowNoise:
      return "BillowNoise";
    case NoiseType::VolcanicNoise:
      return "VolcanicNoise";
    case NoiseType::StarFieldNoise:
      return "StarFieldNoise";
    case NoiseType::DomainWarpedSimplex:
      return "DomainWarpedSimplex";
    case NoiseType::DomainWarpedWorley:
      return "DomainWarpedWorley";
    case NoiseType::FlowNoise:
      return "FlowNoise";
    case NoiseType::GPU:
      return "GPU";
    default:
      return "Unknown";
  }
}

// Helper function to get noise category
NoiseCategory NoiseFactory::GetNoiseCategory(NoiseType type) {
  switch (type) {
    case NoiseType::SimpleNoise:
    case NoiseType::Simplex:
    case NoiseType::Worley:
      return NoiseCategory::Basic;
      
    case NoiseType::RidgedNoise:
    case NoiseType::BillowNoise:
    case NoiseType::TurbulenceNoise:
    case NoiseType::FractalBrownian:
    case NoiseType::HybridMultifractal:
      return NoiseCategory::Fractal;
      
    case NoiseType::VoronoiF1:
    case NoiseType::VoronoiF2:
    case NoiseType::VoronoiF2MinusF1:
    case NoiseType::VoronoiCrackle:
    case NoiseType::VoronoiManhattan:
    case NoiseType::VoronoiChebyshev:
      return NoiseCategory::Cellular;
      
    case NoiseType::DomainWarpedSimplex:
    case NoiseType::DomainWarpedWorley:
    case NoiseType::FlowNoise:
    case NoiseType::CurlNoise:
      return NoiseCategory::Warped;
      
    case NoiseType::StarFieldNoise:
    case NoiseType::NebulaHotnoise:
    case NoiseType::GalaxySpiral:
    case NoiseType::ClusteredNoise:
      return NoiseCategory::Cosmic;
      
    case NoiseType::ContinentalNoise:
    case NoiseType::MountainRidge:
    case NoiseType::RiverNetwork:
    case NoiseType::CraterField:
    case NoiseType::VolcanicNoise:
      return NoiseCategory::Planetary;
      
    case NoiseType::CloudLayers:
    case NoiseType::WeatherFronts:
    case NoiseType::AuroralNoise:
      return NoiseCategory::Atmospheric;
      
    case NoiseType::LayeredNoise:
    case NoiseType::MaskedNoise:
    case NoiseType::DistanceField:
    case NoiseType::GradientNoise:
      return NoiseCategory::Composite;
      
    case NoiseType::GPU:
    default:
      return NoiseCategory::Utility;
  }
}

}  // namespace PlanetGen::Rendering::Noise

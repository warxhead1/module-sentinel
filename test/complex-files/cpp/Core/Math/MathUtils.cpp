#include "Core/Math/MathUtils.h"

namespace PlanetGen {
namespace Core {
namespace Math {
namespace MathUtils {
float sphericalHarmonicY00(const Vector3& dir) {
    return 0.28209479177387814f;
}

float sphericalHarmonicY1m1(const Vector3& dir) {
    return 0.4886025119029199f * dir.y();
}

float sphericalHarmonicY10(const Vector3& dir) {
    return 0.4886025119029199f * dir.z();
}

float sphericalHarmonicY11(const Vector3& dir) {
    return 0.4886025119029199f * dir.x();
}

} // namespace MathUtils
} // namespace Math
} // namespace Core
} // namespace PlanetGen 

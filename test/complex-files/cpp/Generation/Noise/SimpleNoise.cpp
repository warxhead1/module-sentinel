module;
#include <array>
#include <cmath>
#include <random>
#include <stdexcept>

module SimpleNoise;

import GLMModule;

namespace SimpleNoise {
static constexpr std::array<uint8_t, 256> PERM = {
    151, 160, 137, 91,  90,  15,  131, 13,  201, 95,  96,  53,  194, 233, 7,
    225, 140, 36,  103, 30,  69,  142, 8,   99,  37,  240, 21,  10,  23,  190,
    6,   148, 247, 120, 234, 75,  0,   26,  197, 62,  94,  252, 219, 203, 117,
    35,  11,  32,  57,  177, 33,  88,  237, 149, 56,  87,  174, 20,  125, 136,
    171, 168, 68,  175, 74,  165, 71,  134, 139, 48,  27,  166, 77,  146, 158,
    231, 83,  111, 229, 122, 60,  211, 133, 230, 220, 105, 92,  41,  55,  46,
    245, 40,  244, 102, 143, 54,  65,  25,  63,  161, 1,   216, 80,  73,  209,
    76,  132, 187, 208, 89,  18,  169, 200, 196, 135, 130, 116, 188, 159, 86,
    164, 100, 109, 198, 173, 186, 3,   64,  52,  217, 226, 250, 124, 123, 5,
    202, 38,  147, 118, 126, 255, 82,  85,  212, 207, 206, 59,  227, 47,  16,
    58,  17,  182, 189, 28,  42,  223, 183, 170, 213, 119, 248, 152, 2,   44,
    154, 163, 70,  221, 153, 101, 155, 167, 43,  172, 9,   129, 22,  39,  253,
    19,  98,  108, 110, 79,  113, 224, 232, 178, 185, 112, 104, 218, 246, 97,
    228, 251, 34,  242, 193, 238, 210, 144, 12,  191, 179, 162, 241, 81,  51,
    145, 235, 249, 14,  239, 107, 49,  192, 214, 31,  181, 199, 106, 157, 184,
    84,  204, 176, 115, 121, 50,  45,  127, 4,   150, 254, 138, 236, 205, 93,
    222, 114, 67,  29,  24,  72,  243, 141, 128, 195, 78,  66,  215, 61,  156,
    180};
static constexpr std::array<vec3, 12> GRAD3 = {
    vec3(1.0f, 1.0f, 0.0f),  vec3(-1.0f, 1.0f, 0.0f),
    vec3(1.0f, -1.0f, 0.0f), vec3(-1.0f, -1.0f, 0.0f),
    vec3(1.0f, 0.0f, 1.0f),  vec3(-1.0f, 0.0f, 1.0f),
    vec3(1.0f, 0.0f, -1.0f), vec3(-1.0f, 0.0f, -1.0f),
    vec3(0.0f, 1.0f, 1.0f),  vec3(0.0f, -1.0f, 1.0f),
    vec3(0.0f, 1.0f, -1.0f), vec3(0.0f, -1.0f, -1.0f)};
static float Dot(const vec3& a, const vec3& b) {
  return dot(a, b);  // Use GLM's dot product
}

static float Fade(float t) {
  return t * t * t * (t * (t * 6.0f - 15.0f) + 10.0f);
}

static int FastFloor(float x) {
  return (x > 0.0f) ? static_cast<int>(x) : static_cast<int>(x - 1.0f);
}
NoiseProvider::NoiseProvider(float persistence, float lacunarity, int octaves)
    : m_persistence(persistence), m_lacunarity(lacunarity), m_octaves(octaves) {
  if (octaves < 1) {
    throw std::invalid_argument("Octaves must be at least 1");
  }
}

float NoiseProvider::GetNoise(float x, float y, float z) {
  return FractalNoise(x, y, z);
}

float NoiseProvider::GetNoise(const vec3& pos) {
  return GetNoise(pos.x, pos.y, pos.z);
}

void NoiseProvider::SetPersistence(float persistence) {
  m_persistence = persistence;
}

void NoiseProvider::SetLacunarity(float lacunarity) {
  m_lacunarity = lacunarity;
}

void NoiseProvider::SetOctaves(int octaves) {
  if (octaves < 1) {
    throw std::invalid_argument("Octaves must be at least 1");
  }
  m_octaves = octaves;
}

float NoiseProvider::SimplexNoise(float x, float y, float z) {
  int X = FastFloor(x);
  int Y = FastFloor(y);
  int Z = FastFloor(z);
  x -= X;
  y -= Y;
  z -= Z;
  X &= 255;
  Y &= 255;
  Z &= 255;
  uint8_t permX = PERM[X];
  uint8_t permXY = PERM[(permX + Y) & 255];
  uint8_t permXYZ = PERM[(permXY + Z) & 255];
  uint8_t permXYZ1 = PERM[(permXY + (Z + 1)) & 255];
  uint8_t permX1Y = PERM[(permX + (Y + 1)) & 255];
  uint8_t permX1YZ = PERM[(permX1Y + Z) & 255];
  uint8_t permX1YZ1 = PERM[(permX1Y + (Z + 1)) & 255];
  uint8_t permX1 = PERM[(X + 1) & 255];
  uint8_t permX1Y1 = PERM[(permX1 + Y) & 255];
  uint8_t permX1Y1Z = PERM[(permX1Y1 + Z) & 255];
  uint8_t permX1Y1Z1 = PERM[(permX1Y1 + (Z + 1)) & 255];

  float n000 = Dot(GRAD3[permXYZ % 12], vec3(x, y, z));
  float n001 = Dot(GRAD3[permXYZ1 % 12], vec3(x, y, z - 1));
  float n010 = Dot(GRAD3[permX1YZ % 12], vec3(x, y - 1, z));
  float n011 = Dot(GRAD3[permX1YZ1 % 12], vec3(x, y - 1, z - 1));
  float n100 = Dot(GRAD3[permX1Y1Z % 12], vec3(x - 1, y, z));
  float n101 = Dot(GRAD3[permX1Y1Z1 % 12], vec3(x - 1, y, z - 1));
  float n110 = Dot(GRAD3[permX1Y1Z % 12], vec3(x - 1, y - 1, z));
  float n111 = Dot(GRAD3[permX1Y1Z1 % 12], vec3(x - 1, y - 1, z - 1));
  float u = Fade(x);
  float v = Fade(y);
  float w = Fade(z);

  float nx00 = mix(n000, n100, u);
  float nx01 = mix(n001, n101, u);
  float nx10 = mix(n010, n110, u);
  float nx11 = mix(n011, n111, u);

  float nxy0 = mix(nx00, nx10, v);
  float nxy1 = mix(nx01, nx11, v);

  return mix(nxy0, nxy1, w);
}

float NoiseProvider::FractalNoise(float x, float y, float z) {
  float total = 0.0f;
  float frequency = 1.0f;
  float amplitude = 1.0f;
  float maxValue = 0.0f;

  for (int i = 0; i < m_octaves; i++) {
    total +=
        SimplexNoise(x * frequency, y * frequency, z * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= m_persistence;
    frequency *= m_lacunarity;
  }

  return total / maxValue;
}

}  // namespace SimpleNoise
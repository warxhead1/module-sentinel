// VisualFeedbackApplication.cpp
// Implementation of GPU-enabled modular feedback application

module;
#include <Core/Logging/LoggerMacros.h>
#include <GLFW/glfw3.h>
#include <vulkan/vulkan.h>

#include <chrono>
#include <iostream>
#include <memory>
#include <thread>

module FeedbackSystem.VisualApplication;

import GLMModule;
import Core.Logging.Logger;
import Application.Orchestration.MultiPlanetOrchestrationService;
import Application.Orchestration.MultiPlanetOrchestrationBridge;
import Application.Rendering.MultiPlanetRenderer;
import Application.Rendering.IPlanetRenderingService;
import VulkanResourceManager;
import IParameterConfigurationGUI;
import GUICore;
import Application.Parameters.GeneratorDiscoveryService;
import CameraController;
import Core.Parameters.ParameterSystemAdapter;
import Core.Parameters.PlanetParams;

using namespace PlanetGen::Application::Feedback;

VisualFeedbackApplication::VisualFeedbackApplication() = default;

VisualFeedbackApplication::~VisualFeedbackApplication() {
  if (!m_hasBeenShutDown) {
    try {
      Shutdown();
    } catch (...) {
      // Destructors should never throw - catch and log any exceptions
      // Use low-level output since logger might already be destroyed
      std::cerr << "Exception caught in VisualFeedbackApplication destructor "
                   "during Shutdown()"
                << std::endl;
    }
  }
}

bool VisualFeedbackApplication::Initialize(const FeedbackAppConfig& config) {
  m_config = config;

  // Configure logging to file with debug level if in debug mode

  auto now = std::chrono::system_clock::now();
  auto time_t_val = std::chrono::system_clock::to_time_t(now);
  std::tm tm{};
#ifdef _WIN32
  localtime_s(&tm, &time_t_val);
#else
  localtime_r(&time_t_val, &tm);
#endif

  std::string logFilename =
      std::format("visual_feedback_{:04d}{:02d}{:02d}_{:02d}{:02d}{:02d}.log",
                  tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday, tm.tm_hour,
                  tm.tm_min, tm.tm_sec);

  // Get logger instance and configure it
  auto& logger = ::Core::Logging::Logger::getInstance();

  // Enable file output
  logger.setFileOutput(logFilename);

  // Set separate log levels for console and file
  logger.setConsoleLevel(
      ::Core::Logging::LogLevel::INFO);  // Console: INFO/WARN/ERROR only
  logger.setFileLevel(
      ::Core::Logging::LogLevel::DEBUG);  // File: All messages including DEBUG

  // Ensure console output remains enabled
  logger.setConsoleEnabled(true);

  LogInfo("Debug logging enabled - DEBUG messages to file: " + logFilename +
          ", console shows INFO/WARN/ERROR only");

  LogInfo("Initializing Visual Feedback Application...");

  // Create GPU infrastructure manager
  m_gpuManager = std::make_unique<GPUInfrastructureManager>();

  // Configure GPU infrastructure
  GPUInfrastructureConfig gpuConfig;
  gpuConfig.enableRendering = config.enableRendering;
  gpuConfig.enableWaterSystem =
      true;  // Always enable, but defer initialization
  gpuConfig.enableGPUNoise = true;
  gpuConfig.verboseLogging = config.verboseMode;

  // Window configuration
  gpuConfig.window.title =
      "Visual Feedback Application - " + config.applicationName;
  gpuConfig.window.width = config.windowWidth;
  gpuConfig.window.height = config.windowHeight;
  gpuConfig.window.resizable = true;
  gpuConfig.window.vsync = true;

  // Rendering configuration
  gpuConfig.rendering.terrainResolution = config.evaluationResolution;
  gpuConfig.rendering.waterTextureResolution =
      PlanetGen::Core::Parameters::ParameterSystemAdapter::Get<uint32_t>(
          PlanetGen::Core::Parameters::PlanetParams::WATER_GRID_RESOLUTION);
  gpuConfig.rendering.enableDetailedAnalysis = config.enableDetailedAnalysis;

  // Initialize GPU infrastructure
  if (!m_gpuManager->Initialize(gpuConfig)) {
    LogError("Failed to initialize GPU infrastructure");
    return false;
  }

  // Initialize GUI if enabled
  m_guiEnabled = config.enableGUI;
  if (m_guiEnabled) {
    if (!InitializeGUI()) {
      LogError("Failed to initialize GUI");
      return false;
    }
  }

  // Initialize orchestration services if enabled
  if (config.planetsPerGeneration > 1) {
    if (!InitializeOrchestrationServices()) {
      LogError("Failed to initialize orchestration services");
      return false;
    }
    m_multiPlanetModeEnabled = true;
    LogInfo("Multi-planet orchestration mode enabled");
  }

  m_optimizationState = OptimizationState::NOT_STARTED;
  LogInfo("Visual Feedback Application initialized successfully");
  return true;
}

void VisualFeedbackApplication::Run() {
  LogInfo("Running Visual Feedback Application...");

  if (!m_gpuManager) {
    LogError("GPU manager not initialized - cannot run");
    return;
  }

  // If GUI is enabled, run the interactive render loop
  if (m_guiEnabled) {
    LogInfo("Starting interactive GUI mode...");
    m_renderLoopRunning = true;

    // Main render loop
    while (m_renderLoopRunning) {
      // Process window events
      if (!ProcessGUIEvents()) {
        break;
      }

      // Update application state
      float deltaTime = 0.016f;  // ~60 FPS for now
      UpdateVisualization(deltaTime);

      // Begin frame - this sets up the command buffer
      if (!m_gpuManager->GetRenderSystem()->BeginFrame()) {
        continue;
      }

      // Update GUI (prepare ImGui draw data)
      UpdateGUI();

      // Render scene first if we have a planet (without BeginFrame/EndFrame)
      if (m_optimizationState == OptimizationState::COMPLETED &&
          m_bestPlanetMesh) {
        m_gpuManager->RenderPlanetOnly(m_bestPlanetMesh, m_bestWaterMesh);
      } else {
        // Even with no planet, log that we're showing GUI only
        static int logCounter = 0;
        if (logCounter++ % 1800 == 0) {  // Log every 30 seconds
          LogInfo("No planet to render - showing GUI only");
        }
      }

      // Render GUI using the current command buffer
      RenderGUI();

      // End frame - this submits the command buffer
      if (!m_gpuManager->GetRenderSystem()->EndFrame()) {
        LogError("Failed to end frame");
      }
    }

    LogInfo("GUI render loop ended");
  } else {
    // Non-GUI mode - just log that we're ready
    LogInfo(
        "Visual Feedback Application running in headless mode (use "
        "StartOptimization() to begin)");
  }
}

bool VisualFeedbackApplication::StartOptimization() {
  LogInfo("Starting optimization...");

  // Allow re-generation by resetting state if already completed
  if (m_optimizationState == OptimizationState::COMPLETED) {
    LogInfo("Resetting optimization state for new generation");
    m_optimizationState = OptimizationState::NOT_STARTED;
    // Clear previous results
    m_candidateHistory.clear();
  }

  if (m_optimizationState != OptimizationState::NOT_STARTED) {
    LogWarn("Optimization already in progress");
    return false;
  }

  m_optimizationState = OptimizationState::RUNNING_FEEDBACK_LOOP;
  m_optimizationStartTime = std::chrono::steady_clock::now();

  // Choose optimization path based on mode
  bool optimizationSuccess;
  if (m_multiPlanetModeEnabled && m_orchestrationService) {
    optimizationSuccess = RunMultiPlanetFeedbackOptimization();
  } else {
    optimizationSuccess = RunFeedbackOptimization();
  }

  if (!optimizationSuccess) {
    m_optimizationState = OptimizationState::FAILED;
    return false;
  }

  // Select best candidate from optimization results
  if (!SelectBestCandidate()) {
    m_optimizationState = OptimizationState::FAILED;
    return false;
  }

  // Initialize water system with the selected planetary data
  if (!InitializeRenderingForBest()) {
    m_optimizationState = OptimizationState::FAILED;
    return false;
  }

  m_optimizationState = OptimizationState::COMPLETED;

  // Call completion callback if set
  if (m_completionCallback) {
    m_completionCallback(GetOptimizationResult());
  }

  LogInfo("Optimization completed successfully");
  return true;
}

bool VisualFeedbackApplication::IsOptimizationRunning() const {
  return m_optimizationState == OptimizationState::RUNNING_FEEDBACK_LOOP ||
         m_optimizationState == OptimizationState::SELECTING_BEST_CANDIDATE ||
         m_optimizationState == OptimizationState::INITIALIZING_WATER_SYSTEM ||
         m_optimizationState == OptimizationState::GENERATING_MESHES;
}

void VisualFeedbackApplication::StopOptimization() {
  if (IsOptimizationRunning()) {
    LogInfo("Stopping optimization...");
    m_optimizationState = OptimizationState::FAILED;
  }
}

FeedbackOptimizationResult VisualFeedbackApplication::GetOptimizationResult()
    const {
  FeedbackOptimizationResult result;

  if (m_optimizationState == OptimizationState::COMPLETED &&
      !m_candidateHistory.empty()) {
    result.bestFitnessScore = m_bestCandidate.fitnessScore;
    result.generationsCompleted = static_cast<int>(m_candidateHistory.size());
    result.planetsEvaluated = m_candidateHistory.size();
    result.terminationReason = "Optimization completed successfully";
    result.converged = true;
    result.bestPlanetData = m_bestCandidate.planetaryData;
    result.bestOrchestrationResult = m_bestCandidate.orchestrationResult;
    result.bestParametersJson = m_bestCandidate.parameters;

    // Fill generation scores
    for (const auto& candidate : m_candidateHistory) {
      result.generationBestScores.push_back(candidate.fitnessScore);
      result.generationAverageScores.push_back(
          candidate.fitnessScore);  // Simplified
    }
  } else {
    result.bestFitnessScore = 0.0f;
    result.generationsCompleted = 0;
    result.planetsEvaluated = 0;
    result.terminationReason = "Optimization not completed";
    result.converged = false;
  }

  return result;
}

FeedbackAppConfig VisualFeedbackApplication::GetConfig() const {
  return m_config;
}

void VisualFeedbackApplication::SetProgressCallback(ProgressCallback callback) {
  m_progressCallback = callback;
}

void VisualFeedbackApplication::SetCompletionCallback(
    CompletionCallback callback) {
  m_completionCallback = callback;
}

void VisualFeedbackApplication::UpdateConfig(const FeedbackAppConfig& config) {
  m_config = config;
  LogInfo("Configuration updated");
}

void VisualFeedbackApplication::Shutdown() {
  // Guard against double shutdown
  if (m_hasBeenShutDown || !m_gpuManager) {
    return;  // Already shut down
  }

  LogInfo("Shutting down Visual Feedback Application...");

  // Stop render loop if running
  m_renderLoopRunning = false;

  // Shutdown GUI first if enabled
  if (m_guiEnabled) {
    ShutdownGUI();
  }

  // Shutdown orchestration services first
  ShutdownOrchestrationServices();

  // Clear mesh resources safely
  try {
    m_bestPlanetMesh.reset();
    m_bestWaterMesh.reset();
    m_candidateHistory.clear();
  } catch (...) {
    std::cerr << "Exception during mesh resource cleanup" << std::endl;
  }

  // Shutdown GPU manager last
  try {
    if (m_gpuManager) {
      m_gpuManager->Shutdown();
      m_gpuManager.reset();
    }
  } catch (...) {
    std::cerr << "Exception during GPU manager shutdown" << std::endl;
    m_gpuManager.reset();  // Force reset even on exception
  }

  m_optimizationState = OptimizationState::NOT_STARTED;
  m_hasBeenShutDown = true;  // Mark as shut down
}

bool VisualFeedbackApplication::IsRenderingEnabled() const {
  return m_gpuManager && m_gpuManager->IsRenderingEnabled();
}

bool VisualFeedbackApplication::RenderCurrentBest() {
  if (!m_gpuManager || m_optimizationState != OptimizationState::COMPLETED) {
    return false;
  }

  return m_gpuManager->RenderFrame(m_bestPlanetMesh, m_bestWaterMesh);
}

bool VisualFeedbackApplication::UpdateVisualization(float deltaTime) {
  if (!m_gpuManager) return false;

  // Update GPU manager first
  bool result = m_gpuManager->UpdateCamera(deltaTime);

  // Update orchestration if enabled
  if (m_orchestrationService) {
    m_orchestrationService->update(deltaTime);
  }

  return result;
}

// Private implementation methods (simplified for compilation)

bool VisualFeedbackApplication::RunFeedbackOptimization() {
  LogInfo("Running feedback optimization...");

  auto* orchestrator = m_gpuManager->GetOrchestrator();
  if (!orchestrator) {
    LogError("Orchestrator not available for optimization");
    return false;
  }

  PlanetaryDesignTemplate designTemplate;
  bool useGUIParameters = false;

  // Check if we should use GUI parameters
  if (m_pendingParameterUpdate && m_parameterWindow) {
    LogInfo("Using parameters from GUI");

    // Get the current parameter configuration from the parameter window
    // This would need to be implemented through the IParameterConfigurationGUI
    // interface For now, we'll use the template approach as a fallback

    // Get parameter set from GUI
    auto parameterSet = m_parameterWindow->getCurrentParameterSet();
    if (parameterSet) {
      LogInfo("Got parameter set from GUI with " +
              std::to_string(parameterSet->parameters.size()) + " parameters");

      // Use ParameterBridge to convert GUI parameters to design template
      PlanetGen::GUI::Parameters::ParameterBridge::BridgeConfig config{};
      PlanetGen::GUI::Parameters::ParameterBridge bridge(config);
      auto conversionResult =
          bridge.ConvertToOrchestratorConfig(*parameterSet, false);

      if (conversionResult) {
        designTemplate = *conversionResult;
        useGUIParameters = true;
        LogInfo("Successfully converted GUI parameters to design template");
        LogInfo("  Water coverage: " +
                std::to_string(designTemplate.waterCoverage));
        LogInfo("  Mountain density: " +
                std::to_string(designTemplate.mountainDensity));
        LogInfo("  Vegetation coverage: " +
                std::to_string(designTemplate.vegetationCoverage));
      } else {
        LogWarn(
            "Failed to convert GUI parameters to design template, falling back "
            "to template approach");
      }
    } else {
      LogWarn("No parameter set available from GUI");
    }

    m_pendingParameterUpdate = false;
  }

  // If we didn't get GUI parameters, fall back to template approach
  if (!useGUIParameters) {
    // Map GUI generator names to template names
    std::string templateName = m_selectedGenerator;
    if (m_selectedGenerator == "Desert") {
      templateName = "Desert World";
    } else if (m_selectedGenerator == "Terrestrial") {
      templateName = "Earth-like";
    } else if (m_selectedGenerator == "Ocean") {
      templateName = "Ocean World";
    } else if (m_selectedGenerator == "Frozen") {
      templateName = "Ice World";
    } else if (m_selectedGenerator == "Volcanic") {
      templateName = "Volcanic World";
    }

    // Check if template exists
    auto templates = orchestrator->GetAvailableTemplates();
    if (std::find(templates.begin(), templates.end(), templateName) ==
        templates.end()) {
      LogError("Template not found: " + templateName);
      // Fall back to first available template
      if (!templates.empty()) {
        templateName = templates[0];
        LogWarn("Using fallback template: " + templateName);
      } else {
        LogError("No templates available");
        return false;
      }
    }

    // Get the template
    designTemplate = orchestrator->GetTemplate(templateName);
    LogInfo("Using template: " + templateName);
  }

  // Create a planet candidate
  PlanetCandidate candidate;

  // Store visual scaling parameters from design template
  candidate.visualScaleRatio = designTemplate.visualScaleRatio;
  candidate.maxElevation = designTemplate.maxElevation;
  candidate.elevationExaggeration = designTemplate.elevationExaggeration;

  // Generate planet with the design template
  FeatureDistribution distribution;  // Use default

  LogInfo("Generating planet...");
  candidate.orchestrationResult = orchestrator->GeneratePlanet(
      designTemplate, distribution, m_config.evaluationResolution);

  if (candidate.orchestrationResult.generationSuccessful) {
    candidate.planetaryData = candidate.orchestrationResult.planetaryData;
    candidate.fitnessScore = candidate.orchestrationResult.designMatchScore;
    candidate.parameters =
        m_selectedGenerator;  // Store selected generator name

    m_candidateHistory.push_back(candidate);
    LogInfo("Planet generation successful with fitness score: " +
            std::to_string(candidate.fitnessScore));
  } else {
    LogError("Planet generation failed");
  }

  ReportProgress(100.0f, "Feedback optimization completed");
  return !m_candidateHistory.empty();
}

bool VisualFeedbackApplication::SelectBestCandidate() {
  LogInfo("Selecting best candidate...");

  if (m_candidateHistory.empty()) {
    // If we're in multi-planet mode, try to get data from orchestration
    if (m_multiPlanetModeEnabled && m_orchestrationService) {
      return SelectBestCandidateFromOrchestration();
    }
    LogError("No candidates available for selection");
    return false;
  }

  // Find best candidate by fitness score
  m_bestCandidate = m_candidateHistory[0];
  for (const auto& candidate : m_candidateHistory) {
    if (candidate.fitnessScore > m_bestCandidate.fitnessScore) {
      m_bestCandidate = candidate;
    }
  }

  LogInfo("Best candidate selected with fitness score: " +
          std::to_string(m_bestCandidate.fitnessScore));
  return true;
}

bool VisualFeedbackApplication::InitializeRenderingForBest() {
  LogInfo("Initializing rendering for best candidate...");

  if (!m_gpuManager) {
    LogError("GPU manager not available");
    return false;
  }

  // Initialize water system with the selected planetary data
  if (!m_gpuManager->InitializeWaterSystem(m_bestCandidate.planetaryData)) {
    LogWarn("Failed to initialize water system - continuing without water");
  }

  // Generate meshes for the best candidate
  if (!GenerateMeshesForBest()) {
    LogError("Failed to generate meshes for best candidate");
    return false;
  }

  // Position camera to view the generated planet
  auto* camera = m_gpuManager->GetCamera();
  if (camera) {
    // Get planet radius from the planetary data (in meters)
    float planetRadius =
        static_cast<float>(m_bestCandidate.planetaryData.planetRadius);

    // Check if we already have a camera position (from previous planet
    // generation) We need to check if we have a valid mesh (indicating we've
    // rendered before) because orbital animation is always enabled after
    // initialization
    bool preserveCameraPosition =
        (m_bestPlanetMesh != nullptr && camera->IsOrbitalAnimationEnabled());

    // Ensure proper satellite view distance - at least 2.5x planet radius for
    // good overview
    float currentDistance =
        planetRadius * 2.5f;  // Increased default viewing distance
    float currentOrbitAngle = 0.0f;
    float currentElevation = 20.0f;
    float currentElevationTime = 0.0f;

    if (preserveCameraPosition) {
      // Get previous planet radius to calculate altitude above surface
      float previousRadius =
          m_bestPlanetMesh
              ? static_cast<float>(m_bestCandidate.planetaryData.planetRadius)
              : planetRadius;
      vec3 cameraPos = camera->GetPosition();
      float distanceFromCenter = length(cameraPos - camera->GetTarget());

      // Calculate altitude above previous planet's surface
      float altitudeAboveSurface = distanceFromCenter - previousRadius;

      // Set distance for new planet maintaining same altitude
      currentDistance = planetRadius + altitudeAboveSurface;

      // Get the actual orbital animation state
      currentOrbitAngle = camera->GetOrbitAngle();
      currentElevationTime = camera->GetElevationTime();

      // Calculate current elevation angle from camera position
      vec3 pos = camera->GetPosition();
      float horizontalDist = sqrt(pos.x * pos.x + pos.z * pos.z);
      currentElevation = degrees(atan2(pos.y, horizontalDist));

      LogInfo("Preserving camera position - distance: " +
              std::to_string(currentDistance) +
              ", orbit angle: " + std::to_string(currentOrbitAngle) +
              ", elevation: " + std::to_string(currentElevation) +
              ", elevation time: " + std::to_string(currentElevationTime));
    }

    // Update camera for planetary scale (adjusts near/far planes appropriately)
    camera->UpdateForPlanetaryScale(planetRadius);

    // Set up orbital animation with preserved or default position
    PlanetGen::Rendering::OrbitalAnimationParams orbital;
    orbital.enabled = true;
    orbital.orbitSpeed = 5.0f;      // Slow rotation for viewing the planet
    orbital.elevationSpeed = 0.0f;  // No elevation oscillation
    orbital.baseDistance = currentDistance;  // Use current or default distance
    orbital.minElevation =
        currentElevation;  // Use current or default elevation
    orbital.maxElevation =
        currentElevation;  // Same as min to prevent oscillation
    orbital.planetRadius = planetRadius;
    orbital.autoAdjustDistance =
        true;  // Enable auto-adjust to ensure we stay outside the planet
    camera->EnableOrbitalAnimation(orbital);

    // If we're preserving position, restore the orbital animation state
    if (preserveCameraPosition) {
      // Restore the preserved orbital animation state
      camera->SetOrbitAngle(currentOrbitAngle);
      camera->SetElevationTime(currentElevationTime);

      // Update once to apply the restored state
      camera->UpdateOrbitalAnimation(0.0f);
    } else {
      // Set initial angle for new view
      camera->SetOrbitAngle(0.0f);
      camera->SetElevationTime(0.0f);
      camera->UpdateOrbitalAnimation(0.0f);  // Update once to apply settings

      // Double-check that camera is positioned correctly
      float actualDistance =
          length(camera->GetPosition() - camera->GetTarget());
      if (actualDistance < planetRadius * 1.2f) {
        LogWarn("Camera too close to planet! Distance: " +
                std::to_string(actualDistance) +
                ", Planet radius: " + std::to_string(planetRadius));
        // Force a safe distance
        vec3 direction = normalize(camera->GetPosition() - camera->GetTarget());
        vec3 newPosition =
            camera->GetTarget() + direction * (planetRadius * 2.5f);
        camera->SetPosition(newPosition);
      }
    }

    LogInfo("Camera positioned to view planet with radius: " +
            std::to_string(planetRadius) + " meters at distance: " +
            std::to_string(currentDistance) + " meters");
  } else {
    LogWarn("Camera not available - unable to position view");
  }

  return true;
}

bool VisualFeedbackApplication::GenerateMeshesForBest() {
  LogInfo("Generating meshes for best candidate...");

  if (!m_gpuManager) {
    LogError("GPU manager not available");
    return false;
  }

  // Set visual scaling parameters from the best candidate
  m_gpuManager->SetVisualScalingParameters(
      m_bestCandidate.visualScaleRatio, m_bestCandidate.maxElevation,
      m_bestCandidate.elevationExaggeration);

  // Generate planet mesh
  if (!m_gpuManager->GeneratePlanetMesh(m_bestCandidate.planetaryData,
                                        m_bestPlanetMesh)) {
    LogError("Failed to generate planet mesh");
    return false;
  }

  // Generate water mesh if water system is available
  if (m_gpuManager->GetWaterRenderer()) {
    if (m_gpuManager->GenerateWaterMesh(m_bestCandidate.planetaryData)) {
      // Retrieve the generated water mesh
      m_bestWaterMesh = m_gpuManager->GetCurrentWaterMesh();
      if (m_bestWaterMesh) {
        LogInfo("Water mesh retrieved successfully with " +
                std::to_string(m_bestWaterMesh->vertices.size()) + " vertices");
      } else {
        LogInfo(
            "No water mesh generated - planet may be entirely above sea level");
      }
    } else {
      LogWarn("Failed to generate water mesh - continuing without water");
    }
  }

  return true;
}

// Helper methods

void VisualFeedbackApplication::ReportProgress(float progress,
                                               const std::string& message) {
  if (m_progressCallback) {
    // Convert progress/message to the expected callback signature
    int generation = static_cast<int>(m_candidateHistory.size());
    float bestScore =
        m_candidateHistory.empty() ? 0.0f : m_bestCandidate.fitnessScore;
    float avgScore = bestScore;  // Simplified for now
    m_progressCallback(generation, bestScore, avgScore);
  }

  if (m_config.verboseMode) {
    LogInfo("Progress: " + std::to_string(progress) + "% - " + message);
  }
}

void VisualFeedbackApplication::LogInfo(const std::string& message) const {
  LOG_INFO("VisualFeedbackApplication", message);
}

void VisualFeedbackApplication::LogError(const std::string& message) const {
  LOG_ERROR("VisualFeedbackApplication", message);
}

void VisualFeedbackApplication::LogWarn(const std::string& message) const {
  LOG_WARN("VisualFeedbackApplication", message);
}

// ============================================================================
// Multi-Planet Orchestration Implementation
// ============================================================================

bool VisualFeedbackApplication::EnableMultiPlanetMode(bool enabled) {
  if (enabled && !m_orchestrationService) {
    if (!InitializeOrchestrationServices()) {
      LogError("Failed to initialize orchestration services");
      return false;
    }
  } else if (!enabled && m_orchestrationService) {
    ShutdownOrchestrationServices();
  }

  m_multiPlanetModeEnabled = enabled;
  LogInfo(std::string("Multi-planet mode ") +
          (enabled ? "enabled" : "disabled"));
  return true;
}

bool VisualFeedbackApplication::IsMultiPlanetModeEnabled() const {
  return m_multiPlanetModeEnabled;
}

uint32_t VisualFeedbackApplication::GetActivePlanetCount() const {
  if (!m_orchestrationService) {
    return 0;
  }

  auto metrics = m_orchestrationService->getMetrics();
  return metrics.activePlanets;
}

bool VisualFeedbackApplication::AddPlanetToOptimization(
    const std::string& templateName, const dvec3& position,
    const std::string& displayName) {
  if (!m_orchestrationService) {
    LogError("Orchestration service not initialized");
    return false;
  }

  auto planetID =
      m_orchestrationService->addPlanet(templateName, position, displayName);
  if (planetID == ::Application::Orchestration::INVALID_MANAGED_PLANET_ID) {
    LogError("Failed to add planet to optimization");
    return false;
  }

  LogInfo("Added planet " + displayName + " (ID: " + std::to_string(planetID) +
          ") to optimization");
  return true;
}

bool VisualFeedbackApplication::RemovePlanetFromOptimization(
    ::Application::Orchestration::ManagedPlanetID planetID) {
  if (!m_orchestrationService) {
    LogError("Orchestration service not initialized");
    return false;
  }

  bool success = m_orchestrationService->removePlanet(planetID);
  if (success) {
    LogInfo("Removed planet ID " + std::to_string(planetID) +
            " from optimization");
  } else {
    LogError("Failed to remove planet ID " + std::to_string(planetID) +
             " from optimization");
  }

  return success;
}

std::vector<::Application::Orchestration::ManagedPlanetID>
VisualFeedbackApplication::GetOptimizationPlanetIDs() const {
  if (!m_orchestrationService) {
    return {};
  }

  return m_orchestrationService->getAllPlanetIDs();
}

::Application::Orchestration::OrchestrationMetrics
VisualFeedbackApplication::GetOrchestrationMetrics() const {
  if (!m_orchestrationService) {
    return {};
  }

  return m_orchestrationService->getMetrics();
}

void VisualFeedbackApplication::UpdateCameraForOrchestration(
    const dvec3& position, const vec3& forward) {
  if (m_orchestrationService) {
    // Convert to CameraData for orchestration service
    ::Application::Orchestration::CameraData cameraData;
    cameraData.position = vec3(position.x, position.y, position.z);
    cameraData.forward = normalize(forward);
    cameraData.up = vec3(0.0f, 1.0f, 0.0f);
    cameraData.right = normalize(cross(cameraData.forward, cameraData.up));
    cameraData.fov = 45.0f;
    cameraData.aspectRatio = 16.0f / 9.0f;
    cameraData.nearPlane = 0.1f;
    cameraData.farPlane = 100000.0f;

    // Note: CameraData calculates matrices on-demand via getViewMatrix(), etc.
    // No need to call updateMatrices() as it doesn't exist in this interface

    m_orchestrationService->updateCameraData(cameraData);
  }
}

bool VisualFeedbackApplication::InitializeOrchestrationServices() {
  try {
    // Create multi-planet renderer
    if (m_gpuManager) {
      // Get Vulkan device from GPU manager
      VkDevice device = m_gpuManager->GetVkDevice();
      VkPhysicalDevice physicalDevice = m_gpuManager->GetVkPhysicalDevice();

      if (device != VK_NULL_HANDLE && physicalDevice != VK_NULL_HANDLE) {
        auto rendererFactory = std::make_unique<
            ::Application::Rendering::MultiPlanetRendererFactory>(
            device, physicalDevice);
        ::Application::Rendering::SpatialConfig spatialConfig;
        spatialConfig.maxVisiblePlanets =
            static_cast<uint32_t>(m_config.planetsPerGeneration);
        m_planetRenderingService =
            rendererFactory->createService(spatialConfig);

        if (!m_planetRenderingService ||
            !m_planetRenderingService->initialize()) {
          LogError("Failed to initialize multi-planet renderer");
          return false;
        }
      } else {
        LogWarn("Vulkan resources not available, using mock rendering service");
      }
    }

    // Create orchestration service
    auto orchestrationFactory = std::make_unique<
        ::Application::Orchestration::MultiPlanetOrchestrationBridgeFactory>();
    ::Application::Orchestration::OrchestrationConfig config;

    // Configure orchestration based on feedback config
    config.maxConcurrentGenerations =
        std::max(1u, static_cast<uint32_t>(m_config.planetsPerGeneration / 2));
    config.maxConcurrentRendering =
        static_cast<uint32_t>(m_config.planetsPerGeneration);
    config.maxActivePlanets = static_cast<uint32_t>(
        m_config.planetsPerGeneration * m_config.maxGenerations);
    config.enableDistanceBasedPriority = true;
    config.enableResourceSharing = true;
    config.enableMemoryStreaming = true;

    m_orchestrationService = orchestrationFactory->createService(config);
    if (!m_orchestrationService) {
      LogError("Failed to create orchestration service");
      return false;
    }

    // Initialize orchestration service
    PlanetGen::Rendering::VulkanResourceManager* resourceManager =
        m_gpuManager ? m_gpuManager->GetVulkanResourceManager() : nullptr;
    if (!m_orchestrationService->initialize(config, m_planetRenderingService,
                                            resourceManager)) {
      LogError("Failed to initialize orchestration service");
      return false;
    }

    // Set up callbacks
    using namespace ::Application::Orchestration;

    m_orchestrationService->setPlanetStateChangeCallback(
        [this](ManagedPlanetID id, PlanetLifecycleState oldState,
               PlanetLifecycleState newState) {
          OnPlanetStateChanged(id, oldState, newState);
        });

    m_orchestrationService->setPlanetGenerationProgressCallback(
        [this](ManagedPlanetID id, float progress) {
          OnPlanetGenerationProgress(id, progress);
        });

    m_orchestrationService->setOrchestrationErrorCallback(
        [this](const std::string& operation, const std::string& message) {
          OnOrchestrationError(operation, message);
        });

    LogInfo("Orchestration services initialized successfully");
    return true;
  } catch (const std::exception& e) {
    LogError("Exception during orchestration initialization: " +
             std::string(e.what()));
    return false;
  }
}

void VisualFeedbackApplication::ShutdownOrchestrationServices() {
  // Guard against double shutdown
  if (!m_orchestrationService && !m_planetRenderingService) {
    return;  // Already shut down
  }

  try {
    if (m_orchestrationService) {
      m_orchestrationService->shutdown();
      m_orchestrationService.reset();
    }
  } catch (...) {
    std::cerr << "Exception during orchestration service shutdown" << std::endl;
    m_orchestrationService.reset();  // Force reset even on exception
  }

  try {
    if (m_planetRenderingService) {
      m_planetRenderingService->shutdown();
      m_planetRenderingService.reset();
    }
  } catch (...) {
    std::cerr << "Exception during planet rendering service shutdown"
              << std::endl;
    m_planetRenderingService.reset();  // Force reset even on exception
  }

  m_multiPlanetModeEnabled = false;
  LogInfo("Orchestration services shut down");
}

bool VisualFeedbackApplication::RunMultiPlanetFeedbackOptimization() {
  LogInfo("Running multi-planet feedback optimization...");

  if (!m_orchestrationService) {
    LogError("Orchestration service not initialized");
    return false;
  }

  try {
    // Add planets for optimization based on configuration
    std::vector<std::string> templates = {"Earth-like", "Mars-like",
                                          "Water-world", "Volcanic"};

    for (int i = 0; i < m_config.planetsPerGeneration; ++i) {
      std::string templateName = templates[i % templates.size()];
      dvec3 position(i * 20000.0, 0.0, 0.0);  // Space planets 20km apart
      std::string displayName = templateName + "_" + std::to_string(i);

      auto planetID = m_orchestrationService->addPlanet(templateName, position,
                                                        displayName);
      if (planetID == ::Application::Orchestration::INVALID_MANAGED_PLANET_ID) {
        LogError("Failed to add planet " + displayName);
        continue;
      }

      // Start generation for this planet
      if (!m_orchestrationService->startPlanetGeneration(planetID, true)) {
        LogError("Failed to start generation for planet " + displayName);
        continue;
      }
    }

    // Monitor progress and wait for completion
    auto startTime = std::chrono::steady_clock::now();
    auto timeout =
        std::chrono::seconds(static_cast<int>(m_config.shutdownTimeSeconds));

    while (true) {
      auto now = std::chrono::steady_clock::now();
      if (now - startTime > timeout) {
        LogWarn("Multi-planet optimization timed out");
        break;
      }

      // Update orchestration
      m_orchestrationService->update(0.1f);

      // Check if all planets are generated
      auto metrics = m_orchestrationService->getMetrics();
      if (metrics.generatingPlanets == 0 && metrics.activePlanets > 0) {
        LogInfo("All planets generated successfully");
        break;
      }

      // Report progress
      float progress = static_cast<float>(metrics.activePlanets -
                                          metrics.generatingPlanets) /
                       static_cast<float>(std::max(1u, metrics.activePlanets));
      ReportProgress(
          progress * 100.0f,
          "Generating planets: " + std::to_string(metrics.generatingPlanets) +
              " remaining");

      std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }

    LogInfo("Multi-planet feedback optimization completed");
    return true;
  } catch (const std::exception& e) {
    LogError("Exception during multi-planet optimization: " +
             std::string(e.what()));
    return false;
  }
}

void VisualFeedbackApplication::OnPlanetStateChanged(
    ::Application::Orchestration::ManagedPlanetID id,
    ::Application::Orchestration::PlanetLifecycleState oldState,
    ::Application::Orchestration::PlanetLifecycleState newState) {
  std::string stateNames[] = {"Pending", "Generating", "Generated", "Rendering",
                              "Paused",  "Error",      "Cleanup"};

  LogInfo("Planet " + std::to_string(id) +
          " state changed: " + stateNames[static_cast<int>(oldState)] + " -> " +
          stateNames[static_cast<int>(newState)]);

  // Handle specific state transitions
  if (newState ==
      ::Application::Orchestration::PlanetLifecycleState::Generated) {
    // Start rendering for newly generated planets
    if (m_orchestrationService) {
      m_orchestrationService->startPlanetRendering(id);
    }
  } else if (newState ==
             ::Application::Orchestration::PlanetLifecycleState::Error) {
    LogError("Planet " + std::to_string(id) + " entered error state");
  }
}

void VisualFeedbackApplication::OnPlanetGenerationProgress(
    ::Application::Orchestration::ManagedPlanetID id, float progress) {
  if (m_config.verboseMode) {
    LogInfo("Planet " + std::to_string(id) +
            " generation progress: " + std::to_string(progress * 100.0f) + "%");
  }

  // Aggregate progress for overall feedback
  if (m_progressCallback) {
    // Calculate overall progress based on all planets
    auto metrics = m_orchestrationService->getMetrics();
    float overallProgress =
        static_cast<float>(metrics.activePlanets - metrics.generatingPlanets) /
        static_cast<float>(std::max(1u, metrics.activePlanets));
    int generation = static_cast<int>(metrics.totalPlanetsAdded);
    float bestScore = 0.0f;  // Placeholder - would need to track best scores
    m_progressCallback(generation, bestScore, overallProgress * 100.0f);
  }
}

void VisualFeedbackApplication::OnOrchestrationError(
    const std::string& operation, const std::string& message) {
  LogError("Orchestration error in " + operation + ": " + message);
}

bool VisualFeedbackApplication::SelectBestCandidateFromOrchestration() {
  LogInfo("Selecting best candidate from orchestration...");

  if (!m_orchestrationService) {
    return false;
  }

  // Get all planet IDs from orchestration
  auto planetIDs = m_orchestrationService->getAllPlanetIDs();
  if (planetIDs.empty()) {
    LogError("No planets available in orchestration");
    return false;
  }

  // Find the best planet by evaluating each one
  float bestScore = -1.0f;
  ::Application::Orchestration::ManagedPlanetID bestPlanetID =
      ::Application::Orchestration::INVALID_MANAGED_PLANET_ID;

  for (auto planetID : planetIDs) {
    auto planetOpt = m_orchestrationService->getPlanet(planetID);
    if (!planetOpt.has_value()) continue;

    auto& planet = planetOpt.value();

    // Only consider generated planets
    if (planet.state !=
            ::Application::Orchestration::PlanetLifecycleState::Generated &&
        planet.state !=
            ::Application::Orchestration::PlanetLifecycleState::Rendering) {
      continue;
    }

    // Calculate fitness score based on planet metrics
    float score = CalculateOrchestrationFitnessScore(planet);

    if (score > bestScore) {
      bestScore = score;
      bestPlanetID = planetID;
    }
  }

  if (bestPlanetID == ::Application::Orchestration::INVALID_MANAGED_PLANET_ID) {
    LogError("No suitable planets found in orchestration");
    return false;
  }

  // Create a candidate from the best orchestration planet
  auto bestPlanetOpt = m_orchestrationService->getPlanet(bestPlanetID);
  if (!bestPlanetOpt.has_value()) {
    LogError("Failed to retrieve best planet from orchestration");
    return false;
  }

  // Convert orchestration planet to candidate format
  m_bestCandidate.fitnessScore = bestScore;
  m_bestCandidate.parameters =
      "orchestration_planet_" + std::to_string(bestPlanetID);

  // For now, use placeholder data - in a full implementation,
  // we'd need to extract the actual planetary data from the orchestration
  // planet This would require additional interfaces to access the planet's
  // generation results

  LogInfo("Best orchestration candidate selected with fitness score: " +
          std::to_string(bestScore));
  return true;
}

float VisualFeedbackApplication::CalculateOrchestrationFitnessScore(
    const ::Application::Orchestration::ManagedPlanetInstance& planet) {
  float score = 0.0f;

  // Base score for successfully generated planets
  if (planet.state ==
          ::Application::Orchestration::PlanetLifecycleState::Generated ||
      planet.state ==
          ::Application::Orchestration::PlanetLifecycleState::Rendering) {
    score += 50.0f;
  }

  // Bonus for faster generation
  if (planet.lastGenerationTime > 0.0f) {
    float timeBonus = std::max(0.0f, 30.0f - planet.lastGenerationTime);
    score += timeBonus;
  }

  // Bonus for memory efficiency
  if (planet.memoryUsage > 0) {
    float memoryEfficiency =
        1.0f - (static_cast<float>(planet.memoryUsage) /
                (1024.0f * 1024.0f * 1024.0f));  // Normalize to GB
    score += memoryEfficiency * 20.0f;
  }

  // Priority-based bonus
  score += planet.priority * 10.0f;

  return std::max(0.0f, score);
}

// ============================================================================
// GUI Implementation
// ============================================================================

bool VisualFeedbackApplication::InitializeGUI() {
  if (!m_gpuManager) {
    LogError("GPU manager not available for GUI initialization");
    return false;
  }

  auto* renderSystem = m_gpuManager->GetRenderSystem();
  if (!renderSystem) {
    LogError("Render system not available for GUI initialization");
    return false;
  }

  // GUI components will be created through factory pattern
  // to avoid direct dependencies between modules

  // For now, disable GUI features when no parameter window is injected
  LogWarn(
      "GUI initialization skipped - parameter window must be injected via "
      "dependency injection");
  LogInfo("To enable GUI, inject an IParameterConfigurationGUI implementation");

  // Generator discovery service is not needed here since the GUI will use its
  // own discovery service through the adapter pattern

  // Return true to allow the application to continue without GUI
  // The GUI can be injected later if needed
  return true;
}

void VisualFeedbackApplication::ShutdownGUI() {
  LogInfo("Shutting down GUI...");

  try {
    if (m_parameterWindow) {
      m_parameterWindow->shutdown();
      m_parameterWindow.reset();
    }
  } catch (const std::exception& e) {
    LogError("Exception during parameter window shutdown: " +
             std::string(e.what()));
    m_parameterWindow.reset();  // Force reset on error
  } catch (...) {
    LogError("Unknown exception during parameter window shutdown");
    m_parameterWindow.reset();  // Force reset on error
  }

  try {
    if (m_imguiIntegration) {
      m_imguiIntegration->shutdown();
      m_imguiIntegration.reset();
    }
  } catch (const std::exception& e) {
    LogError("Exception during ImGui integration shutdown: " +
             std::string(e.what()));
    m_imguiIntegration.reset();  // Force reset on error
  } catch (...) {
    LogError("Unknown exception during ImGui integration shutdown");
    m_imguiIntegration.reset();  // Force reset on error
  }

  // Discovery service managed by GUI components

  LogInfo("GUI shutdown complete");
}

void VisualFeedbackApplication::UpdateGUI() {
  if (!m_parameterWindow || !m_showGUI) {
    // Only log this warning occasionally to avoid spam
    static int logCounter = 0;
    if (logCounter++ % 60 == 0) {  // Log every 60 frames (~1 second at 60 FPS)
      LogWarn("GUI update skipped - parameterWindow: " +
              std::to_string(m_parameterWindow != nullptr) +
              ", showGUI: " + std::to_string(m_showGUI));
    }
    return;
  }

  // Begin ImGui frame
  m_parameterWindow->beginFrame();

  // Refresh generator list if needed
  static bool firstUpdate = true;
  if (firstUpdate) {
    LogInfo("First GUI update - refreshing generator list");
    m_parameterWindow->refreshGeneratorList();
    firstUpdate = false;
  }

  // Debug: Check if window is visible
  if (!m_parameterWindow->isVisible()) {
    LogWarn("Parameter window is not visible!");
    m_parameterWindow->setVisible(true);
  }

  // Render the parameter window
  m_parameterWindow->render();

  // End ImGui frame
  m_parameterWindow->endFrame();
}

void VisualFeedbackApplication::RenderGUI() {
  if (!m_parameterWindow || !m_showGUI) {
    // Only log occasionally to avoid spam
    static int logCounter = 0;
    if (logCounter++ % 60 == 0) {
      LogWarn("RenderGUI skipped - parameterWindow: " +
              std::to_string(m_parameterWindow != nullptr) +
              ", showGUI: " + std::to_string(m_showGUI));
    }
    return;
  }

  auto* renderSystem = m_gpuManager->GetRenderSystem();
  if (!renderSystem) {
    static bool errorLogged = false;
    if (!errorLogged) {
      LogError("RenderGUI failed - no render system");
      errorLogged = true;
    }
    return;
  }

  // Get current command buffer from GPU manager
  VkCommandBuffer cmd = m_gpuManager->GetCurrentCommandBuffer();
  if (cmd == VK_NULL_HANDLE) {
    static bool errorLogged = false;
    if (!errorLogged) {
      LogError("RenderGUI failed - no command buffer");
      errorLogged = true;
    }
    return;
  }

  // Render the GUI draw data using the command buffer
  m_parameterWindow->renderDrawData(cmd);
}

bool VisualFeedbackApplication::ProcessGUIEvents() {
  auto* renderSystem = m_gpuManager->GetRenderSystem();
  if (!renderSystem) {
    return false;
  }

  // Process window events
  if (!m_gpuManager->ProcessWindowEvents()) {
    m_renderLoopRunning = false;
    return false;
  }

  // Check for ESC key to toggle GUI
  if (m_gpuManager->IsKeyPressed(GLFW_KEY_ESCAPE)) {
    m_showGUI = !m_showGUI;
  }

  // Check for window close
  if (m_gpuManager->ShouldClose()) {
    m_renderLoopRunning = false;
    return false;
  }

  return true;
}

void VisualFeedbackApplication::OnGeneratorSelected(
    const std::string& generatorId) {
  LogInfo("Generator selected: " + generatorId);

  // Store the selected generator
  m_selectedGenerator = generatorId;

  // The parameter window will handle the parameter loading
  // We just need to wait for the generation callback
}

void VisualFeedbackApplication::OnParameterChanged(const std::string& name,
                                                   const std::string& value) {
  if (m_config.verboseMode) {
    LogInfo("Parameter changed: " + name + " = " + value);
  }

  // Handle real-time parameter updates that don't require mesh regeneration
  if (m_gpuManager) {
    try {
      if (name == "elevation_exaggeration") {
        float exaggeration = std::stof(value);
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                ElevationExaggeration,
            exaggeration);
      } else if (name == "atmosphere_density") {
        float density = std::stof(value);
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                AtmosphereDensity,
            density);
      } else if (name == "sun_intensity") {
        float intensity = std::stof(value);
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                SunIntensity,
            intensity);
      } else if (name == "water_level") {
        float level = std::stof(value);
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                WaterLevel,
            level);
      } else if (name == "water_transparency") {
        float transparency = std::stof(value);
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                WaterTransparency,
            transparency);
      } else if (name == "tessellation_level") {
        float level = std::stof(value);
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                TessellationLevel,
            level);
      } else if (name == "sun_direction_x" || name == "sun_direction_y" ||
                 name == "sun_direction_z") {
        // Handle sun direction as a composite parameter
        static vec3 sunDirection(0.0f, 1.0f, 0.0f);
        if (name == "sun_direction_x")
          sunDirection.x = std::stof(value);
        else if (name == "sun_direction_y")
          sunDirection.y = std::stof(value);
        else if (name == "sun_direction_z")
          sunDirection.z = std::stof(value);
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                SunDirection,
            sunDirection);
      }
      // Water color parameters
      else if (name == "water_color_r" || name == "water_color_g" ||
               name == "water_color_b") {
        static vec3 waterColor(0.0f, 0.2f, 0.4f);
        if (name == "water_color_r")
          waterColor.r = std::stof(value);
        else if (name == "water_color_g")
          waterColor.g = std::stof(value);
        else if (name == "water_color_b")
          waterColor.b = std::stof(value);
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                WaterColor,
            waterColor);
      } else if (name == "shallow_water_color_r" ||
                 name == "shallow_water_color_g" ||
                 name == "shallow_water_color_b") {
        static vec3 shallowWaterColor(0.2f, 0.6f, 0.8f);
        if (name == "shallow_water_color_r")
          shallowWaterColor.r = std::stof(value);
        else if (name == "shallow_water_color_g")
          shallowWaterColor.g = std::stof(value);
        else if (name == "shallow_water_color_b")
          shallowWaterColor.b = std::stof(value);
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                ShallowWaterColor,
            shallowWaterColor);
      } else if (name == "foam_color_r" || name == "foam_color_g" ||
                 name == "foam_color_b") {
        static vec3 foamColor(1.0f, 1.0f, 1.0f);
        if (name == "foam_color_r")
          foamColor.r = std::stof(value);
        else if (name == "foam_color_g")
          foamColor.g = std::stof(value);
        else if (name == "foam_color_b")
          foamColor.b = std::stof(value);
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                FoamColor,
            foamColor);
      } else if (name == "sky_color_r" || name == "sky_color_g" ||
                 name == "sky_color_b") {
        static vec3 skyColor(0.5f, 0.7f, 1.0f);
        if (name == "sky_color_r")
          skyColor.r = std::stof(value);
        else if (name == "sky_color_g")
          skyColor.g = std::stof(value);
        else if (name == "sky_color_b")
          skyColor.b = std::stof(value);
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                SkyColor,
            skyColor);
      } else if (name == "horizon_color_r" || name == "horizon_color_g" ||
                 name == "horizon_color_b") {
        static vec3 horizonColor(0.8f, 0.9f, 1.0f);
        if (name == "horizon_color_r")
          horizonColor.r = std::stof(value);
        else if (name == "horizon_color_g")
          horizonColor.g = std::stof(value);
        else if (name == "horizon_color_b")
          horizonColor.b = std::stof(value);
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                HorizonColor,
            horizonColor);
      } else if (name == "ambient_color_r" || name == "ambient_color_g" ||
                 name == "ambient_color_b") {
        static vec3 ambientColor(0.2f, 0.3f, 0.4f);
        if (name == "ambient_color_r")
          ambientColor.r = std::stof(value);
        else if (name == "ambient_color_g")
          ambientColor.g = std::stof(value);
        else if (name == "ambient_color_b")
          ambientColor.b = std::stof(value);
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                AmbientColor,
            ambientColor);
      } else if (name == "flow_direction_x" || name == "flow_direction_y") {
        static vec2 flowDirection(1.0f, 0.0f);
        if (name == "flow_direction_x")
          flowDirection.x = std::stof(value);
        else if (name == "flow_direction_y")
          flowDirection.y = std::stof(value);
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                FlowDirection,
            flowDirection);
      }
      // Water float parameters
      else if (name == "foam_threshold") {
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                FoamThreshold,
            std::stof(value));
      } else if (name == "deep_water_depth") {
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                DeepWaterDepth,
            std::stof(value));
      } else if (name == "shallow_water_depth") {
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                ShallowWaterDepth,
            std::stof(value));
      } else if (name == "wave_height") {
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                WaveHeight,
            std::stof(value));
      } else if (name == "water_roughness") {
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                WaterRoughness,
            std::stof(value));
      } else if (name == "flow_speed") {
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                FlowSpeed,
            std::stof(value));
      } else if (name == "caustic_strength") {
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                CausticStrength,
            std::stof(value));
      } else if (name == "wave_speed") {
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                WaveSpeed,
            std::stof(value));
      } else if (name == "water_opacity") {
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                WaterOpacity,
            std::stof(value));
      } else if (name == "refraction_strength") {
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                RefractionStrength,
            std::stof(value));
      } else if (name == "reflection_strength") {
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                ReflectionStrength,
            std::stof(value));
      } else if (name == "fresnel_power") {
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                FresnelPower,
            std::stof(value));
      } else if (name == "fresnel_bias") {
        m_gpuManager->UpdateRenderParameter(
            Application::Feedback::GPUInfrastructureManager::RenderParameter::
                FresnelBias,
            std::stof(value));
      }
    } catch (const std::exception& e) {
      LogError("Failed to parse " + name + " value: " + value);
    }
  }

  // The parameter window now handles auto-preview internally for other
  // parameters
}

void VisualFeedbackApplication::OnPreviewRequested() {
  LogInfo("Preview requested - starting planet generation");

  // Collect current parameters from GUI if available
  if (m_parameterWindow) {
    // Store the current parameter set for use in generation
    m_pendingParameterUpdate = true;
  }

  // Start the optimization process which will generate a planet
  if (!IsOptimizationRunning()) {
    if (StartOptimization()) {
      LogInfo("Planet generation started successfully");
    } else {
      LogError("Failed to start planet generation");
    }
  } else {
    LogWarn("Generation already in progress");
  }
}

void VisualFeedbackApplication::ResetGenerationState() {
  LogInfo("Resetting generation state");

  // Reset optimization state
  m_optimizationState = OptimizationState::NOT_STARTED;

  // Clear candidate history
  m_candidateHistory.clear();

  // Clear mesh resources
  m_bestPlanetMesh.reset();
  m_bestWaterMesh.reset();

  // Reset pending parameter flag
  m_pendingParameterUpdate = false;
}

// GUI Injection method
void VisualFeedbackApplication::SetParameterConfigurationGUI(
    std::unique_ptr<PlanetGen::GUI::IParameterConfigurationGUI> gui) {
  m_parameterWindow = std::move(gui);

  if (m_parameterWindow && m_gpuManager) {
    // Set up callbacks after injection
    m_parameterWindow->setGeneratorSelectionCallback(
        [this](const std::string& generatorId) {
          OnGeneratorSelected(generatorId);
        });

    m_parameterWindow->setParameterChangeCallback(
        [this](const std::string& name, const std::string& value) {
          OnParameterChanged(name, value);
        });

    m_parameterWindow->setPreviewRequestCallback(
        [this]() { OnPreviewRequested(); });

    // Initialize the window
    auto result = m_parameterWindow->initialize();
    if (!result) {
      LogError("Failed to initialize injected parameter window");
    } else {
      m_parameterWindow->setVisible(true);
      LogInfo("Parameter configuration GUI injected successfully");
    }
  }
}

// Factory function implementation
std::unique_ptr<PlanetGen::Application::Feedback::IFeedbackApplication>
PlanetGen::Application::Feedback::CreateVisualFeedbackApplication() {
  return std::make_unique<VisualFeedbackApplication>();
}

// Factory implementation for FeedbackApplicationFactory
namespace PlanetGen::Application::Feedback {
std::unique_ptr<IFeedbackApplication> CreateApplicationImpl(
    FeedbackApplicationFactory::ApplicationType type) {
  switch (type) {
    case FeedbackApplicationFactory::ApplicationType::TERRAIN_OPTIMIZER:
      return std::make_unique<VisualFeedbackApplication>();
    case FeedbackApplicationFactory::ApplicationType::BATCH_PROCESSOR:
      return std::make_unique<
          VisualFeedbackApplication>();  // For now, use same implementation
    case FeedbackApplicationFactory::ApplicationType::INTERACTIVE_EXPLORER:
      return std::make_unique<
          VisualFeedbackApplication>();  // For now, use same implementation
    default:
      return nullptr;
  }
}
}  // namespace PlanetGen::Application::Feedback
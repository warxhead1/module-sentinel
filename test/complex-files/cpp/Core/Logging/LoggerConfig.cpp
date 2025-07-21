// Example configuration for the new logging system
// This can be called at application startup

#include <string>

import Core.Logging.Logger;

namespace PlanetGen::Core::Logging {

void ConfigureLogging(bool verbose = false) {
    auto& logger = Logger::getInstance();
    
    // Set global log level based on verbosity
    if (verbose) {
        logger.setLevel(LogLevel::DEBUG);
    } else {
        logger.setLevel(LogLevel::INFO);
    }
    
    // Configure component-specific levels
    // This helps reduce spam from specific components
    logger.setComponentLevel("WaterRenderer", LogLevel::INFO);
    logger.setComponentLevel("WaterDepthPrepass", LogLevel::WARN);
    logger.setComponentLevel("WaterSurface", LogLevel::WARN);
    logger.setComponentLevel("WaterCompositor", LogLevel::WARN);
    
    // For debugging specific issues, you can enable detailed logging for specific components
    // logger.setComponentLevel("WaterRenderer", LogLevel::DEBUG);
    
    // Enable console output (default is true)
    logger.setConsoleEnabled(true);
    
    // Optionally enable file logging
    // logger.setFileOutput("planet_procgen.log");
}

} // namespace PlanetGen::Core::Logging
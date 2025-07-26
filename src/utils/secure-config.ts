import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface SecureConfig {
  geminiApiKey?: string;
  projectPath?: string;
  projectName?: string;
  languages?: string[];
  dbPath?: string;
  debugMode?: boolean;
  scanPaths?: string[];
  filePatterns?: {
    source?: string[];
    header?: string[];
  };
  enableMultiLanguage?: boolean;
}

export class SecureConfigManager {
  private static readonly CONFIG_DIR = path.join(
    os.homedir(),
    ".module-sentinel"
  );
  private static readonly CONFIG_FILE = path.join(
    SecureConfigManager.CONFIG_DIR,
    "config.json"
  );

  /**
   * Get configuration from multiple sources (secure + project config)
   */
  static getConfig(): SecureConfig {
    let config: SecureConfig = {};

    try {
      // First, try to read project config (module-sentinel.config.json)
      const projectConfigPaths = [
        path.join(process.cwd(), "module-sentinel.config.json"),
        path.join(process.cwd(), "module-sentinel.config.example.json")
      ];

      for (const projectConfigPath of projectConfigPaths) {
        if (fs.existsSync(projectConfigPath)) {
          try {
            const projectConfigData = fs.readFileSync(projectConfigPath, "utf8");
            const projectConfig = JSON.parse(projectConfigData) as SecureConfig;
            config = { ...config, ...projectConfig };
            break;
          } catch (error) {
            console.warn(`[SecureConfig] Error reading project config ${projectConfigPath}:`, error);
          }
        }
      }

      // Ensure config directory exists
      if (!fs.existsSync(SecureConfigManager.CONFIG_DIR)) {
        fs.mkdirSync(SecureConfigManager.CONFIG_DIR, { mode: 0o700 }); // Only owner can read/write
      }

      // Try to read secure config file (overrides project config for sensitive data)
      if (fs.existsSync(SecureConfigManager.CONFIG_FILE)) {
        const configData = fs.readFileSync(
          SecureConfigManager.CONFIG_FILE,
          "utf8"
        );
        const secureConfig = JSON.parse(configData) as SecureConfig;

        // Validate file permissions (should be 600 - only owner read/write)
        const stats = fs.statSync(SecureConfigManager.CONFIG_FILE);
        const mode = stats.mode & parseInt("777", 8);
        if (mode !== parseInt("600", 8)) {
          console.warn(
            "[SecureConfig] Warning: Config file permissions are not secure (should be 600)"
          );
          console.warn(
            `[SecureConfig] Current permissions: ${mode.toString(8)}`
          );
          console.warn(
            `[SecureConfig] Run: chmod 600 ${SecureConfigManager.CONFIG_FILE}`
          );
        }

        // Merge secure config over project config
        config = { ...config, ...secureConfig };
      }
    } catch (error) {
      console.error("[SecureConfig] Error reading config:", error);
    }

    return config;
  }

  /**
   * Save configuration to secure location
   */
  static saveConfig(config: SecureConfig): void {
    try {
      // Ensure config directory exists with secure permissions
      if (!fs.existsSync(SecureConfigManager.CONFIG_DIR)) {
        fs.mkdirSync(SecureConfigManager.CONFIG_DIR, { mode: 0o700 });
      }

      // Write config file
      fs.writeFileSync(
        SecureConfigManager.CONFIG_FILE,
        JSON.stringify(config, null, 2),
        { mode: 0o600 } // Only owner can read/write
      );
    } catch (error) {
      console.error("[SecureConfig] Error saving config:", error);
      throw error;
    }
  }

  /**
   * Get API key from multiple sources in order of preference:
   * 1. Secure config file
   * 2. Environment variable (for backwards compatibility)
   * 3. Return undefined
   */
  static getGeminiApiKey(): string | undefined {
    // First try secure config file
    const config = SecureConfigManager.getConfig();
    if (config.geminiApiKey && config.geminiApiKey.trim() !== "") {
      return config.geminiApiKey;
    }

    // Fall back to environment variable (with warning)
    const envKey = process.env.GEMINI_API_KEY;
    if (envKey && envKey.trim() !== "") {
      console.warn(
        "[SecureConfig] Using GEMINI_API_KEY from environment (not secure)"
      );
      console.warn(
        "[SecureConfig] Consider moving to secure config: module-sentinel-config set-api-key"
      );
      return envKey;
    }

    return undefined;
  }

  /**
   * Initialize config with setup wizard
   */
  static async initializeConfig(): Promise<void> {
    console.log("🔐 Module Sentinel Secure Configuration Setup");
    console.log("============================================");
    console.log();

    const config: SecureConfig = {};

    // Get existing config
    const existingConfig = SecureConfigManager.getConfig();

    console.log(
      "Setting up secure configuration in:",
      SecureConfigManager.CONFIG_DIR
    );
    console.log();

    // For now, we'll just create the structure - actual interactive setup would need readline
    config.projectPath =
      existingConfig.projectPath || "/home/warxh/planet_procgen";
    config.dbPath =
      existingConfig.dbPath ||
      path.join(SecureConfigManager.CONFIG_DIR, "module-sentinel.db");

    // Don't auto-set API key - require manual setup
    if (!existingConfig.geminiApiKey) {
      console.log("⚠️  GEMINI_API_KEY not configured");
      console.log("To set your API key securely:");
      console.log(
        `  echo '{"geminiApiKey":"your-api-key-here","projectPath":"${config.projectPath}","dbPath":"${config.dbPath}"}' > ${SecureConfigManager.CONFIG_FILE}`
      );

      console.log();
    }

    // Save config (without API key if not provided)
    SecureConfigManager.saveConfig(config);

    console.log("✅ Secure configuration initialized");
  }

  /**
   * Set API key securely
   */
  static setApiKey(apiKey: string): void {
    if (!apiKey || apiKey.trim() === "") {
      throw new Error("API key cannot be empty");
    }

    const config = SecureConfigManager.getConfig();
    config.geminiApiKey = apiKey.trim();
    SecureConfigManager.saveConfig(config);

    console.log("✅ Gemini API key saved securely");

    console.log("🔒 File permissions: 600 (owner only)");
  }

  /**
   * Get config file path for reference
   */
  static getConfigPath(): string {
    return SecureConfigManager.CONFIG_FILE;
  }

  /**
   * Check if config is properly secured
   */
  static checkSecurity(): { secure: boolean; issues: string[] } {
    const issues: string[] = [];

    try {
      // Check if config file exists
      if (!fs.existsSync(SecureConfigManager.CONFIG_FILE)) {
        issues.push("Config file does not exist");
        return { secure: false, issues };
      }

      // Check file permissions
      const stats = fs.statSync(SecureConfigManager.CONFIG_FILE);
      const mode = stats.mode & parseInt("777", 8);
      if (mode !== parseInt("600", 8)) {
        issues.push(`File permissions are ${mode.toString(8)}, should be 600`);
      }

      // Check directory permissions
      const dirStats = fs.statSync(SecureConfigManager.CONFIG_DIR);
      const dirMode = dirStats.mode & parseInt("777", 8);
      if (dirMode !== parseInt("700", 8)) {
        issues.push(
          `Directory permissions are ${dirMode.toString(8)}, should be 700`
        );
      }

      // Check if API key is set
      const config = SecureConfigManager.getConfig();
      if (!config.geminiApiKey || config.geminiApiKey.trim() === "") {
        issues.push("Gemini API key not configured");
      }

      return { secure: issues.length === 0, issues };
    } catch (error) {
      issues.push(`Error checking security: ${error}`);
      return { secure: false, issues };
    }
  }
}

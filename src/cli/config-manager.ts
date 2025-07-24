#!/usr/bin/env node

import { SecureConfigManager } from "../utils/secure-config.js";

function showHelp() {
  console.log("🔐 Module Sentinel Secure Configuration Manager");
  console.log("==============================================");
  console.log();
  console.log("Usage: module-sentinel-config <command> [args]");
  console.log();
  console.log("Commands:");
  console.log("  init                    Initialize secure configuration");
  console.log("  set-api-key <key>      Set Gemini API key securely");
  console.log(
    "  show                   Show current configuration (API key hidden)"
  );
  console.log("  check                  Check configuration security");
  console.log("  path                   Show configuration file path");
  console.log("  help                   Show this help");
  console.log();
  console.log("Examples:");
  console.log("  module-sentinel-config init");
  console.log('  module-sentinel-config set-api-key "your-gemini-api-key"');
  console.log("  module-sentinel-config check");
  console.log();
  console.log("Security:");
  console.log("  • Config stored in ~/.module-sentinel/config.json");
  console.log("  • File permissions: 600 (owner read/write only)");
  console.log("  • Directory permissions: 700 (owner access only)");
}

function showConfig() {
  const config = SecureConfigManager.getConfig();

  console.log("📋 Current Configuration:");
  console.log("========================");
  console.log();

  console.log();
}

function checkSecurity() {
  console.log("🔒 Security Check:");
  console.log("=================");
  console.log();

  const security = SecureConfigManager.checkSecurity();

  if (security.secure) {
    console.log("✅ Configuration is secure");
  } else {
    console.log("⚠️  Security issues found:");
    security.issues.forEach((issue) => {});
    console.log();
    console.log("🔧 To fix permissions:");
  }
}

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  try {
    switch (command) {
      case "init":
        await SecureConfigManager.initializeConfig();
        break;

      case "set-api-key":
        if (args.length !== 1) {
          console.error("❌ Error: set-api-key requires exactly one argument");
          console.error(
            "Usage: module-sentinel-config set-api-key <your-api-key>"
          );
          process.exit(1);
        }
        SecureConfigManager.setApiKey(args[0]);
        break;

      case "show":
        showConfig();
        break;

      case "check":
        checkSecurity();
        break;

      case "path":
        console.log(SecureConfigManager.getConfigPath());
        break;

      case "help":
      case undefined:
        showHelp();
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        console.error(
          'Run "module-sentinel-config help" for usage information'
        );
        process.exit(1);
    }
  } catch (error) {
    console.error(
      "❌ Error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
}

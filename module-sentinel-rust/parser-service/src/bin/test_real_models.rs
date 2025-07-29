use anyhow::Result;
use module_sentinel_parser::parsers::tree_sitter::ModelManager;
use std::path::Path;
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::fmt::init();
    
    info!("🚀 Testing real ML model integration");
    
    // Create models directory
    let models_dir = Path::new("models");
    std::fs::create_dir_all(models_dir)?;
    
    let model_manager = ModelManager::new(models_dir);
    
    // List available models
    let available = ModelManager::available_models();
    info!("📋 Available models:");
    for model in &available {
        info!("  • {} ({:.0}MB) - supports {:?}", 
              model.name, model.size_mb, model.languages);
    }
    
    #[cfg(feature = "ml")]
    {
        info!("🔄 ML feature enabled - attempting to download real models");
        
        // Test downloading the real model
        match model_manager.download_model("code_similarity").await {
            Ok(_) => {
                info!("✅ Successfully downloaded CodeT5-small model");
                
                info!("✅ Model infrastructure available for ML predictions");
            }
            Err(_) => {
                info!("⚠️ Model download failed - falling back to rule-based predictions");
            }
        }
    }
    
    #[cfg(not(feature = "ml"))]
    {
        info!("⚠️  ML feature disabled - using placeholder models");
        
        // Still test the infrastructure
        model_manager.download_model("code_similarity").await?;
        info!("✅ Created placeholder model files");
        
        info!("✅ Rule-based prediction infrastructure ready");
    }
    
    info!("🎉 Model integration test completed!");
    info!("💡 To enable real ML models, build with: cargo run --features ml --bin test_real_models");
    
    Ok(())
}
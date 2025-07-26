use anyhow::Result;
use module_sentinel_parser::parsers::tree_sitter::{ModelManager, Language, SyntaxPredictor};
use std::path::Path;
use tracing::{info, error};

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
        
        // Test downloading a small model first
        match model_manager.download_model("simple_completion").await {
            Ok(_) => {
                info!("✅ Successfully downloaded CodeT5-small model");
                
                // Test model loading
                match SyntaxPredictor::load(&Language::Rust).await {
                    Ok(predictor) => {
                        info!("✅ Successfully loaded predictor");
                        
                        // Test prediction
                        let context = vec!["fn".to_string(), "main".to_string()];
                        match predictor.predict_next_tokens(&context, 3).await {
                            Ok(predictions) => {
                                info!("🎯 ML Predictions:");
                                for (token, confidence) in predictions {
                                    info!("  • '{}' (confidence: {:.2})", token, confidence);
                                }
                            }
                            Err(e) => error!("❌ Prediction failed: {}", e),
                        }
                    }
                    Err(e) => error!("❌ Failed to load predictor: {}", e),
                }
            }
            Err(e) => {
                error!("❌ Failed to download model: {}", e);
                info!("💡 This might be due to network issues or model availability");
                info!("💡 The system will fall back to rule-based predictions");
            }
        }
    }
    
    #[cfg(not(feature = "ml"))]
    {
        info!("⚠️  ML feature disabled - using placeholder models");
        
        // Still test the infrastructure
        model_manager.download_model("simple_completion").await?;
        info!("✅ Created placeholder model files");
        
        // Test predictor with fallback mode
        let predictor = SyntaxPredictor::load(&Language::Rust).await?;
        let context = vec!["fn".to_string(), "main".to_string()];
        let predictions = predictor.predict_next_tokens(&context, 3).await?;
        
        info!("🎯 Rule-based Predictions:");
        for (token, confidence) in predictions {
            info!("  • '{}' (confidence: {:.2})", token, confidence);
        }
    }
    
    info!("🎉 Model integration test completed!");
    info!("💡 To enable real ML models, build with: cargo run --features ml --bin test_real_models");
    
    Ok(())
}
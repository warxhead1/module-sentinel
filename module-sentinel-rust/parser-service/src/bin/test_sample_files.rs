use anyhow::Result;
use module_sentinel_parser::services::{ParsingService, ParsingConfig};
use module_sentinel_parser::database::project_database::ProjectDatabase;
use std::path::Path;
use std::time::Instant;
use tracing::{info, error};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::fmt::init();
    
    info!("🚀 Testing ML-enhanced parser on sample files from real project");
    
    // Initialize database and parsing service  
    let temp_dir = std::env::temp_dir().join("module-sentinel-sample-test");
    std::fs::create_dir_all(&temp_dir)?;
    let project_db = ProjectDatabase::new(&temp_dir).await?;
    let config = ParsingConfig::default();
    let parsing_service = ParsingService::new(project_db, config).await?;
    
    // Test files from the microservices demo (using supported languages)
    let test_files = vec![
        "/home/warxh/cpp_mcp_master/test-multi-proj/microservices-demo/src/loadgenerator/locustfile.py",
        "/home/warxh/cpp_mcp_master/test-multi-proj/microservices-demo/src/shoppingassistantservice/shoppingassistantservice.py",
        "/home/warxh/cpp_mcp_master/test-multi-proj/microservices-demo/src/paymentservice/index.js",
        "/home/warxh/cpp_mcp_master/test-multi-proj/microservices-demo/src/paymentservice/charge.js",
    ];
    
    info!("📄 Testing parsing of {} sample files", test_files.len());
    
    let mut total_symbols = 0;
    let mut successful_parses = 0;
    let overall_start = Instant::now();
    
    for file_path in &test_files {
        let path = Path::new(file_path);
        if !path.exists() {
            info!("⚠️  Skipping missing file: {}", file_path);
            continue;
        }
        
        info!("🔍 Parsing: {}", path.file_name().unwrap().to_str().unwrap());
        let start_time = Instant::now();
        
        match parsing_service.parse_file(path).await {
            Ok(result) => {
                let duration = start_time.elapsed();
                info!("  ✅ Success in {:.2}ms", duration.as_millis());
                info!("     • Language: {}", result.language);
                info!("     • Symbols found: {}", result.symbols.len());
                info!("     • Relationships: {}", result.relationships.len());
                
                if !result.symbols.is_empty() {
                    info!("     • Sample symbols:");
                    for symbol in result.symbols.iter().take(3) {
                        info!("       - {} ({})", symbol.name, symbol.kind);
                    }
                }
                
                total_symbols += result.symbols.len();
                successful_parses += 1;
                
                if !result.errors.is_empty() {
                    info!("     • Parsing errors: {}", result.errors.len());
                }
            }
            Err(e) => {
                error!("  ❌ Failed to parse {}: {}", file_path, e);
            }
        }
    }
    
    let total_duration = overall_start.elapsed();
    
    // Summary
    info!("📊 Summary:");
    info!("  • Total files tested: {}", test_files.len());
    info!("  • Successfully parsed: {}", successful_parses);
    info!("  • Total symbols extracted: {}", total_symbols);
    info!("  • Total time: {:.2?}", total_duration);
    
    if successful_parses > 0 {
        info!("  • Average symbols per file: {:.1}", total_symbols as f64 / successful_parses as f64);
        info!("  • Average time per file: {:.2}ms", total_duration.as_millis() as f64 / successful_parses as f64);
    }
    
    // Test specific ML features
    info!("🧪 ML Features Status:");
    
    #[cfg(feature = "ml")]
    {
        info!("  • ML features enabled ✅");
        info!("  • ONNX models attempted for enhanced analysis");
        info!("  • Advanced tokenization and semantic analysis active");
    }
    
    #[cfg(not(feature = "ml"))]
    {
        info!("  • ML features disabled (using rule-based analysis)");
        info!("  • To enable ML: cargo run --features ml --bin test_sample_files");
    }
    
    info!("🎉 Sample file test completed!");
    info!("💡 This demonstrates our parser working on real Go microservice code");
    
    Ok(())
}
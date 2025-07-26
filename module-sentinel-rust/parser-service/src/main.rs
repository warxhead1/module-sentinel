use anyhow::Result;
use clap::Parser;
use std::path::PathBuf;
use tracing::{info, warn, error};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod ast;
mod parsers;
mod database;
mod models;
mod patterns;
mod analyzers;
mod config;

use parsers::ParserManager;
use database::DatabaseWriter;
use patterns::PatternEngine;
use config::PerfMode;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// Project path to parse
    #[arg(short, long)]
    project_path: PathBuf,
    
    /// Languages to parse (comma-separated)
    #[arg(short, long, value_delimiter = ',')]
    languages: Vec<String>,
    
    /// Database path
    #[arg(short = 'd', long, default_value = "~/.module-sentinel/prod/prod.db")]
    db_path: PathBuf,
    
    /// Pattern definition directory (for hot-reloading)
    #[arg(long)]
    patterns_dir: Option<PathBuf>,
    
    /// Performance mode
    #[arg(long, default_value = "balanced")]
    perf_mode: PerfMode,
    
    /// Number of parallel workers
    #[arg(short = 'j', long)]
    workers: Option<usize>,
    
    /// Enable debug output
    #[arg(long)]
    debug: bool,
    
    /// File patterns to include
    #[arg(long)]
    include: Vec<String>,
    
    /// File patterns to exclude
    #[arg(long)]
    exclude: Vec<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    
    // Initialize logging
    init_logging(cli.debug);
    
    info!("Module Sentinel Rust Parser v{}", env!("CARGO_PKG_VERSION"));
    info!("Parsing project: {:?}", cli.project_path);
    info!("Languages: {:?}", cli.languages);
    
    // Expand home directory in paths
    let db_path = expand_home_dir(&cli.db_path)?;
    let project_path = cli.project_path.canonicalize()?;
    
    // Initialize components
    let pattern_engine = PatternEngine::new(cli.patterns_dir)?;
    let parser_manager = ParserManager::new(pattern_engine, cli.perf_mode).await?;
    let db_writer = DatabaseWriter::new(&db_path).await?;
    
    // Configure worker pool
    let workers = cli.workers.unwrap_or_else(|| {
        let cpus = num_cpus::get();
        match cli.perf_mode {
            PerfMode::Turbo => cpus,
            PerfMode::Balanced => (cpus * 3) / 4,
            PerfMode::LowMemory => cpus / 2,
        }
    });
    
    info!("Using {} worker threads", workers);
    
    // Parse project
    let start = std::time::Instant::now();
    
    let results = parser_manager
        .parse_project(
            &project_path,
            &cli.languages,
            workers,
            cli.include,
            cli.exclude,
        )
        .await?;
    
    let parse_duration = start.elapsed();
    
    info!(
        "Parsed {} files in {:.2}s ({:.0} files/sec)",
        results.total_files,
        parse_duration.as_secs_f64(),
        results.total_files as f64 / parse_duration.as_secs_f64()
    );
    
    // Write to database
    info!("Writing results to database...");
    let write_start = std::time::Instant::now();
    
    db_writer.write_results(&results).await?;
    
    let write_duration = write_start.elapsed();
    info!(
        "Database write completed in {:.2}s ({:.0} symbols/sec)",
        write_duration.as_secs_f64(),
        results.total_symbols as f64 / write_duration.as_secs_f64()
    );
    
    // Print summary
    println!("\n=== Parse Summary ===");
    println!("Files parsed: {}", results.total_files);
    println!("Symbols extracted: {}", results.total_symbols);
    println!("Relationships found: {}", results.total_relationships);
    println!("Parse errors: {}", results.errors.len());
    println!("Total time: {:.2}s", (parse_duration + write_duration).as_secs_f64());
    
    if !results.errors.is_empty() {
        warn!("{} files had parse errors:", results.errors.len());
        for (file, error) in results.errors.iter().take(10) {
            warn!("  {}: {}", file.display(), error);
        }
        if results.errors.len() > 10 {
            warn!("  ... and {} more", results.errors.len() - 10);
        }
    }
    
    Ok(())
}

fn init_logging(debug: bool) {
    let filter = if debug {
        "module_sentinel_parser=debug,info"
    } else {
        "module_sentinel_parser=info,warn"
    };
    
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| filter.into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();
}

fn expand_home_dir(path: &PathBuf) -> Result<PathBuf> {
    if let Some(path_str) = path.to_str() {
        if path_str.starts_with("~/") {
            if let Some(home) = dirs::home_dir() {
                return Ok(home.join(&path_str[2..]));
            }
        }
    }
    Ok(path.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_expand_home_dir() {
        let path = PathBuf::from("~/test/file.db");
        let expanded = expand_home_dir(&path).unwrap();
        assert!(!expanded.to_str().unwrap().starts_with("~/"));
    }
}
#[derive(Debug, Clone, Copy, clap::ValueEnum)]
pub enum PerfMode {
    /// Maximum speed, high memory usage
    Turbo,
    /// Balanced speed and memory
    Balanced,
    /// Low memory usage
    LowMemory,
}
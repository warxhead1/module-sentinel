use std::collections::HashMap;
use anyhow::Result;
use regex::Regex;
use serde::{Serialize, Deserialize};
use crate::database::models::UniversalSymbol;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubprocessCall {
    pub id: String,
    pub command: String,
    pub arguments: Vec<String>,
    pub file_path: String,
    pub line: u32,
    pub language: String,
    pub library: String,
    pub execution_type: ExecutionType,
    pub confidence: f32,
    pub environment_vars: Vec<String>,
    pub working_directory: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExecutionType {
    Synchronous,   // Process blocks until completion
    Asynchronous,  // Process runs in background
    Detached,      // Process runs independently
    Shell,         // Executed via shell
    Direct,        // Direct executable invocation
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossLanguageExecution {
    pub source_language: String,
    pub target_language: String,
    pub execution_call: SubprocessCall,
    pub target_script: Option<String>,
    pub data_transfer: Vec<DataTransferMethod>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DataTransferMethod {
    CommandLineArgs,
    StandardInput,
    EnvironmentVars,
    FileSystem,
    Pipes,
    SharedMemory,
    NetworkSocket,
}

pub struct SubprocessDetector {
    language_patterns: HashMap<String, Vec<Regex>>,
}

impl SubprocessDetector {
    pub fn new() -> Self {
        let mut detector = Self {
            language_patterns: HashMap::new(),
        };
        detector.initialize_patterns();
        detector
    }

    fn initialize_patterns(&mut self) {
        // JavaScript/TypeScript patterns
        let js_patterns = vec![
            // Node.js child_process patterns
            Regex::new(r#"(?:spawn|exec|execFile|fork)\s*\(\s*["'`]([^"'`]+)["'`]"#).unwrap(),
            Regex::new(r#"child_process\.(?:spawn|exec|execFile|fork)\s*\(\s*["'`]([^"'`]+)["'`]"#).unwrap(),
            // Dynamic imports for cross-language modules
            Regex::new(r#"import\s*\(\s*["'`]([^"'`]+\.(?:py|rs|go|java))["'`]\s*\)"#).unwrap(),
        ];
        self.language_patterns.insert("javascript".to_string(), js_patterns.clone());
        self.language_patterns.insert("typescript".to_string(), js_patterns);

        // Python patterns
        let python_patterns = vec![
            // subprocess module patterns
            Regex::new(r#"subprocess\.(?:run|call|check_call|check_output|Popen)\s*\(\s*\[\s*["']([^"']+)["']"#).unwrap(),
            Regex::new(r#"subprocess\.(?:run|call|check_call|check_output|Popen)\s*\(\s*["']([^"']+)["']"#).unwrap(),
            // os.system patterns
            Regex::new(r#"os\.system\s*\(\s*["']([^"']+)["']"#).unwrap(),
            // Shell command patterns
            Regex::new(r#"(?:os\.popen|commands\.getoutput)\s*\(\s*["']([^"']+)["']"#).unwrap(),
        ];
        self.language_patterns.insert("python".to_string(), python_patterns);

        // Rust patterns
        let rust_patterns = vec![
            // std::process::Command patterns
            Regex::new(r#"Command::new\s*\(\s*"([^"]+)""#).unwrap(),
            Regex::new(r#"std::process::Command::new\s*\(\s*"([^"]+)""#).unwrap(),
            // tokio::process patterns
            Regex::new(r#"tokio::process::Command::new\s*\(\s*"([^"]+)""#).unwrap(),
        ];
        self.language_patterns.insert("rust".to_string(), rust_patterns);

        // C++ patterns
        let cpp_patterns = vec![
            // system() function
            Regex::new(r#"system\s*\(\s*"([^"]+)""#).unwrap(),
            // exec family functions
            Regex::new(r#"(?:execl|execv|execle|execve|execlp|execvp)\s*\(\s*"([^"]+)""#).unwrap(),
            // popen
            Regex::new(r#"popen\s*\(\s*"([^"]+)""#).unwrap(),
        ];
        self.language_patterns.insert("cpp".to_string(), cpp_patterns.clone());
        self.language_patterns.insert("c++".to_string(), cpp_patterns);

        // Go patterns
        let go_patterns = vec![
            // exec.Command patterns
            Regex::new(r#"exec\.Command\s*\(\s*"([^"]+)""#).unwrap(),
            Regex::new(r#"exec\.CommandContext\s*\([^,]+,\s*"([^"]+)""#).unwrap(),
        ];
        self.language_patterns.insert("go".to_string(), go_patterns);

        // Java patterns
        let java_patterns = vec![
            // ProcessBuilder and Runtime.exec patterns
            Regex::new(r#"ProcessBuilder\s*\(\s*"([^"]+)""#).unwrap(),
            Regex::new(r#"Runtime\.getRuntime\(\)\.exec\s*\(\s*"([^"]+)""#).unwrap(),
        ];
        self.language_patterns.insert("java".to_string(), java_patterns);
    }

    /// Extract subprocess calls from symbols
    pub fn extract_subprocess_calls(&self, symbols: &[UniversalSymbol]) -> Result<Vec<SubprocessCall>> {
        let mut subprocess_calls = Vec::new();

        for symbol in symbols {
            if let Some(calls) = self.symbol_to_subprocess_calls(symbol)? {
                subprocess_calls.extend(calls);
            }
        }

        Ok(subprocess_calls)
    }

    /// Convert a symbol to subprocess calls if applicable
    fn symbol_to_subprocess_calls(&self, symbol: &UniversalSymbol) -> Result<Option<Vec<SubprocessCall>>> {
        if let Some(signature) = &symbol.signature {
            // Get language from symbol metadata or file extension
            let language = self.infer_language(&symbol.file_path);
            
            if let Some(patterns) = self.language_patterns.get(&language) {
                let mut calls = Vec::new();
                
                for pattern in patterns {
                    for captures in pattern.captures_iter(signature) {
                        if let Some(command_match) = captures.get(1) {
                            let command = command_match.as_str().to_string();
                            
                            let subprocess_call = SubprocessCall {
                                id: format!("{}:{}:{}", symbol.file_path, symbol.line, symbol.column),
                                command: command.clone(),
                                arguments: self.extract_arguments(signature, &command),
                                file_path: symbol.file_path.clone(),
                                line: symbol.line as u32,
                                language: language.clone(),
                                library: self.detect_library(signature, &language),
                                execution_type: self.detect_execution_type(signature, &language),
                                confidence: self.calculate_confidence(signature, &command, &language),
                                environment_vars: self.extract_environment_vars(signature),
                                working_directory: self.extract_working_directory(signature),
                            };
                            
                            calls.push(subprocess_call);
                        }
                    }
                }
                
                if !calls.is_empty() {
                    return Ok(Some(calls));
                }
            }
        }

        Ok(None)
    }

    /// Infer language from file path
    fn infer_language(&self, file_path: &str) -> String {
        if file_path.ends_with(".js") || file_path.ends_with(".mjs") {
            "javascript".to_string()
        } else if file_path.ends_with(".ts") || file_path.ends_with(".tsx") {
            "typescript".to_string()
        } else if file_path.ends_with(".py") {
            "python".to_string()
        } else if file_path.ends_with(".rs") {
            "rust".to_string()
        } else if file_path.ends_with(".cpp") || file_path.ends_with(".cxx") || file_path.ends_with(".cc") {
            "cpp".to_string()
        } else if file_path.ends_with(".go") {
            "go".to_string()
        } else if file_path.ends_with(".java") {
            "java".to_string()
        } else {
            "unknown".to_string()
        }
    }

    /// Extract command arguments from the signature
    fn extract_arguments(&self, signature: &str, command: &str) -> Vec<String> {
        let mut arguments = Vec::new();
        
        // Look for array/list patterns after the command
        if let Some(args_match) = Regex::new(&format!(r#"["|']{}["|']\s*,\s*\[([^\]]+)\]"#, regex::escape(command)))
            .unwrap().captures(signature) {
            if let Some(args_str) = args_match.get(1) {
                // Parse array elements
                for arg in args_str.as_str().split(',') {
                    let trimmed = arg.trim().trim_matches('"').trim_matches('\'');
                    if !trimmed.is_empty() {
                        arguments.push(trimmed.to_string());
                    }
                }
            }
        }

        arguments
    }

    /// Detect the library being used for subprocess execution
    fn detect_library(&self, signature: &str, language: &str) -> String {
        match language {
            "javascript" | "typescript" => {
                if signature.contains("child_process") {
                    "child_process".to_string()
                } else {
                    "native".to_string()
                }
            }
            "python" => {
                if signature.contains("subprocess") {
                    "subprocess".to_string()
                } else if signature.contains("os.system") {
                    "os".to_string()
                } else {
                    "unknown".to_string()
                }
            }
            "rust" => {
                if signature.contains("tokio::process") {
                    "tokio".to_string()
                } else if signature.contains("std::process") {
                    "std".to_string()
                } else {
                    "std".to_string()
                }
            }
            "cpp" => {
                if signature.contains("popen") {
                    "popen".to_string()
                } else if signature.contains("exec") {
                    "exec".to_string()
                } else {
                    "system".to_string()
                }
            }
            _ => "unknown".to_string(),
        }
    }

    /// Detect the execution type (sync/async/etc.)
    fn detect_execution_type(&self, signature: &str, language: &str) -> ExecutionType {
        match language {
            "javascript" | "typescript" => {
                if signature.contains("spawn") {
                    ExecutionType::Asynchronous
                } else if signature.contains("exec") {
                    ExecutionType::Shell
                } else {
                    ExecutionType::Synchronous
                }
            }
            "python" => {
                if signature.contains("Popen") {
                    ExecutionType::Asynchronous
                } else if signature.contains("os.system") {
                    ExecutionType::Shell
                } else {
                    ExecutionType::Synchronous
                }
            }
            "rust" => {
                if signature.contains("tokio") || signature.contains(".spawn()") {
                    ExecutionType::Asynchronous
                } else {
                    ExecutionType::Synchronous
                }
            }
            _ => ExecutionType::Synchronous,
        }
    }

    /// Calculate confidence score for the subprocess detection
    fn calculate_confidence(&self, signature: &str, command: &str, language: &str) -> f32 {
        let mut confidence: f32 = 0.5; // Base confidence

        // Higher confidence for well-known patterns
        if signature.contains("subprocess.") || signature.contains("child_process.") {
            confidence += 0.3;
        }

        // Higher confidence for executable commands
        if command.contains(".py") || command.contains(".js") || command.contains(".exe") {
            confidence += 0.2;
        }

        // Language-specific confidence adjustments
        match language {
            "python" | "javascript" | "typescript" => confidence += 0.1,
            _ => {}
        }

        confidence.min(1.0_f32)
    }

    /// Extract environment variables from the signature
    fn extract_environment_vars(&self, signature: &str) -> Vec<String> {
        let mut env_vars = Vec::new();
        
        // Look for env parameter patterns
        let env_patterns = vec![
            Regex::new(r#"env\s*=\s*\{[^}]*["']([^"']+)["']\s*:"#).unwrap(),
            Regex::new(r#"process\.env\.([A-Z_]+)"#).unwrap(),
            Regex::new(r#"os\.environ\[["']([^"']+)["']\]"#).unwrap(),
        ];

        for pattern in env_patterns {
            for captures in pattern.captures_iter(signature) {
                if let Some(env_var) = captures.get(1) {
                    env_vars.push(env_var.as_str().to_string());
                }
            }
        }

        env_vars
    }

    /// Extract working directory from the signature
    fn extract_working_directory(&self, signature: &str) -> Option<String> {
        let cwd_patterns = vec![
            Regex::new(r#"cwd\s*[=:]\s*["']([^"']+)["']"#).unwrap(),
            Regex::new(r#"working_directory\s*[=:]\s*["']([^"']+)["']"#).unwrap(),
        ];

        for pattern in cwd_patterns {
            if let Some(captures) = pattern.captures(signature) {
                if let Some(cwd) = captures.get(1) {
                    return Some(cwd.as_str().to_string());
                }
            }
        }

        None
    }

    /// Find cross-language execution patterns
    pub fn find_cross_language_executions(&self, subprocess_calls: &[SubprocessCall]) -> Result<Vec<CrossLanguageExecution>> {
        let mut cross_lang_executions = Vec::new();

        for call in subprocess_calls {
            if let Some(execution) = self.analyze_cross_language_call(call)? {
                cross_lang_executions.push(execution);
            }
        }

        Ok(cross_lang_executions)
    }

    /// Analyze a subprocess call for cross-language execution patterns
    fn analyze_cross_language_call(&self, call: &SubprocessCall) -> Result<Option<CrossLanguageExecution>> {
        let target_language = self.infer_target_language(&call.command);
        
        // Different language execution
        if target_language != "unknown" && target_language != call.language {
            let data_transfer = self.analyze_data_transfer(call);
            
            return Ok(Some(CrossLanguageExecution {
                source_language: call.language.clone(),
                target_language,
                execution_call: call.clone(),
                target_script: self.extract_target_script(&call.command),
                data_transfer,
            }));
        }
        
        // Same language but external script (cross-environment execution)
        if target_language == call.language && self.extract_target_script(&call.command).is_some() {
            let data_transfer = self.analyze_data_transfer(call);
            
            return Ok(Some(CrossLanguageExecution {
                source_language: call.language.clone(),
                target_language: format!("{}_external", target_language),
                execution_call: call.clone(),
                target_script: self.extract_target_script(&call.command),
                data_transfer,
            }));
        }

        Ok(None)
    }

    /// Infer target language from command
    fn infer_target_language(&self, command: &str) -> String {
        if command.contains("python") || command.ends_with(".py") {
            "python".to_string()
        } else if command.contains("node") || command.ends_with(".js") {
            "javascript".to_string()
        } else if command.contains("cargo") || command.ends_with(".rs") {
            "rust".to_string()
        } else if command.contains("go run") || command.ends_with(".go") {
            "go".to_string()
        } else if command.contains("java") || command.ends_with(".java") || command.ends_with(".jar") {
            "java".to_string()
        } 
        // Database tools
        else if command.contains("psql") || command.contains("mysql") || command.contains("sqlite") {
            "sql".to_string()
        }
        // Cache/storage tools
        else if command.contains("redis-cli") || command.contains("memcached") {
            "cache".to_string()
        }
        // Other common tools that represent different execution environments
        else if command.contains("docker") || command.contains("kubectl") {
            "container".to_string()
        }
        else {
            "unknown".to_string()
        }
    }

    /// Extract target script path from command
    fn extract_target_script(&self, command: &str) -> Option<String> {
        // Look for file extensions
        let file_patterns = vec![
            Regex::new(r#"([^/\s]+\.(?:py|js|rs|go|java))(?:\s|$)"#).unwrap(),
        ];

        for pattern in file_patterns {
            if let Some(captures) = pattern.captures(command) {
                if let Some(script) = captures.get(1) {
                    return Some(script.as_str().to_string());
                }
            }
        }

        None
    }

    /// Analyze data transfer methods used in subprocess call
    fn analyze_data_transfer(&self, call: &SubprocessCall) -> Vec<DataTransferMethod> {
        let mut transfer_methods = Vec::new();

        if !call.arguments.is_empty() {
            transfer_methods.push(DataTransferMethod::CommandLineArgs);
        }

        if !call.environment_vars.is_empty() {
            transfer_methods.push(DataTransferMethod::EnvironmentVars);
        }

        // Check for stdin/pipe patterns in the command or arguments
        if call.command.contains("|") || call.arguments.iter().any(|arg| arg.contains("stdin")) {
            transfer_methods.push(DataTransferMethod::Pipes);
        }

        // Default to command line args if no other method detected
        if transfer_methods.is_empty() {
            transfer_methods.push(DataTransferMethod::CommandLineArgs);
        }

        transfer_methods
    }

    /// Get statistics about subprocess detection
    pub fn get_statistics(&self, subprocess_calls: &[SubprocessCall]) -> SubprocessStatistics {
        let mut stats = SubprocessStatistics::default();
        
        stats.total_calls = subprocess_calls.len();
        
        let mut languages = std::collections::HashSet::new();
        let mut libraries = std::collections::HashSet::new();
        let mut commands = std::collections::HashSet::new();
        
        for call in subprocess_calls {
            languages.insert(call.language.clone());
            libraries.insert(call.library.clone());
            commands.insert(call.command.clone());
            
            match call.execution_type {
                ExecutionType::Synchronous => stats.synchronous_calls += 1,
                ExecutionType::Asynchronous => stats.asynchronous_calls += 1,
                ExecutionType::Shell => stats.shell_calls += 1,
                _ => {}
            }
        }
        
        stats.unique_languages = languages.len();
        stats.unique_libraries = libraries.len();
        stats.unique_commands = commands.len();
        stats.language_names = languages.into_iter().collect();
        
        stats
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SubprocessStatistics {
    pub total_calls: usize,
    pub synchronous_calls: usize,
    pub asynchronous_calls: usize,
    pub shell_calls: usize,
    pub unique_languages: usize,
    pub unique_libraries: usize,
    pub unique_commands: usize,
    pub language_names: Vec<String>,
}

impl Default for SubprocessDetector {
    fn default() -> Self {
        Self::new()
    }
}
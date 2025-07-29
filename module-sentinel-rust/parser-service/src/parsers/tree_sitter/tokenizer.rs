use anyhow::Result;
use regex::Regex;
use std::collections::HashMap;
use super::language::Language;

/// Code tokenizer for various programming languages
pub struct CodeTokenizer {
    language: Language,
    vocab: HashMap<String, u32>,
    special_tokens: HashMap<String, u32>,
    identifier_regex: Regex,
    number_regex: Regex,
    string_regex: Regex,
    comment_regex: Regex,
}

impl CodeTokenizer {
    pub fn new(language: &Language) -> Result<Self> {
        let mut tokenizer = Self {
            language: *language,
            vocab: HashMap::new(),
            special_tokens: HashMap::new(),
            identifier_regex: Regex::new(r"[a-zA-Z_][a-zA-Z0-9_]*")?,
            number_regex: Regex::new(r"\d+(?:\.\d+)?")?,
            string_regex: Regex::new(r#""[^"]*"|'[^']*'"#)?,
            comment_regex: Regex::new(r"//.*|/\*[\s\S]*?\*/")?,
        };
        
        tokenizer.initialize_vocab();
        Ok(tokenizer)
    }
    
    /// Encode text into token IDs
    pub fn encode(&self, text: &str) -> Vec<u32> {
        let mut tokens = Vec::new();
        
        // Simple whitespace tokenization with vocabulary lookup
        for word in text.split_whitespace() {
            if let Some(&token_id) = self.vocab.get(word) {
                tokens.push(token_id);
            } else if let Some(&token_id) = self.special_tokens.get(word) {
                tokens.push(token_id);
            } else {
                // Unknown token
                tokens.push(1); // <UNK> token ID
            }
        }
        
        tokens
    }

    fn initialize_vocab(&mut self) {
        // Common programming tokens
        let common_tokens = vec![
            // Special tokens
            ("<PAD>", 0), ("<UNK>", 1), ("<BOS>", 2), ("<EOS>", 3),
            
            // Common keywords across languages
            ("function", 10), ("class", 11), ("if", 12), ("else", 13),
            ("for", 14), ("while", 15), ("return", 16), ("import", 17),
            ("export", 18), ("const", 19), ("let", 20), ("var", 21),
            ("true", 22), ("false", 23), ("null", 24), ("undefined", 25),
            
            // Operators
            ("=", 30), ("==", 31), ("===", 32), ("!=", 33), ("!==", 34),
            ("+", 35), ("-", 36), ("*", 37), ("/", 38), ("%", 39),
            ("&&", 40), ("||", 41), ("!", 42), ("&", 43), ("|", 44),
            
            // Delimiters
            ("(", 50), (")", 51), ("{", 52), ("}", 53), ("[", 54), ("]", 55),
            (";", 56), (",", 57), (".", 58), (":", 59), ("?", 60),
            
            // Common identifiers
            ("length", 70), ("size", 71), ("count", 72), ("index", 73),
            ("value", 74), ("name", 75), ("type", 76), ("data", 77),
            ("result", 78), ("error", 79), ("success", 80), ("status", 81),
        ];

        for (token, id) in common_tokens {
            self.vocab.insert(token.to_string(), id);
        }

        // Language-specific tokens
        match self.language {
            Language::Rust => self.add_rust_tokens(),
            Language::TypeScript | Language::JavaScript => self.add_typescript_tokens(),
            Language::Python => self.add_python_tokens(),
            Language::Cpp => self.add_cpp_tokens(),
            Language::Go => self.add_go_tokens(),
            _ => {}, // Use common tokens only
        }

        // Special tokens
        self.special_tokens.insert("<PAD>".to_string(), 0);
        self.special_tokens.insert("<UNK>".to_string(), 1);
        self.special_tokens.insert("<BOS>".to_string(), 2);
        self.special_tokens.insert("<EOS>".to_string(), 3);
    }

    fn add_rust_tokens(&mut self) {
        let rust_tokens = vec![
            ("fn", 100), ("struct", 101), ("enum", 102), ("impl", 103),
            ("trait", 104), ("mod", 105), ("use", 106), ("pub", 107),
            ("mut", 108), ("ref", 109), ("match", 110), ("Some", 111),
            ("None", 112), ("Ok", 113), ("Err", 114), ("Result", 115),
            ("Option", 116), ("Vec", 117), ("String", 118), ("str", 119),
            ("i32", 120), ("u32", 121), ("f32", 122), ("f64", 123),
            ("bool", 124), ("usize", 125), ("isize", 126), ("char", 127),
            ("&", 128), ("&mut", 129), ("->", 130), ("=>", 131),
            ("::", 132), ("...", 133), ("..", 134), ("?", 135),
        ];

        for (token, id) in rust_tokens {
            self.vocab.insert(token.to_string(), id);
        }
    }

    fn add_typescript_tokens(&mut self) {
        let ts_tokens = vec![
            ("interface", 200), ("type", 201), ("extends", 202), ("implements", 203),
            ("public", 204), ("private", 205), ("protected", 206), ("static", 207),
            ("async", 208), ("await", 209), ("Promise", 210), ("Array", 211),
            ("string", 212), ("number", 213), ("boolean", 214), ("object", 215),
            ("any", 216), ("void", 217), ("never", 218), ("unknown", 219),
            ("as", 220), ("typeof", 221), ("instanceof", 222), ("in", 223),
            ("=>", 224), ("...", 225), ("?.", 226), ("??", 227),
        ];

        for (token, id) in ts_tokens {
            self.vocab.insert(token.to_string(), id);
        }
    }

    fn add_python_tokens(&mut self) {
        let python_tokens = vec![
            ("def", 300), ("class", 301), ("import", 302), ("from", 303),
            ("as", 304), ("with", 305), ("try", 306), ("except", 307),
            ("finally", 308), ("raise", 309), ("pass", 310), ("break", 311),
            ("continue", 312), ("lambda", 313), ("yield", 314), ("global", 315),
            ("nonlocal", 316), ("and", 317), ("or", 318), ("not", 319),
            ("is", 320), ("in", 321), ("None", 322), ("True", 323),
            ("False", 324), ("self", 325), ("cls", 326), ("__init__", 327),
        ];

        for (token, id) in python_tokens {
            self.vocab.insert(token.to_string(), id);
        }
    }

    fn add_cpp_tokens(&mut self) {
        let cpp_tokens = vec![
            ("namespace", 400), ("using", 401), ("template", 402), ("typename", 403),
            ("virtual", 404), ("override", 405), ("final", 406), ("constexpr", 407),
            ("noexcept", 408), ("static_cast", 409), ("dynamic_cast", 410),
            ("const_cast", 411), ("reinterpret_cast", 412), ("auto", 413),
            ("decltype", 414), ("nullptr", 415), ("std", 416), ("vector", 417),
            ("string", 418), ("map", 419), ("set", 420), ("unique_ptr", 421),
            ("shared_ptr", 422), ("make_unique", 423), ("make_shared", 424),
            ("::", 425), ("->", 426), (".*", 427), ("->*", 428),
        ];

        for (token, id) in cpp_tokens {
            self.vocab.insert(token.to_string(), id);
        }
    }

    fn add_go_tokens(&mut self) {
        let go_tokens = vec![
            ("package", 500), ("import", 501), ("func", 502), ("struct", 503),
            ("interface", 504), ("type", 505), ("var", 506), ("const", 507),
            ("chan", 508), ("go", 509), ("defer", 510), ("select", 511),
            ("case", 512), ("default", 513), ("fallthrough", 514), ("range", 515),
            ("make", 516), ("new", 517), ("len", 518), ("cap", 519),
            ("append", 520), ("copy", 521), ("delete", 522), ("close", 523),
            ("panic", 524), ("recover", 525), ("iota", 526), ("nil", 527),
        ];

        for (token, id) in go_tokens {
            self.vocab.insert(token.to_string(), id);
        }
    }

    /// Tokenize code into a sequence of tokens
    pub fn tokenize(&self, code: &str) -> Vec<String> {
        let mut tokens = Vec::new();
        
        // Remove comments first
        let code_no_comments = self.remove_comments(code);
        
        // Split into logical units
        let mut current_pos = 0;
        let chars: Vec<char> = code_no_comments.chars().collect();
        
        while current_pos < chars.len() {
            // Skip whitespace
            if chars[current_pos].is_whitespace() {
                current_pos += 1;
                continue;
            }
            
            // Try to match different token types
            if let Some(token) = self.match_string_literal(&chars, current_pos) {
                tokens.push(format!("STRING_{}", token.len()));
                current_pos += token.len();
            } else if let Some(token) = self.match_number(&chars, current_pos) {
                tokens.push(format!("NUMBER_{}", token));
                current_pos += token.len();
            } else if let Some(token) = self.match_identifier(&chars, current_pos) {
                let token_len = token.len();
                // Check if it's a known keyword
                if self.vocab.contains_key(&token) {
                    tokens.push(token);
                } else {
                    tokens.push("IDENTIFIER".to_string());
                }
                current_pos += token_len;
            } else if let Some(token) = self.match_operator(&chars, current_pos) {
                tokens.push(token.clone());
                current_pos += token.len();
            } else {
                // Single character token
                tokens.push(chars[current_pos].to_string());
                current_pos += 1;
            }
        }
        
        tokens
    }

    /// Tokenize code into token IDs for ML models
    pub fn tokenize_to_ids(&self, code: &str) -> Vec<u32> {
        let tokens = self.tokenize(code);
        tokens.into_iter()
            .map(|token| {
                self.vocab.get(&token)
                    .or_else(|| self.special_tokens.get(&token))
                    .copied()
                    .unwrap_or(1) // Unknown token
            })
            .collect()
    }

    /// Convert token IDs back to tokens
    pub fn decode_ids(&self, ids: &[u32]) -> Vec<String> {
        let id_to_token: HashMap<u32, String> = self.vocab.iter()
            .chain(self.special_tokens.iter())
            .map(|(token, id)| (*id, token.clone()))
            .collect();
            
        ids.iter()
            .map(|id| {
                id_to_token.get(id)
                    .cloned()
                    .unwrap_or_else(|| format!("<UNK_{}>", id))
            })
            .collect()
    }

    fn remove_comments(&self, code: &str) -> String {
        self.comment_regex.replace_all(code, "").to_string()
    }
    
    /// Extract all identifiers from code using regex
    pub fn extract_identifiers(&self, code: &str) -> Vec<String> {
        self.identifier_regex
            .find_iter(code)
            .map(|m| m.as_str().to_string())
            .collect()
    }
    
    /// Extract all numbers from code using regex
    pub fn extract_numbers(&self, code: &str) -> Vec<String> {
        self.number_regex
            .find_iter(code)
            .map(|m| m.as_str().to_string())
            .collect()
    }
    
    /// Extract all string literals from code using regex
    pub fn extract_strings(&self, code: &str) -> Vec<String> {
        self.string_regex
            .find_iter(code)
            .map(|m| m.as_str().to_string())
            .collect()
    }
    
    /// Validate if a token is a valid identifier
    pub fn is_valid_identifier(&self, token: &str) -> bool {
        self.identifier_regex.is_match(token) && 
        self.identifier_regex.find(token).map(|m| m.as_str() == token).unwrap_or(false)
    }
    
    /// Validate if a token is a valid number
    pub fn is_valid_number(&self, token: &str) -> bool {
        self.number_regex.is_match(token) &&
        self.number_regex.find(token).map(|m| m.as_str() == token).unwrap_or(false)
    }
    
    /// Validate if a token is a valid string literal
    pub fn is_valid_string(&self, token: &str) -> bool {
        self.string_regex.is_match(token) &&
        self.string_regex.find(token).map(|m| m.as_str() == token).unwrap_or(false)
    }

    fn match_string_literal(&self, chars: &[char], pos: usize) -> Option<String> {
        if pos >= chars.len() {
            return None;
        }
        
        // Use the regex for more robust string matching
        let remaining: String = chars[pos..].iter().collect();
        if let Some(mat) = self.string_regex.find(&remaining) {
            if mat.start() == 0 {
                return Some(mat.as_str().to_string());
            }
        }
        
        // Fallback to manual matching if regex doesn't match
        let quote_char = chars[pos];
        if quote_char != '"' && quote_char != '\'' {
            return None;
        }
        
        let mut end_pos = pos + 1;
        while end_pos < chars.len() && chars[end_pos] != quote_char {
            if chars[end_pos] == '\\' {
                end_pos += 2; // Skip escaped character
            } else {
                end_pos += 1;
            }
        }
        
        if end_pos < chars.len() {
            end_pos += 1; // Include closing quote
            Some(chars[pos..end_pos].iter().collect())
        } else {
            None
        }
    }

    fn match_number(&self, chars: &[char], pos: usize) -> Option<String> {
        if pos >= chars.len() {
            return None;
        }
        
        // Use the regex for more robust number matching
        let remaining: String = chars[pos..].iter().collect();
        if let Some(mat) = self.number_regex.find(&remaining) {
            if mat.start() == 0 {
                return Some(mat.as_str().to_string());
            }
        }
        
        None
    }

    fn match_identifier(&self, chars: &[char], pos: usize) -> Option<String> {
        if pos >= chars.len() {
            return None;
        }
        
        // Use the regex for more robust identifier matching
        let remaining: String = chars[pos..].iter().collect();
        if let Some(mat) = self.identifier_regex.find(&remaining) {
            if mat.start() == 0 {
                return Some(mat.as_str().to_string());
            }
        }
        
        None
    }

    fn match_operator(&self, chars: &[char], pos: usize) -> Option<String> {
        if pos >= chars.len() {
            return None;
        }
        
        // Try multi-character operators first
        let two_char_ops = ["==", "!=", "<=", ">=", "&&", "||", "++", "--", 
                           "+=", "-=", "*=", "/=", "%=", "<<", ">>", "::", 
                           "->", "=>", "?.", "??", "...", "?."];
        
        if pos + 1 < chars.len() {
            let two_char: String = chars[pos..pos+2].iter().collect();
            if two_char_ops.contains(&two_char.as_str()) {
                return Some(two_char);
            }
        }
        
        // Three-character operators
        let three_char_ops = ["===", "!==", "...", "<<=", ">>="];
        if pos + 2 < chars.len() {
            let three_char: String = chars[pos..pos+3].iter().collect();
            if three_char_ops.contains(&three_char.as_str()) {
                return Some(three_char);
            }
        }
        
        // Single character operators
        let single_char_ops = ['=', '+', '-', '*', '/', '%', '<', '>', '!', 
                               '&', '|', '^', '~', '?', ':', ';', ',', '.'];
        
        if single_char_ops.contains(&chars[pos]) {
            Some(chars[pos].to_string())
        } else {
            None
        }
    }

    pub fn vocab_size(&self) -> usize {
        self.vocab.len() + self.special_tokens.len()
    }

    pub fn get_vocab(&self) -> &HashMap<String, u32> {
        &self.vocab
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rust_tokenization() {
        let tokenizer = CodeTokenizer::new(&Language::Rust).unwrap();
        let code = "fn main() { let x = 42; }";
        let tokens = tokenizer.tokenize(code);
        
        assert!(tokens.contains(&"fn".to_string()));
        assert!(tokens.contains(&"IDENTIFIER".to_string()) || tokens.contains(&"main".to_string()));
        assert!(tokens.contains(&"let".to_string()));
    }

    #[test]
    fn test_tokenize_to_ids() {
        let tokenizer = CodeTokenizer::new(&Language::Rust).unwrap();
        let code = "fn main";
        let ids = tokenizer.tokenize_to_ids(code);
        
        assert!(!ids.is_empty());
        assert_ne!(ids[0], 1); // Should not be unknown token for 'fn'
    }

    #[test]
    fn test_string_literal_tokenization() {
        let tokenizer = CodeTokenizer::new(&Language::Rust).unwrap();
        let code = r#"let s = "hello world";"#;
        let tokens = tokenizer.tokenize(code);
        
        assert!(tokens.iter().any(|t| t.starts_with("STRING_")));
    }

    #[test]
    fn test_number_tokenization() {
        let tokenizer = CodeTokenizer::new(&Language::Rust).unwrap();
        let code = "let x = 42.5;";
        let tokens = tokenizer.tokenize(code);
        
        assert!(tokens.iter().any(|t| t.starts_with("NUMBER_")));
    }
    
    #[test]
    fn test_extract_identifiers() {
        let tokenizer = CodeTokenizer::new(&Language::Rust).unwrap();
        let code = "let foo = bar + baz_123;";
        let identifiers = tokenizer.extract_identifiers(code);
        
        assert!(identifiers.contains(&"foo".to_string()));
        assert!(identifiers.contains(&"bar".to_string()));
        assert!(identifiers.contains(&"baz_123".to_string()));
    }
    
    #[test]
    fn test_extract_numbers() {
        let tokenizer = CodeTokenizer::new(&Language::Rust).unwrap();
        let code = "let x = 42; let y = 3.14; let z = 0.5;";
        let numbers = tokenizer.extract_numbers(code);
        
        assert!(numbers.contains(&"42".to_string()));
        assert!(numbers.contains(&"3.14".to_string()));
        assert!(numbers.contains(&"0.5".to_string()));
    }
    
    #[test]
    fn test_extract_strings() {
        let tokenizer = CodeTokenizer::new(&Language::Rust).unwrap();
        let code = r#"let s1 = "hello"; let s2 = 'world'; let s3 = "test";"#;
        let strings = tokenizer.extract_strings(code);
        
        assert!(strings.contains(&r#""hello""#.to_string()));
        assert!(strings.contains(&"'world'".to_string()));
        assert!(strings.contains(&r#""test""#.to_string()));
    }
    
    #[test]
    fn test_validation_methods() {
        let tokenizer = CodeTokenizer::new(&Language::Rust).unwrap();
        
        // Test identifier validation
        assert!(tokenizer.is_valid_identifier("valid_name"));
        assert!(tokenizer.is_valid_identifier("_underscore"));
        assert!(tokenizer.is_valid_identifier("camelCase123"));
        assert!(!tokenizer.is_valid_identifier("123invalid"));
        assert!(!tokenizer.is_valid_identifier("invalid-name"));
        
        // Test number validation
        assert!(tokenizer.is_valid_number("42"));
        assert!(tokenizer.is_valid_number("3.14"));
        assert!(tokenizer.is_valid_number("0.001"));
        assert!(!tokenizer.is_valid_number("abc"));
        assert!(!tokenizer.is_valid_number("12.34.56"));
        
        // Test string validation
        assert!(tokenizer.is_valid_string(r#""hello world""#));
        assert!(tokenizer.is_valid_string("'single quotes'"));
        assert!(!tokenizer.is_valid_string("no quotes"));
        assert!(!tokenizer.is_valid_string(r#""unclosed"#));
    }
}
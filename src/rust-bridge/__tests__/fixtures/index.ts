/**
 * Test fixtures and mock data for Rust bridge tests
 */

import type { 
  Language, 
  IndexingOptions, 
  SearchOptions, 
  Symbol,
  AnalysisResult,
  SimilarityResult,
  ParseResult,
  ProjectInfo,
  UniversalRelationship,
  CodeQualityResult 
} from '../../types/rust-bindings';

export const mockLanguages: Language[] = [
  'TypeScript',
  'JavaScript',
  'Rust',
  'Python',
  'Cpp',
  'Java',
  'Go',
  'CSharp'
];

export const mockIndexingOptions: IndexingOptions = {
  force: false,
  languages: ['TypeScript', 'JavaScript'],
  includeTests: true,
  maxFileSize: 1024 * 1024, // 1MB
  excludePatterns: ['node_modules/**', '*.test.ts']
};

export const mockSearchOptions: SearchOptions = {
  kind: 'function',
  language: 'TypeScript',
  limit: 20,
  includePrivate: true,
  fuzzyMatch: false
};

export const mockSymbol: Symbol = {
  id: 'test_function_1',
  name: 'testFunction',
  signature: 'testFunction(param: string): boolean',
  returnType: 'boolean',
  language: 'TypeScript',
  filePath: '/test/src/main.ts',
  startLine: 10,
  endLine: 15,
  normalizedName: 'testfunction',
  confidenceScore: 0.95,
  similarSymbols: ['test_function_2:0.8:similar', 'helper_function:0.6:related']
};

export const mockProjectInfo: ProjectInfo = {
  id: 1,
  name: 'test_project',
  path: '/test/project',
  lastIndexed: '2025-01-27T12:00:00Z',
  symbolCount: 42,
  languageDistribution: {
    'TypeScript': 25,
    'JavaScript': 10,
    'Rust': 5,
    'Python': 2
  }
};

export const mockSimilarityResult: SimilarityResult = {
  overallScore: 0.75,
  nameSimilarity: 0.8,
  signatureSimilarity: 0.7,
  structuralSimilarity: 0.65,
  contextSimilarity: 0.85
};

export const mockParseResult: ParseResult = {
  symbols: [mockSymbol],
  errors: [],
  parseMethod: 'tree-sitter',
  confidence: 1.0
};

export const mockAnalysisResult: AnalysisResult = {
  patterns: [
    {
      category: 'Factory',
      symbols: [mockSymbol],
      confidence: 0.9,
      evidence: [
        'Contains factory method pattern',
        'Creates objects without specifying exact classes'
      ]
    }
  ],
  insights: {
    totalSymbolsAnalyzed: 42,
    duplicateCount: 3,
    patternsDetected: 2,
    averageSimilarity: 0.65,
    codeReusePercentage: 15.5,
    recommendations: [
      'Consider refactoring duplicate code',
      'Extract common functionality into shared utilities'
    ]
  },
  symbolCount: 42
};

export const mockUniversalRelationship: UniversalRelationship = {
  id: 1,
  projectId: 1,
  fromSymbolId: 1,
  toSymbolId: 2,
  relationshipType: 'calls',
  confidence: 0.95,
  contextLine: 25,
  contextColumn: 10,
  contextSnippet: 'testFunction(param)',
  metadata: '{"call_type": "direct"}',
  createdAt: '2025-01-27T12:00:00Z'
};

export const mockCodeQualityResult: CodeQualityResult = {
  issues: [
    {
      description: 'High cyclomatic complexity: 15 (threshold: 10)',
      category: 'complexity',
      severity: 'medium',
      suggestion: 'Consider breaking this into smaller functions'
    },
    {
      description: 'Low comment ratio: 5% (recommended: >10%)',
      category: 'documentation',
      severity: 'low',
      suggestion: 'Add more comments to explain complex logic'
    }
  ],
  metrics: {
    cyclomaticComplexity: 15,
    maxNestingDepth: 4,
    functionCount: 8,
    largeFunctionCount: 2,
    linesOfCode: 150,
    commentRatio: 0.05
  },
  overallScore: 75.0,
  recommendations: [
    '🔍 Found 2 code quality issues to address',
    '⚠️ MEDIUM PRIORITY: Reduce cyclomatic complexity by breaking down complex functions',
    '📝 LOW PRIORITY: Add more comments to improve code documentation'
  ]
};

export const testFiles = {
  typescript: `
// Test TypeScript file
export interface TestInterface {
  id: number;
  name: string;
  optional?: boolean;
}

export class TestClass implements TestInterface {
  constructor(
    public id: number,
    public name: string,
    public optional?: boolean
  ) {}

  testMethod(param: string): boolean {
    if (param.length > 0) {
      return this.validateInput(param);
    }
    return false;
  }

  private validateInput(input: string): boolean {
    return input.trim().length > 0;
  }
}

export function testFunction(data: TestInterface): string {
  return \`\${data.name} (\${data.id})\`;
}
`,

  javascript: `
// Test JavaScript file
const TestModule = {
  createInstance: function(id, name) {
    return {
      id: id,
      name: name,
      getData: function() {
        return { id: this.id, name: this.name };
      }
    };
  },

  processData: function(data) {
    if (!data || !data.length) {
      return [];
    }
    
    return data.map(item => {
      return this.createInstance(item.id, item.name);
    });
  }
};

module.exports = TestModule;
`,

  rust: `
// Test Rust file
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct TestStruct {
    pub id: u32,
    pub name: String,
    pub metadata: HashMap<String, String>,
}

impl TestStruct {
    pub fn new(id: u32, name: String) -> Self {
        Self {
            id,
            name,
            metadata: HashMap::new(),
        }
    }

    pub fn add_metadata(&mut self, key: String, value: String) {
        self.metadata.insert(key, value);
    }

    pub fn get_display_name(&self) -> String {
        format!("{} ({})", self.name, self.id)
    }
}

pub fn process_items(items: Vec<TestStruct>) -> Vec<String> {
    items.into_iter()
        .map(|item| item.get_display_name())
        .collect()
}
`
};

export const errorScenarios = {
  invalidProjectPath: '/non/existent/project/path',
  invalidFilePath: '/non/existent/file.ts',
  malformedQuery: '***invalid***query***',
  outsideProjectFile: '/etc/passwd',
  nonexistentSymbolId: 'nonexistent_symbol_12345'
};

// Helper functions for creating test data
export function createTestSymbol(overrides: Partial<Symbol> = {}): Symbol {
  return {
    ...mockSymbol,
    ...overrides
  };
}

export function createTestSymbols(count: number): Symbol[] {
  return Array.from({ length: count }, (_, i) =>
    createTestSymbol({
      id: `test_symbol_${i}`,
      name: `testSymbol${i}`,
      startLine: 10 + (i * 5),
      endLine: 15 + (i * 5)
    })
  );
}

export function createTestRelationship(overrides: Partial<UniversalRelationship> = {}): UniversalRelationship {
  return {
    ...mockUniversalRelationship,
    ...overrides
  };
}

export function createTestRelationships(count: number): UniversalRelationship[] {
  return Array.from({ length: count }, (_, i) =>
    createTestRelationship({
      id: i + 1,
      fromSymbolId: i + 1,
      toSymbolId: i + 2,
      relationshipType: i % 2 === 0 ? 'calls' : 'references'
    })
  );
}
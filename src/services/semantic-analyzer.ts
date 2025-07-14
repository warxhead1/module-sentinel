export interface QueryAnalysis {
  intent: 'implementation' | 'usage' | 'debug' | 'extend' | 'antipattern' | 'architecture' | 'unknown';
  keywords: string[];
  concepts: {
    functionality?: string;
    returnType?: string;
    className?: string;
    methodName?: string;
    problemType?: string;
    extensionType?: string;
    antipatternType?: string;
    architecturalConcern?: string;
  };
}

export class SemanticAnalyzer {
  private intentPatterns = {
    implementation: [
      /how (do|can) i (generate|create|implement|build)/i,
      /implement/i,
      /create .* (function|method|class)/i,
      /need .* (functionality|feature)/i
    ],
    usage: [
      /how (do|can) i use/i,
      /usage of/i,
      /example of/i,
      /how to call/i,
      /what does .* do/i
    ],
    debug: [
      /(error|bug|issue|problem) (in|with)/i,
      /not working/i,
      /failing/i,
      /debug/i,
      /fix/i
    ],
    extend: [
      /extend/i,
      /inherit from/i,
      /add .* to existing/i,
      /enhance/i,
      /modify/i
    ]
  };

  private conceptExtractors = {
    returnType: [
      /return(?:s|ing)?\s+(?:a\s+)?(\w+(?:<[^>]+>)?)/i,
      /(?:->|:)\s*(\w+(?:<[^>]+>)?)\s*$/,
      /(?:std::)?vector<(\w+)>/i,
      /(\w+(?:<[^>]+>)?)\s+(?:result|output)/i
    ],
    className: [
      /class\s+(\w+)/i,
      /(\w+)::/,
      /new\s+(\w+)/i,
      /(\w+)\s+(?:class|object|instance)/i
    ],
    methodName: [
      /::(\w+)\s*\(/,
      /method\s+(\w+)/i,
      /function\s+(\w+)/i,
      /call\s+(\w+)/i
    ],
    functionality: [
      /(heightmap|terrain|noise|render|generate|process|calculate|compute)\s+\w+/i,
      /\w+\s+(generation|processing|calculation|rendering)/i
    ]
  };

  async analyzeQuery(query: string): Promise<QueryAnalysis> {
    const intent = this.detectIntent(query);
    const keywords = this.extractKeywords(query);
    const concepts = this.extractConcepts(query);

    return {
      intent,
      keywords,
      concepts
    };
  }

  private detectIntent(query: string): QueryAnalysis['intent'] {
    for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
      if (patterns.some(pattern => pattern.test(query))) {
        return intent as QueryAnalysis['intent'];
      }
    }

    // Additional heuristics
    if (query.includes('?')) {
      if (query.includes('use') || query.includes('call')) return 'usage';
      if (query.includes('implement') || query.includes('create')) return 'implementation';
    }

    return 'unknown';
  }

  private extractKeywords(query: string): string[] {
    // Remove common words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'been', 'be',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'i', 'me', 'my', 'we', 'our',
      'you', 'your', 'it', 'its', 'this', 'that', 'these', 'those', 'what',
      'which', 'who', 'when', 'where', 'why', 'how'
    ]);

    // Extract potential keywords
    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    // Prioritize technical terms
    const technicalTerms = words.filter(word => 
      this.isTechnicalTerm(word)
    );

    // Combine technical terms and remaining words
    const keywords = [
      ...technicalTerms,
      ...words.filter(w => !technicalTerms.includes(w))
    ].slice(0, 5);

    return keywords;
  }

  private extractConcepts(query: string): QueryAnalysis['concepts'] {
    const concepts: QueryAnalysis['concepts'] = {};

    for (const [concept, patterns] of Object.entries(this.conceptExtractors)) {
      for (const pattern of patterns) {
        const match = query.match(pattern);
        if (match && match[1]) {
          concepts[concept as keyof QueryAnalysis['concepts']] = match[1];
          break;
        }
      }
    }

    // Extract problem type for debugging
    if (query.includes('error') || query.includes('exception')) {
      concepts.problemType = 'error';
    } else if (query.includes('performance') || query.includes('slow')) {
      concepts.problemType = 'performance';
    } else if (query.includes('memory') || query.includes('leak')) {
      concepts.problemType = 'memory';
    }

    // Extract extension type
    if (query.includes('inherit')) {
      concepts.extensionType = 'inheritance';
    } else if (query.includes('interface')) {
      concepts.extensionType = 'interface';
    } else if (query.includes('override')) {
      concepts.extensionType = 'override';
    }

    return concepts;
  }

  private isTechnicalTerm(word: string): boolean {
    const technicalTerms = [
      // C++ terms
      'class', 'struct', 'namespace', 'template', 'virtual', 'static',
      'const', 'public', 'private', 'protected', 'override', 'final',
      
      // Data structures
      'vector', 'array', 'map', 'set', 'list', 'queue', 'stack',
      'string', 'pair', 'tuple',
      
      // Domain terms
      'heightmap', 'terrain', 'noise', 'perlin', 'simplex', 'gpu',
      'render', 'mesh', 'texture', 'shader', 'buffer', 'vertex',
      'generation', 'algorithm', 'optimization', 'parallel', 'async',
      
      // Common programming terms
      'function', 'method', 'parameter', 'return', 'callback', 'interface',
      'implementation', 'instance', 'object', 'pointer', 'reference'
    ];

    return technicalTerms.some(term => 
      word.toLowerCase().includes(term) || 
      term.includes(word.toLowerCase())
    );
  }
}
import { EventEmitter } from 'events';
import { ClaudeValidationService, ClaudeCodeSuggestion, ValidationResult } from '../services/claude-validation-service.js';
import Database from 'better-sqlite3';

export interface ClaudeHookConfig {
  enabled: boolean;
  autoValidation: boolean;
  blockInvalidCode: boolean;
  validationThreshold: number; // minimum confidence to approve
  geminiApiKey: string;
}

export interface ClaudeInteractionEvent {
  sessionId: string;
  timestamp: number;
  userMessage: string;
  claudeResponse: string;
  extractedCode?: string;
  filePath?: string;
  workingDirectory?: string;
}

export class ClaudeIntegrationHooks extends EventEmitter {
  private validationService: ClaudeValidationService;
  private config: ClaudeHookConfig;
  private activeValidations = new Map<string, ValidationResult>();

  constructor(db: Database.Database, config: ClaudeHookConfig) {
    super();
    this.config = config;
    this.validationService = new ClaudeValidationService(db, config.geminiApiKey);
    
    // Subscribe to validation events
    this.validationService.on('validation_complete', this.handleValidationComplete.bind(this));
    
    console.log(`🔗 Claude Integration Hooks initialized (${config.enabled ? 'ENABLED' : 'DISABLED'})`);
  }

  /**
   * Main hook for intercepting Claude interactions
   * Call this whenever Claude suggests code changes
   */
  async interceptClaudeResponse(event: ClaudeInteractionEvent): Promise<ValidationResult | null> {
    if (!this.config.enabled) {
      return null;
    }

    console.log(`🔍 Intercepting Claude response for session: ${event.sessionId}`);

    // Extract code blocks from Claude's response
    const codeBlocks = this.extractCodeBlocks(event.claudeResponse);
    
    if (codeBlocks.length === 0) {
      // No code to validate
      return null;
    }

    // Create validation request
    const suggestion: ClaudeCodeSuggestion = {
      userPrompt: event.userMessage,
      claudeResponse: event.claudeResponse,
      suggestedCode: codeBlocks.join('\n\n'),
      timestamp: event.timestamp,
      sessionId: event.sessionId,
      filePath: event.filePath,
      context: {
        filePath: event.filePath,
        content: event.extractedCode
      }
    };

    // Validate the code
    const result = await this.validationService.validateClaudeCode(suggestion);
    
    // Store for later reference
    this.activeValidations.set(event.sessionId, result);

    // Emit hook events
    this.emit('code_validated', { event, result });

    if (!result.isValid && this.config.blockInvalidCode) {
      this.emit('invalid_code_blocked', { event, result });
    }

    return result;
  }

  /**
   * Create a formatted validation report for the user
   */
  createValidationReport(result: ValidationResult): string {
    let report = `\n🔍 **Code Validation Report**\n\n`;
    
    // Overall assessment
    const statusEmoji = result.recommendation === 'approve' ? '✅' : 
                       result.recommendation === 'modify' ? '⚠️' : '❌';
    
    report += `${statusEmoji} **Recommendation:** ${result.recommendation.toUpperCase()}\n`;
    report += `📊 **Confidence:** ${(result.confidence * 100).toFixed(1)}%\n\n`;

    // Hallucinations
    if (result.hallucinations.length > 0) {
      report += `🚨 **Hallucinations Detected (${result.hallucinations.length}):**\n`;
      result.hallucinations.forEach(h => {
        report += `- **${h.type}**: \`${h.item}\` - ${h.reason}\n`;
        if (h.suggestedAlternative) {
          report += `  💡 Try: \`${h.suggestedAlternative}\`${h.actualLocation ? ` (found in ${h.actualLocation})` : ''}\n`;
        }
      });
      report += '\n';
    }

    // Semantic issues
    if (result.semanticIssues.length > 0) {
      report += `⚠️ **Architectural Issues (${result.semanticIssues.length}):**\n`;
      result.semanticIssues.forEach(issue => {
        const severityEmoji = issue.severity === 'critical' ? '🔴' : 
                             issue.severity === 'high' ? '🟠' : 
                             issue.severity === 'medium' ? '🟡' : '🟢';
        report += `- ${severityEmoji} **${issue.type}** (${issue.severity}): ${issue.description}\n`;
        report += `  💡 ${issue.suggestion}\n`;
      });
      report += '\n';
    }

    // Corrections
    if (result.corrections.length > 0) {
      report += `🔧 **Suggested Corrections:**\n`;
      result.corrections.forEach(correction => {
        report += `- ${correction}\n`;
      });
      report += '\n';
    }

    // Corrected code
    if (result.correctedCode) {
      report += `✨ **Corrected Code:**\n\`\`\`cpp\n${result.correctedCode}\n\`\`\`\n\n`;
    }

    // Explanation
    if (result.explanation) {
      report += `📝 **Analysis:**\n${result.explanation}\n`;
    }

    return report;
  }

  /**
   * Get validation result for a session
   */
  getSessionValidation(sessionId: string): ValidationResult | null {
    return this.activeValidations.get(sessionId) || null;
  }

  /**
   * Configure validation behavior
   */
  updateConfig(newConfig: Partial<ClaudeHookConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('🔧 Claude hook configuration updated:', this.config);
  }

  /**
   * Extract code blocks from Claude's response
   */
  private extractCodeBlocks(response: string): string[] {
    const codeBlocks: string[] = [];
    
    // Extract C++ code blocks
    const cppMatches = response.match(/```(?:cpp|c\+\+|c)\n([\s\S]*?)```/g);
    if (cppMatches) {
      cppMatches.forEach(match => {
        const code = match.replace(/```(?:cpp|c\+\+|c)\n/, '').replace(/```$/, '');
        codeBlocks.push(code.trim());
      });
    }

    // Extract generic code blocks that might be C++
    const genericMatches = response.match(/```\n([\s\S]*?)```/g);
    if (genericMatches) {
      genericMatches.forEach(match => {
        const code = match.replace(/```\n/, '').replace(/```$/, '');
        // Check if it looks like C++ (has common C++ keywords)
        if (this.looksLikeCpp(code)) {
          codeBlocks.push(code.trim());
        }
      });
    }

    return codeBlocks;
  }

  /**
   * Heuristic to detect if code block is C++
   */
  private looksLikeCpp(code: string): boolean {
    const cppKeywords = [
      'class', 'struct', 'namespace', 'template', 'typename',
      '#include', 'std::', 'void', 'int', 'float', 'double',
      'const', 'auto', 'decltype', 'constexpr', 'noexcept',
      'public:', 'private:', 'protected:', '->', '::', 'new ', 'delete'
    ];

    const keywordCount = cppKeywords.reduce((count, keyword) => {
      return count + (code.includes(keyword) ? 1 : 0);
    }, 0);

    return keywordCount >= 2; // Needs at least 2 C++ keywords
  }

  private handleValidationComplete(data: { suggestion: ClaudeCodeSuggestion, result: ValidationResult }): void {
    const { suggestion, result } = data;
    
    console.log(`✅ Validation complete for session ${suggestion.sessionId}:`, {
      recommendation: result.recommendation,
      confidence: result.confidence,
      hallucinations: result.hallucinations.length,
      semanticIssues: result.semanticIssues.length
    });

    // Log significant findings
    if (result.hallucinations.length > 0) {
      console.warn(`🚨 ${result.hallucinations.length} hallucinations detected in Claude's code suggestion`);
    }

    if (result.semanticIssues.some(issue => issue.severity === 'high' || issue.severity === 'critical')) {
      console.warn('⚠️ High-severity architectural issues detected in Claude\'s suggestion');
    }
  }

  /**
   * Get validation statistics
   */
  async getValidationStats(): Promise<any> {
    return await this.validationService.getValidationStats();
  }

  /**
   * Manual validation trigger (for testing or explicit validation)
   */
  async validateCodeSnippet(code: string, context?: {
    userPrompt?: string;
    filePath?: string;
    sessionId?: string;
  }): Promise<ValidationResult> {
    const suggestion: ClaudeCodeSuggestion = {
      userPrompt: context?.userPrompt || 'Manual validation',
      claudeResponse: `Code snippet validation:\n\`\`\`cpp\n${code}\n\`\`\``,
      suggestedCode: code,
      timestamp: Date.now(),
      sessionId: context?.sessionId || 'manual-' + Date.now(),
      filePath: context?.filePath,
      context: {
        filePath: context?.filePath,
        content: code
      }
    };

    return await this.validationService.validateClaudeCode(suggestion);
  }
}

/**
 * Factory function to create Claude integration hooks
 */
export function createClaudeHooks(db: Database.Database, geminiApiKey: string): ClaudeIntegrationHooks {
  const config: ClaudeHookConfig = {
    enabled: true,
    autoValidation: true,
    blockInvalidCode: false, // Don't block by default, just warn
    validationThreshold: 0.7,
    geminiApiKey
  };

  return new ClaudeIntegrationHooks(db, config);
}
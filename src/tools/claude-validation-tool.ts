import { z } from 'zod';
import Database from 'better-sqlite3';
import { ClaudeIntegrationHooks, ClaudeInteractionEvent, createClaudeHooks } from '../hooks/claude-integration-hooks.js';

// Input schemas for MCP tools
const ValidateClaudeCodeSchema = z.object({
  userPrompt: z.string().describe('The original user prompt/request'),
  claudeResponse: z.string().describe('Claude\'s full response including code'),
  filePath: z.string().optional().describe('Target file path for the code'),
  sessionId: z.string().optional().describe('Session identifier for tracking'),
  extractedCode: z.string().optional().describe('Any existing code context')
});

const ValidateCodeSnippetSchema = z.object({
  code: z.string().describe('The C++ code snippet to validate'),
  userPrompt: z.string().optional().describe('Context about what the code should do'),
  filePath: z.string().optional().describe('Target file path'),
  sessionId: z.string().optional().describe('Session identifier')
});

const GetValidationStatsSchema = z.object({
  sessionId: z.string().optional().describe('Get stats for specific session')
});

export class ClaudeValidationTool {
  private hooks: ClaudeIntegrationHooks;

  constructor(db: Database.Database, geminiApiKey: string) {
    this.hooks = createClaudeHooks(db, geminiApiKey);
    console.log('🔗 Claude Validation Tool initialized');
  }

  /**
   * MCP Tool: Validate Claude's code suggestion against the semantic database
   */
  async validateClaudeCode(input: z.infer<typeof ValidateClaudeCodeSchema>) {
    try {
      const event: ClaudeInteractionEvent = {
        sessionId: input.sessionId || `validation-${Date.now()}`,
        timestamp: Date.now(),
        userMessage: input.userPrompt,
        claudeResponse: input.claudeResponse,
        extractedCode: input.extractedCode,
        filePath: input.filePath
      };

      const result = await this.hooks.interceptClaudeResponse(event);
      
      if (!result) {
        return {
          success: true,
          message: 'No code blocks found to validate',
          hasCodeBlocks: false
        };
      }

      // Create formatted report
      const report = this.hooks.createValidationReport(result);

      return {
        success: true,
        validation: {
          isValid: result.isValid,
          confidence: result.confidence,
          recommendation: result.recommendation,
          hallucinations: result.hallucinations,
          semanticIssues: result.semanticIssues,
          corrections: result.corrections,
          correctedCode: result.correctedCode,
          explanation: result.explanation
        },
        report,
        sessionId: event.sessionId
      };

    } catch (error: any) {
      console.error('Error validating Claude code:', error);
      return {
        success: false,
        error: error.message,
        details: 'Failed to validate Claude\'s code suggestion'
      };
    }
  }

  /**
   * MCP Tool: Validate a standalone code snippet
   */
  async validateCodeSnippet(input: z.infer<typeof ValidateCodeSnippetSchema>) {
    try {
      const result = await this.hooks.validateCodeSnippet(input.code, {
        userPrompt: input.userPrompt,
        filePath: input.filePath,
        sessionId: input.sessionId
      });

      const report = this.hooks.createValidationReport(result);

      return {
        success: true,
        validation: {
          isValid: result.isValid,
          confidence: result.confidence,
          recommendation: result.recommendation,
          hallucinations: result.hallucinations,
          semanticIssues: result.semanticIssues,
          corrections: result.corrections,
          correctedCode: result.correctedCode,
          explanation: result.explanation
        },
        report
      };

    } catch (error: any) {
      console.error('Error validating code snippet:', error);
      return {
        success: false,
        error: error.message,
        details: 'Failed to validate code snippet'
      };
    }
  }

  /**
   * MCP Tool: Get validation statistics and trends
   */
  async getValidationStats(input: z.infer<typeof GetValidationStatsSchema>) {
    try {
      const stats = await this.hooks.getValidationStats();
      
      // Get session-specific validation if requested
      let sessionValidation = null;
      if (input.sessionId) {
        sessionValidation = this.hooks.getSessionValidation(input.sessionId);
      }

      return {
        success: true,
        statistics: stats,
        sessionValidation,
        summary: {
          totalValidations: stats.totalValidations || 0,
          approvalRate: ((stats.approvalRate || 0) * 100).toFixed(1) + '%',
          averageConfidence: ((stats.averageConfidence || 0) * 100).toFixed(1) + '%',
          topHallucinations: stats.topHallucinations || []
        }
      };

    } catch (error: any) {
      console.error('Error getting validation stats:', error);
      return {
        success: false,
        error: error.message,
        details: 'Failed to retrieve validation statistics'
      };
    }
  }

  /**
   * MCP Tool: Configure validation behavior
   */
  async configureValidation(input: {
    enabled?: boolean;
    autoValidation?: boolean;
    blockInvalidCode?: boolean;
    validationThreshold?: number;
  }) {
    try {
      this.hooks.updateConfig(input);
      
      return {
        success: true,
        message: 'Validation configuration updated',
        currentConfig: input
      };

    } catch (error: any) {
      console.error('Error configuring validation:', error);
      return {
        success: false,
        error: error.message,
        details: 'Failed to update validation configuration'
      };
    }
  }

  /**
   * Get the validation tool definitions for MCP server registration
   */
  getToolDefinitions() {
    return [
      {
        name: 'validate_claude_code',
        description: 'Validate Claude\'s code suggestions against the semantic database to detect hallucinations and architectural issues',
        inputSchema: ValidateClaudeCodeSchema
      },
      {
        name: 'validate_code_snippet',
        description: 'Validate a C++ code snippet against the codebase for hallucinations and semantic issues',
        inputSchema: ValidateCodeSnippetSchema
      },
      {
        name: 'get_validation_stats',
        description: 'Get validation statistics and trends for Claude code suggestions',
        inputSchema: GetValidationStatsSchema
      }
    ];
  }

  /**
   * Handle MCP tool calls
   */
  async handleToolCall(name: string, args: any) {
    switch (name) {
      case 'validate_claude_code':
        return await this.validateClaudeCode(ValidateClaudeCodeSchema.parse(args));
      
      case 'validate_code_snippet':
        return await this.validateCodeSnippet(ValidateCodeSnippetSchema.parse(args));
      
      case 'get_validation_stats':
        return await this.getValidationStats(GetValidationStatsSchema.parse(args));
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Create a real-time validation middleware (for integration with other systems)
   */
  createValidationMiddleware() {
    return async (interaction: ClaudeInteractionEvent) => {
      console.log(`🔍 Middleware intercepting Claude interaction: ${interaction.sessionId}`);
      
      const result = await this.hooks.interceptClaudeResponse(interaction);
      
      if (result && !result.isValid) {
        console.warn(`⚠️ Invalid code detected in session ${interaction.sessionId}`);
        console.warn(`Hallucinations: ${result.hallucinations.length}, Issues: ${result.semanticIssues.length}`);
        
        // Could emit warnings, block execution, or modify response
        return {
          shouldBlock: result.recommendation === 'reject',
          validationResult: result,
          report: this.hooks.createValidationReport(result)
        };
      }

      return {
        shouldBlock: false,
        validationResult: result,
        report: result ? this.hooks.createValidationReport(result) : null
      };
    };
  }
}
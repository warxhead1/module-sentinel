import { GoogleGenerativeAI } from '@google/generative-ai';
import { CodeContext } from '../types/essential-features';

export class GeminiTool {
  private genAI?: GoogleGenerativeAI;
  private model?: any; // GenerativeModel
  private isEnabled: boolean;

  constructor(apiKey: string) {
    this.isEnabled = !!apiKey;
    
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      // For text-only input, use the gemini-2.0-flash-exp model
      this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    } else {
      console.warn('⚠️  GeminiTool initialized without API key. AI features will be disabled.');
    }
  }

  async callGemini(prompt: string, context?: CodeContext): Promise<string> {
    if (!this.isEnabled || !this.model) {
      return 'Gemini AI is not available. Please set GEMINI_API_KEY environment variable.';
    }
    
    try {
      let fullPrompt = prompt;
      if (context) {
        fullPrompt += "\n\n--- Context ---\n";
        if (context.filePath) fullPrompt += `File: ${context.filePath}\n`;
        if (context.cursorPosition) fullPrompt += `Cursor: Line ${context.cursorPosition.line}, Column ${context.cursorPosition.column}\n`;
        if (context.surroundingCode) fullPrompt += "Surrounding Code:\n```cpp\n" + context.surroundingCode + "\n```\n";
        if (context.activeTaskDescription) fullPrompt += `Active Task: ${context.activeTaskDescription}\n`;
        if (context.symbols && context.symbols.length > 0) fullPrompt += `Symbols in scope: ${context.symbols.join(', ')}\n`;
        if (context.content) fullPrompt += "Full File Content (excerpt):\n```cpp\n" + context.content.substring(0, 500) + "...\n```\n"; // Limit full content
      }

      const result = await this.model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();
      return text;
    } catch (error: any) {
      console.error('Error calling Gemini API:', error);
      return `Error: Could not get a response from Gemini. ${error.message || 'Unknown error.'}`;
    }
  }
}
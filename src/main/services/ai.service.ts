import { AIProvider, AIAnalysisResult } from './ai/ai.interface';
import { GeminiProvider } from './ai/gemini.provider';
import { OllamaProvider } from './ai/ollama.provider';
import { getEnv } from '../config/environment';
import { logger } from '../core/logger';
import { DecisionResult } from '../../shared/types';

// Re-export type for compatibility
export { AIAnalysisResult };

export class AIService implements AIProvider {
  private provider: AIProvider;

  constructor() {
    const env = getEnv();
    if (env.LLM_PROVIDER === 'local') {
      logger.info(`Initializing AI Service with Local Provider (Ollama: ${env.OLLAMA_MODEL})`);
      this.provider = new OllamaProvider();
    } else {
      logger.info(`Initializing AI Service with Gemini Provider (${env.GEMINI_MODEL})`);
      this.provider = new GeminiProvider();
    }
  }

  async analyzePageAndMapFields(
    html: string, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extractedData: any,
    documentList: { name: string; category: string }[],
    customPrompt?: string
  ): Promise<AIAnalysisResult> {
    return this.provider.analyzePageAndMapFields(html, extractedData, documentList, customPrompt);
  }

  async makeExplorationDecision(
    html: string,
    extractedData: Record<string, unknown>,
    filledFieldSelectors: string[],
    visitedElements: string[],
    documentList: { name: string; category: string }[]
  ): Promise<DecisionResult> {
    return this.provider.makeExplorationDecision(html, extractedData, filledFieldSelectors, visitedElements, documentList);
  }
}

export const aiService = new AIService();

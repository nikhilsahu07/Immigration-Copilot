export * from './ai.interface';
export * from './gemini.provider';
export * from './ollama.provider';
// keeping legacy export if needed, but likely better to remove if unused. 
// User didn't ask to delete, so I'll leave gemini.service.ts alone but update index.
export { geminiService } from './gemini.service';

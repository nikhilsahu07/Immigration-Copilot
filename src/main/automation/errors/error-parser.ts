/**
 * Error parser for automation errors
 * Converts technical errors into user-friendly messages
 */
export class ErrorParser {
  /**
   * Parse Gemini API errors into user-friendly messages
   */
  static parseGeminiError(error: any): { 
    title: string; 
    message: string; 
    type: string; 
    retryAfter?: number 
  } {
    const errorString = String(error.message || error);
    
    // Rate limit / quota exceeded
    if (errorString.includes('429') || errorString.includes('quota') || errorString.includes('Too Many Requests')) {
      const retryMatch = errorString.match(/retry.*?(\d+)/i);
      const retryAfter = retryMatch ? parseInt(retryMatch[1]) : 60;
      return {
        title: 'API Rate Limit Exceeded',
        message: `You have exceeded your Gemini API quota. Please wait ${retryAfter} seconds or upgrade your plan.`,
        type: 'rate_limit',
        retryAfter,
      };
    }
    
    // Token limit exceeded
    if (errorString.includes('token') && (errorString.includes('limit') || errorString.includes('exceeded'))) {
      return {
        title: 'Token Limit Exceeded',
        message: 'The page content is too large for the AI to process. Try simplifying the form or reducing content.',
        type: 'token_limit',
      };
    }
    
    // Invalid API key
    if (errorString.includes('401') || errorString.includes('API key') || errorString.includes('unauthorized')) {
      return {
        title: 'Invalid API Key',
        message: 'Your Gemini API key is invalid or expired. Please check your configuration.',
        type: 'auth_error',
      };
    }
    
    // Network error
    if (errorString.includes('network') || errorString.includes('ECONNREFUSED') || errorString.includes('fetch')) {
      return {
        title: 'Network Error',
        message: 'Could not connect to Gemini API. Please check your internet connection.',
        type: 'network_error',
      };
    }
    
    // JSON parse error
    if (errorString.includes('JSON') || errorString.includes('parse')) {
      return {
        title: 'Invalid AI Response',
        message: 'The AI returned an invalid response. This page may be too complex. Try adding custom instructions.',
        type: 'parse_error',
      };
    }
    
    // Generic error
    return {
      title: 'Processing Error',
      message: errorString.substring(0, 200),
      type: 'unknown',
    };
  }
}

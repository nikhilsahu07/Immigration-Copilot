/**
 * Automation Configuration
 *
 * Centralized configuration for all automation timeouts and settings.
 * Replaces hardcoded values throughout the codebase.
 */

export interface PageLoadConfig {
  /** Timeout for domcontentloaded wait (ms) */
  domContentLoaded: number;
  /** Timeout for networkidle wait (ms) */
  networkIdle: number;
  /** Delay after page load before extraction (ms) */
  postLoadDelay: number;
}

export interface NavigationConfig {
  /** Timeout waiting for navigation after click (ms) */
  waitAfterClick: number;
  /** Delay after navigation completes (ms) */
  postNavigationDelay: number;
  /** Timeout for form submission navigation (ms) */
  formSubmitTimeout: number;
}

export interface FillingConfig {
  /** Timeout for individual field operations (ms) */
  fieldTimeout: number;
  /** Max time per fill strategy (click/fill/type) - fail fast to avoid long stalls (ms) */
  fieldActionTimeout: number;
  /** Delay between keystrokes when typing (ms) */
  typingDelay: number;
  /** Delay between sequential field fills (ms) */
  betweenFieldsDelay: number;
  /** Timeout waiting for field to become visible (ms) */
  visibilityTimeout: number;
}

export interface AutomationConfig {
  pageLoad: PageLoadConfig;
  navigation: NavigationConfig;
  filling: FillingConfig;
}

/**
 * Default automation configuration
 * These values can be overridden at runtime via setConfig()
 */
export const defaultConfig: AutomationConfig = {
  pageLoad: {
    domContentLoaded: 15000,
    networkIdle: 5000,
    postLoadDelay: 300,
  },
  navigation: {
    waitAfterClick: 10000,
    postNavigationDelay: 500,
    formSubmitTimeout: 10000,
  },
  filling: {
    fieldTimeout: 3000,
    fieldActionTimeout: 8000,
    typingDelay: 50,
    betweenFieldsDelay: 100,
    visibilityTimeout: 5000,
  },
};

// Mutable config that can be updated at runtime
let currentConfig: AutomationConfig = { ...defaultConfig };

/**
 * Get current automation configuration
 */
export function getConfig(): AutomationConfig {
  return currentConfig;
}

/**
 * Update configuration (partial update supported)
 */
export function setConfig(partial: Partial<AutomationConfig>): void {
  currentConfig = {
    pageLoad: { ...currentConfig.pageLoad, ...(partial.pageLoad ?? {}) },
    navigation: { ...currentConfig.navigation, ...(partial.navigation ?? {}) },
    filling: { ...currentConfig.filling, ...(partial.filling ?? {}) },
  };
}

/**
 * Reset to default configuration
 */
export function resetConfig(): void {
  currentConfig = { ...defaultConfig };
}

/**
 * Adapter System Exports
 * 
 * This module provides the adapter registry pattern for portal automation.
 * It allows custom Playwright scripts for specific portals while falling
 * back to AI-powered automation when needed.
 */

// Core types
export * from './types';

// Registry
export { adapterRegistry } from './registry';

// Base class for custom adapters
export { BaseAdapter } from './base-adapter';

// AI fallback adapter
export { AIAdapter, aiAdapter } from './ai-adapter';

// Loggers
export { 
  adapterLogger, 
  aiFailureLogger, 
  customAdapterFailureLogger,
  AdapterLogHelper 
} from './adapter-logger';

// Portal adapters registration
export { registerPortalAdapters } from './portals';

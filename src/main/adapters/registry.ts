import { IPortalAdapter } from './types';
import { adapterLogger } from './adapter-logger';

/**
 * Central registry for all portal adapters.
 * Adapters register themselves here and can be looked up by slug or URL.
 */
class AdapterRegistry {
  private adapters: Map<string, IPortalAdapter> = new Map();

  /**
   * Register an adapter with the registry.
   * @param adapter The adapter to register
   */
  register(adapter: IPortalAdapter): void {
    if (this.adapters.has(adapter.slug)) {
      adapterLogger.warn(`Adapter with slug "${adapter.slug}" already registered, overwriting`);
    }
    
    this.adapters.set(adapter.slug, adapter);
    adapterLogger.info(`Adapter registered: ${adapter.name} (${adapter.slug}) v${adapter.version}`);
  }

  /**
   * Get an adapter by its slug.
   * @param slug The unique identifier for the adapter
   * @returns The adapter if found, undefined otherwise
   */
  get(slug: string): IPortalAdapter | undefined {
    return this.adapters.get(slug);
  }

  /**
   * Check if an adapter with the given slug exists.
   * @param slug The slug to check
   */
  has(slug: string): boolean {
    return this.adapters.has(slug);
  }

  /**
   * Get all registered adapter slugs.
   * @returns Array of registered slugs
   */
  getRegisteredSlugs(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Find an adapter that can handle the given URL.
   * Iterates through all registered adapters and returns the first one
   * that reports it can handle the URL.
   * 
   * @param url The URL to find an adapter for
   * @param html Optional HTML content for more precise matching
   * @returns The matching adapter if found, undefined otherwise
   */
  async findAdapterForUrl(url: string, html?: string): Promise<IPortalAdapter | undefined> {
    for (const adapter of this.adapters.values()) {
      try {
        if (await adapter.canHandle(url, html)) {
          adapterLogger.info(`Found adapter for URL: ${adapter.slug}`, { url });
          return adapter;
        }
      } catch (error) {
        adapterLogger.warn(`Error checking adapter ${adapter.slug} for URL`, { 
          url, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
    return undefined;
  }

  /**
   * Get all registered adapters.
   * @returns Array of all registered adapters
   */
  getAll(): IPortalAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get adapter info for UI display.
   */
  getAdapterInfoList(): { slug: string; name: string; version: string }[] {
    return this.getAll().map(a => ({
      slug: a.slug,
      name: a.name,
      version: a.version,
    }));
  }

  /**
   * Clear all registered adapters (mainly for testing).
   */
  clear(): void {
    this.adapters.clear();
    adapterLogger.info('Adapter registry cleared');
  }
}

// Singleton instance
export const adapterRegistry = new AdapterRegistry();

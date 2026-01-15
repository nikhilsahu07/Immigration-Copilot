/**
 * Portal Adapters Registry
 * 
 * This file imports all portal-specific adapters and registers them
 * with the central adapter registry.
 * 
 * To add a new adapter:
 * 1. Create a new file in this directory (e.g., my-portal.ts)
 * 2. Extend BaseAdapter and implement the required methods
 * 3. Import and register the adapter here
 * 4. Update the portal's adapterSlug field in the database
 */

import { adapterRegistry } from '../registry';

// Import portal adapters
import { AttcAqatoPortalAdapter } from './attc-aqato-portal';
import { CourseFinderAIAdapter } from './coursefinderai-portal';

/**
 * Register all portal adapters.
 * Call this during application startup.
 */
export function registerPortalAdapters(): void {
  // Register portal adapters
  adapterRegistry.register(new AttcAqatoPortalAdapter());
  adapterRegistry.register(new CourseFinderAIAdapter());

  // Add new portal adapter registrations here:
  // import { MyPortalAdapter } from './my-portal';
  // adapterRegistry.register(new MyPortalAdapter());
}

// Export adapters for direct access if needed
export { AttcAqatoPortalAdapter } from './attc-aqato-portal';
export { CourseFinderAIAdapter } from './coursefinderai-portal';

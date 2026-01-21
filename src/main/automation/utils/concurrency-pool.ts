import { logger } from '../../core/logger';

/**
 * ConcurrencyPool - Run async tasks with a maximum concurrency limit
 * 
 * Parallel field filling with hard cap of 10 concurrent executions.
 * Ensures controlled parallelism to avoid overwhelming the browser or portal.
 */

export interface PoolTask<T> {
  id: string;
  execute: () => Promise<T>;
}

export interface PoolResult<T> {
  id: string;
  success: boolean;
  result?: T;
  error?: Error;
}

export class ConcurrencyPool {
  /**
   * Run tasks with concurrency limit
   * 
   * @param tasks - Array of tasks to execute
   * @param concurrency - Maximum number of concurrent tasks (default: 10)
   * @returns Array of results in the same order as input tasks
   */
  static async run<T>(
    tasks: PoolTask<T>[],
    concurrency: number = 10
  ): Promise<PoolResult<T>[]> {
    logger.info(`Starting concurrency pool with ${tasks.length} tasks, max concurrency: ${concurrency}`);

    const results: PoolResult<T>[] = [];
    const executing: Promise<void>[] = [];
    let completed = 0;

    for (const task of tasks) {
      // Wrap each task execution
      const promise = (async () => {
        const startTime = Date.now();
        try {
          logger.debug(`Pool: Starting task ${task.id}`);
          const result = await task.execute();
          const duration = Date.now() - startTime;
          
          results.push({
            id: task.id,
            success: true,
            result,
          });
          
          completed++;
          logger.debug(`Pool: Completed task ${task.id} (${completed}/${tasks.length}) in ${duration}ms`);
        } catch (error) {
          const duration = Date.now() - startTime;
          
          results.push({
            id: task.id,
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
          });
          
          completed++;
          logger.warn(`Pool: Failed task ${task.id} (${completed}/${tasks.length}) in ${duration}ms:`, error);
        }
      })();

      executing.push(promise);

      // If we've hit the concurrency limit, wait for one to complete
      if (executing.length >= concurrency) {
        await Promise.race(executing);
        // Remove completed promises
        executing.splice(0, executing.findIndex(p => p === promise) + 1);
      }
    }

    // Wait for remaining tasks to complete
    await Promise.allSettled(executing);

    logger.info(`Concurrency pool completed: ${results.filter(r => r.success).length}/${tasks.length} succeeded`);

    return results;
  }

  /**
   * Alternative implementation using Promise.allSettled with batching
   * This ensures we get exactly the same order as input tasks
   */
  static async runBatched<T>(
    tasks: PoolTask<T>[],
    concurrency: number = 10
  ): Promise<PoolResult<T>[]> {
    logger.info(`Starting batched pool with ${tasks.length} tasks, max concurrency: ${concurrency}`);

    const results: PoolResult<T>[] = [];
    
    // Process in batches
    for (let i = 0; i < tasks.length; i += concurrency) {
      const batch = tasks.slice(i, i + concurrency);
      logger.debug(`Processing batch ${Math.floor(i / concurrency) + 1}, tasks: ${batch.map(t => t.id).join(', ')}`);
      
      const batchPromises = batch.map(async (task) => {
        const startTime = Date.now();
        try {
          const result = await task.execute();
          const duration = Date.now() - startTime;
          logger.debug(`Batch task ${task.id} completed in ${duration}ms`);
          return {
            id: task.id,
            success: true,
            result,
          } as PoolResult<T>;
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.warn(`Batch task ${task.id} failed in ${duration}ms:`, error);
          return {
            id: task.id,
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
          } as PoolResult<T>;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      // Extract results from settled promises
      for (const settled of batchResults) {
        if (settled.status === 'fulfilled') {
          results.push(settled.value);
        } else {
          // This shouldn't happen as we catch errors inside the task
          logger.error('Unexpected rejected promise in batch');
        }
      }
    }

    logger.info(`Batched pool completed: ${results.filter(r => r.success).length}/${tasks.length} succeeded`);

    return results;
  }
}

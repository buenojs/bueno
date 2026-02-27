import { 
  createEventManager, 
  createEventRegistry, 
  createEvent, 
  createEventListener, 
  createEventCategory,
  createEventContext,
  createEventMiddleware,
  createEventFilter
} from './index';

// Create event manager and registry
const manager = createEventManager({
  maxListeners: 200,
  errorHandling: 'log'
});

const registry = createEventRegistry({
  maxEvents: 5000,
  retentionPeriod: 7 * 24 * 60 * 60 * 1000 // 7 days
});

// Register event categories
const databaseCategory = createEventCategory(
  'database',
  'Database operations and query lifecycle',
  ['query', 'mutation', 'connection', 'transaction']
);

const jobQueueCategory = createEventCategory(
  'job-queue',
  'Background job processing and queue management',
  ['job.created', 'job.started', 'job.completed', 'job.failed']
);

manager.registerEventCategory(databaseCategory);
manager.registerEventCategory(jobQueueCategory);

// Create event context
const defaultContext = createEventContext({
  userId: 'user123',
  sessionId: 'session456',
  ipAddress: '192.168.1.1'
});

// Create event middleware
const loggingMiddleware = createEventMiddleware(async (event, next) => {
  console.log(`Event received: ${event.name}`);
  await next();
});

const validationMiddleware = createEventMiddleware(async (event, next) => {
  if (event.data && typeof event.data === 'object') {
    // Validate event data
    if (Object.keys(event.data).length === 0) {
      throw new Error('Event data cannot be empty');
    }
  }
  await next();
});

manager.addMiddleware(loggingMiddleware);
manager.addMiddleware(validationMiddleware);

// Create event listeners
const queryListener = createEventListener(
  'database.query',
  async (event) => {
    console.log('Query executed:', event.data.query);
    // Log query to database
    registry.registerEvent(event);
  },
  { priority: 10 }
);

const jobStartedListener = createEventListener(
  'job.started',
  async (event) => {
    console.log(`Job started: ${event.data.jobId}`);
    // Update job status
  }
);

const errorListener = createEventListener(
  'error',
  async (event) => {
    console.error('Error occurred:', event.data.error);
  },
  { priority: 100 }
);

// Add listeners to manager
manager.addListener(queryListener);
manager.addListener(jobStartedListener);
manager.addListener(errorListener);

// Create event filters
const importantFilter = createEventFilter((event) => {
  return event.data && event.data.importance === 'high';
});

// Create filtered listener
const importantEventListener = createEventListener(
  'important.event',
  async (event) => {
    console.log('Important event detected:', event.data);
    // Send alert or notification
  },
  { filter: importantFilter }
);

manager.addListener(importantEventListener);

// Example event emission
async function exampleUsage() {
  try {
    // Database query event
    const queryEvent = createEvent(
      'database.query',
      {
        query: 'SELECT * FROM users WHERE id = 1',
        executionTime: 120
      },
      { context: defaultContext }
    );

    await manager.emit(queryEvent);

    // Job started event
    const jobEvent = createEvent(
      'job.started',
      {
        jobId: 'job789',
        type: 'email-sender',
        data: { userId: 'user123' }
      },
      { context: defaultContext }
    );

    await manager.emit(jobEvent);

    // Important event
    const importantEvent = createEvent(
      'important.event',
      {
        message: 'System alert',
        importance: 'high',
        details: 'High memory usage detected'
      },
      { context: defaultContext }
    );

    await manager.emit(importantEvent);

    // Error event
    const errorEvent = createEvent(
      'error',
      {
        error: new Error('Test error'),
        source: 'example-usage'
      },
      { context: defaultContext }
    );

    await manager.emit(errorEvent);

    console.log('All events processed successfully!');
  } catch (error) {
    console.error('Error in example usage:', error);
  }
}

// Run example
exampleUsage();

// Export for use in other modules
export {
  manager,
  registry,
  defaultContext,
  loggingMiddleware,
  validationMiddleware,
  queryListener,
  jobStartedListener,
  errorListener,
  importantFilter,
  importantEventListener
};
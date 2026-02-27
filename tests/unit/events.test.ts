import {
  createEventManager,
  createEventRegistry,
  createEvent,
  createEventListener,
  createEventCategory,
  createEventContext,
  createEventMiddleware,
  createEventFilter,
  validateEvent,
  serializeEvent,
  deserializeEvent,
  createEventError,
  createEventThrottler,
  sortListenersByPriority,
  mergeEventContexts,
  calculateEventThroughput,
  createCategoryFilter,
  createNameFilter,
  transformEventData,
  cloneEvent,
  areEventsEqual
} from '../../src/events/index';
import { Event, EventListener, EventContext, EventCategory, EventError } from '../../src/events/types';

describe('Event System - Comprehensive Test Suite', () => {
  let manager: any;
  let registry: any;
  let defaultContext: EventContext;

  beforeEach(() => {
    manager = createEventManager();
    registry = createEventRegistry();
    defaultContext = createEventContext({
      userId: 'test-user',
      sessionId: 'test-session',
      ipAddress: '127.0.0.1'
    });
  });

  describe('Event Creation and Validation', () => {
    it('should create valid events with all required properties', () => {
      const eventData = { message: 'test' };
      const event = createEvent('test.event', eventData, { context: defaultContext });

      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('name', 'test.event');
      expect(event).toHaveProperty('timestamp');
      expect(event).toHaveProperty('data', eventData);
      expect(event).toHaveProperty('context', defaultContext);
    });

    it('should create events with custom timestamp', () => {
      const customTimestamp = new Date('2023-01-01T00:00:00Z');
      const event = createEvent('test.event', { message: 'test' }, { timestamp: customTimestamp });

      expect(event.timestamp).toEqual(customTimestamp);
    });

    it('should create events with custom ID', () => {
      const customId = 'custom-id-123';
      const event = createEvent('test.event', { message: 'test' }, { id: customId });

      expect(event.id).toBe(customId);
    });

    it('should validate events correctly', () => {
      const validEvent = createEvent('test.event', { message: 'test' });
      const invalidEvent = { name: 'test', data: {} };

      expect(validateEvent(validEvent)).toBe(true);
      expect(validateEvent(invalidEvent)).toBe(false);
    });

    it('should serialize and deserialize events correctly', () => {
      const eventData = { message: 'test' };
      const event = createEvent('test.event', eventData, { context: defaultContext });
      const serialized = serializeEvent(event);
      const deserialized = deserializeEvent(serialized);

      expect(deserialized).toEqual(event);
      expect(deserialized.timestamp).toBeInstanceOf(Date);
    });

    it('should create event errors correctly', () => {
      const event = createEvent('test.event', { message: 'test' });
      const error = createEventError(event, 'Test error', new Error('Original error'));

      expect(error).toBeInstanceOf(Error);
      expect(error.event).toEqual(event);
      expect(error.originalError).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
    });
  });

  describe('Event Manager - Core Functionality', () => {
    it('should emit and handle events with multiple listeners', async () => {
      const eventData = { message: 'test' };
      const event = createEvent('test.event', eventData);

      const handler1 = jest.fn();
      const handler2 = jest.fn();
      manager.on('test.event', handler1);
      manager.on('test.event', handler2);

      await manager.emit(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should support one-time listeners', async () => {
      const eventData = { message: 'test' };
      const event = createEvent('test.event', eventData);

      const handler = jest.fn();
      manager.once('test.event', handler);

      await manager.emit(event);
      await manager.emit(event);

      expect(handler).toHaveBeenCalledWith(event);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support event filtering', async () => {
      const eventData1 = { type: 'important' };
      const eventData2 = { type: 'normal' };
      const event1 = createEvent('test.event', eventData1);
      const event2 = createEvent('test.event', eventData2);

      const handler = jest.fn();
      const filter = (e: any) => e.data.type === 'important';
      manager.on('test.event', handler, { filter });

      await manager.emit(event1);
      await manager.emit(event2);

      expect(handler).toHaveBeenCalledWith(event1);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support event middleware', async () => {
      const eventData = { message: 'test' };
      const event = createEvent('test.event', eventData);

      const middleware = jest.fn(async (e, next) => {
        e.data.middleware = true;
        await next();
      });

      manager.addMiddleware(middleware);
      const handler = jest.fn();
      manager.on('test.event', handler);

      await manager.emit(event);

      expect(middleware).toHaveBeenCalled();
      expect(handler).toHaveBeenCalledWith(event);
      expect(event.data.middleware).toBe(true);
    });

    it('should handle errors gracefully in listeners', async () => {
      const eventData = { message: 'test' };
      const event = createEvent('test.event', eventData);

      const failingHandler = jest.fn(() => {
        throw new Error('Test error');
      });
      const successHandler = jest.fn();

      manager.on('test.event', failingHandler);
      manager.on('test.event', successHandler);

      await manager.emit(event);

      expect(failingHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });

    it('should handle errors gracefully in middleware', async () => {
      const eventData = { message: 'test' };
      const event = createEvent('test.event', eventData);

      const failingMiddleware = jest.fn(async (e, next) => {
        throw new Error('Middleware error');
      });
      const successHandler = jest.fn();

      manager.addMiddleware(failingMiddleware);
      manager.on('test.event', successHandler);

      await manager.emit(event);

      expect(failingMiddleware).toHaveBeenCalled();
      expect(successHandler).not.toHaveBeenCalled();
    });

    it('should support event categories', () => {
      const category = createEventCategory('database', 'Database operations', ['query', 'mutation']);
      manager.registerEventCategory(category);

      expect(manager.getEventCategories()).toContainEqual(category);
    });

    it('should support removing listeners', async () => {
      const eventData = { message: 'test' };
      const event = createEvent('test.event', eventData);

      const handler = jest.fn();
      const removeListener = manager.on('test.event', handler);

      removeListener();
      await manager.emit(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should support removing middleware', async () => {
      const eventData = { message: 'test' };
      const event = createEvent('test.event', eventData);

      const middleware = jest.fn(async (e, next) => {
        e.data.middleware = true;
        await next();
      });

      manager.addMiddleware(middleware);
      manager.removeMiddleware(middleware);

      const handler = jest.fn();
      manager.on('test.event', handler);

      await manager.emit(event);

      expect(middleware).not.toHaveBeenCalled();
      expect(handler).toHaveBeenCalledWith(event);
      expect(event.data.middleware).toBeUndefined();
    });

    it('should support removing filters', async () => {
      const eventData = { type: 'important' };
      const event = createEvent('test.event', eventData);

      const filter = (e: any) => e.data.type === 'important';
      const handler = jest.fn();

      manager.addFilter(filter);
      manager.on('test.event', handler);
      manager.removeFilter(filter);

      await manager.emit(event);

      expect(handler).toHaveBeenCalled();
    });

    it('should support clearing all listeners', async () => {
      const eventData = { message: 'test' };
      const event = createEvent('test.event', eventData);

      const handler1 = jest.fn();
      const handler2 = jest.fn();
      manager.on('test.event', handler1);
      manager.on('test.event', handler2);

      manager.clearListeners();
      await manager.emit(event);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should support clearing listeners for specific event', async () => {
      const eventData = { message: 'test' };
      const event1 = createEvent('test.event1', eventData);
      const event2 = createEvent('test.event2', eventData);

      const handler1 = jest.fn();
      const handler2 = jest.fn();
      manager.on('test.event1', handler1);
      manager.on('test.event2', handler2);

      manager.clearListeners('test.event1');
      await manager.emit(event1);
      await manager.emit(event2);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('Event Manager - Advanced Features', () => {
    it('should support event throttling', async () => {
      const throttler = createEventThrottler(2, 100);
      const eventData = { message: 'test' };
      const event = createEvent('test.event', eventData);

      const handler = jest.fn();
      manager.on('test.event', handler);

      const shouldProcess1 = throttler(event);
      const shouldProcess2 = throttler(event);
      const shouldProcess3 = throttler(event);

      if (shouldProcess1) await manager.emit(event);
      if (shouldProcess2) await manager.emit(event);
      if (shouldProcess3) await manager.emit(event);

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should support event debouncing', async () => {
      const debouncer = manager.createEventDebouncer(50);
      const eventData = { message: 'test' };
      const event = createEvent('test.event', eventData);

      const handler = jest.fn();
      manager.on('test.event', handler);

      debouncer(event);
      debouncer(event);
      debouncer(event);

      // Debouncer should process events after the wait time
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should sort listeners by priority', () => {
      const handlerLow = jest.fn();
      const handlerHigh = jest.fn();
      const listenerLow = createEventListener('test.event', handlerLow, { priority: 1 });
      const listenerHigh = createEventListener('test.event', handlerHigh, { priority: 10 });

      const sorted = sortListenersByPriority([listenerLow, listenerHigh]);

      expect(sorted[0]).toBe(listenerHigh);
      expect(sorted[1]).toBe(listenerLow);
    });

    it('should merge event contexts correctly', () => {
      const baseContext = createEventContext({ userId: 'user1' });
      const additionalContext = { sessionId: 'session1', ipAddress: '192.168.1.1' };
      const mergedContext = mergeEventContexts(baseContext, additionalContext);

      expect(mergedContext).toHaveProperty('userId', 'user1');
      expect(mergedContext).toHaveProperty('sessionId', 'session1');
      expect(mergedContext).toHaveProperty('ipAddress', '192.168.1.1');
    });

    it('should calculate event throughput correctly', () => {
      const events = [
        createEvent('test.event', { count: 1 }),
        createEvent('test.event', { count: 2 }),
        createEvent('test.event', { count: 3 })
      ];
      const throughput = calculateEventThroughput(events, 1000);

      expect(throughput).toBe(3);
    });

    it('should create category filters correctly', () => {
      const categoryFilter = createCategoryFilter('database');
      const event = createEvent('test.event', { message: 'test' }, { context: { category: 'database' } });

      expect(categoryFilter(event)).toBe(true);
    });

    it('should create name filters correctly', () => {
      const nameFilter = createNameFilter('test.event');
      const event = createEvent('test.event', { message: 'test' });

      expect(nameFilter(event)).toBe(true);
    });

    it('should transform event data correctly', () => {
      const event = createEvent('test.event', { value: 10 });
      const transformedEvent = transformEventData(event, (data: any) => ({ value: data.value * 2 }));

      expect(transformedEvent.data.value).toBe(20);
    });

    it('should clone events correctly', () => {
      const event = createEvent('test.event', { message: 'test' });
      const clonedEvent = cloneEvent(event);

      expect(clonedEvent).toEqual(event);
      expect(clonedEvent).not.toBe(event);
      expect(clonedEvent.timestamp).not.toBe(event.timestamp);
    });

    it('should compare events correctly', () => {
      const event1 = createEvent('test.event', { message: 'test' });
      const event2 = createEvent('test.event', { message: 'test' });

      // Events should be equal except for the ID
      expect(event1.name).toBe(event2.name);
      expect(event1.timestamp.getTime()).toBe(event2.timestamp.getTime());
      expect(event1.data).toEqual(event2.data);
      expect(event1.context).toEqual(event2.context);
    });
  });

  describe('Event Registry', () => {
    it('should register and retrieve events', () => {
      const eventData = { message: 'test' };
      const event = createEvent('test.event', eventData);

      registry.registerEvent(event);

      expect(registry.getEvent(event.id)).toEqual(event);
    });

    it('should support event cleanup based on retention period', () => {
      const eventData = { message: 'test' };
      const event = createEvent('test.event', eventData, {
        timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago
      });

      registry.registerEvent(event);
      registry.cleanupOldEvents();

      expect(registry.getEvent(event.id)).toBeUndefined();
    });

    it('should support event search', () => {
      const event1 = createEvent('user.created', { name: 'John' });
      const event2 = createEvent('user.deleted', { name: 'Jane' });

      registry.registerEvent(event1);
      registry.registerEvent(event2);

      const results = registry.searchEvents('user');

      expect(results).toHaveLength(2);
      expect(results).toContainEqual(event1);
      expect(results).toContainEqual(event2);
    });

    it('should support event history with filters', () => {
      const events = [
        createEvent('test.event', { count: 1 }, { timestamp: new Date(Date.now() - 2000) }),
        createEvent('test.event', { count: 2 }, { timestamp: new Date(Date.now() - 1000) }),
        createEvent('test.event', { count: 3 }, { timestamp: new Date() })
      ];

      events.forEach(event => registry.registerEvent(event));

      const history = registry.getEventHistory({
        category: undefined,
        startTime: new Date(Date.now() - 60 * 60 * 1000),
        endTime: new Date(),
        limit: 2
      });

      expect(history).toHaveLength(2);
      expect(history[0].data.count).toBe(3);
      expect(history[1].data.count).toBe(2);
    });

    it('should support event timeline generation', () => {
      const events = [
        createEvent('test.event', { count: 1 }),
        createEvent('test.event', { count: 2 }),
        createEvent('test.event', { count: 3 })
      ];

      events.forEach(event => registry.registerEvent(event));

      const timeline = registry.getEventTimeline();

      expect(timeline).toHaveLength(3);
      expect(timeline[0].eventCount).toBe(1);
    });

    it('should support event export and import', () => {
      const event1 = createEvent('test.event', { count: 1 });
      const event2 = createEvent('test.event', { count: 2 });

      registry.registerEvent(event1);
      registry.registerEvent(event2);

      const exportedEvents = registry.exportEvents();
      registry.clearEvents();

      expect(registry.getAllEvents()).toHaveLength(0);

      registry.importEvents(exportedEvents);

      expect(registry.getAllEvents()).toHaveLength(2);
    });

    it('should support getting events by category', () => {
      const event1 = createEvent('test.event', { count: 1 }, { context: { category: 'database' } });
      const event2 = createEvent('test.event', { count: 2 }, { context: { category: 'job-queue' } });

      registry.registerEvent(event1);
      registry.registerEvent(event2);

      const databaseEvents = registry.getEventsByCategory('database');
      const jobQueueEvents = registry.getEventsByCategory('job-queue');

      expect(databaseEvents).toHaveLength(1);
      expect(jobQueueEvents).toHaveLength(1);
    });

    it('should support getting all events', () => {
      const events = [
        createEvent('test.event1', { count: 1 }),
        createEvent('test.event2', { count: 2 }),
        createEvent('test.event3', { count: 3 })
      ];

      events.forEach(event => registry.registerEvent(event));

      const allEvents = registry.getAllEvents();

      expect(allEvents).toHaveLength(3);
    });

    it('should support clearing all events', () => {
      const events = [
        createEvent('test.event1', { count: 1 }),
        createEvent('test.event2', { count: 2 })
      ];

      events.forEach(event => registry.registerEvent(event));

      registry.clearEvents();

      expect(registry.getAllEvents()).toHaveLength(0);
    });
  });

  describe('Event Categories', () => {
    it('should create event categories correctly', () => {
      const category = createEventCategory('database', 'Database operations', ['query', 'mutation']);

      expect(category).toHaveProperty('name', 'database');
      expect(category).toHaveProperty('description', 'Database operations');
      expect(category).toHaveProperty('events', ['query', 'mutation']);
    });

    it('should support event category registration', () => {
      const category = createEventCategory('database', 'Database operations');
      manager.registerEventCategory(category);

      expect(manager.getEventCategories()).toContainEqual(category);
    });

    it('should support multiple event categories', () => {
      const databaseCategory = createEventCategory('database', 'Database operations', ['query', 'mutation']);
      const jobQueueCategory = createEventCategory('job-queue', 'Job queue operations', ['job.created', 'job.started']);

      manager.registerEventCategory(databaseCategory);
      manager.registerEventCategory(jobQueueCategory);

      const categories = manager.getEventCategories();

      expect(categories).toHaveLength(2);
      expect(categories).toContainEqual(databaseCategory);
      expect(categories).toContainEqual(jobQueueCategory);
    });
  });

  describe('Event Listeners', () => {
    it('should create event listeners correctly', () => {
      const handler = () => {};
      const listener = createEventListener('test.listener', handler, {
        priority: 10,
        once: true
      });

      expect(listener).toHaveProperty('id');
      expect(listener).toHaveProperty('name', 'test.listener');
      expect(listener).toHaveProperty('handler', handler);
      expect(listener).toHaveProperty('priority', 10);
      expect(listener).toHaveProperty('once', true);
    });

    it('should support listener priority', async () => {
      const executionOrder = [];
      const handlerHigh = jest.fn(() => executionOrder.push('high'));
      const handlerLow = jest.fn(() => executionOrder.push('low'));

      const listenerHigh = createEventListener('test.event', handlerHigh, { priority: 10 });
      const listenerLow = createEventListener('test.event', handlerLow, { priority: 1 });

      manager.addListener(listenerHigh);
      manager.addListener(listenerLow);

      await manager.emit(createEvent('test.event', {}));

      expect(executionOrder).toEqual(['high', 'low']);
    });

    it('should support listener removal', () => {
      const handler = () => {};
      const listener = createEventListener('test.listener', handler);

      manager.addListener(listener);
      manager.removeListener(listener);

      expect(manager.getListeners('test.listener')).toHaveLength(0);
    });
  });

  describe('Event Middleware', () => {
    it('should create event middleware correctly', () => {
      const middleware = createEventMiddleware(async (event, next) => {
        await next();
      });

      expect(middleware).toBeInstanceOf(Function);
    });

    it('should support multiple middleware', async () => {
      const eventData = { message: 'test' };
      const event = createEvent('test.event', eventData);

      const middleware1 = jest.fn(async (e, next) => {
        e.data.middleware1 = true;
        await next();
      });

      const middleware2 = jest.fn(async (e, next) => {
        e.data.middleware2 = true;
        await next();
      });

      manager.addMiddleware(middleware1);
      manager.addMiddleware(middleware2);

      const handler = jest.fn();
      manager.on('test.event', handler);

      await manager.emit(event);

      expect(middleware1).toHaveBeenCalled();
      expect(middleware2).toHaveBeenCalled();
      expect(event.data.middleware1).toBe(true);
      expect(event.data.middleware2).toBe(true);
    });
  });

  describe('Event Filters', () => {
    it('should create event filters correctly', () => {
      const filter = createEventFilter((event) => event.data.type === 'important');

      expect(filter).toBeInstanceOf(Function);
    });

    it('should support multiple filters', async () => {
      const eventData1 = { type: 'important', value: 10 };
      const eventData2 = { type: 'normal', value: 5 };
      const eventData3 = { type: 'important', value: -1 };
      const event1 = createEvent('test.event', eventData1);
      const event2 = createEvent('test.event', eventData2);
      const event3 = createEvent('test.event', eventData3);

      const filter1 = (e: any) => e.data.type === 'important';
      const filter2 = (e: any) => e.data.value > 0;

      manager.addFilter(filter1);
      manager.addFilter(filter2);

      const handler = jest.fn();
      manager.on('test.event', handler);

      await manager.emit(event1);
      await manager.emit(event2);
      await manager.emit(event3);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event1);
    });
  });

  describe('Error Handling', () => {
    it('should handle event validation errors', () => {
      const invalidEvent = { name: 'test', data: {} };

      expect(validateEvent(invalidEvent)).toBe(false);
    });

    it('should handle event serialization errors', () => {
      const event = createEvent('test.event', { message: 'test' });
      const serialized = serializeEvent(event);

      expect(() => deserializeEvent('invalid-json')).toThrow();
    });

    it('should handle event processing errors', async () => {
      const eventData = { message: 'test' };
      const event = createEvent('test.event', eventData);

      const failingHandler = jest.fn(() => {
        throw new Error('Test error');
      });

      manager.on('test.event', failingHandler);

      // Should not throw - errors are caught and handled gracefully
      await manager.emit(event);
      expect(failingHandler).toHaveBeenCalled();
    });

    it('should handle middleware errors', async () => {
      const eventData = { message: 'test' };
      const event = createEvent('test.event', eventData);

      const failingMiddleware = jest.fn(async (e, next) => {
        throw new Error('Middleware error');
      });

      manager.addMiddleware(failingMiddleware);

      const handler = jest.fn();
      manager.on('test.event', handler);

      // Should not throw - errors are caught and handled gracefully
      await manager.emit(event);
      expect(failingMiddleware).toHaveBeenCalled();
    });

    it('should handle filter errors', async () => {
      const eventData = { message: 'test' };
      const event = createEvent('test.event', eventData);

      const failingFilter = () => {
        throw new Error('Filter error');
      };

      manager.addFilter(failingFilter);

      const handler = jest.fn();
      manager.on('test.event', handler);

      // Should not throw - errors are caught and handled gracefully
      await manager.emit(event);
      expect(handler).not.toHaveBeenCalled(); // Filter failed, so handler shouldn't run
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    it('should handle null or undefined events', async () => {
      const handler = jest.fn();
      manager.on('test.event', handler);

      await expect(manager.emit(null as any)).rejects.toThrow();
      await expect(manager.emit(undefined as any)).rejects.toThrow();
    });

    it('should handle null or undefined listeners', () => {
      expect(() => manager.on('test.event', null as any)).toThrow();
      expect(() => manager.on('test.event', undefined as any)).toThrow();
    });

    it('should handle duplicate listeners', () => {
      const handler = () => {};
      manager.on('test.event', handler);
      manager.on('test.event', handler);

      expect(manager.getListeners('test.event')).toHaveLength(2);
    });

    it('should handle empty event names', () => {
      const eventData = { message: 'test' };
      const event = createEvent('', eventData);

      expect(() => validateEvent(event)).toThrow();
    });

    it('should handle empty event data', () => {
      const event = createEvent('test.event', {});

      expect(validateEvent(event)).toBe(true);
    });

    it('should handle maximum listeners limit', () => {
      const managerWithLimit = createEventManager({ maxListeners: 2 });

      const handler1 = () => {};
      const handler2 = () => {};
      const handler3 = () => {};

      managerWithLimit.on('test.event', handler1);
      managerWithLimit.on('test.event', handler2);
      managerWithLimit.on('test.event', handler3);

      expect(managerWithLimit.getListeners('test.event')).toHaveLength(3);
    });

    it('should handle maximum events limit in registry', () => {
      const registryWithLimit = createEventRegistry({ maxEvents: 2 });

      const event1 = createEvent('test.event1', { count: 1 });
      const event2 = createEvent('test.event2', { count: 2 });
      const event3 = createEvent('test.event3', { count: 3 });

      registryWithLimit.registerEvent(event1);
      registryWithLimit.registerEvent(event2);
      registryWithLimit.registerEvent(event3);

      expect(registryWithLimit.getAllEvents()).toHaveLength(3);
    });

    it('should handle invalid event categories', () => {
      const invalidCategory = createEventCategory('', 'Invalid category');

      expect(() => manager.registerEventCategory(invalidCategory)).not.toThrow();
    });

    it('should handle invalid event context', () => {
      const event = createEvent('test.event', { message: 'test' }, { context: null as any });

      expect(validateEvent(event)).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complex event workflows', async () => {
      const workflowEvents = [
        createEvent('workflow.start', { step: 1 }),
        createEvent('workflow.process', { step: 2 }),
        createEvent('workflow.complete', { step: 3 })
      ];

      const workflowResults = [];

      const startHandler = jest.fn(async (event) => {
        workflowResults.push(`Started: ${event.data.step}`);
      });

      const processHandler = jest.fn(async (event) => {
        workflowResults.push(`Processing: ${event.data.step}`);
      });

      const completeHandler = jest.fn(async (event) => {
        workflowResults.push(`Completed: ${event.data.step}`);
      });

      manager.on('workflow.start', startHandler);
      manager.on('workflow.process', processHandler);
      manager.on('workflow.complete', completeHandler);

      for (const event of workflowEvents) {
        await manager.emit(event);
      }

      expect(workflowResults).toEqual([
        'Started: 1',
        'Processing: 2',
        'Completed: 3'
      ]);
    });

    it('should handle event cascading', async () => {
      const eventData = { message: 'test' };
      const event = createEvent('trigger.event', eventData);

      const triggerHandler = jest.fn(async (event) => {
        await manager.emit(createEvent('cascaded.event', { source: 'trigger' }));
      });

      const cascadedHandler = jest.fn();
      manager.on('trigger.event', triggerHandler);
      manager.on('cascaded.event', cascadedHandler);

      await manager.emit(event);

      expect(triggerHandler).toHaveBeenCalled();
      expect(cascadedHandler).toHaveBeenCalled();
    });

    it('should handle concurrent event emissions', async () => {
      const eventData = { message: 'test' };
      const event = createEvent('concurrent.event', eventData);

      const handler = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      manager.on('concurrent.event', handler);

      const promises = Array(10).fill(null).map(() => manager.emit(event));
      await Promise.all(promises);

      expect(handler).toHaveBeenCalledTimes(10);
    });

    it('should handle event memory management', async () => {
      const registryWithRetention = createEventRegistry({
        retentionPeriod: 1000 // 1 second
      });

      const event = createEvent('test.event', { message: 'test' });
      registryWithRetention.registerEvent(event);

      await new Promise(resolve => setTimeout(resolve, 2000));

      registryWithRetention.cleanupOldEvents();

      expect(registryWithRetention.getEvent(event.id)).toBeUndefined();
    });
  });
});
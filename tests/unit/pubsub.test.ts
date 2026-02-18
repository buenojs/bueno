import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PubSub, createPubSub, createMemoryPubSub } from '../../src/websocket';

describe('PubSub (In-Memory)', () => {
  let pubsub: PubSub;

  beforeEach(() => {
    pubsub = createMemoryPubSub();
  });

  afterEach(() => {
    pubsub.destroy();
  });

  describe('Basic Operations', () => {
    test('should publish and receive messages', async () => {
      const messages: unknown[] = [];
      
      await pubsub.subscribe('test-channel', (message) => {
        messages.push(message.data);
      });

      await pubsub.publish('test-channel', 'hello world');
      await pubsub.publish('test-channel', { foo: 'bar' });

      expect(messages.length).toBe(2);
      expect(messages[0]).toBe('hello world');
      expect(messages[1]).toEqual({ foo: 'bar' });
    });

    test('should support multiple subscribers on same channel', async () => {
      const messages1: unknown[] = [];
      const messages2: unknown[] = [];

      await pubsub.subscribe('shared-channel', (msg) => { messages1.push(msg.data); });
      await pubsub.subscribe('shared-channel', (msg) => { messages2.push(msg.data); });

      const delivered = await pubsub.publish('shared-channel', 'broadcast');

      expect(delivered).toBe(2);
      expect(messages1).toEqual(['broadcast']);
      expect(messages2).toEqual(['broadcast']);
    });

    test('should return unsubscribe function', async () => {
      const messages: unknown[] = [];

      const unsubscribe = await pubsub.subscribe('temp-channel', (msg) => {
        messages.push(msg.data);
      });

      await pubsub.publish('temp-channel', 'message 1');
      expect(messages.length).toBe(1);

      // Unsubscribe
      await unsubscribe();

      await pubsub.publish('temp-channel', 'message 2');
      expect(messages.length).toBe(1); // Should still be 1
    });

    test('should handle async callbacks', async () => {
      const messages: string[] = [];

      await pubsub.subscribe('async-channel', async (msg) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        messages.push(`processed: ${msg.data}`);
      });

      await pubsub.publish('async-channel', 'test');

      // Wait for async callback
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(messages).toEqual(['processed: test']);
    });
  });

  describe('Pattern Subscriptions', () => {
    test('should match pattern with * wildcard', async () => {
      const messages: string[] = [];

      await pubsub.psubscribe('user:*', (msg) => {
        messages.push(msg.channel);
      });

      await pubsub.publish('user:123', 'data');
      await pubsub.publish('user:456', 'data');
      await pubsub.publish('post:789', 'data');

      expect(messages).toEqual(['user:123', 'user:456']);
    });

    test('should match pattern with ? single char', async () => {
      const messages: string[] = [];

      await pubsub.psubscribe('user:?', (msg) => {
        messages.push(msg.channel);
      });

      await pubsub.publish('user:1', 'data');
      await pubsub.publish('user:a', 'data');
      await pubsub.publish('user:12', 'data'); // Should not match (2 chars)

      expect(messages).toEqual(['user:1', 'user:a']);
    });

    test('should match complex patterns', async () => {
      const messages: string[] = [];

      await pubsub.psubscribe('app:*:event', (msg) => {
        messages.push(msg.channel);
      });

      await pubsub.publish('app:user:event', 'data');
      await pubsub.publish('app:order:event', 'data');
      await pubsub.publish('app:user:other', 'data');

      expect(messages).toEqual(['app:user:event', 'app:order:event']);
    });

    test('should include pattern in message', async () => {
      let receivedPattern: string | undefined;

      await pubsub.psubscribe('test:*', (msg) => {
        receivedPattern = msg.pattern;
      });

      await pubsub.publish('test:channel', 'data');

      expect(receivedPattern).toBe('test:*');
    });
  });

  describe('Subscriber Management', () => {
    test('should count channel subscribers', async () => {
      expect(pubsub.getChannelSubscribers('my-channel')).toBe(0);

      await pubsub.subscribe('my-channel', () => {});
      expect(pubsub.getChannelSubscribers('my-channel')).toBe(1);

      await pubsub.subscribe('my-channel', () => {});
      expect(pubsub.getChannelSubscribers('my-channel')).toBe(2);
    });

    test('should count pattern subscribers', async () => {
      expect(pubsub.getPatternSubscribers('test:*')).toBe(0);

      await pubsub.psubscribe('test:*', () => {});
      expect(pubsub.getPatternSubscribers('test:*')).toBe(1);
    });

    test('should count total subscribers', async () => {
      await pubsub.subscribe('channel1', () => {});
      await pubsub.subscribe('channel2', () => {});
      await pubsub.psubscribe('pattern:*', () => {});

      expect(pubsub.getTotalSubscribers()).toBe(3);
    });

    test('should unsubscribe all from channel', async () => {
      await pubsub.subscribe('multi-channel', () => {});
      await pubsub.subscribe('multi-channel', () => {});

      expect(pubsub.getChannelSubscribers('multi-channel')).toBe(2);

      await pubsub.unsubscribe('multi-channel');

      expect(pubsub.getChannelSubscribers('multi-channel')).toBe(0);
    });

    test('should punsubscribe all from pattern', async () => {
      await pubsub.psubscribe('test:*', () => {});
      await pubsub.psubscribe('test:*', () => {});

      expect(pubsub.getPatternSubscribers('test:*')).toBe(2);

      await pubsub.punsubscribe('test:*');

      expect(pubsub.getPatternSubscribers('test:*')).toBe(0);
    });
  });

  describe('Clear Operations', () => {
    test('should clear all subscriptions', async () => {
      await pubsub.subscribe('channel1', () => {});
      await pubsub.subscribe('channel2', () => {});
      await pubsub.psubscribe('pattern:*', () => {});

      await pubsub.clear();

      expect(pubsub.getTotalSubscribers()).toBe(0);
    });
  });

  describe('Message Structure', () => {
    test('should include timestamp in message', async () => {
      let receivedTimestamp: number | undefined;
      const beforeTime = Date.now();

      await pubsub.subscribe('timestamp-channel', (msg) => {
        receivedTimestamp = msg.timestamp;
      });

      await pubsub.publish('timestamp-channel', 'test');

      expect(receivedTimestamp).toBeDefined();
      expect(receivedTimestamp!).toBeGreaterThanOrEqual(beforeTime);
    });

    test('should include channel in message', async () => {
      let receivedChannel: string | undefined;

      await pubsub.subscribe('my-channel', (msg) => {
        receivedChannel = msg.channel;
      });

      await pubsub.publish('my-channel', 'test');

      expect(receivedChannel).toBe('my-channel');
    });
  });
});

describe('PubSub Factory Functions', () => {
  test('createPubSub should create memory pubsub by default', () => {
    const pubsub = createPubSub();
    expect(pubsub.getDriverType()).toBe('memory');
    pubsub.destroy();
  });

  test('createPubSub with driver option', () => {
    const memPubsub = createPubSub({ driver: 'memory' });
    expect(memPubsub.getDriverType()).toBe('memory');
    memPubsub.destroy();
  });

  test('createMemoryPubSub should create memory pubsub', () => {
    const pubsub = createMemoryPubSub();
    expect(pubsub.getDriverType()).toBe('memory');
    pubsub.destroy();
  });
});

describe('PubSub Connection State', () => {
  test('should be connected after initialization for memory', () => {
    const pubsub = createMemoryPubSub();
    expect(pubsub.isConnected).toBe(true);
    pubsub.destroy();
  });

  test('should not be connected after destroy', () => {
    const pubsub = createMemoryPubSub();
    pubsub.destroy();
    expect(pubsub.isConnected).toBe(false);
  });
});
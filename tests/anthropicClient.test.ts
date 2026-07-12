import { describe, it, expect } from 'vitest';
import { anthropicClient } from '../src/utils/anthropicClient.js';

describe('anthropicClient (unconfigured - no ANTHROPIC_API_KEY in the test environment)', () => {
  it('throws a clear error instead of a cryptic SDK failure', async () => {
    await expect(anthropicClient.askClaude('test prompt')).rejects.toThrow(
      /AI features are not configured/,
    );
  });
});

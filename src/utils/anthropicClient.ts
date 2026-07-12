import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { AppError } from '../errors/index.js';

/**
 * Shared client for Anthropic's Messages API (server-side, billed by usage -
 * a different key than a claude.ai login). Used by:
 * - analytics.service.ts (waste analysis narrative + recommendations)
 * - local-event.service.ts (event search via the web_search tool)
 */

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AppError(
      500,
      'INTERNAL_ERROR',
      'AI features are not configured (missing ANTHROPIC_API_KEY)',
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

// Balanced cost/capability choice for summarization + light reasoning tasks -
// not the heaviest model, not the cheapest. Update here if pricing/model
// availability changes; verify the current recommended model and the
// web_search tool's version string against Anthropic's docs periodically,
// since both can change.
const MODEL = 'claude-sonnet-5';
const WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search' } as const;

export interface AskClaudeOptions {
  maxTokens?: number;
  enableWebSearch?: boolean;
}

export const anthropicClient = {
  /**
   * Sends a single-turn prompt and returns the concatenated text of the
   * response. When web search is enabled, the response may interleave text
   * and tool-use/tool-result blocks - only the text blocks are joined here.
   */
  async askClaude(prompt: string, options: AskClaudeOptions = {}): Promise<string> {
    const anthropic = getClient();

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: options.maxTokens ?? 1500,
      messages: [{ role: 'user', content: prompt }],
      // The SDK's bundled `tools` type models only custom client-side tools
      // (which require an `input_schema`); server-side tools like
      // web_search don't have one, so TS rejects the object shape
      // Anthropic's own API docs specify for it. This is a real gap in the
      // SDK's types, not an escape from real type checking - WEB_SEARCH_TOOL
      // is a fixed, hand-verified constant, never user input.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: options.enableWebSearch ? ([WEB_SEARCH_TOOL] as any) : undefined,
    });

    return response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('\n');
  },

  /**
   * Same as askClaude, but parses the result as JSON, stripping ```json
   * fences if the model wrapped its output in a code block despite
   * instructions not to. Throws a clear (502) error if the result isn't
   * valid JSON, rather than letting a malformed AI response crash silently
   * or leak a raw parse error to the client.
   */
  async askClaudeForJson<T>(prompt: string, options: AskClaudeOptions = {}): Promise<T> {
    const raw = await anthropicClient.askClaude(prompt, options);
    const cleaned = raw.replace(/```json|```/g, '').trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new AppError(
        502,
        'INTERNAL_ERROR',
        'AI response was not valid JSON - the model may have deviated from the expected output format',
      );
    }
  },
};

import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { normalizeMiniMaxModelId } from '@/lib/constants/minimaxModels';

export function getMiniMaxBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.MINIMAX_ANTHROPIC_BASE_URL?.trim()
    || (env.MINIMAX_REGION?.trim() === 'cn_zh'
      ? 'https://api.minimaxi.com/anthropic'
      : 'https://api.minimax.io/anthropic');
}

export function buildMiniMaxQueryOptions(
  model: string | undefined,
  cwd: string,
  apiKey?: string,
  inherited: NodeJS.ProcessEnv = process.env,
): Options {
  const normalized = normalizeMiniMaxModelId(model);
  return {
    cwd,
    additionalDirectories: [cwd],
    model: normalized,
    env: buildMiniMaxEnvironment(normalized, apiKey, getMiniMaxBaseUrl(inherited), inherited.MINIMAX_API_TIMEOUT_MS?.trim() || '3000000', inherited),
    settingSources: ['user'],
    permissionMode: 'bypassPermissions',
  };
}

/** Build child-runtime settings without changing other providers' environment. */
export function buildMiniMaxEnvironment(
  model: string,
  apiKey: string | undefined,
  baseUrl: string,
  timeout: string,
  inherited: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...inherited };
  const key = apiKey?.trim() || env.MINIMAX_API_KEY?.trim() || env.MINIMAXI_API_KEY?.trim();
  if (key) {
    env.MINIMAX_API_KEY = key;
    env.MINIMAXI_API_KEY = key;
    env.ANTHROPIC_AUTH_TOKEN = key;
    env.ANTHROPIC_API_KEY = key;
  }
  env.ANTHROPIC_BASE_URL ||= baseUrl;
  env.API_TIMEOUT_MS ||= timeout;
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ||= '1';
  if (env.MINIMAX_MAX_OUTPUT_TOKENS) {
    env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = env.MINIMAX_MAX_OUTPUT_TOKENS;
  }

  const normalized = normalizeMiniMaxModelId(model);
  if (normalized === 'MiniMax-M3.1-Flash' || normalized === 'MiniMax-M3') {
    const extra = env.CLAUDE_CODE_EXTRA_BODY ? JSON.parse(env.CLAUDE_CODE_EXTRA_BODY) : {};
    if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
      throw new Error('CLAUDE_CODE_EXTRA_BODY must be a JSON object');
    }
    // The pinned runtime otherwise caps unknown models and drops effort settings.
    const requestedTokens = Number(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS);
    const maxTokens = Number.isInteger(requestedTokens) && requestedTokens > 0
      ? requestedTokens
      : 131072;
    env.CLAUDE_CODE_EXTRA_BODY = JSON.stringify({
      max_tokens: maxTokens,
      ...extra,
      ...(normalized === 'MiniMax-M3.1-Flash' ? {
        thinking: { type: 'adaptive' },
        output_config: { effort: 'max', ...extra.output_config },
      } : {}),
    });
  }
  return env;
}

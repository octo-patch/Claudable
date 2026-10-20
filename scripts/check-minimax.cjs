// Run with: node scripts/check-minimax.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(relative) {
  const filename = path.join(root, `${relative}.ts`);
  if (cache.has(filename)) return cache.get(filename);
  const exports = {};
  cache.set(filename, exports);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInThisContext(`(function(require, exports) {${source}\n})`, { filename })(
    name => name.startsWith('@/') ? load(name.slice(2))
      : name.startsWith('.') ? load(path.join(path.dirname(relative), name)) : require(name), exports,
  );
  return exports;
}

async function main() {
  const models = load('lib/constants/minimaxModels');
  const cli = load('lib/utils/cliOptions');
  const { buildMiniMaxEnvironment, buildMiniMaxQueryOptions, getMiniMaxBaseUrl } = load('lib/services/cli/minimaxEnvironment');
  assert.equal(getMiniMaxBaseUrl({}), 'https://api.minimax.io/anthropic');
  assert.equal(getMiniMaxBaseUrl({ MINIMAX_REGION: 'cn_zh' }), 'https://api.minimaxi.com/anthropic');
  assert.equal(getMiniMaxBaseUrl({ MINIMAX_REGION: 'global_en' }), 'https://api.minimax.io/anthropic');
  assert.equal(getMiniMaxBaseUrl({ MINIMAX_ANTHROPIC_BASE_URL: 'https://custom.invalid' }), 'https://custom.invalid');
  assert.deepEqual(models.MINIMAX_MODEL_DEFINITIONS.map(model => model.id), ['MiniMax-M3.1-Flash', 'MiniMax-M3']);
  for (const value of [undefined, null, '', '  ', 'minimax', 'minimax-latest', 'MINIMAX-M3.1-FLASH']) {
    assert.equal(models.normalizeMiniMaxModelId(value), 'MiniMax-M3.1-Flash');
  }
  assert.equal(models.normalizeMiniMaxModelId('m3'), 'MiniMax-M3');
  assert.equal(models.normalizeMiniMaxModelId('m27'), 'MiniMax-M2.7');
  for (const model of ['MiniMax-M2.5', 'MiniMax-M2.7', 'custom-deployment']) {
    assert.equal(models.normalizeMiniMaxModelId(model), model);
    assert(cli.buildActiveModelOptions({}, { cli: 'minimax', model }).some(option => option.cli === 'minimax' && option.id === model));
  }
  assert.equal(models.getMiniMaxModelDisplayName('custom-deployment'), 'custom-deployment');
  assert.equal(models.getMiniMaxModelDefinition('m27').supportsImages, false);
  assert(models.MINIMAX_MODEL_DEFINITIONS.every(model => model.supportsImages));
  assert.equal(cli.buildActiveModelOptions({}).filter(option => option.cli === 'minimax').length, 2);

  const inherited = { MINIMAX_API_KEY: 'test-key', ANTHROPIC_BASE_URL: 'http://custom.invalid' };
  const env = buildMiniMaxEnvironment('MiniMax-M3.1-Flash', undefined, 'http://default.invalid', '10000', inherited);
  assert.deepEqual(inherited, { MINIMAX_API_KEY: 'test-key', ANTHROPIC_BASE_URL: 'http://custom.invalid' });
  assert.equal(env.ANTHROPIC_BASE_URL, inherited.ANTHROPIC_BASE_URL);
  assert.equal(env.ANTHROPIC_API_KEY, 'test-key');
  assert.deepEqual(JSON.parse(env.CLAUDE_CODE_EXTRA_BODY), { max_tokens: 131072, thinking: { type: 'adaptive' }, output_config: { effort: 'max' } });
  for (const model of ['MiniMax-M2.7', 'custom-deployment']) {
    assert.equal(buildMiniMaxEnvironment(model, undefined, 'http://default.invalid', '10000', {}).CLAUDE_CODE_EXTRA_BODY, undefined);
  }
  const overridden = buildMiniMaxEnvironment('MiniMax-M3.1-Flash', undefined, 'http://default.invalid', '10000', {
    MINIMAX_MAX_OUTPUT_TOKENS: '8192',
    CLAUDE_CODE_EXTRA_BODY: JSON.stringify({ output_config: { effort: 'low' }, temperature: 0.7 }),
  });
  assert.deepEqual(JSON.parse(overridden.CLAUDE_CODE_EXTRA_BODY), { max_tokens: 8192, temperature: 0.7, thinking: { type: 'adaptive' }, output_config: { effort: 'low' } });
  console.log('PASS MiniMax catalog, aliases, saved/custom selections, image support, and isolated request settings');

  // Exercise the real pinned Agent SDK/CLI against a local Anthropic-compatible endpoint.
  const requests = [];
  const server = http.createServer((req, res) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      if (!req.url.startsWith('/v1/messages')) { console.error(`Unexpected SDK route: ${req.url}`); res.writeHead(404).end(); return; }
      const body = JSON.parse(data);
      requests.push(body);
      const message = { id: 'msg_minimax_test', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
      if (!body.stream) { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(message)); return; }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const event of [
        { type: 'message_start', message: { ...message, content: [], stop_reason: null } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } },
        { type: 'message_stop' },
      ]) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      res.end();
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const fixtureRoot = path.join(root, 'node_modules', '.cache');
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(fixtureRoot, 'minimax-check-'));
  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    for (const model of ['MiniMax-M3.1-Flash', 'MiniMax-M3', 'MiniMax-M2.7', 'custom-deployment']) {
      const abortController = new AbortController();
      const timer = setTimeout(() => abortController.abort(), 30000);
      const start = requests.length;
      try {
        const options = buildMiniMaxQueryOptions(model === 'MiniMax-M3.1-Flash' ? undefined : model, fixture, 'local-test-key', {
          PATH: process.env.PATH, HOME: fixture, CLAUDE_CONFIG_DIR: fixture,
          MINIMAX_ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`, MINIMAX_API_TIMEOUT_MS: '5000',
          DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1',
        });
        const response = query({ prompt: 'Reply OK without calling tools.', options: {
          ...options, settingSources: [], tools: [], maxTurns: 1,
          abortController, persistSession: false, permissionMode: 'default',
          stderr: data => process.stderr.write(data),
        } });
        for await (const message of response) {
          if (message.type === 'result') assert.equal(message.is_error, false, JSON.stringify(message));
        }
      } finally { clearTimeout(timer); }
      const body = requests.slice(start).find(request => request.stream);
      assert(body, `No streaming request for ${model}`);
      assert.equal(body.model, model);
      if (model === 'MiniMax-M3.1-Flash' || model === 'MiniMax-M3') {
        assert.equal(body.max_tokens, 131072);
      }
      if (model === 'MiniMax-M3.1-Flash') {
        assert.equal(body.output_config.effort, 'max');
        assert.deepEqual(body.thinking, { type: 'adaptive' });
        assert.equal(body.service_tier, undefined);
        assert.notEqual(body.reasoning_split, false);
      }
      console.log(`PASS real SDK wire ${JSON.stringify({ model: body.model, max_tokens: body.max_tokens, thinking: body.thinking, output_config: body.output_config })}`);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

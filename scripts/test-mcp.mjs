import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';

const root = process.cwd();
const child = spawn(process.execPath, [process.env.TEXPRO_MCP_SERVER || path.join(root, 'mcp/server.mjs'), '--project', path.join(root, 'demo')], {
  stdio: ['pipe', 'pipe', 'pipe'],
});
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures.push(name);
};

const lines = readline.createInterface({ input: child.stdout });
const pending = new Map();
lines.on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  const waiter = pending.get(message.id);
  if (waiter) {
    pending.delete(message.id);
    waiter(message);
  }
});
child.stderr.on('data', (chunk) => {
  if (process.env.DEBUG_MCP) process.stderr.write(chunk);
});

let nextId = 1;
function request(method, params = {}) {
  const id = nextId++;
  const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP request timed out: ${method}`));
    }, 20000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
    child.stdin.write(payload);
  });
}

try {
  const initialized = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'texpro-smoke', version: '1.0.0' },
  });
  check('MCP initialize', initialized?.serverInfo?.name === 'texpro');

  const tools = await request('tools/list');
  check('MCP tools are listed', Array.isArray(tools?.tools) && tools.tools.length >= 12, `${tools?.tools?.length || 0} tools`);

  const info = await request('tools/call', { name: 'texpro_project_info', arguments: {} });
  const infoText = info?.content?.find((item) => item.type === 'text')?.text || '';
  const infoJson = JSON.parse(infoText);
  check('MCP project info', infoJson.rootFile?.endsWith('main.tex'));

  const search = await request('tools/call', { name: 'texpro_search', arguments: { query: 'Visual', limit: 10 } });
  const searchText = search?.content?.find((item) => item.type === 'text')?.text || '';
  const results = JSON.parse(searchText);
  check('MCP project search', Array.isArray(results) && results.length > 0, `${results.length} results`);

  const read = await request('tools/call', { name: 'texpro_read_file', arguments: { path: 'main.tex' } });
  const content = read?.content?.find((item) => item.type === 'text')?.text || '';
  check('MCP read file', content.includes('\\documentclass'), `${content.length} bytes`);

  const resources = await request('resources/list');
  check('MCP resources are listed', Array.isArray(resources?.resources) && resources.resources.length > 0, `${resources?.resources?.length || 0} resources`);
  const resource = resources.resources.find((item) => item.uri.endsWith('main.tex'));
  if (resource) {
    const readResource = await request('resources/read', { uri: resource.uri });
    check('MCP resource read', readResource?.contents?.[0]?.text?.includes('\\documentclass'));
  }
  const prompts = await request('prompts/list');
  check('MCP prompts are listed', Array.isArray(prompts?.prompts) && prompts.prompts.length >= 3);

  const diagnose = await request('tools/call', { name: 'texpro_diagnose', arguments: {} });
  const diagnoseText = diagnose?.content?.find((item) => item.type === 'text')?.text || '';
  const report = JSON.parse(diagnoseText);
  check('MCP project doctor', Array.isArray(report.tools) && report.tools.length > 0);
} catch (error) {
  check('MCP protocol completed', false, String(error));
} finally {
  child.stdin.end();
  child.kill();
}
if (failures.length) process.exit(1);
console.log('\nMCP checks passed');

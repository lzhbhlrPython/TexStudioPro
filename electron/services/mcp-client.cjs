'use strict';
const { spawn } = require('node:child_process');

const clients = new Map();
let elicitationHandler = null;

function rpc(client, method, params = {}, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const id = ++client.nextId;
    const timer = setTimeout(() => {
      client.pending.delete(id);
      reject(new Error(`MCP request timed out: ${method}`));
    }, timeout);
    client.pending.set(id, { resolve, reject, timer });
    try {
      client.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    } catch (error) {
      clearTimeout(timer);
      client.pending.delete(id);
      reject(error);
    }
  });
}

function handleLine(client, line) {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.id && client.pending.has(message.id)) {
    const waiter = client.pending.get(message.id);
    client.pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(message.error.message || 'MCP error'));
    else waiter.resolve(message.result);
    return;
  }
  if (message.method && message.id !== undefined) {
    const reply = (result) => {
      try { client.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n'); } catch { /* ignore */ }
    };
    if (message.method === 'ping') reply({});
    else if (message.method === 'roots/list') reply({ roots: client.projectRoot ? [{ uri: 'file://' + client.projectRoot, name: 'TeXPro project' }] : [] });
    else if (message.method === 'elicitation/create') {
      Promise.resolve(elicitationHandler?.(message.params) || { action: 'decline' }).then(reply).catch(() => reply({ action: 'decline' }));
    }
    else reply({});
  }
}

async function connectClient(id, options = {}) {
  await disconnectClient(id);
  const command = String(options.command || '').trim();
  if (!command) throw new Error('MCP command is required');
  const args = Array.isArray(options.args) ? options.args.map(String) : [];
  const child = spawn(command, args, {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...(options.env || {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const client = { id, child, pending: new Map(), nextId: 0, stderr: '', tools: [], projectRoot: options.cwd || '' };
  clients.set(id, client);
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) handleLine(client, line);
  });
  child.stderr.on('data', (chunk) => { client.stderr = (client.stderr + chunk.toString()).slice(-5000); });
  child.on('exit', () => {
    for (const waiter of client.pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('MCP server exited'));
    }
    client.pending.clear();
    clients.delete(id);
  });
  let initialized;
  try {
    initialized = await rpc(client, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'TeXPro', version: '0.1.0' },
    });
    client.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const listed = await rpc(client, 'tools/list', {});
    client.tools = listed?.tools || [];
  } catch (error) {
    await disconnectClient(id);
    throw new Error(`${error.message}${client.stderr ? '\n' + client.stderr : ''}`);
  }
  return {
    id,
    serverInfo: initialized?.serverInfo || null,
    tools: client.tools,
  };
}

async function callClient(id, name, args = {}) {
  const client = clients.get(id);
  if (!client) throw new Error('MCP server is not connected');
  return rpc(client, 'tools/call', { name, arguments: args });
}

async function disconnectClient(id) {
  const client = clients.get(id);
  if (!client) return { ok: true };
  clients.delete(id);
  try { client.child.kill('SIGTERM'); } catch { /* ignore */ }
  for (const waiter of client.pending.values()) {
    clearTimeout(waiter.timer);
    waiter.reject(new Error('MCP server disconnected'));
  }
  client.pending.clear();
  return { ok: true };
}

function listClients() {
  return [...clients.values()].map((client) => ({
    id: client.id,
    pid: client.child.pid,
    tools: client.tools.map((tool) => ({ name: tool.name, description: tool.description })),
  }));
}

function disconnectAll() {
  for (const id of [...clients.keys()]) void disconnectClient(id);
}

function setElicitationHandler(handler) { elicitationHandler = handler; }

module.exports = { connectClient, callClient, disconnectClient, listClients, disconnectAll, setElicitationHandler };

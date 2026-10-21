'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const tex = require('./tex.cjs');

let server = null;
let state = null;

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value, null, 2));
}

function start(root) {
  if (server) return status();
  const token = crypto.randomBytes(18).toString('hex');
  const projectRoot = root;
  server = http.createServer(async (request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) return json(response, 401, { error: 'Unauthorized' });
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === '/v1/project') {
        const project = tex.openProject(projectRoot);
        return json(response, 200, { root: projectRoot, name: project.name, rootFile: project.rootFile, files: project.tree });
      }
      if (url.pathname === '/v1/symbols') return json(response, 200, tex.collectProjectSymbols(projectRoot));
      if (url.pathname === '/v1/diagnostics') return json(response, 200, await tex.diagnoseProject(projectRoot));
      if (url.pathname === '/v1/assets') return json(response, 200, tex.collectAssets(projectRoot));
      if (url.pathname === '/v1/graph') return json(response, 200, tex.collectProjectGraph(projectRoot));
      return json(response, 404, { error: 'Unknown endpoint' });
    } catch (error) {
      return json(response, 500, { error: error?.message || String(error) });
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      state = { running: true, root: projectRoot, token, port, baseUrl: `http://127.0.0.1:${port}` };
      resolve({ ...state });
    });
  });
}

function stop() {
  if (server) server.close();
  server = null;
  state = null;
  return { ok: true };
}

function status() {
  return state ? { ...state } : { running: false };
}

module.exports = { start, stop, status };

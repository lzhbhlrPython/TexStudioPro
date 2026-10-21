'use strict';
const os = require('node:os');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');
const Y = require('yjs');

let server = null;
let room = null;
let port = null;

function lanAddress() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '127.0.0.1';
}

function startCollab(options = {}) {
  if (server) return status();
  port = Number(options.port) || 4177;
  room = String(options.room || crypto.randomBytes(4).toString('hex'));
  const doc = new Y.Doc();
  const sockets = new Set();
  const wss = new WebSocketServer({ port, host: '0.0.0.0' });
  wss.on('connection', (socket, request) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.searchParams.get('room') !== room) {
      socket.close(1008, 'invalid room');
      return;
    }
    sockets.add(socket);
    socket.send(Y.encodeStateAsUpdate(doc));
    broadcast(sockets, JSON.stringify({ type: 'presence', count: sockets.size }));
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        Y.applyUpdate(doc, new Uint8Array(data));
        for (const other of sockets) if (other !== socket) other.send(data);
        return;
      }
      try {
        const message = JSON.parse(String(data));
        if (message.type === 'presence') broadcast(sockets, JSON.stringify({ type: 'presence', count: sockets.size, name: message.name }));
      } catch { /* ignore */ }
    });
    socket.on('close', () => {
      sockets.delete(socket);
      broadcast(sockets, JSON.stringify({ type: 'presence', count: sockets.size }));
    });
  });
  server = wss;
  return status();
}

function broadcast(sockets, message) {
  for (const socket of sockets) {
    try { socket.send(message); } catch { /* ignore */ }
  }
}

function stopCollab() {
  if (!server) return { ok: true };
  server.close();
  server = null;
  room = null;
  port = null;
  return { ok: true };
}

function status() {
  if (!server) return { running: false };
  return { running: true, port, room, host: lanAddress(), url: `ws://${lanAddress()}:${port}?room=${room}` };
}

module.exports = { startCollab, stopCollab, status };

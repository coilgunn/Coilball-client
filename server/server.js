const fs = require('fs');
const path = require('path');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_ROOM_PLAYERS = 6; // 1 hôte + 5 clients max
const HEARTBEAT_INTERVAL_MS = 15000;
const BANNED_IPS_FILE = path.join(__dirname, 'banned-ips.json');

/** @type {Map<string, { code: string, host: WebSocket, clients: Set<WebSocket>, createdAt: number }>} */
const rooms = new Map();
/** @type {Set<string>} */
const bannedIps = new Set();

try {
  if (fs.existsSync(BANNED_IPS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(BANNED_IPS_FILE, 'utf8'));
    if (Array.isArray(saved)) saved.forEach((ip) => ip && bannedIps.add(String(ip)));
  }
} catch (_) {}

function saveBannedIps() {
  try {
    fs.writeFileSync(BANNED_IPS_FILE, JSON.stringify(Array.from(bannedIps), null, 2));
  } catch (_) {}
}

function normalizeIp(raw) {
  if (!raw) return '';
  let ip = String(raw).split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

function getClientIp(req) {
  const fwd = req && req.headers ? req.headers['x-forwarded-for'] || req.headers['x-real-ip'] : '';
  if (fwd) return normalizeIp(fwd);
  return normalizeIp(req && req.socket ? req.socket.remoteAddress : '');
}

function isLocalAdminRequest(req) {
  const remote = normalizeIp(req && req.socket ? req.socket.remoteAddress : '');
  const hasFwd = !!(req && req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip']));
  return !hasFwd && (remote === '127.0.0.1' || remote === '::1');
}

function forceCloseRoom(code) {
  const cleanCode = String(code || '').replace(/[^0-9A-Za-z]/g, '').slice(-4).toUpperCase();
  const room = rooms.get(cleanCode);
  if (!room) return false;
  const hostId = room.host ? room.host._peerId || '' : '';
  const allSockets = [];
  if (room.host) allSockets.push(room.host);
  room.clients.forEach((c) => allSockets.push(c));
  room.clients.clear();
  rooms.delete(cleanCode);
  allSockets.forEach((s) => {
    s._roomCode = null;
    sendJson(s, {
      type: 'MP_LEAVE',
      peerId: hostId,
      isHost: true,
      _sender: hostId
    });
    try { s.close(4004, 'Salon fermé par l’administrateur'); } catch (_) {}
  });
  console.log(`[Admin] Salon ${cleanCode} fermé de force. Salons actifs: ${rooms.size}`);
  return true;
}

function banIp(rawIp) {
  const ip = normalizeIp(rawIp);
  if (!ip) return false;
  bannedIps.add(ip);
  saveBannedIps();
  let kicked = 0;
  wss.clients.forEach((ws) => {
    if (ws._ip === ip) {
      kicked++;
      cleanupSocket(ws);
      try { ws.close(4003, 'IP bannie'); } catch (_) {}
    }
  });
  console.log(`[Admin] IP bannie: ${ip} (${kicked} connexion(s) coupée(s))`);
  return true;
}

function unbanIp(rawIp) {
  const ip = normalizeIp(rawIp);
  if (!ip) return false;
  const existed = bannedIps.delete(ip);
  if (existed) {
    saveBannedIps();
    console.log(`[Admin] IP débannie: ${ip}`);
  }
  return existed;
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 8192) req.destroy();
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (_) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function safeSend(ws, data, isBinary = false) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(data, { binary: isBinary });
  } catch (_) {}
}

function sendJson(ws, obj) {
  safeSend(ws, JSON.stringify(obj), false);
}

function cleanupSocket(ws) {
  const code = ws._roomCode;
  if (!code) return;
  const room = rooms.get(code);
  ws._roomCode = null;
  if (!room) return;

  if (ws._isHost && room.host === ws) {
    room.clients.forEach((client) => {
      client._roomCode = null;
      sendJson(client, {
        type: 'MP_LEAVE',
        peerId: ws._peerId || '',
        isHost: true,
        _sender: ws._peerId || ''
      });
    });
    room.clients.clear();
    rooms.delete(code);
    console.log(`[Room ${code}] Fermée (hôte déconnecté). Salons actifs: ${rooms.size}`);
    return;
  }

  if (room.clients.has(ws)) {
    room.clients.delete(ws);
    if (room.host && room.host.readyState === WebSocket.OPEN && ws._peerId) {
      sendJson(room.host, {
        type: 'MP_LEAVE',
        peerId: ws._peerId,
        isHost: false,
        _sender: ws._peerId
      });
    }
    console.log(`[Room ${code}] Client ${ws._peerId || '?'} parti. Joueurs: ${1 + room.clients.size}`);
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const isLocalAdmin = isLocalAdminRequest(req);

  if (req.method === 'POST' && req.url.startsWith('/admin/')) {
    if (!isLocalAdmin) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Accès admin local uniquement' }));
      return;
    }
    const body = await readJsonBody(req);
    if (req.url === '/admin/close-room') {
      const closed = forceCloseRoom(body.code);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: closed }));
      return;
    }
    if (req.url === '/admin/ban-ip') {
      const ok = banIp(body.ip);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok, bannedIps: Array.from(bannedIps) }));
      return;
    }
    if (req.url === '/admin/unban-ip') {
      const ok = unbanIp(body.ip);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok, bannedIps: Array.from(bannedIps) }));
      return;
    }
  }

  if (req.url === '/health' || req.url === '/') {
    let totalClients = 0;
    const roomList = [];
    rooms.forEach((r) => {
      totalClients += 1 + r.clients.size;
      if (isLocalAdmin) {
        roomList.push({
          code: r.code,
          hostPeerId: r.host ? r.host._peerId : '',
          hostName: r.host ? r.host._playerName || r.host._peerId || 'Hôte' : 'Hôte',
          hostIp: r.host ? r.host._ip || '' : '',
          createdAt: r.createdAt,
          playerCount: 1 + r.clients.size,
          clients: Array.from(r.clients).map((c) => ({
            peerId: c._peerId || '',
            name: c._playerName || c._peerId || 'Joueuse',
            ip: c._ip || ''
          }))
        });
      }
    });
    const payload = {
      ok: true,
      service: 'coilball-multiplayer',
      rooms: rooms.size,
      players: totalClients,
      uptimeSec: Math.round(process.uptime())
    };
    if (isLocalAdmin) {
      payload.roomList = roomList;
      payload.bannedIps = Array.from(bannedIps);
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

wss.on('connection', (ws, req) => {
  const clientIp = getClientIp(req);
  if (clientIp && bannedIps.has(clientIp)) {
    sendJson(ws, { type: 'WS_BANNED' });
    try { ws.close(4003, 'IP bannie'); } catch (_) {}
    return;
  }

  ws._isAlive = true;
  ws._roomCode = null;
  ws._peerId = null;
  ws._isHost = false;
  ws._ip = clientIp;

  ws.on('pong', () => {
    ws._isAlive = true;
  });

  ws.on('message', (data, isBinary) => {
    ws._isAlive = true;

    // Paquets binaires (MP_PLAYER_INPUT / MP_WORLD_STATE) : relais direct sans parsing
    if (isBinary) {
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if (!room) return;
      if (ws._isHost) {
        room.clients.forEach((client) => safeSend(client, data, true));
      } else {
        safeSend(room.host, data, true);
      }
      return;
    }

    const text = typeof data === 'string' ? data : data.toString('utf8');
    let msg;
    try {
      msg = JSON.parse(text);
    } catch (_) {
      return;
    }
    if (!msg || !msg.type) return;

    if (msg.type === 'WS_PING') {
      sendJson(ws, { type: 'WS_PONG', t: msg.t });
      return;
    }

    if (msg.type === 'WS_HOST_OPEN') {
      const code = String(msg.code || '').replace(/[^0-9A-Za-z]/g, '').slice(-4).toUpperCase();
      const peerId = String(msg.peerId || '').slice(0, 64);
      if (code.length < 4 || !peerId) {
        sendJson(ws, { type: 'WS_ERROR', reason: 'Code de salon ou peerId invalide.' });
        return;
      }

      const existing = rooms.get(code);
      if (existing && existing.host && existing.host.readyState === WebSocket.OPEN && existing.host !== ws) {
        sendJson(ws, { type: 'WS_ROOM_TAKEN', code });
        return;
      }
      if (existing) {
        rooms.delete(code);
      }

      cleanupSocket(ws);
      ws._roomCode = code;
      ws._peerId = peerId;
      ws._isHost = true;
      rooms.set(code, {
        code,
        host: ws,
        clients: new Set(),
        createdAt: Date.now()
      });
      sendJson(ws, { type: 'WS_HOST_OK', code });
      console.log(`[Room ${code}] Créée par ${peerId}. Salons actifs: ${rooms.size}`);
      return;
    }

    if (msg.type === 'WS_JOIN_OPEN') {
      const code = String(msg.code || '').replace(/[^0-9A-Za-z]/g, '').slice(-4).toUpperCase();
      const peerId = String(msg.peerId || '').slice(0, 64);
      const room = rooms.get(code);
      if (!room || !room.host || room.host.readyState !== WebSocket.OPEN) {
        sendJson(ws, { type: 'WS_ROOM_NOT_FOUND', code });
        return;
      }

      cleanupSocket(ws);

      // Nettoyer une éventuelle ancienne connexion du même peerId
      room.clients.forEach((other) => {
        if (other._peerId === peerId) {
          room.clients.delete(other);
          other._roomCode = null;
          try { other.terminate(); } catch (_) {}
        }
      });

      if (1 + room.clients.size >= MAX_ROOM_PLAYERS) {
        sendJson(ws, { type: 'WS_ROOM_FULL', code });
        return;
      }

      ws._roomCode = code;
      ws._peerId = peerId;
      ws._isHost = false;
      room.clients.add(ws);
      sendJson(ws, { type: 'WS_JOIN_OK', code });
      console.log(`[Room ${code}] Client ${peerId} connecté. Joueurs: ${1 + room.clients.size}`);
      return;
    }

    // Relais des messages JSON du jeu (lobby, rôles, préparation, fin de manche...)
    const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
    if (!room) return;
    if (msg.type === 'MP_PING') return;

    if (msg.type === 'MP_JOIN_REQ' && msg.name) {
      ws._playerName = String(msg.name).slice(0, 24);
    } else if (msg.type === 'MP_LOBBY_STATE' && Array.isArray(msg.members)) {
      msg.members.forEach((m) => {
        if (!m || !m.peerId || !m.name) return;
        if (room.host && room.host._peerId === m.peerId) {
          room.host._playerName = String(m.name).slice(0, 24);
        } else {
          room.clients.forEach((c) => {
            if (c._peerId === m.peerId) c._playerName = String(m.name).slice(0, 24);
          });
        }
      });
    }

    if (ws._isHost) {
      room.clients.forEach((client) => safeSend(client, text, false));
    } else {
      safeSend(room.host, text, false);
    }
  });

  ws.on('close', () => cleanupSocket(ws));
  ws.on('error', () => cleanupSocket(ws));
});

const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws._isAlive === false) {
      cleanupSocket(ws);
      try { ws.terminate(); } catch (_) {}
      return;
    }
    ws._isAlive = false;
    try { ws.ping(); } catch (_) {}
  });
}, HEARTBEAT_INTERVAL_MS);

wss.on('close', () => clearInterval(heartbeatTimer));

server.listen(PORT, HOST, () => {
  console.log(`Coilball multiplayer server listening on http://${HOST}:${PORT}`);
});

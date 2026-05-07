#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const args = new Map(process.argv.slice(2).map((arg, i, all) => {
  if (!arg.startsWith('--')) return [String(i), arg];
  const [key, inlineValue] = arg.slice(2).split('=', 2);
  return [key, inlineValue ?? all[i + 1] ?? ''];
}));

const port = Number(args.get('port') || process.env.PORT || 8091);
const roomCode = 'FAMILY';
let state = newState();

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
};

function normalizeWordList(words) {
  const seen = new Set();
  (Array.isArray(words) ? words : []).forEach(word => {
    const key = String(word || '').trim().toLowerCase();
    if (key) seen.add(key);
  });
  return [...seen];
}

function mergeUsedWords(...sources) {
  const merged = { sv: [], en: [] };
  sources.forEach(source => {
    ['sv', 'en'].forEach(lang => {
      merged[lang] = normalizeWordList([
        ...merged[lang],
        ...(Array.isArray(source?.[lang]) ? source[lang] : []),
      ]);
    });
  });
  return merged;
}

function emptyRichStats() {
  return { players: {}, guests: [] };
}

function mergeRichStats(...sources) {
  const merged = emptyRichStats();
  sources.forEach(source => {
    Object.entries(source?.players || {}).forEach(([name, stats]) => {
      const current = merged.players[name];
      if (!current || (stats?.updatedAt || 0) >= (current.updatedAt || 0)) {
        merged.players[name] = { ...(stats || {}) };
      }
    });
    (Array.isArray(source?.guests) ? source.guests : []).forEach(guest => {
      if (!guest?.name) return;
      const prev = merged.guests.find(g => g.name === guest.name);
      if (!prev) merged.guests.push({ name: guest.name, lastSeen: guest.lastSeen || 0 });
      else prev.lastSeen = Math.max(prev.lastSeen || 0, guest.lastSeen || 0);
    });
  });
  merged.guests.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  merged.guests = merged.guests.slice(0, 12);
  return merged;
}

function newState(extra = {}) {
  const players = Array.isArray(extra.players) ? extra.players : [];
  return stamp({
    version: 1,
    phase: players.length ? 'waiting_for_round' : 'setup',
    players,
    claimed_names: [],
    claimed_sessions: {},
    scores: Object.fromEntries(players.map(player => [player, 0])),
    idx: 0,
    round: 1,
    lang: extra.lang || 'sv',
    theme: extra.theme || 'standard',
    timer_on: Boolean(extra.timer_on),
    timer_dur: Number(extra.timer_dur) || 60,
    barn_mode: Boolean(extra.barn_mode),
    same_device_mode: Boolean(extra.same_device_mode),
    timer_started_at: null,
    round_pts: 0,
    used_words: mergeUsedWords(extra.used_words),
    rich_stats: mergeRichStats(extra.rich_stats),
    last_event: null,
  }, false);
}

function stamp(next, bump = true) {
  return {
    ...next,
    version: bump ? (next.version || 0) + 1 : (next.version || 1),
    updated_at: new Date().toISOString(),
  };
}

function withTimer(current) {
  if (!current?.timer_on || current.phase !== 'playing' || !current.timer_started_at) return current;
  const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(current.timer_started_at)) / 1000));
  return { ...current, timer_remaining: Math.max(0, (current.timer_dur || 60) - elapsed) };
}

function handleAction(body = {}) {
  const action = body.action;

  if (action === 'setup') {
    state = newState(body);
    return { ok: true, room_code: roomCode, state: withTimer(state) };
  }

  const next = { ...state };
  const claimed = { ...(next.claimed_sessions || {}) };

  if (action === 'join') {
    const player = body.player;
    if (!next.players.includes(player)) return { ok: false };
    if (claimed[player] && claimed[player] !== body.session_id) return { ok: false };
    claimed[player] = body.session_id;
    next.claimed_sessions = claimed;
    next.claimed_names = Object.keys(claimed);
    next.used_words = mergeUsedWords(next.used_words, body.used_words);
    next.rich_stats = mergeRichStats(next.rich_stats, body.rich_stats);
  } else if (action === 'start_round') {
    next.phase = 'playing';
    next.round_pts = 0;
    next.timer_started_at = next.timer_on ? new Date().toISOString() : null;
  } else if (action === 'score_event') {
    const seq = (next.last_event?.seq || 0) + 1;
    next.last_event = { seq, pts: body.pts, diff: body.diff, at: Date.now() };
  } else if (action === 'mark_used') {
    const lang = body.lang === 'en' ? 'en' : 'sv';
    const word = String(body.word || '').trim().toLowerCase();
    if (word) next.used_words = mergeUsedWords(next.used_words, { [lang]: [word] });
  } else if (action === 'merge_stats') {
    next.rich_stats = mergeRichStats(next.rich_stats, body.rich_stats);
  } else if (action === 'clear_stats') {
    next.rich_stats = emptyRichStats();
  } else if (action === 'end_round') {
    const player = next.players[next.idx];
    const pts = Number(body.round_pts) || 0;
    next.scores = { ...(next.scores || {}), [player]: ((next.scores || {})[player] || 0) + pts };
    next.round_pts = pts;
    next.round = (next.round || 1) + 1;
    next.phase = 'round_summary';
    next.timer_started_at = null;
  } else if (action === 'next_player') {
    next.idx = next.players.length ? (next.idx + 1) % next.players.length : 0;
    next.phase = 'waiting_for_round';
    next.round_pts = 0;
    next.last_event = null;
  } else if (action === 'go_home') {
    next.phase = 'setup';
    next.claimed_names = [];
    next.claimed_sessions = {};
    next.used_words = { sv: [], en: [] };
  } else if (action === 'reset') {
    state = newState();
    return { ok: true, state };
  } else {
    return { ok: false, error: `Unknown action: ${action || '(missing)'}` };
  }

  state = stamp(next);
  return { ok: true, state: withTimer(state) };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

async function serveFile(urlPath, res) {
  const cleanPath = urlPath === '/' ? '/index.html' : decodeURIComponent(urlPath);
  const fullPath = normalize(join(root, cleanPath));
  if (relative(root, fullPath).startsWith('..')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    let body = await readFile(fullPath);
    if (cleanPath === '/index.html') {
      body = Buffer.from(
        body.toString('utf8')
          .replace(/<script src="https:\/\/unpkg\.com\/@supabase\/supabase-js@2"><\/script>\n?/, '')
          .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/[^"]*supabase-js@2"><\/script>\n?/, '')
      );
    }
    res.writeHead(200, {
      'content-type': types[extname(fullPath)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/state') {
    sendJson(res, withTimer(state));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/action') {
    sendJson(res, handleAction(await readBody(req)));
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    await serveFile(url.pathname, res);
    return;
  }

  res.writeHead(405, { allow: 'GET, HEAD, POST' });
  res.end('Method not allowed');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Local test server: http://127.0.0.1:${port}/`);
  console.log('Supabase is disabled in this served copy; room state is in memory.');
  console.log('Stop with Ctrl-C when the check is done.');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

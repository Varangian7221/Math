#!/usr/bin/env node
/* ==========================================================================
   server.js — сервер лендинга + API админки
   --------------------------------------------------------------------------
   Без зависимостей: только встроенные модули Node. npm install не нужен.

   Запуск:
       node server.js
   или с настройками:
       ADMIN_PASSWORD=мойпароль PORT=3000 node server.js

   Что умеет:
     • раздаёт статику (index.html, css, js, images)
     • подставляет data/content.json прямо в HTML — без мигания и для SEO
     • GET  /api/content          — контент (публично, нужен странице)
     • PUT  /api/content          — сохранить контент (только админ)
     • POST /api/login            — вход по паролю
     • POST /api/logout           — выход
     • GET  /api/session          — проверка входа
     • POST /api/upload           — загрузка фото (только админ)
     • POST /api/reset            — сброс контента к исходному (только админ)
     • GET  /api/content.default  — исходный контент для «сброса полей»
   ========================================================================== */
'use strict';

const http = require('http');
const fs   = require('fs');
const fsp  = fs.promises;
const path = require('path');
const crypto = require('crypto');
const url  = require('url');

/* ---------- Настройки ---------- */
const ROOT        = __dirname;
const PORT        = parseInt(process.env.PORT || '3000', 10);
const HOST        = process.env.HOST || '0.0.0.0';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const USING_DEFAULT_PW = !process.env.ADMIN_PASSWORD;
const SESSION_SECRET  = process.env.SESSION_SECRET ||
                        crypto.createHash('sha256').update('sid:' + ADMIN_PASSWORD).digest('hex');
const SESSION_TTL_MS  = 1000 * 60 * 60 * 12;   // 12 часов
const MAX_BODY    = 1024 * 1024;                 // 1 МБ для JSON
const MAX_UPLOAD  = 12 * 1024 * 1024;            // 12 МБ для картинки
const COOKIE_NAME = 'm_admin';

const CONTENT_FILE = path.join(ROOT, 'data', 'content.json');
const BACKUP_FILE  = path.join(ROOT, 'data', 'content.default.json');
const UPLOAD_DIR   = path.join(ROOT, 'images', 'uploads');

/* ---------- Типы файлов ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.txt':  'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

const ALLOWED_IMG = { 'image/webp': '.webp', 'image/png': '.png', 'image/jpeg': '.jpg' };

/* ---------- Утилиты ---------- */
function send(res, code, body, headers) {
  const h = Object.assign({
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN'
  }, headers || {});
  res.writeHead(code, h);
  res.end(body);
}

function sendJson(res, code, obj) {
  send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('too-large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  raw.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function hmac(data) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
}

function makeSession() {
  const payload = String(Date.now() + SESSION_TTL_MS);
  return payload + '.' + hmac(payload);
}

function sessionValid(req) {
  const raw = parseCookies(req)[COOKIE_NAME];
  if (!raw) return false;
  const i = raw.lastIndexOf('.');
  if (i < 1) return false;
  const payload = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  if (hmac(payload) !== sig) return false;
  return Number(payload) > Date.now();
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function readContent() {
  return JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
}

async function writeContent(obj) {
  obj.updatedAt = new Date().toISOString();
  const tmp = CONTENT_FILE + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  await fsp.rename(tmp, CONTENT_FILE);
}

/* Безопасное имя файла: только латиница, цифры, дефис */
function safeName(input, fallback) {
  const map = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y',
    'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
    'х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
  };
  const translit = String(input || '').toLowerCase()
    .replace(/[а-яё]/g, ch => map[ch] || '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return translit || fallback;
}

/* Подстановка контента прямо в HTML: SEO получает готовый текст,
   а браузер не показывает «мигание» старой версии. */
function injectContent(html) {
  let json;
  try { json = readContent(); }
  catch (e) {
    console.error('[warn] не удалось прочитать data/content.json:', e.message);
    return html;
  }
  // </ и спецсимволы, которые ломают <script>
  const safe = JSON.stringify(json)
    .replace(/<\//g, '<\\/')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  const block =
    '<script>window.__CONTENT__ = ' + safe + ';</script>\n' +
    '<script src="js/content.js"></script>';

  return html.includes('<!--#CONTENT#-->')
    ? html.replace('<!--#CONTENT#-->', block)
    : html;
}

/* ---------- Ограничение попыток входа ---------- */
const attempts = new Map();   // ip -> { count, until }
const MAX_TRIES = 5;
const LOCK_MS   = 10 * 60 * 1000;

function loginBlocked(ip) {
  const a = attempts.get(ip);
  if (!a) return 0;
  if (a.until && a.until > Date.now()) return Math.ceil((a.until - Date.now()) / 1000);
  return 0;
}
function noteFail(ip) {
  const a = attempts.get(ip) || { count: 0, until: 0 };
  a.count++;
  if (a.count >= MAX_TRIES) a.until = Date.now() + LOCK_MS;
  attempts.set(ip, a);
}
function clearFails(ip) { attempts.delete(ip); }

/* ---------- Статика ---------- */
async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  const full = path.normalize(path.join(ROOT, rel));

  // Защита от выхода за пределы папки
  if (!full.startsWith(ROOT)) return send(res, 403, 'Forbidden');

  let stat;
  try { stat = await fsp.stat(full); }
  catch { return send(res, 404, 'Не найдено: ' + rel); }

  if (stat.isDirectory()) return send(res, 403, 'Forbidden');

  const ext = path.extname(full).toLowerCase();
  const isHtml = ext === '.html';

  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Last-Modified': stat.mtime.toUTCString(),
    'Cache-Control': isHtml || ext === '.json' ? 'no-cache' : 'public, max-age=3600'
  };

  if (req.method === 'HEAD') { res.writeHead(200, headers); return res.end(); }

  if (isHtml) {
    let html = await fsp.readFile(full, 'utf8');
    if (rel === '/index.html' || rel === '/admin-node.html') html = injectContent(html);
    res.writeHead(200, headers);
    return res.end(html);
  }

  res.writeHead(200, headers);
  fs.createReadStream(full).pipe(res);
}

/* ---------- Роуты API ---------- */
async function handleApi(req, res, pathname) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
             req.socket.remoteAddress || 'unknown';

  /* --- Проверка входа --- */
  if (sessionValid(req)) { /* ok */ }
  else if (pathname !== '/api/login' && pathname !== '/api/session' && pathname !== '/api/content' && pathname !== '/api/content.default') {
    return sendJson(res, 401, { error: 'Требуется вход' });
  }

  /* --- GET /api/session --- */
  if (pathname === '/api/session' && req.method === 'GET') {
    return sendJson(res, 200, {
      auth: sessionValid(req),
      defaultPassword: USING_DEFAULT_PW,
      contentPath: 'data/content.json'
    });
  }

  /* --- POST /api/login --- */
  if (pathname === '/api/login' && req.method === 'POST') {
    const wait = loginBlocked(ip);
    if (wait) return sendJson(res, 429, { error: 'Слишком много попыток. Подождите ' + Math.ceil(wait / 60) + ' мин.' });

    let body;
    try { body = JSON.parse((await readBody(req, 4096)).toString('utf8')); }
    catch { return sendJson(res, 400, { error: 'Некорректный запрос' }); }

    if (!body.password || !timingSafeEqual(body.password, ADMIN_PASSWORD)) {
      noteFail(ip);
      return sendJson(res, 401, { error: 'Неверный пароль' });
    }

    clearFails(ip);
    res.setHeader('Set-Cookie',
      COOKIE_NAME + '=' + makeSession() +
      '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + (SESSION_TTL_MS / 1000));
    return sendJson(res, 200, { ok: true, defaultPassword: USING_DEFAULT_PW });
  }

  /* --- POST /api/logout --- */
  if (pathname === '/api/logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', COOKIE_NAME + '=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return sendJson(res, 200, { ok: true });
  }

  /* --- GET /api/content --- */
  if (pathname === '/api/content' && req.method === 'GET') {
    try { return sendJson(res, 200, readContent()); }
    catch (e) { return sendJson(res, 500, { error: e.message }); }
  }

  /* --- GET /api/content.default --- */
  if (pathname === '/api/content.default' && req.method === 'GET') {
    try { return sendJson(res, 200, JSON.parse(await fsp.readFile(BACKUP_FILE, 'utf8'))); }
    catch { return sendJson(res, 404, { error: 'Нет файла data/content.default.json' }); }
  }

  /* --- PUT /api/content --- */
  if (pathname === '/api/content' && req.method === 'PUT') {
    let obj;
    try { obj = JSON.parse((await readBody(req, MAX_BODY)).toString('utf8')); }
    catch (e) { return sendJson(res, e.message === 'too-large' ? 413 : 400, { error: 'Файл слишком большой или повреждён' }); }

    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return sendJson(res, 400, { error: 'Ожидался объект JSON' });
    }
    // Мягкая проверка структуры
    if (!obj.hero || !obj.prices || !obj.faq) {
      return sendJson(res, 400, { error: 'В объекте отсутствуют обязательные разделы (hero, prices, faq)' });
    }

    // Картинки: запрещаем выход за пределы папки images
    for (const key of ['hero', 'about']) {
      const v = obj.images && obj.images[key];
      if (typeof v === 'string' && v && !/^images\/[A-Za-z0-9._\/-]+$/.test(v)) {
        return sendJson(res, 400, { error: 'Недопустимый путь к изображению: ' + v });
      }
    }

    try {
      await writeContent(obj);
      return sendJson(res, 200, { ok: true, updatedAt: obj.updatedAt });
    } catch (e) {
      return sendJson(res, 500, { error: 'Не удалось сохранить: ' + e.message });
    }
  }

  /* --- POST /api/upload --- */
  if (pathname === '/api/upload' && req.method === 'POST') {
    const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const ext = ALLOWED_IMG[type];
    if (!ext) {
      return sendJson(res, 415, { error: 'Поддерживаются только WebP, PNG и JPEG' });
    }

    let buf;
    try { buf = await readBody(req, MAX_UPLOAD); }
    catch (e) { return sendJson(res, 413, { error: 'Файл больше 12 МБ' }); }

    if (!buf.length) return sendJson(res, 400, { error: 'Пустой файл' });

    // Сверяем сигнатуру: расширение не должно обманывать сервер
    const sig = {
      '.webp': b => b.length > 12 && b.slice(0,4).toString('latin1') === 'RIFF' && b.slice(8,12).toString('latin1') === 'WEBP',
      '.png':  b => b.slice(1,4).toString('latin1') === 'PNG',
      '.jpg':  b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF
    }[ext];
    if (!sig(buf)) return sendJson(res, 415, { error: 'Содержимое файла не соответствует формату' });

    const slot = (req.headers['x-slot'] || 'image').toString().toLowerCase().replace(/[^a-z]/g, '');
    const base = safeName(req.headers['x-name'] || '', slot || 'image');
    const stamp = Date.now().toString(36);
    const file = base + '-' + stamp + ext;

    await fsp.mkdir(UPLOAD_DIR, { recursive: true });
    await fsp.writeFile(path.join(UPLOAD_DIR, file), buf);

    return sendJson(res, 200, { ok: true, url: 'images/uploads/' + file, bytes: buf.length });
  }

  /* --- POST /api/reset --- */
  if (pathname === '/api/reset' && req.method === 'POST') {
    try {
      const def = JSON.parse(await fsp.readFile(BACKUP_FILE, 'utf8'));
      await writeContent(def);
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 500, { error: 'Не удалось сбросить: ' + e.message });
    }
  }

  return sendJson(res, 404, { error: 'Неизвестный метод API' });
}

/* ---------- Сервер ---------- */
const server = http.createServer(async (req, res) => {
  let pathname;
  try { pathname = url.parse(req.url).pathname; }
  catch { return send(res, 400, 'Bad request'); }

  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST' && req.method !== 'PUT') {
    return send(res, 405, 'Method not allowed');
  }

  if (pathname.startsWith('/api/')) {
    try { return await handleApi(req, res, pathname); }
    catch (e) {
      console.error('[api]', e);
      return sendJson(res, 500, { error: 'Внутренняя ошибка сервера' });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method not allowed');
  }

  try { return await serveStatic(req, res, pathname); }
  catch (e) {
    console.error('[static]', e);
    return send(res, 500, 'Ошибка сервера');
  }
});

/* Отдаём файл целиком: клиент сможет скачать его как запасную копию */
server.on('request', (req, res) => {
  res.setHeader('Cache-Control', res.getHeader('Cache-Control') || 'no-cache');
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Лендинг преподавателя математики');
  console.log('  ─────────────────────────────────────────────');
  console.log('  Сайт:     http://localhost:' + PORT + '/');
  console.log('  Админка:  http://localhost:' + PORT + '/admin-node.html');
  console.log('');

  if (USING_DEFAULT_PW) {
    console.log('  ⚠️  ВНИМАНИЕ: задан пароль по умолчанию — "admin"');
    console.log('      Перед публикацией задайте свой:');
    console.log('        ADMIN_PASSWORD=ваш_пароль node server.js');
    console.log('');
  }

  if (!fs.existsSync(BACKUP_FILE)) {
    try { fs.copyFileSync(CONTENT_FILE, BACKUP_FILE); console.log('  Создана резервная копия контента: data/content.default.json\n'); }
    catch (e) { console.log('  [!] Не удалось создать резервную копию:', e.message); }
  }
});

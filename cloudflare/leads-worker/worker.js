/**
 * leads-worker — приём заявок с лендинга в D1 + уведомление в Telegram
 * ============================================================================
 *
 * ЗАЧЕМ
 *
 * Статический сайт не умеет принимать данные: POST некуда. Раньше заявка
 * уходила в Telegram одним тапом — её доходил только сам посетитель.
 *
 * Здесь появляется настоящий endpoint: браузер шлёт POST, Worker кладёт
 * запись в D1 (SQLite в облаке Cloudflare) и отправляет вам уведомление.
 *
 * Почему не «просто вписать токен бота в js/config.js»: этот файл публичный,
 * токен виден в DevTools, и по нему можно писать от вашего имени.
 * Здесь токен лежит в секрете Worker и в браузер не попадает.
 *
 * ============================================================================
 * РАЗВЁРТЫВАНИЕ
 *
 * 1. Создать базу:
 *      Dashboard → D1 SQL Database → Create Database → открыть базу →
 *      вкладка Console → вставить schema.sql из этой папки → Execute
 *
 * 2. Задеплоить Worker:
 *      Dashboard → Workers & Pages → Create → Worker → имя math-leads →
 *      Deploy → Edit code (</>) → вставить этот файл → Save and deploy
 *      затем привязать базу: Settings → Bindings → Add → D1 database
 *      переменная: DB
 *
 * 3. Задать секреты (Variables and Secrets → Add, тип Secret):
 *      TELEGRAM_BOT_TOKEN  — токен от @BotFather
 *      TELEGRAM_CHAT_ID    — ваш chat.id
 *      LEADS_TOKEN         — длинная случайная строка для выгрузки CSV
 *      ALLOWED_ORIGIN      — https://math-tutor.varangian7221.workers.dev
 *
 * 4. Вписать адрес Worker в js/config.js:
 *      leadsEndpoint: 'https://<имя-worker>.<поддомен>.workers.dev/api/lead'
 *
 * ============================================================================
 * ЗАЩИТА ОТ СПАМА
 *
 *   • honeypot — скрытое поле, бот его заполнит, человек нет
 *   • лимит по IP — не больше RATE_LIMIT заявок за RATE_WINDOW минут
 *   • проверка Origin — отсекает чужие СТРАНИЦЫ в браузере
 *
 * Про Origin честно: это слабая проверка, а не защита. Любой скрипт (curl,
 * python) просто не пришлёт заголовок Origin — и пройдёт. Реальную защиту от
 * мусора дают первые два пункта; Origin нужен лишь для того, чтобы случайный
 * вредоносный скрипт не слал заявки с вашего домена из чужой вкладки.
 *
 * Этого достаточно, чтобы форму не засыпали мусором. Если прилетит больше —
 * добавьте капчу, но на 300–400 заявок в месяц обычно не нужно.
 * ============================================================================
 */

/* ---- Настройки (переопределяются секретами) ---- */
const RATE_LIMIT = 5;      // заявок с одного IP за окно
const RATE_WINDOW = 600;   // окно в секундах (10 минут)
const MAX_LEN = { name: 120, phone: 40, grade: 40, goal: 120, page: 500 };

/* Заголовки, которые не проксируем (Workers запрещает задавать) */
const DROP = new Set([
  "host", "connection", "content-length", "transfer-encoding", "keep-alive",
  "upgrade", "te", "trailer", "proxy-authenticate", "proxy-authorization",
  "expect", "cookie", "origin", "referer", "user-agent", "accept-encoding"
]);

const KEEP = [
  "content-type", "etag", "link", "last-modified",
  "x-github-media-type", "x-ratelimit-limit", "x-ratelimit-remaining",
  "x-ratelimit-reset", "x-ratelimit-used", "x-ratelimit-resource"
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": KEEP.join(", ") + ", Location",
  "Cache-Control": "no-store"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      const requested = request.headers.get("Access-Control-Request-Headers");
      return new Response(null, {
        status: 204,
        headers: Object.assign({}, CORS_HEADERS, {
          "Access-Control-Allow-Headers":
            requested || "Authorization, Content-Type, If-None-Match, If-Match",
          "Access-Control-Max-Age": "86400"
        })
      });
    }

    const incoming = new URL(request.url);
    const path = incoming.pathname.replace(/\/+$/, "") || "/";

    // /api/leads.csv — выгрузка заявок, закрыта секретом
    if (path === "/api/leads.csv") return exportCsv(request, incoming, env);

    // /api/lead — приём заявки
    if (path === "/api/lead") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Метод не поддерживается" }, 405);
      }
      return receiveLead(request, env);
    }

    // / — проверка «жив ли» воркер
    if (path === "/") return json({ ok: true, service: "leads-worker" });

    return json({ ok: false, error: "Не найдено" }, 404);
  }
};

/* ---------------------------------------------------------------- helpers */

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, CORS_HEADERS)
  });
}

/** Только цифры — для телефона */
function digits(s) { return String(s || "").replace(/\D/g, ""); }

/** Обрезать и убрать управляющие символы, чтобы в CSV не попал \r */
function clean(s, max) {
  return String(s == null ? "" : s)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

function getIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

/* ------------------------------------------------------------- приём заявки */

async function receiveLead(request, env) {
  // 1. Запрос должен прийти с нашего домена
  const origin = request.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGIN || "";
  if (allowed && origin && origin !== allowed) {
    return json({ ok: false, error: "Источник не разрешён" }, 403);
  }

  // 2. Тело
  let raw;
  try {
    raw = await request.text();
  } catch (_) {
    return json({ ok: false, error: "Не удалось прочитать запрос" }, 400);
  }
  if (!raw || raw.length > 8000) {
    return json({ ok: false, error: "Пустой или слишком большой запрос" }, 400);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    return json({ ok: false, error: "Некорректный JSON" }, 400);
  }
  if (!data || typeof data !== "object") {
    return json({ ok: false, error: "Некорректные данные" }, 400);
  }

  // 3. Honeypot: поле скрыто от людей, но заполняется ботами.
  //    Отвечаем «успехом», чтобы бот не подбирал другие правила обхода.
  if (clean(data.website, 50)) {
    return json({ ok: true, skipped: true });
  }

  // 4. Валидация
  const name = clean(data.name, MAX_LEN.name);
  const phone = clean(data.phone, MAX_LEN.phone);
  const grade = clean(data.grade, MAX_LEN.grade);
  const goal = clean(data.goal, MAX_LEN.goal);
  const page = clean(data.page, MAX_LEN.page);

  if (name.length < 2) return json({ ok: false, error: "Укажите имя" }, 400);
  if (digits(phone).length !== 11) return json({ ok: false, error: "Укажите телефон полностью" }, 400);

  const ip = getIp(request);

  // 5. Лимит по IP
  if (env.DB) {
    const since = new Date(Date.now() - RATE_WINDOW * 1000).toISOString();
    let count = 0;
    try {
      const row = await env.DB
        .prepare("SELECT COUNT(*) AS n FROM leads WHERE ip = ? AND created_at > ?")
        .bind(ip, since)
        .first();
      count = (row && row.n) || 0;
    } catch (err) {
      // Не роняем форму из-за сбоя счётчика — запись всё равно попадёт в базу
      console.warn("rate limit check failed", err && err.message);
    }
    if (count >= RATE_LIMIT) {
      return json({ ok: false, error: "Слишком много заявок подряд. Попробуйте позже." }, 429);
    }
  }

  // 6. Запись в базу
  if (!env.DB) {
    return json({ ok: false, error: "База не подключена (переменная DB)" }, 500);
  }

  let info;
  try {
    info = await env.DB
      .prepare(
        "INSERT INTO leads (name, phone, grade, goal, page, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(name, phone, grade, goal, page, ip, clean(request.headers.get("User-Agent"), 200))
      .run();
  } catch (err) {
    console.error("insert failed", err && err.message);
    return json({ ok: false, error: "Не удалось сохранить заявку" }, 500);
  }

  // 7. Уведомление в Telegram. Ошибка сюда не пробрасывается: заявка уже
  //    в базе, и показывать посетителю ошибку было бы неверно.
  notify(env, { name, phone, grade, goal, page, id: info && info.meta && info.meta.last_row_id });

  return json({ ok: true, id: info && info.meta ? info.meta.last_row_id : null });
}

async function notify(env, lead) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;

  const text = [
    "Новая заявка с сайта",
    "",
    "Имя: " + lead.name,
    "Телефон: " + lead.phone,
    "Класс: " + (lead.grade || "—"),
    "Цель: " + (lead.goal || "—"),
    "",
    "Страница: " + (lead.page || "—")
  ].join("\n");

  try {
    // Без parse_mode: спецсимволы в имени не ломают запрос
    const r = await fetch(
      "https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text })
      }
    );
    if (!r.ok) console.warn("telegram notify failed", r.status, (await r.text()).slice(0, 200));
  } catch (err) {
    console.warn("telegram notify error", err && err.message);
  }
}

/* ----------------------------------------------------------- выгрузка CSV */

async function exportCsv(request, incoming, env) {
  const expected = env.LEADS_TOKEN || "";
  const given = request.headers.get("Authorization") || incoming.searchParams.get("key") || "";
  const token = given.replace(/^Bearer\s+/i, "");

  if (!expected || token !== expected) {
    return json({ ok: false, error: "Нет доступа" }, 401);
  }
  if (!env.DB) return json({ ok: false, error: "База не подключена" }, 500);

  let rows;
  try {
    rows = await env.DB.prepare("SELECT * FROM leads ORDER BY id DESC LIMIT 5000").all();
  } catch (err) {
    console.error("select failed", err && err.message);
    return json({ ok: false, error: "Не удалось прочитать базу" }, 500);
  }

  const head = ["id", "created_at", "name", "phone", "grade", "goal", "page", "status", "ip"];
  const lines = [head.join(";")];

  for (const r of rows.results || []) {
    lines.push(head.map(function (k) { return csvCell(r[k]); }).join(";"));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  // \uFEFF — BOM. Без него Excel откроет кириллицу как кракозябры.
  return new Response("\uFEFF" + lines.join("\r\n"), {
    headers: Object.assign({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leads-' + stamp + '.csv"'
    }, CORS_HEADERS)
  });
}

function csvCell(value) {
  const s = String(value == null ? "" : value);
  // Разделитель «;» и переносы строк обязательно экранируем в кавычках
  if (/[";\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * api-proxy — CORS-прокси для api.github.com
 * ============================================================================
 *
 * ЗАЧЕМ НУЖЕН
 *
 * Decap CMS с бэкендом `github` после получения OAuth-токена ходит из браузера
 * напрямую в api.github.com:
 *
 *     GET https://api.github.com/user                 ← currentUser()
 *     GET https://api.github.com/repos/:owner/:repo   ← hasWriteAccess()
 *
 * base_url в конфиге покрывает ТОЛЬКО OAuth-редирект и эти запросы не спасает.
 *
 * Эти запросы уходят с заголовками
 *     Authorization: token ...
 *     Content-Type: application/json; charset=utf-8
 * то есть являются «непростыми» — браузер сначала обязан отправить
 * CORS-preflight (OPTIONS). Если на сетевом пути до api.github.com ответы
 * OPTIONS зависают или отбрасываются, запрос не уходит вообще, и через 60 секунд
 * срабатывает таймаут Decap:
 *     auth.js  Error: Request timed out after 60 seconds
 *
 * Проверить вкладкой api.github.com/user нельзя: без своих заголовков это
 * простой запрос, preflight для него не нужен — тест получается «зелёным»
 * независимо от проблемы.
 *
 * ЧТО ДЕЛАЕТ ЭТОТ WORKER
 *
 *   1. На OPTIONS отвечает сам, мгновенно, не дожидаясь GitHub.
 *   2. Остальные методы проксирует на api.github.com с сохранением пути,
 *      query, тела и заголовка Authorization.
 *   3. Сохраняет ETag и прочие заголовки, на которые смотрит Decap.
 *
 * Браузер общается только с этим Worker'ом; leg Worker → GitHub идёт с серверов
 * Cloudflare и от локальной сети посетителя не зависит вообще.
 *
 * ============================================================================
 * РАЗВЁРТЫВАНИЕ
 *
 *   1. Cloudflare Dashboard → Workers & Pages → Create → Worker
 *   2. Имя, например  math-api-proxy
 *   3. Edit code → вставить этот файл целиком → Deploy
 *   4. В admin/config.yml в блок backend добавить:
 *
 *        api_root: https://math-api-proxy.<ваш-поддомен>.workers.dev
 *
 *      Без завершающего слэша — Decap склеивает его как api_root + "/user".
 *
 * Токен при этом НЕ хранится в Worker: Authorization отправляет браузер,
 * Worker просто пересылает заголовок. Сам Worker можно сделать публичным,
 * секретов в нём нет.
 * ============================================================================
 */

const UPSTREAM = "https://api.github.com";

/**
 * Сквозные и служебные заголовки. Их нельзя пересылать: либо относятся к
 * транспорту между браузером и Worker, либо Workers запрещает их задавать.
 */
const DROP = new Set([
  "host", "connection", "content-length", "transfer-encoding", "keep-alive",
  "upgrade", "te", "trailer", "proxy-authenticate", "proxy-authorization",
  "expect", "cookie", "origin", "referer", "user-agent", "accept-encoding",
  "cf-connecting-ip", "cf-ray", "cf-visitor", "cf-worker",
  "x-forwarded-pro", "x-forwarded-host", "x-real-ip"
]);

/** Заголовки GitHub, которые важно вернуть клиенту без изменений. */
const KEEP = [
  "content-type", "etag", "link", "last-modified",
  "x-github-media-type", "x-ratelimit-limit", "x-ratelimit-remaining",
  "x-ratelimit-reset", "x-ratelimit-used", "x-ratelimit-resource"
];

const CORS_HEADERS = {
  // Decap не шлёт куки (cross-origin fetch без credentials), поэтому "*" корректен.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": KEEP.join(", ") + ", Location",
  "Cache-Control": "no-store"
};

export default {
  async fetch(request) {
    // --- 1. Preflight отвечаем сами: никакой зависимости от пути до GitHub ---
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

    // --- 2. Собираем запрос к GitHub ---
    const incoming = new URL(request.url);
    const target = UPSTREAM + incoming.pathname + incoming.search;

    const headers = new Headers();
    for (const [key, value] of request.headers) {
      if (!DROP.has(key.toLowerCase())) headers.set(key, value);
    }

    const hasBody = request.method !== "GET" && request.method !== "HEAD";

    let upstream;
    try {
      upstream = await fetch(target, {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          message: "GitHub API unreachable from the Worker",
          detail: String(err && err.message || err)
        }),
        {
          status: 502,
          headers: Object.assign({ "Content-Type": "application/json" }, CORS_HEADERS)
        }
      );
    }

    // --- 3. Отдаём ответ, сохраняя то, на что смотрит Decap ---
    const out = new Headers(CORS_HEADERS);
    for (const key of KEEP) {
      const value = upstream.headers.get(key);
      if (value !== null) out.set(key, value);
    }

    // У 304 тела нет — отдавать пустое, иначе ломается парсер.
    const body = upstream.status === 304 || upstream.status === 204
      ? null
      : upstream.body;

    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: out
    });
  }
};
# Вход в админку зависает на 60 секунд

Симптом: после нажатия «Войти с GitHub» страница крутится минуту и в консоли

```
auth.js:75 Error: Request timed out after 60 seconds
    at unsentRequest.js:26:13
    at async implementation.js:128:15
    at async cF.authenticate (implementation.js:267:11)
```

При этом правки сохранялись и раньше — то есть дело не в настройках сайта.

## Почему проверка вкладкой ничего не показывает

Откройте `https://api.github.com/user` в браузере — получите мгновенный ответ
`401 {"message": "Requires authentication"}`. Кажется, что GitHub доступен и всё
в порядке. **Это ложный вывод.**

Дело в том, какими заголовками уходит запрос. Decap отправляет:

```js
requestHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    Authorization: `token ${this.token}`
  }
}
```

Запрос с `Authorization` и `Content-Type` — «непростой», поэтому браузер перед ним
обязан отправить **CORS-preflight** (`OPTIONS` на `api.github.com`). Если на пути
до api.github.com ответы `OPTIONS` зависают или отбрасываются, основной запрос
вообще не уходит, и через 60 секунд срабатывает таймаут самого Decap:

```js
const controller = new AbortController;
const timer = setTimeout(() => controller.abort(), 6e4);   // ровно 60 секунд
```

Открытая вкладка делает простой запрос без своих заголовков — preflight для него
не нужен. Поэтому тест проходит, а CMS всё равно зависает.

Что именно ломается на сетевом пути, без доступа к вашей сети не определить:
провайдерский DPI, антивирус или расширение браузера, корпоративный прокси,
забытый VPN. Но лечится это одним и тем же способом при любой из причин.

## Где именно ходит Decap

Распакованный `decap-cms@3.16.3`, функция `authenticate`:

```js
this.apiRoot = e.backend.api_root || "https://api.github.com";
...
const n = await this.api.user();           // GET /user
if (!await this.api.hasWriteAccess())      // GET /repos/:owner/:repo
```

`base_url` отвечает **только** за OAuth-редирект — эти два запроса он не
затрагивает. `use_graphql` в конфиге не включён, речь о REST.

## Решение

Свой Worker перед `api.github.com`. Браузер общается только с Worker'ом, а
участок Worker → GitHub идёт с серверов Cloudflare и от локальной сети не зависит.

Файл готов: [`cloudflare/api-proxy/worker.js`](../cloudflare/api-proxy/worker.js)

### 1. Задеплойте Worker

1. Cloudflare Dashboard → **Workers & Pages** → Create → Worker
2. Имя, например `math-api-proxy`
3. **Edit code** → вставить файл целиком → **Deploy**

### 2. Пропишите адрес в конфиге

В `admin/config.yml`, блок `backend`:

```yaml
  api_root: https://math-api-proxy.<ваш-поддомен>.workers.dev
```

Ключ называется именно `api_root`. Ключа `api_base_url` в Decap 3.16.3 не
существует. Завершающий слэш не нужен — Decap склеивает `api_root + "/user"`.

### 3. Перезагрузите админку

Выйдите из аккаунта (Decap → «Выйти»), потом войдите заново.

## Что уже проверено

Worker прогнан как обычный модуль в браузере:

| Проверка | Результат |
|---|---|
| `OPTIONS /user` (preflight) | `204`, `Allow-Origin: *`, заголовки из запроса |
| `GET /user` с токеном | `401` пробрасывается дословно |
| `GET /repos/Varangian7221/Math` | `200`, тело и **ETag** на месте |
| `If-None-Match` → условный запрос | `304`, тело пустое, ETag сохранён |

Пустое тело у `304` обязательно: при ответе с телом `parseResponse` Decap
упадёт при разборе JSON.

## Безопасность

Worker можно сделать публичным: секретов в нём нет, `Authorization` приходит
от браузера и просто пересылается. Токен на стороне Cloudflare не хранится.
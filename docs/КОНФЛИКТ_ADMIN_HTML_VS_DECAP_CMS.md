# Актуальная архитектура: почему в админке было две разных панели

Короткая памятка, чтобы эта ошибка не повторилась.

---

## Два разных админских интерфейса

| | Node-админка | Decap CMS |
|---|---|---|
| Файл | `admin-node.html` (в корне) | папка `admin/` → `index.html` + `config.yml` |
| Адрес на Netlify | `/admin-node.html` | `/admin/` |
| Адрес на Node-хостинге | `/admin-node.html` | не работает (нет сервера) |
| Авторизация | пароль (`ADMIN_PASSWORD`), API `/api/*` | GitHub OAuth через `api.netlify.com` |
| Хранит | `data/content.json` + `images/` | `data/content.json` + `images/uploads/` |
| Зависимости | `server.js` (только Node) | CDN `unpkg.com/decap-cms` |

Обе редактируют один и тот же `data/content.json` — конфликта данных нет.

---

## Правило именования

**`admin.html` — запрещённое имя.**

Netlify (и другие статические хостинги с «Pretty URLs») разрешают `/admin/`
сначала как корень `admin.html`, и только потом как папку `admin/index.html`.
Проверено: при наличии обоих `/admin/` отдавал корень `admin.html`.

Симптомы, которые это даёт:

- в консоли `api/session:1 404` — это запрос из `js/admin.js` (Node-админка)
- форма входа с одним полем `Password` вместо кнопки «Войти через GitHub»
- ошибки `/api/content`, `/api/upload` — их на статике нет по определению

Имя `admin-node.html` коллизий не создаёт: адрес `/admin-node.html` уникален.

---

## Что указывать в ссылках

| Хостинг | Правильная ссылка |
|---|---|
| Netlify | `https://<домен>/admin/` |
| Node (Render/Railway/VPS) | `https://<домен>/admin-node.html` |

---

## Как убедиться, что всё правильно

Откройте `/admin/` и нажмите `F12` → Console.

- Есть `decap-cms 3.x` в логах → грузится Decap, всё верно
- Есть `api/session 404` → снова открылся `admin.html`, вернитесь к этому документу

# Развёртывание лендинга на Cloudflare Pages

Пошаговая инструкция. Проверено по документации Cloudflare и Decap CMS (октябрь 2026).

---

## Зачем это нужно

Cloudflare Pages даёт **безлимитный трафик для статики** (в отличие от Netlify,
где Free-план ограничен 300 кредитами ≈ 20 деплоев в месяц).

Но у Decap CMS на Cloudflare есть особенность: **вход через GitHub требует
отдельного OAuth-прокси**. Netlify даёт его из коробки, Cloudflare — нет.
Прокси — это маленький Cloudflare Worker, который бесплатно разворачивается
за 10 минут.

---

## Что будет на выходе

| Что | Адрес |
|---|---|
| Сайт | `https://<проект>.pages.dev` |
| Админка | `https://<проект>.pages.dev/admin/` |
| OAuth-прокси | `https://decap-proxy.<ваш-аккаунт>.workers.dev` |

---

## Часть 1. Аккаунт Cloudflare и проект Pages

### 1.1. Регистрация

1. Откройте https://dash.cloudflare.com/sign-up
2. Создайте аккаунт (бесплатно, карта не нужна)
3. При входе Cloudflare спросит **зону** (домен). Если домена нет — пропустите,
   нажмите «Skip» / выберите «Not now». Pages работает и без своей зоны

### 1.2. Создание проекта

1. `dash.cloudflare.com` → **Workers & Pages** → **Create application**
2. Вкладка **Connect to Git**
3. Выберите **GitHub** → авторизуйтесь
4. Выберите репозиторий **`Varangian7221/Math`** (он публичный)
5. **Install & Authorize** → **Begin setup**

### 1.3. Настройки сборки

Важно — проект без сборщика, поэтому:

| Поле | Значение |
|---|---|
| Project name | `math-tutor` (или любой) |
| Production branch | `main` |
| **Framework preset** | **None** |
| **Build command** | **оставьте пустым** |
| **Build output directory** | `/` |
| Root directory | `/` (по умолчанию) |

> ⚠️ Не ставьте `npm run build` — его в проекте нет. Сборка не нужна, всё уже
> готово. Если поле Build command заполнить, деплой упадёт.

### 1.4. Первый деплой

Нажмите **Save and Deploy**. Через минуту сайт откроется на
`https://math-tutor.pages.dev`.

Проверьте:
- главная страница открылась
- `https://math-tutor.pages.dev/admin/` открылась (пока без входа — это нормально)

---

## Часть 2. OAuth-прокси (нужен для входа в админку)

### Зачем

Decap CMS при нажатии «Войти через GitHub» открывает всплывающее окно на
`base_url/auth`. Если `base_url` не задан, Decap идёт на
`https://api.netlify.com/auth` — а **этот адрес больше не работает (404)**.
Проверено напрямую.

Поэтому поднимаем собственный прокси.

### 2.1. GitHub OAuth-приложение

Откройте https://github.com/settings/applications/new

| Поле | Значение |
|---|---|
| Application name | `Math CMS Proxy` |
| Homepage URL | `https://decap-proxy.<ваш-аккаунт>.workers.dev` |
| Application callback URL | `https://decap-proxy.<ваш-аккаунт>.workers.dev/callback` |
| Application description | `Прокси авторизации Decap CMS` |

> **Callback URL — ключевое поле.** Он должен заканчиваться на `/callback`.
> Подставьте реальный URL воркера из шага 2.5 — Cloudflare выдаёт его сразу
> после первого деплоя. Если адрес ещё не известен, создайте приложение с
> временным значением и вернётесь, чтобы исправить.

**Generate a new client secret** → сохраните **Client ID** и **Client secret**.

### 2.2. Скачать шаблон прокси

Официальный шаблон от сообщества Decap, который рекомендует сама документация:
https://github.com/sterlingwes/decap-proxy

```bash
git clone https://github.com/sterlingwes/decap-proxy
cd decap-proxy
```

### 2.3. Настроить `wrangler.toml`

Скопируйте `wrangler.toml.sample` в `wrangler.toml`.

Правьте только имя:

```toml
name = "decap-proxy"
```

Больше ничего менять **не нужно**:
- `workers_dev = true` — оставляем, чтобы прокси был доступен на `workers.dev`
- `GITHUB_REPO_PRIVATE` — **не трогайте**, репозиторий у вас публичный

Если хотите свой поддомен вместо `workers.dev`, раскомментируйте строку
`route` и подставьте свой домен:

```toml
route = { pattern = "decap.example.com", zone_name = "example.com", custom_domain = true }
```

> **Осторожно:** `workers.dev` включён у Cloudflare по умолчанию. Если его
> выключить, а кастомный домен не настроить — прокси станет недоступен.

### 2.4. Залогиниться в Cloudflare

```bash
npx wrangler login
```

Откроется браузер, подтвердите доступ.

### 2.5. Задать секреты

```bash
npx wrangler secret put GITHUB_OAUTH_ID
npx wrangler secret put GITHUB_OAUTH_SECRET
```

Команда спросит значение — вставьте Client ID и Client secret из шага 2.1.

### 2.6. Задеплоить прокси

```bash
npx wrangler deploy
```

В выводе будет строка вида:

```
https://decap-proxy.<ваш-аккаунт>.workers.dev
```

Откройте этот адрес в браузере. Если видите **«Hello 👋»** — прокси работает.

> Сохраните этот URL — он пойдёт в `config.yml`.

---

## Часть 3. Настроить Decap CMS

### 3.1. Поменять backend в `admin/config.yml`

Сейчас там `git-gateway` (для Netlify). Для Cloudflare нужен `github` +
ваш прокси.

Замените блок `backend` на:

```yaml
backend:
  name: github
  repo: Varangian7221/Math
  branch: main
  base_url: https://decap-proxy.<ваш-аккаунт>.workers.dev
  auth_endpoint: /auth
```

> `auth_endpoint: /auth` — обязательно. По умолчанию Decap подставляет
> другой путь, а прокси слушает именно `/auth`.

### 3.2. Запушить

```bash
git add admin/config.yml
git commit -m "feat: switch Decap backend to github via Cloudflare Worker proxy"
git push
```

Cloudflare Pages автоматически пересоберёт сайт.

### 3.3. Войти

Откройте `https://math-tutor.pages.dev/admin/`
(лучше в **инкогнито**, чтобы не мешал старый кэш).

Нажмите **«Войти через GitHub»** → откроется GitHub → **Authorize** →
Decap загрузит редактор.

---

## Часть 4. Свой домен

### 4.1. Подключить домен к Cloudflare

1. `dash.cloudflare.com` → **Workers & Pages** → ваш проект →
   **Custom domains** → **Set up a custom domain**
2. Введите ваш домен (например `math-smirnova.ru`)

Если домен ещё не на Cloudflare, сначала перенесите NS-записи —
Cloudflare покажет, какие именно.

### 4.2. Обновить SEO в `index.html`

В `<head>` замените старый домен на новый в трёх местах:

```html
<link rel="canonical" content="https://ваш-домен/">
<meta property="og:url" content="https://ваш-домен/">
```

И в `data/content.json` → `site.siteUrl`.

---

## Часть 5. Обновить ссылки в контенте

После смены хостинга в `data/content.json` проверьте поле `site.siteUrl` —
оно используется для микроразметки Schema.org.

---

## Часть 6. Отключить Netlify (по желанию)

Если Cloudflare заработал, Netlify можно остановить:
`app.netlify.com` → сайт `mathlastname` → **Site settings** →
**Unlink domain** или удалить проект.

Не забудьте поменять `canonical` и `og:url` (шаг 4.2) — иначе поисковики
будут считать два сайта дублями.

---

## Возможные проблемы

| Симптом | Причина и решение |
|---|---|
| `/admin/` показывает форму с полем `Password` | Открылся `admin-node.html`, а не Decap. Проверьте, что файл называется `admin-node.html`, а не `admin.html` |
| Всплывающее окно показывает `Not Found` | Прокси не развёрнут или `base_url` в `config.yml` указывает не на него. Проверьте: открывается ли `https://ваш-прокси/auth` |
| `Error: Repository not found` | Неверный `repo` в `config.yml`. Должно быть `Varangian7221/Math` |
| `You don't have sufficient permissions` | Вы вошли не тем GitHub-аккаунтом, который владеет репозиторием |
| `redirect_uri mismatch` | В GitHub callback URL не совпадает с `PROXY URL/callback`. Проверьте пробелы и слэш |
| Белая страница вместо админки | Не загрузился `https://unpkg.com/decap-cms@^3.3.3/dist/decap-cms.js`. Проверьте доступ к unpkg |
| Висяк на `Loading configuration...` | То же — CDN недоступен или очень медленный |

### Диагностика

`F12` → **Console**. Полезная строка при успешной загрузке:

```
info: decap-cms 3.16.3
```

Её нет → скрипт CMS не загрузился вообще.

---

## Откат

Если что-то пошло не так, ничего не потеряно: репозиторий на GitHub — источник
истины. Достаточно вернуть в `admin/config.yml` блок `git-gateway`, и сайт
снова заработает на Netlify.

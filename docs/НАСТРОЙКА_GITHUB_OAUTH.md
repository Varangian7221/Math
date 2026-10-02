# Настройка входа в админку (GitHub OAuth)

Актуальная инструкция. Админка: **https://mathlastname.netlify.app/admin/**

---

## Как это работает

```
вы  →  «Войти через GitHub»  →  api.netlify.com  →  GitHub  →  вы
                (посредник Netlify, держит секрет)
```

Правки сохраняются коммитом в `data/content.json`, Netlify сам пересобирает сайт.
**Netlify Identity не используется** — она давала неработающие формы
`Set your password` и `Forgot password`, поэтому заменена.

---

## Что уже настроено в репозитории

| Файл | Что сделано |
|---|---|
| `admin/index.html` | подключён Decap CMS, настройки берутся из `config.yml` |
| `admin/config.yml` | `backend: github` + `base_url: https://api.netlify.com`, все 11 блоков |
| `admin-node.html` | переименован из `admin.html` — см. раздел «Почему нельзя переименовывать обратно» |

---

## ⚠️ Почему нельзя переименовывать `admin-node.html` обратно в `admin.html`

Netlify применяет «Pretty URLs»: адрес `/admin/` разрешается в **корневой
`admin.html`**, и этот файл имеет приоритет над папкой `admin/`.

Последствие: по адресу `/admin/` открывалась Node-админка, которая дёргает
`/api/session` → `404`, и кнопка входа не появлялась.

---

## Что нужно сделать (один раз)

### 1. OAuth-приложение на GitHub

https://github.com/settings/applications/new

| Поле | Значение |
|---|---|
| Application name | `Math CMS` |
| Homepage URL | `https://mathlastname.netlify.app` |
| Application description | `Редактор лендинга` |
| **Redirect URI** | `https://api.netlify.com/ua/oauth/authorize` |

> Поле называется **Redirect URI**. Старое название — `Authorization callback URL`.
> Значение — строго `https://api.netlify.com/ua/oauth/authorize`, это посредник Netlify.

Галочки **Allow wildcard matching** и **Enable Device Flow** — не включать.

### 2. Client ID и Client secret

На странице приложения скопируйте **Client ID**, затем
**Generate a new client secret** → скопируйте **Client secret**.

### 3. Переменные в Netlify

`app.netlify.com` → сайт → `Site configuration` → `Environment variables`:

| Key | Value |
|---|---|
| `GITHUB_CLIENT_ID` | ваш Client ID |
| `GITHUB_CLIENT_SECRET` | ваш Client secret |

### 4. Отключить Identity

`Site configuration` → `Identity` → `Disable Identity`.
Она больше не нужна и только мешает.

### 5. Пересобрать и открыть

`Deploys` → `Trigger deploy` → `Deploy site`, дождаться `Published`.

Открыть **в инкогнито** (`Ctrl+Shift+N`):

```
https://mathlastname.netlify.app/admin/
```

Должна появиться кнопка **«Войти через GitHub»**.

---

## Как редактировать

В левом меню — разделы (Первый экран, УТП, Боли, Решение, Обо мне, Направления,
Почему со мной, Отзывы, Стоимость, FAQ, Финальный CTA, Форма и подвал, Фото).

Меняете текст → **Save** → Netlify пересобирает сайт за 30–90 секунд.

Загрузка фото: кнопка выбора файла или drag-and-drop прямо в поле.
Браузер сам сжимает картинку в WebP через `<canvas>`.

---

## Если не работает — читать консоль

`F12` → **Console**.

| Ошибка | Причина |
|---|---|
| `Failed to fetch` при клике на кнопку | не заданы `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` |
| `redirect_uri mismatch` | в GitHub неверное значение — должно быть `https://api.netlify.com/ua/oauth/authorize` |
| `api/session 404` | снова открылся `admin.html` вместо `admin/index.html` — проверьте, что файл переименован |
| страница висит на `Loading configuration...` | не загрузился `https://unpkg.com/decap-cms@^3.3.3/dist/decap-cms.js` — проверьте доступ к unpkg |

---

## Запасной путь без админки

Если что-то пойдёт не так — правьте `data/content.json` напрямую на GitHub
(кнопка « pencil » у файла → отредактировать → commit). Формат там такой же,
как в админке; сайт подхватит изменения автоматически.

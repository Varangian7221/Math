# Лендинг репетитора по математике

Одностраничный сайт из 11 блоков. Чистые HTML/CSS/JS — без сборки, без фреймворков,
без `npm install`. Открывается двойным кликом по `index.html`.

Деплой: **https://mathlastname.netlify.app**
Админка (Decap CMS): **https://mathlastname.netlify.app/admin/**

---

## 📁 Структура

```
Math/
├── index.html          — вся страница: 11 блоков, data-field на каждом тексте
├── data/
│   ├── content.json        ⭐ ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ — весь текст сайта
│   └── content.default.json— бэкап исходных текстов (кнопка «Сбросить» в админке)
├── css/
│   ├── styles.css      — дизайн-система, адаптив (1080/920/640/380)
│   └── admin.css       — стили Node-админки
├── js/
│   ├── content.js      — подстановка контента + генерация Schema.org
│   ├── config.js       — ТОЛЬКО техданные: токен бота, chatId, календарь
│   ├── script.js       — маска телефона, валидация, отправка в Telegram, sticky bar
│   └── admin.js        — логика Node-админки
├── admin/                  ← ДЕКАП CMS (для Netlify)
│   ├── index.html
│   └── config.yml      — схема всех полей
├── admin-node.html         ← NODE-АДМИНКА (для хостингов с Node)
├── server.js            ← статика + API для Node-админки
├── images/
└── docs/                ← служебные инструкции по деплою и трублюшнгу
```

---

## ✏️ Где редактировать тексты

### Вариант А — через админку в браузере (рекомендуется)

| Хостинг | Адрес | Технология |
|---|---|---|
| Netlify (ваш текущий) | `/admin/` | Decap CMS, вход через GitHub |
| Render / Railway / VPS | `/admin-node.html` | Своя админка, вход по паролю |

Обе редактируют **весь текст сайта + фотографии** и пишут в `data/content.json`.

### Вариант Б — вручную в `data/content.json`

Файл читается и лендингом, и админкой. Правьте JSON, коммитьте — Netlify
пересоберёт сайт за 30–90 секунд.

### Как это работает на странице

`js/content.js` работает в трёх режимах и всегда показывает текст:

1. **Node-хостинг** — `server.js` подставляет `window.__CONTENT__` прямо в HTML
   (нет мигания пустых блоков, весь текст виден поисковикам).
2. **Статика (Netlify)** — `fetch('data/content.json')`.
3. **`file://`** — берёт тексты из самого HTML.

Разметка помечена атрибутом `data-field="путь.к.полю"` — это единый контракт
между разметкой и контентом:

| Атрибут | Что подставляет |
|---|---|
| `data-field` | текст в элемент |
| `data-attr="href"` | значение атрибута вместо текста |
| `data-field` + `data-attr="src"` | `src` у `<img>` |
| `data-hide-empty` | прячет элемент, если значение пустое |

---

## 🖼 Фотографии

Через админку: drag-and-drop, браузер сам сжимает в WebP через `<canvas>`.

Вручную: положите файлы в `images/` и пропишите путь в `data/content.json`
(секция `images`):

- `teacher-1.webp` — первый экран, **800 × 1000** (4:5)
- `teacher-2.webp` — блок «Обо мне», **720 × 720** (1:1)

Конвертеры: [squoosh.app](https://squoosh.app), [webp-converter.io](https://webp-converter.io).
Для соцсетей сохраните кадр 1200 × 630 как `images/og-cover.jpg`.

---

## 🤖 Telegram-форма

1. `@BotFather` → `/newbot` → скопируйте токен.
2. Напишите боту любое сообщение (чтобы он «увидел» чат).
3. Откройте `https://api.telegram.org/bot<ТОКЕН>/getUpdates`, найдите `"chat":{"id": ...}`.
4. Впишите оба значения в `js/config.js`:

```js
telegramBot: {
  token:  '7123456789:AAH...',
  chatId: '123456789'
}
```

Если оставить пустыми — форма всё равно работает: посетитель получит готовое
сообщение и кнопку «Отправить заявку в Telegram».

Ссылка на календарь после отправки — `calendar` в том же файле.

---

## 🖥 Node-хостинг (для `admin-node.html`)

```bash
ADMIN_PASSWORD=ваш_пароль node server.js
```

- Сайт: `http://localhost:3000/`
- Админка: `http://localhost:3000/admin-node.html`

API: `/api/content` (GET/PUT), `/api/login`, `/api/logout`, `/api/session`,
`/api/upload`, `/api/reset`.

> ⚠️ **Имя файла `admin-node.html` — не переименовывайте обратно в `admin.html`.**
> Netlify отдаёт по адресу `/admin/` корневой `admin.html` (его «Pretty URLs»
> имеют приоритет над папкой `admin/`), и вместо CMS вы видели Node-админку,
> которая пыталась дёрнуть несуществующий `/api/session`.

---

## ✅ Чек-лист перед публикацией

- [ ] `ADMIN_PASSWORD` задан (не `admin`) — только для Node-хостинга
- [ ] В `canonical` / `og:url` / `og:image` в `<head>` — ваш домен вместо `math-smirnova.ru`
- [ ] Токен и `chatId` Telegram-бота в `js/config.js`
- [ ] `teacher-1.webp` и `teacher-2.webp` вместо SVG-заглушек
- [ ] Домен подключён к Netlify (SSL бесплатный, выдаётся автоматически)

---

## 🎨 Смена палитры

Блок `:root` в начале `css/styles.css`. Поменяйте `--accent` — и вся сетка
кнопок, ссылок и акцентов перекрасится. Генераторы палитр:
[coolors.co](https://coolors.co), [realtimecolors.com](https://www.realtimecolors.com).

---

## 📚 Служебные инструкции

В папке `docs/` лежат инструкции по деплою и разбору проблем:

| Файл | О чём |
|---|---|
| `docs/НАСТРОЙКА_GITHUB_OAUTH.md` | **← актуальная настройка входа в `/admin/`** |
| `docs/ИНСТРУКЦИЯ_ЗАГРУЗКИ_РЕПОЗИТОРИЯ_GITHUB.md` | как залить проект на GitHub |
| `docs/КОНФЛИКТ_ADMIN_HTML_VS_DECAP_CMS.md` | почему `/admin/` показывал не ту админку |
| остальные `*.md` | история трублюшнга Netlify Identity и Git Gateway |

> ⚠️ Файлы про Netlify Identity и Git Gateway **устарели** — Identity больше не
> используется, вход идёт через GitHub OAuth.

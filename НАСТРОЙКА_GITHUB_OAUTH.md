# Перенастройка админки на GitHub OAuth (без Netlify Identity)

## Что было не так

1. **`admin/index.html` отсутствовал.** В папке `admin/` лежал только `config.yml`. Поэтому по адресу `/admin/` Netlify отдавал 404 или пустую страницу. Из-за этого вы видели «какую-то форму с паролем» и ошибки `/api/session`.

2. **Netlify Identity у вас не работает** — формы `Set your password` и `Forgot password?` не отрисовываются. Причину выяснять долго; проще убрать Identity совсем.

## Что сделано

- Создан `admin/index.html` с подключением Decap CMS
- `admin/config.yml` переключён с `git-gateway` на **`github`** backend с посредником `base_url: https://api.netlify.com`
- Убран `editorial_workflow` — правки будут публиковаться сразу

Теперь вход будет через **«Войти с GitHub»** — без Identity, токенов и приглашений.

## Что нужно сделать вам (один раз)

### Шаг 1. Зарегистрировать OAuth-приложение на GitHub

Откройте: https://github.com/settings/applications/new

Заполните поля:

| Поле | Значение |
|---|---|
| Application name | `Math CMS` |
| Homepage URL | `https://mathlastname.netlify.app` |
| Application description | `Редактор лендинга` |
| **Redirect URI** | `https://api.netlify.com/ua/oauth/authorize` |

> Поле называется **Redirect URI** (не «Authorization callback URL» — это старая формулировка).
> Значение строго `https://api.netlify.com/ua/oauth/authorize` — это посредник Netlify, через который проходит авторизация.

Галочки **Allow wildcard matching** и **Enable Device Flow** — не включайте.

Нажмите **Register application**.

### Шаг 2. Скопировать Client ID и Client secret

На странице приложения:

1. Скопируйте **Client ID** (виден сразу)
2. Нажмите **Generate a new client secret** → скопируйте **Client secret**

### Шаг 3. Добавить значения в Netlify

1. Откройте [app.netlify.com](https://app.netlify.com/) → ваш сайт `mathlastname.netlify.app`
2. `Site configuration` → `Environment variables`
3. Добавьте **две** переменные:

   | Key | Value |
   |---|---|
   | `GITHUB_CLIENT_ID` | (ваш Client ID) |
   | `GITHUB_CLIENT_SECRET` | (ваш Client secret) |

4. Нажмите `Save`

### Шаг 4. Отключить Netlify Identity (опционально, но рекомендуется)

Чтобы Identity больше не мешала:

1. `Site configuration` → `Identity`
2. Нажмите `Disable Identity` → подтвердите

Это уберёт все её формы и токены, которые не работали.

### Шаг 5. Пересобрать сайт

1. `Deploys` → `Trigger deploy` → `Deploy site`
2. Дождитесь статуса `Published`

### Шаг 6. Открыть админку

1. Откройте **в режиме инкогнито** (`Ctrl+Shift+N`), чтобы не мешал старый кэш:

   **https://mathlastname.netlify.app/admin/**

2. Нажмите **`Войти с GitHub`** (или `Login with GitHub`)
3. GitHub попросит подтвердить доступ к репозиторию → `Authorize`
4. Готово — вы в редакторе

## Как редактировать

В левом меню выберите раздел (Первый экран, УТП, Боли, Отзывы, Стоимость, FAQ и т.д.), измените тексты, нажмите **`Save`**.

Через 30–90 секунд Netlify пересоберёт сайт и изменения появятся на нём.

## Если что-то не работает

1. Нажмите `F12` → вкладка **Console** → посмотрите ошибки
2. Частая ошибка `Failed to fetch` — значит не добавлены `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` в Netlify
3. Ошибка про `Redirect URI mismatch` — в GitHub должно быть именно `https://api.netlify.com/ua/oauth/authorize`
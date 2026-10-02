# Оглавление служебных инструкций

## Актуальные

| Файл | О чём |
|---|---|
| [НАСТРОЙКА_GITHUB_OAUTH.md](НАСТРОЙКА_GITHUB_OAUTH.md) | **настройка входа в `/admin/` — читать первым** |
| [КОНФЛИКТ_ADMIN_HTML_VS_DECAP_CMS.md](КОНФЛИКТ_ADMIN_HTML_VS_DECAP_CMS.md) | две админки, правило именования, почему был `404` |
| [ИНСТРУКЦИЯ_ЗАГРУЗКИ_РЕПОЗИТОРИЯ_GITHUB.md](ИНСТРУКЦИЯ_ЗАГРУЗКИ_РЕПОЗИТОРИЯ_GITHUB.md) | как залить проект на GitHub |
| [ИНСТРУКЦИЯ_GIT_GATEWAY_NETLIFY.md](ИНСТРУКЦИЯ_GIT_GATEWAY_NETLIFY.md) | Git Gateway на Netlify |

## Устаревшие (Netlify Identity)

Эти файлы остались как история трублюшнга. **Identity в проекте больше не
используется** — вход идёт через GitHub OAuth.

- `КАК_УСТАНОВИТЬ_ПАРОЛЬ_NETLIFY_IDENTITY.md`
- `КАК_СБРОСИТЬ_ПАРОЛЬ_NETLIFY_IDENTITY.md`
- `РЕШЕНИЕ_INVITE_TOKEN.md`
- `ИСПРАВЛЕНИЕ_GIT_GATEWAY_СТАТУС.md`
- `ФИКС_КНОПКИ_LOGIN_NETLIFY_IDENTITY.md`
- `ФОРМА_ВХОДА_DECAP_CMS_NETLIFY.md`
- `РЕШЕНИЕ_ФОРМА_BEEGO_CMS.md`
- `РЕШЕНИЕ_NETLIFY_IDENTITY_POPUP.md`
- `РЕШЕНИЕ_КАРДИНАЛЬНОЕ_NETLIFY.md`
- `Решение_Invitation_Netlify_Identity.md`

Если снова понадобится Identity — сначала проверьте `КОНФЛИКТ_ADMIN_HTML_VS_DECAP_CMS.md`:
возможно, проблема была не в Identity, а в том, что `/admin/` отдавал чужой файл.

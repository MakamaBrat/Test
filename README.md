# MenuMaker

Статический веб-билд, собранный в Unity 2D Editor (File ▸ Export ▸ Web).
Сборка не требуется — на Vercel это обычный статический сайт.

## Деплой на Vercel

**Через CLI** (в этой папке):

    npx vercel --prod

На вопросы отвечайте Enter: Framework Preset — "Other", Build Command — пусто, Output Directory — "." (текущая папка).

**Через сайт:** vercel.com ▸ Add New ▸ Project ▸ загрузите эту папку (или залейте её в GitHub-репозиторий и импортируйте его).

## Локальная проверка

    npx serve .

(открывать index.html двойным кликом нельзя — браузеры блокируют загрузку game.json по file://)

## Что внутри

- `index.html`, `player.js` — страница и рантайм игры
- `game.json` — сцена, анимации, Animator-контроллеры
- `assets/` — спрайты и шрифты (имена содержат хэш, кэшируются навсегда)
- `vercel.json` — кэш-заголовки

# BABEL° — Translator

A translator for **207 languages**. Free, no sign-up, no API key.
That's the whole site — open it and translate.

## Run it

```bash
npm start
# → http://localhost:4173
```

## What it does

| Feature | What it does |
|---|---|
| **Live translation** | Translates as you type, with auto-detect and a detected-language badge |
| **207 languages** | Searchable pickers with flags + native names, Popular & Recent sections, quick-pair chips, one-tap swap |
| **Triple-engine brain** | Google Translate → same-origin `/api/translate` proxy → MyMemory; if one engine fails, another answers. Long text is auto-chunked |
| **Offline essentials** | *Hello, Thank you, I love you…* in 22 languages work with zero network |
| **Voice in & out** | 🎙️ Dictate your text, 🔊 hear source & translation spoken aloud |
| **Phrasebook** | Travel essentials that translate on tap |
| **History & Saved** | Last 30 translations + starred favourites, stored only in your browser — click a card to restore it |
| **Tools** | Copy, paste, download `.txt`, translate a `.txt/.md/.srt` file, shareable links, dictionary for English words, alternative translations, RTL support |

Shortcuts: `Ctrl+Enter` translate · `Ctrl+Shift+S` swap languages

## Files

```
index.html                  The translator page
css/translator.css          Styling
js/translator/languages.js  207-language catalogue
js/translator/engine.js     Translation engines + chunking + offline glossary
js/translator/app.js        UI logic
server.mjs                  Static server + /api/translate proxy
test/translator.test.mjs    Tests (npm test)
```

## Tests

```bash
npm test
```

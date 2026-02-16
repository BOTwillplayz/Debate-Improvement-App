# Debate Tracker (Redesign)

A multi-page WSDC debating tracker with cleaner UX, Drive import, and a real layout editor.

## Pages

- `/Users/williamdownes/Documents/Debate App/index.html` - dashboard
- `/Users/williamdownes/Documents/Debate App/resources.html` - local resources + Google Drive import/tree
- `/Users/williamdownes/Documents/Debate App/speeches.html` - speech storage
- `/Users/williamdownes/Documents/Debate App/skills.html` - skill tracking + trend chart
- `/Users/williamdownes/Documents/Debate App/evaluations.html` - round evaluations + trend chart
- `/Users/williamdownes/Documents/Debate App/settings.html` - layout editor + data tools

## Run

```bash
cd "/Users/williamdownes/Documents/Debate App"
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Main Features

- IndexedDB local data storage
- Google Drive folder import/update into Drive tree structure
- Duplicate-safe Drive updates (by Drive file ID, then path/name fallback)
- Local manual resource upload with duplicate guard
- Search + sorting across libraries
- Layout editor with presets and custom theme controls (colors, fonts, spacing, width, radius)
- Backup export/import JSON

## Google Drive Setup

1. Enable **Google Drive API** in Google Cloud.
2. Configure OAuth consent screen.
3. Create OAuth 2.0 Client ID (Web app).
4. Add `http://localhost:8080` to authorized JS origins.
5. Paste Client ID in `resources.html`, connect, then import folder.

## Limits

- Max file size per imported/uploaded file: 8MB
- Drive API page size: 1000 (Google API limit)

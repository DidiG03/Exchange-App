# Exchange Bureau (Albania)

Internal desktop application for a currency exchange bureau. Staff manage rates, perform buy/sell conversions against ALL, and review transaction history. Fully offline — data is stored locally in SQLite.

## Tech stack

- **Electron** — desktop shell
- **React + Vite** — UI (`src/renderer`)
- **better-sqlite3** — local database (`src/database`)
- **Tailwind CSS** — styling
- **React Router** — navigation
- **electron-builder** — Windows NSIS installer

## Default login

| Username | Password   |
|----------|------------|
| `admin`  | `admin123` |

Change this in production by adding user management or updating the seeded account in the database.

## Development

```bash
npm install
npm run dev
```

## Build Windows installer

Run on Windows (recommended for native `better-sqlite3`), or use a Windows CI runner:

```bash
npm run build
npm run dist
```

Output: `release/Exchange Bureau Setup x.x.x.exe`

## Project structure

```
src/
  main/          Electron main process, preload, IPC
  renderer/      React UI (pages, components, hooks)
  database/      SQLite schema and queries
```

## Supported currencies

EUR, GBP, USD — all paired against Albanian Lek (ALL).

On first launch, example starter rates are seeded automatically. Open **Rates** to replace them with your bureau's real buy/sell prices.

**Exchange types:** Buy/Sell vs ALL, or **Convert** for cross-rates (e.g. EUR → USD) calculated through ALL using your buy rate on the source currency and sell rate on the target.

## Thermal receipt printer (USB / Windows)

1. Connect the thermal printer via USB and install the **Windows printer driver** (Epson, Star, generic ESC/POS, etc.).
2. In the app, open **Printer** in the sidebar.
3. Select the printer name exactly as it appears in Windows **Settings → Bluetooth & devices → Printers**.
4. Enable **Print receipt after each transaction** and save.
5. Each confirmed exchange on the **Exchange** screen prints a receipt automatically.

Receipts are sent as **RAW ESC/POS** commands (what thermal printers expect), not as PDF/PostScript. This avoids garbled PostScript text on the paper.

- **macOS:** uses `lp -o raw` to your selected printer (e.g. `_80Series2`)
- **Windows:** uses RAW printing via `@thesusheer/electron-printer` (install before `npm run dist`)

If printing fails, the transaction is still saved; the UI shows a warning.

Settings are stored in the app user-data folder (`printer-settings.json`).

**Windows — install RAW driver before building:**

```bash
npm install @thesusheer/electron-printer
npm run postinstall
npm run dist
```

## Live rates

After login, buy/sell rates for EUR, GBP, and USD appear in the top header on every screen. They load from SQLite via `window.api.getLiveRates()` and refresh automatically when rates are saved (`window.api.onRatesUpdated`).

## Authentication & sessions

- Passwords are bcrypt-hashed in SQLite.
- On login, the **main process** issues a cryptographically random session token (not exposed to the React UI).
- All data APIs require a valid session; changing React state alone cannot bypass auth.
- Sessions expire after **1 hour** and the user is logged out automatically.
- Valid sessions survive page refresh (stored securely in the app data folder, not in the browser).
- Use **Logout** to end a session immediately.

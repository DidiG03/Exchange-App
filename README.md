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

Change the default admin username and password after first login under **Settings → Administrator account** (current password required). Admins can register and delete staff under **Settings → Staff accounts** (admin accounts cannot be deleted). Each staff member signs in separately; transactions, rate changes, and voids are recorded under their username.

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

33 major and regional currencies (EUR, USD, GBP, CHF, TRY, CAD, AUD, JPY, CNY, Gulf and European pairs, and more) — all paired against Albanian Lek (ALL). Starter buy/sell rates are seeded on first launch; update them on the **Rates** screen with your bureau’s real prices.

On first launch, example starter rates are seeded automatically. Open **Rates** to replace them with your bureau's real buy/sell prices.

**Exchange types:** Buy/Sell vs ALL, or **Convert** for cross-rates (e.g. EUR → USD) calculated through ALL using your buy rate on the source currency and sell rate on the target.

**Void / corrections:** On **History**, staff can void a mistaken transaction with a required reason. Rows are never deleted — `voided_at`, operator username, and reason are stored for audit. Voided entries show as struck-through; use **Hide voided** to focus on active trades only. Reprinting a voided receipt shows an **ANULLUAR** banner.

**Rate change history:** On **Rates**, every save logs who changed buy/sell, when, and the previous vs new values (filter by period and currency). Seeded starter rates on first install are not logged — only changes made through the app after login.

## Thermal receipt printer (USB / Windows)

1. Connect the thermal printer via USB and install the **Windows printer driver** (Epson, Star, generic ESC/POS, etc.).
2. In the app, open **Printer** in the sidebar.
3. Select the printer name exactly as it appears in Windows **Settings → Bluetooth & devices → Printers**.
4. Enable **Print receipt after each transaction** and save.
5. Each confirmed exchange prints an Albanian **Mandat Konvertim Valute** receipt (Nr. Fatures, Shuma / Kursi / Shuma e Konvert., boxed total, city and time).
6. Set **Bureau name** and **City** under **Settings** to match your office (default: KEMBIM VALUTOR, Durres).

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

After login, configured buy/sell rates appear in a scrollable strip in the top header on every screen. They load from SQLite via `window.api.getLiveRates()` and refresh automatically when rates are saved (`window.api.onRatesUpdated`).

## Authentication & sessions

- Passwords are bcrypt-hashed in SQLite.
- On login, the **main process** issues a cryptographically random session token (not exposed to the React UI).
- All data APIs require a valid session; changing React state alone cannot bypass auth.
- Sessions expire after **1 hour** and the user is logged out automatically.
- Valid sessions survive page refresh (stored securely in the app data folder, not in the browser).
- Use **Logout** to end a session immediately.

## Automatic updates

Installed apps check **GitHub Releases** for new versions (via `electron-updater`). Staff do not need to uninstall and reinstall manually.

**What happens for users**

1. App starts → checks for updates after a few seconds
2. If a newer version exists → downloads in the background
3. When ready → dialog: **Restart now** to install
4. Or open **Settings** → **Check for updates** / **Restart & install**

**How you publish a new version** (from your dev machine or CI)

1. Bump version in `package.json` (e.g. `1.0.0` → `1.1.0`)
2. Commit and push to `main`
3. Create a [GitHub release](https://github.com/DidiG03/Exchange-App/releases) with tag `v1.1.0` matching the version
4. On **Windows**, build and publish:

```bash
# Set a GitHub token with repo access (release scope)
export GH_TOKEN=your_github_token

npm install @thesusheer/electron-printer
npm run postinstall
npm run dist:publish
```

This uploads the installer and `latest.yml` to GitHub Releases. Installed apps pick up the update on the next check.

**Notes**

- Auto-update only runs in the **packaged .exe**, not in `npm run dev`
- First install is still done with the `.exe` from `npm run dist`
- Database and settings in `%APPDATA%` are kept across updates

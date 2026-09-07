# GoldTrack – setup guide

A team PWA that shows the live gold price per gram (USD and ZiG), keeps a shared
stock register in Google Sheets, and calculates achievable profit.

## 1. Get a price API key (5 min)

Sign up at **goldapi.io** (free tier: ~300 requests/month, the script caches for
15 minutes so this is plenty). Copy your API key.

Optional fallback: **metalpriceapi.com** (free tier available).

## 2. Create the Google Sheet backend (10 min)

1. Create a new Google Sheet (name it e.g. *GoldTrack data*).
2. **Extensions → Apps Script**. Delete the sample code and paste the contents of
   `apps-script/Code.gs`. Save.
3. **Project Settings (gear icon) → Script properties → Add**:
   - `GOLDAPI_KEY` = your goldapi.io key
   - `METALPRICEAPI_KEY` = your metalpriceapi key (optional)
4. Back in the editor, choose the function `setup` in the dropdown and press
   **Run**. Approve the permissions. This creates the Lots, Sales, Settings and
   PriceLog tabs.
5. Run `installDailyTrigger` the same way. Every morning it logs the spot price
   and fetches Fidelity Gold Refinery's daily buying-price list (scraped from
   Mining Zimbabwe's republication, stored in the FidelityLog tab). Optionally run
   `backfillHistory` (past year of spot, ~80 API calls) and `backfillFidelity`
   (last ~60 FGR lists).
6. In the **Settings** tab, change `TEAM_PIN` and set `ZIG_PER_USD` to today's rate.
7. **Deploy → New deployment → type: Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy, then copy the **Web app URL** (ends in `/exec`).

The URL is the only thing you share with the team; the API keys stay on the
script and are never sent to phones. Access is protected by the PIN.

> If you change `Code.gs` later, you must **Deploy → Manage deployments → Edit → New version** for the change to go live.

## 3. Build and host the app (10 min)

```bash
npm install
npm run dev        # test locally
npm run build      # produces dist/
```

Host the `dist/` folder anywhere static: Netlify, Vercel, Cloudflare Pages, or
GitHub Pages (all free). Drag-and-drop on Netlify is the quickest.

## 4. Install on phones

Open the hosted URL in Chrome (Android) or Safari (iOS) → **Add to Home Screen**.
On first open go to **Settings**, paste the web app URL and the team PIN, tap
**Save connection**.

## How the numbers work

- **Two price sources.** International LBMA spot (goldapi.io / metalpriceapi.com)
  drives the live number and the chart. Fidelity Gold Refinery's daily list gives
  the six buying bands (SG 90%+, 85–90%, 80–85%, 75–80%, sample, fire-assay cash).
- **Stock valuation** defaults to the Fidelity band matching each lot's purity %
  (set per lot; defaults from karat). Lots below 75% purity, or when no list has
  loaded, fall back to spot minus your selling spread. Switch basis in Settings.
- If the scrape fails the app keeps the last stored list and shows its age; a
  list older than 3 days is flagged on the dashboard.

- Spot arrives as USD per troy ounce; per gram = ÷ 31.1035; purity K = × K/24.
- **We buy / We sell** columns apply your buying and selling spreads from Settings.
- **Unrealised profit** = (sell price now − cost per gram) × grams in stock.
- **Realised profit** is computed at the moment a sale is recorded and stored in
  the Sales sheet (cost basis converted to USD if the lot was bought in ZiG).
- **Break-even spot** is the ounce price at which your selected stock sells for
  exactly what you paid.
- Everything is also visible directly in the Google Sheet, so you can build
  your own pivot tables or link it to your management accounts.

## Offline

The app keeps the last prices and stock on the phone. Lots and sales added while
offline are queued and sent when the connection returns.

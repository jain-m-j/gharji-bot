# GharJi WhatsApp Bot — V1

A WhatsApp assistant (Next.js App Router webhook, Meta Cloud API) for collecting
property listings and buyer requirements, with **Google Sheets as the database**.

## How it behaves

- **First message ever** from a number → one-time welcome with three buttons:
  **🏠 List a Property** / **🔍 Find a Property** / **💬 Talk to Our Team**.
- **List a Property** (or typing `list` / `sell` anytime) → guided 8-question
  listing flow (owner/broker, rent/sale, type, location, price, size, media,
  contact). Completed listings land in the **Listings** tab.
- **Find a Property** (or typing `find` / `buy` / `search` anytime) → guided
  6-question buyer flow (buy/rent, location, budget, type, size, contact).
  Completed requirements land in the **Buyers** tab.
- **Talk to Our Team** / any other message → the bot steps aside; your team
  chats normally on the number. The bot never re-prompts a greeted user.
- Multiple-choice questions are tappable (WhatsApp reply buttons, or a list
  picker for 4+ options). Typed answers work too.
- Mid-flow sessions expire after 30 minutes of inactivity; typing `list` or
  `find` always restarts fresh.

## State & storage

All state lives in **one Google Spreadsheet** (4 tabs, auto-created on first
use): `Listings`, `Buyers`, `Sessions` (mid-flow state — survives serverless
cold starts), `Contacts` (who has been greeted).

**No Google credentials?** The bot still runs: state falls back to in-memory
maps and completed records are `console.log`-ged. Fine for local testing; not
demo-safe (cold starts lose state).

## Files

- `app/api/webhook/route.ts` — GET (verification) + POST (messages, routing)
- `lib/flow.ts` — greeting, listing flow, buyer flow
- `lib/store.ts` — sessions/contacts/records (Sheets or in-memory)
- `lib/sheets.ts` — minimal Google Sheets client (service account, zero deps)
- `app/page.tsx` — health-check page

## Environment variables

| Var | Where to get it |
|---|---|
| `WHATSAPP_TOKEN` | Meta → Business Settings → System Users → generate token (whatsapp_business_messaging + whatsapp_business_management) |
| `PHONE_NUMBER_ID` | Meta → WhatsApp → API Setup |
| `VERIFY_TOKEN` | You invent this — any random string |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google Cloud → service account email (see below) |
| `GOOGLE_PRIVATE_KEY` | The `private_key` field from the service account JSON key (keep the `\n`s) |
| `GOOGLE_SHEET_ID` | From the spreadsheet URL: `docs.google.com/spreadsheets/d/<THIS>/edit` |

## Google Sheets setup (one-time, ~10 min)

1. [console.cloud.google.com](https://console.cloud.google.com) → create a
   project (e.g. `gharji-bot`).
2. APIs & Services → Library → enable **Google Sheets API**.
3. APIs & Services → Credentials → Create Credentials → **Service account**
   (any name, no roles needed) → done.
4. Open the service account → Keys → Add key → **JSON** → download.
5. From the JSON: `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
   `private_key` → `GOOGLE_PRIVATE_KEY`.
6. Create a Google Spreadsheet (any name). **Share it with the service
   account's email as Editor.** Copy the ID from the URL → `GOOGLE_SHEET_ID`.
7. Tabs and headers are created automatically on the first message.

## Local run

```bash
npm install
cp .env.local.example .env.local   # fill in the vars
npm run dev
```

## Deploy (Vercel)

1. Push to GitHub → import on vercel.com.
2. Add all env vars in Project Settings (redeploy after changing any).
3. Webhook URL = `https://<project>.vercel.app/api/webhook`.

## Register webhook with Meta

1. Meta dashboard → WhatsApp → Configuration.
2. Callback URL: `https://<project>.vercel.app/api/webhook`, verify token =
   `VERIFY_TOKEN`. Verify and Save → subscribe to the **messages** field.
3. **Critical:** confirm the WABA is subscribed to *your* app (not Meta's
   sample app) — inbound silently fails otherwise:
   ```
   curl "https://graph.facebook.com/v21.0/{WABA_ID}/subscribed_apps" -H "Authorization: Bearer {TOKEN}"
   curl -X POST "https://graph.facebook.com/v21.0/{WABA_ID}/subscribed_apps" -H "Authorization: Bearer {TOKEN}"
   ```
   (`WABA_ID` = WhatsApp Business Account ID from API Setup; token must belong
   to your app. On Windows, keep curl commands on one line.)

## Test

From an allow-listed phone: send "hello" → expect the 3-button welcome. Tap
**List a Property** → complete the flow → check the **Listings** tab. Send
"hello" again → expect silence (human mode). Type `find` → buyer flow →
**Buyers** tab.

## Next steps (V2 candidates)

- AI extraction layer: parse free-text like "3 BHK in Sainik Farms for ₹2.2L"
  and only ask for missing fields (Claude API, structured outputs).
- Media handling for the "photos or video" step (WhatsApp media download).
- Buyer ↔ listing matching; website fed from the same sheet.
- Voice note transcription.

# GharJi WhatsApp Bot — POC

A stateless webhook (Next.js App Router) that walks a user through an 8-question
property-listing flow on WhatsApp, using the Meta Cloud API.

State is kept in an in-memory `Map` keyed by phone number. **This is POC-only** —
on Vercel, serverless instances are ephemeral, so a user mid-flow can hit a fresh
instance and restart. Swap the `Map` for Supabase before showing a client.

## Files

- `app/api/webhook/route.ts` — GET (verification) + POST (messages)
- `lib/flow.ts` — the 8 questions and their field names
- `app/page.tsx` — health-check page

## Local run

```bash
npm install
cp .env.local.example .env.local   # fill in your Meta credentials
npm run dev
```

## Environment variables

| Var | Where to get it |
|---|---|
| `WHATSAPP_TOKEN` | Meta → Business Settings → System Users → generate token (whatsapp_business_messaging + whatsapp_business_management) |
| `PHONE_NUMBER_ID` | Meta → WhatsApp → API Setup |
| `VERIFY_TOKEN` | You invent this — any random string |

## Deploy (Vercel)

1. Push this folder to a GitHub repo.
2. vercel.com → Import repo.
3. Add the 3 env vars above in Project Settings.
4. Deploy. Webhook URL = `https://<project>.vercel.app/api/webhook`.

## Register webhook with Meta

1. Meta dashboard → WhatsApp → Configuration.
2. Callback URL: `https://<project>.vercel.app/api/webhook`
3. Verify token: same string as `VERIFY_TOKEN`.
4. Verify and Save → subscribe to the **messages** field.

## Test

Message the Meta test number from your verified phone. You should get Q1, and each
reply advances the flow. Completed listings are logged (`NEW LISTING: {...}`) in
Vercel Runtime Logs.

## Next steps

- Replace in-memory `Map` with Supabase (one row per session, keyed by phone).
- Add media handling for the "photos or video" step.
- Add a role selector / buyer branch.

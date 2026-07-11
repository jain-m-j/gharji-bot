// Minimal Google Sheets client (service account, no dependencies).
// Auth: signs a JWT with the service account key, exchanges it for an
// OAuth access token, caches the token in the instance.

import crypto from "crypto";

const EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
// Vercel env vars store the key with literal "\n" sequences
const KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

export const sheetsConfigured = Boolean(EMAIL && KEY && SHEET_ID);

// Tab names + header rows, created automatically if missing
const TABS: Record<string, string[]> = {
  Listings: [
    "timestamp", "whatsapp", "role", "listing_type", "property_type",
    "location", "price", "bedrooms_size", "has_media", "contact",
  ],
  Buyers: [
    "timestamp", "whatsapp", "search_type", "location", "budget",
    "property_type", "bedrooms_size", "contact",
  ],
  Sessions: ["phone", "flow", "step", "answers", "updated_at"],
  Contacts: ["phone", "first_seen"],
};

let cachedToken: { token: string; expires: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires - 60_000) {
    return cachedToken.token;
  }
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned =
    b64({ alg: "RS256", typ: "JWT" }) +
    "." +
    b64({
      iss: EMAIL,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    });
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(KEY!, "base64url");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error("Google auth failed: " + JSON.stringify(data));
  }
  cachedToken = {
    token: data.access_token,
    expires: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

async function api(path: string, init?: RequestInit): Promise<any> {
  const token = await getToken();
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    }
  );
  if (!res.ok) {
    throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// Create any missing tabs (with headers) on first use per instance
let setupDone = false;
export async function ensureSetup(): Promise<void> {
  if (setupDone) return;
  const meta = await api("?fields=sheets.properties.title");
  const existing = new Set<string>(
    meta.sheets.map((s: any) => s.properties.title)
  );
  const missing = Object.keys(TABS).filter((t) => !existing.has(t));
  if (missing.length > 0) {
    await api(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
      }),
    });
    for (const title of missing) {
      await appendRow(title, TABS[title]);
    }
  }
  setupDone = true;
}

export async function readRows(tab: string): Promise<string[][]> {
  const data = await api(`/values/${tab}!A2:Z`);
  return data.values ?? [];
}

export async function appendRow(tab: string, row: string[]): Promise<void> {
  await api(`/values/${encodeURIComponent(tab)}!A1:append?valueInputOption=USER_ENTERED`, {
    method: "POST",
    body: JSON.stringify({ values: [row] }),
  });
}

export async function updateRow(
  tab: string,
  rowIndex: number, // 1-based sheet row number
  row: string[]
): Promise<void> {
  await api(
    `/values/${encodeURIComponent(tab)}!A${rowIndex}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      body: JSON.stringify({ values: [row] }),
    }
  );
}

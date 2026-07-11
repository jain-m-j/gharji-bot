// State + records store. Uses Google Sheets when the three GOOGLE_* env
// vars are set (survives cold starts — production mode); otherwise falls
// back to in-memory Maps + console.log (local/dev mode).

import {
  sheetsConfigured,
  ensureSetup,
  readRows,
  appendRow,
  updateRow,
} from "./sheets";
import { LISTING_FLOW, BUYER_FLOW } from "./flow";

export type Flow = "listing" | "buyer";
export type Session = {
  flow: Flow;
  step: number;
  answers: Record<string, string>;
  updatedAt: number;
};

// A session untouched for this long is treated as abandoned
const SESSION_TTL_MS = 30 * 60 * 1000;

// ---------- In-memory fallback ----------
const memSessions = new Map<string, Session>();
const memGreeted = new Set<string>();

// ---------- Public API ----------

export async function getSession(phone: string): Promise<Session | null> {
  let session: Session | null = null;
  if (!sheetsConfigured) {
    session = memSessions.get(phone) ?? null;
  } else {
    await ensureSetup();
    const rows = await readRows("Sessions");
    // last matching non-empty row wins
    for (const row of rows) {
      if (row[0] === phone && row[1]) {
        session = {
          flow: row[1] as Flow,
          step: parseInt(row[2], 10) || 0,
          answers: JSON.parse(row[3] || "{}"),
          updatedAt: Date.parse(row[4]) || 0,
        };
      }
    }
  }
  if (session && Date.now() - session.updatedAt > SESSION_TTL_MS) {
    return null; // stale — abandoned mid-flow
  }
  return session;
}

export async function setSession(phone: string, session: Session): Promise<void> {
  session.updatedAt = Date.now();
  if (!sheetsConfigured) {
    memSessions.set(phone, session);
    return;
  }
  await ensureSetup();
  const row = [
    phone,
    session.flow,
    String(session.step),
    JSON.stringify(session.answers),
    new Date(session.updatedAt).toISOString(),
  ];
  const rowIndex = await findSessionRow(phone);
  if (rowIndex) {
    await updateRow("Sessions", rowIndex, row);
  } else {
    await appendRow("Sessions", row);
  }
}

export async function deleteSession(phone: string): Promise<void> {
  if (!sheetsConfigured) {
    memSessions.delete(phone);
    return;
  }
  const rowIndex = await findSessionRow(phone);
  if (rowIndex) {
    // blank the row (keeps the grid stable; readers skip empty rows)
    await updateRow("Sessions", rowIndex, [phone, "", "", "", ""]);
  }
}

async function findSessionRow(phone: string): Promise<number | null> {
  const rows = await readRows("Sessions");
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][0] === phone) return i + 2; // +2: 1-based + header row
  }
  return null;
}

export async function hasGreeted(phone: string): Promise<boolean> {
  if (!sheetsConfigured) return memGreeted.has(phone);
  await ensureSetup();
  const rows = await readRows("Contacts");
  return rows.some((row) => row[0] === phone);
}

export async function markGreeted(phone: string): Promise<void> {
  if (!sheetsConfigured) {
    memGreeted.add(phone);
    return;
  }
  await ensureSetup();
  if (!(await hasGreeted(phone))) {
    await appendRow("Contacts", [phone, new Date().toISOString()]);
  }
}

export async function saveListing(
  phone: string,
  answers: Record<string, string>
): Promise<void> {
  const record = {
    timestamp: new Date().toISOString(),
    whatsapp: phone,
    ...answers,
  };
  if (!sheetsConfigured) {
    console.log("NEW LISTING:", record);
    return;
  }
  await ensureSetup();
  await appendRow("Listings", [
    record.timestamp,
    phone,
    ...LISTING_FLOW.map((q) => answers[q.field] ?? ""),
  ]);
}

export async function saveBuyerLead(
  phone: string,
  answers: Record<string, string>
): Promise<void> {
  const record = {
    timestamp: new Date().toISOString(),
    whatsapp: phone,
    ...answers,
  };
  if (!sheetsConfigured) {
    console.log("NEW BUYER LEAD:", record);
    return;
  }
  await ensureSetup();
  await appendRow("Buyers", [
    record.timestamp,
    phone,
    ...BUYER_FLOW.map((q) => answers[q.field] ?? ""),
  ]);
}

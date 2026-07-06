import { NextRequest, NextResponse } from "next/server";
import { QUESTIONS, FIELDS } from "@/lib/flow";

// In-memory state. NOTE: resets on cold start / redeploy. POC only.
type Session = { step: number; answers: Record<string, string> };
const sessions = new Map<string, Session>();

const TOKEN = process.env.WHATSAPP_TOKEN!;
const PHONE_ID = process.env.PHONE_NUMBER_ID!;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN!;

async function sendMessage(to: string, text: string) {
  await fetch(`https://graph.facebook.com/v25.0/${PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
}

// --- Webhook verification (GET) ---
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// --- Incoming messages (POST) ---
export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const change = body.entry?.[0]?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    // Ignore status callbacks (delivered/read) — they have no `messages`
    if (!message) return NextResponse.json({ ok: true });

    const from = message.from; // phone number, e.g. "919812345678"
    const text = message.text?.body?.trim() ?? "";

    let session = sessions.get(from);

    // New / returning user starting fresh
    if (!session) {
      session = { step: 0, answers: {} };
      sessions.set(from, session);
      await sendMessage(from, QUESTIONS[0]);
      return NextResponse.json({ ok: true });
    }

    // Record the answer to the current question
    session.answers[FIELDS[session.step]] = text;
    session.step += 1;

    if (session.step < QUESTIONS.length) {
      await sendMessage(from, QUESTIONS[session.step]);
    } else {
      // Done — log the completed listing
      console.log("NEW LISTING:", {
        whatsapp: from,
        ...session.answers,
        timestamp: new Date().toISOString(),
      });
      await sendMessage(
        from,
        "✅ Thank you! Your listing has been received. Our team will review it and get back to you shortly."
      );
      sessions.delete(from);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: true }); // always 200 so Meta doesn't retry-storm
  }
}

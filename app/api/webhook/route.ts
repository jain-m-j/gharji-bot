import { NextRequest, NextResponse } from "next/server";
import { FLOW, GREETING } from "@/lib/flow";

// In-memory state. NOTE: resets on cold start / redeploy. POC only —
// the Supabase migration replaces both of these with table reads/writes.
type Session = { step: number; answers: Record<string, string> };
const sessions = new Map<string, Session>();
// Numbers that have already seen the one-time greeting ("human mode":
// the bot stays silent for them unless summoned)
const greeted = new Set<string>();

const TOKEN = process.env.WHATSAPP_TOKEN!;
const PHONE_ID = process.env.PHONE_NUMBER_ID!;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN!;

async function sendPayload(to: string, payload: Record<string, unknown>) {
  await fetch(`https://graph.facebook.com/v25.0/${PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", to, ...payload }),
  });
}

async function sendText(to: string, text: string) {
  await sendPayload(to, { type: "text", text: { body: text } });
}

// Sends a flow question: plain text, reply buttons (≤3 options), or a
// list message (>3 options — WhatsApp caps reply buttons at 3).
async function sendQuestion(to: string, step: number) {
  const q = FLOW[step];

  if (!q.options) {
    await sendText(to, q.text);
  } else if (q.options.length <= 3) {
    await sendPayload(to, {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: q.text },
        action: {
          buttons: q.options.map((opt) => ({
            type: "reply",
            reply: { id: opt.toLowerCase(), title: opt },
          })),
        },
      },
    });
  } else {
    await sendPayload(to, {
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: q.text },
        action: {
          button: "Choose",
          sections: [
            {
              title: "Options",
              rows: q.options.map((opt) => ({
                id: opt.toLowerCase(),
                title: opt,
              })),
            },
          ],
        },
      },
    });
  }
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
    // Answer: tapped button, tapped list row, or typed text
    const answer =
      message.interactive?.button_reply?.title ??
      message.interactive?.list_reply?.title ??
      message.text?.body?.trim() ??
      "";

    const typed = message.text?.body?.trim().toLowerCase() ?? "";
    const tappedButton = message.interactive?.button_reply?.id ?? null;

    // Bot summons: typing "list" or tapping the greeting's "List a
    // property" button — always starts a fresh flow, even if one was
    // mid-way (doubles as a restart escape hatch)
    if (typed === "list" || tappedButton === "list_property") {
      greeted.add(from);
      sessions.set(from, { step: 0, answers: {} });
      await sendQuestion(from, 0);
      return NextResponse.json({ ok: true });
    }

    const session = sessions.get(from);

    if (!session) {
      // "Enquire" tap — log the lead, invite details, then leave the
      // chat to humans
      if (tappedButton === "enquire") {
        console.log("ENQUIRY LEAD:", {
          whatsapp: from,
          timestamp: new Date().toISOString(),
        });
        await sendText(
          from,
          "🔍 Sure! Tell us what you're looking for — location, budget, type of property — and our team will get back to you with options."
        );
        return NextResponse.json({ ok: true });
      }

      // "Talk to our team" tap — acknowledge once, then go silent
      if (tappedButton === "talk_team") {
        await sendText(
          from,
          "👍 Sure — our team will reply here personally. (You can type *list* anytime to list a property.)"
        );
        return NextResponse.json({ ok: true });
      }

      // First message ever from this number → one-time greeting
      if (!greeted.has(from)) {
        greeted.add(from);
        await sendPayload(from, {
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: GREETING },
            action: {
              buttons: [
                {
                  type: "reply",
                  reply: { id: "list_property", title: "List a property" },
                },
                {
                  type: "reply",
                  reply: { id: "enquire", title: "Enquire" },
                },
                {
                  type: "reply",
                  reply: { id: "talk_team", title: "Talk to our team" },
                },
              ],
            },
          },
        });
        return NextResponse.json({ ok: true });
      }

      // Already greeted, no active flow — human mode, stay silent
      return NextResponse.json({ ok: true });
    }

    // Record the answer to the current question
    session.answers[FLOW[session.step].field] = answer;
    session.step += 1;

    if (session.step < FLOW.length) {
      await sendQuestion(from, session.step);
    } else {
      // Done — log the completed listing
      console.log("NEW LISTING:", {
        whatsapp: from,
        ...session.answers,
        timestamp: new Date().toISOString(),
      });
      await sendText(
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

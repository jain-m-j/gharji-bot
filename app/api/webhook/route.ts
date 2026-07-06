import { NextRequest, NextResponse } from "next/server";
import { GREETING, QUESTIONS, FIELDS } from "@/lib/flow";

// In-memory state. NOTE: resets on cold start / redeploy. POC only.
type Stage = "menu" | "listing" | "inquiry";
type Session = { stage: Stage; step: number; answers: Record<string, string> };
const sessions = new Map<string, Session>();

const MENU_BUTTONS = [
  { id: "list_property", title: "List a property" },
  { id: "search_property", title: "Buy / Rent" },
  { id: "other", title: "Something else" },
];

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

async function sendButtons(
  to: string,
  text: string,
  buttons: { id: string; title: string }[]
) {
  await fetch(`https://graph.facebook.com/v25.0/${PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text },
        action: {
          buttons: buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    }),
  });
}

// Map a free-text reply in the menu stage to a button id, so typing
// "sell"/"buy" works as well as tapping. Returns null if unrecognized.
function textToMenuChoice(text: string): string | null {
  const t = text.toLowerCase();
  // "rent out" / "for rent" is a landlord listing, not a buyer searching
  if (/\b(list|sell|owner|broker|1)\b/.test(t) || /rent\s*out|for rent/.test(t))
    return "list_property";
  if (/\b(buy|rent|search|look|2)\b/.test(t)) return "search_property";
  if (/\b(3|other|else)\b/.test(t)) return "other";
  return null;
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
    // Interactive button tap — id of the button the user pressed, if any
    const buttonId = message.interactive?.button_reply?.id ?? null;

    let session = sessions.get(from);

    // New / returning user starting fresh
    if (!session) {
      session = { stage: "menu", step: 0, answers: {} };
      sessions.set(from, session);
      // If the first message doesn't already state an intent ("sell my
      // flat", "list"), greet with the menu and wait. Otherwise fall
      // through to the menu router below and skip the greeting.
      if (!buttonId && !textToMenuChoice(text)) {
        await sendButtons(from, GREETING, MENU_BUTTONS);
        return NextResponse.json({ ok: true });
      }
    }

    // --- Menu stage: route by button tap or typed keyword ---
    if (session.stage === "menu") {
      const choice = buttonId ?? textToMenuChoice(text);

      if (choice === "list_property") {
        session.stage = "listing";
        session.step = 0;
        await sendMessage(from, QUESTIONS[0]);
      } else if (choice === "search_property") {
        console.log("BUYER LEAD:", {
          whatsapp: from,
          timestamp: new Date().toISOString(),
        });
        await sendMessage(
          from,
          "🔍 Great! Property search on WhatsApp is coming soon.\n\nOur team has your number and will reach out with matching options. Meanwhile, if you'd like to *list* a property instead, just say *list*."
        );
        sessions.delete(from);
      } else if (choice === "other") {
        session.stage = "inquiry";
        await sendMessage(
          from,
          "No problem! Tell us briefly what you need, and our team will get back to you."
        );
      } else {
        // Unrecognized text — slide into inquiry mode with this message
        // as the first note, rather than forcing the menu again
        session.stage = "inquiry";
        session.step = 1;
        console.log("GENERAL INQUIRY:", {
          whatsapp: from,
          message: text,
          timestamp: new Date().toISOString(),
        });
        await sendMessage(
          from,
          "Thanks for reaching out! Our team will get back to you shortly. Feel free to share more details here.\n\n(To list a property anytime, just say *list*.)"
        );
      }
      return NextResponse.json({ ok: true });
    }

    // --- Inquiry stage: open-ended conversation, no re-prompting ---
    if (session.stage === "inquiry") {
      // Explicit one-word commands can still switch flows
      const cmd = text.toLowerCase();
      if (/^(list|sell)$/.test(cmd)) {
        session.stage = "listing";
        session.step = 0;
        session.answers = {};
        await sendMessage(from, QUESTIONS[0]);
        return NextResponse.json({ ok: true });
      }
      if (/^menu$/.test(cmd)) {
        session.stage = "menu";
        await sendButtons(from, GREETING, MENU_BUTTONS);
        return NextResponse.json({ ok: true });
      }

      console.log("GENERAL INQUIRY:", {
        whatsapp: from,
        message: text,
        timestamp: new Date().toISOString(),
      });
      // Acknowledge the first message properly; stay unobtrusive after
      // that so the person can keep typing without canned spam
      if (session.step === 0) {
        await sendMessage(
          from,
          "✅ Got it — our team will get back to you shortly. Feel free to add anything else here."
        );
      } else {
        await sendMessage(from, "Noted 👍");
      }
      session.step += 1;
      return NextResponse.json({ ok: true });
    }

    // --- Listing stage: record the answer to the current question ---
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

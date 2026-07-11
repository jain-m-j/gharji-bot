import { NextRequest, NextResponse } from "next/server";
import {
  GREETING,
  GREETING_BUTTONS,
  LISTING_FLOW,
  BUYER_FLOW,
  LISTING_DONE,
  BUYER_DONE,
  Question,
} from "@/lib/flow";
import {
  Flow,
  getSession,
  setSession,
  deleteSession,
  hasGreeted,
  markGreeted,
  saveListing,
  saveBuyerLead,
} from "@/lib/store";

const TOKEN = process.env.WHATSAPP_TOKEN!;
const PHONE_ID = process.env.PHONE_NUMBER_ID!;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN!;

const FLOWS: Record<Flow, Question[]> = {
  listing: LISTING_FLOW,
  buyer: BUYER_FLOW,
};
const DONE_MESSAGES: Record<Flow, string> = {
  listing: LISTING_DONE,
  buyer: BUYER_DONE,
};

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

async function sendGreeting(to: string) {
  await sendPayload(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: GREETING },
      action: {
        buttons: GREETING_BUTTONS.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  });
}

// Sends a flow question: plain text, reply buttons (≤3 options), or a
// list message (>3 options — WhatsApp caps reply buttons at 3).
async function sendQuestion(to: string, flow: Question[], step: number) {
  const q = flow[step];

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

async function startFlow(from: string, flow: Flow) {
  await markGreeted(from);
  await setSession(from, { flow, step: 0, answers: {}, updatedAt: 0 });
  await sendQuestion(from, FLOWS[flow], 0);
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
    const typed = message.text?.body?.trim().toLowerCase() ?? "";
    const tappedButton = message.interactive?.button_reply?.id ?? null;
    // Answer: tapped button, tapped list row, or typed text
    const answer =
      message.interactive?.button_reply?.title ??
      message.interactive?.list_reply?.title ??
      message.text?.body?.trim() ??
      "";

    // Keyword / button summons — always start a fresh flow, even if one
    // was mid-way (doubles as a restart escape hatch)
    if (/^(list|sell)$/.test(typed) || tappedButton === "list_property") {
      await startFlow(from, "listing");
      return NextResponse.json({ ok: true });
    }
    if (/^(find|buy|search)$/.test(typed) || tappedButton === "find_property") {
      await startFlow(from, "buyer");
      return NextResponse.json({ ok: true });
    }

    const session = await getSession(from);

    if (!session) {
      // "Talk to our team" tap — acknowledge once, then go silent
      if (tappedButton === "talk_team") {
        await sendText(
          from,
          "👍 Sure — our team will reply here personally. (You can type *list* to list a property or *find* to search, anytime.)"
        );
        return NextResponse.json({ ok: true });
      }

      // First message ever from this number → one-time greeting
      if (!(await hasGreeted(from))) {
        await markGreeted(from);
        await sendGreeting(from);
        return NextResponse.json({ ok: true });
      }

      // Already greeted, no active flow — human mode, stay silent
      return NextResponse.json({ ok: true });
    }

    // --- Active flow: record the answer, ask the next question ---
    const flow = FLOWS[session.flow];
    session.answers[flow[session.step].field] = answer;
    session.step += 1;

    if (session.step < flow.length) {
      await setSession(from, session);
      await sendQuestion(from, flow, session.step);
    } else {
      if (session.flow === "listing") {
        await saveListing(from, session.answers);
      } else {
        await saveBuyerLead(from, session.answers);
      }
      await sendText(from, DONE_MESSAGES[session.flow]);
      await deleteSession(from);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: true }); // always 200 so Meta doesn't retry-storm
  }
}

export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: "3rem", maxWidth: 640 }}>
      <h1>GharJi WhatsApp Bot</h1>
      <p>
        Webhook is live at <code>/api/webhook</code>. This page is just a
        health check — the bot runs entirely through the WhatsApp webhook.
      </p>
    </main>
  );
}

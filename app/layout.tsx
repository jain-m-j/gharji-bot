export const metadata = {
  title: "GharJi Bot",
  description: "WhatsApp property listing bot",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

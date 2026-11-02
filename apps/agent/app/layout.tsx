export const metadata = { title: 'Blast Radius' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'ui-monospace, monospace', maxWidth: 760, margin: '40px auto', padding: '0 16px' }}>
        {children}
      </body>
    </html>
  );
}

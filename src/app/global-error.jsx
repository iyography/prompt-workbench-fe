"use client";

import Error from "next/error";

export default function GlobalError({ error }) {
  // Log error to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Global error:', error);
  }

  return (
    <html>
      <body>
        <Error />
      </body>
    </html>
  );
}

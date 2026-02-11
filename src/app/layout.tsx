import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import { MainContainer } from "@/components/layout/MainContainer";
import { circularStd } from "@/utils/circularStd";

export const metadata: Metadata = {
  title: "Narrative AI",
  description: "Narrative AI - Prompt Workbench",
  icons: {
    icon: [
      {
        url: "/favicon.svg",
        type: "image/svg+xml",
      },
      {
        url: "/favico.svg", 
        type: "image/svg+xml",
      }
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={circularStd.className} suppressHydrationWarning={true}>
        <Providers>
          <MainContainer>{children}</MainContainer>
        </Providers>
      </body>
    </html>
  );
}

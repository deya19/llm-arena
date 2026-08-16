import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LLM Arena — Compare models honestly",
  description: "Put one prompt in front of multiple models and see what wins.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider
      appearance={{
        elements: {
          card: "auth-clerk-card",
          dividerLine: "auth-clerk-divider",
          footerActionLink: "auth-clerk-link",
          formButtonPrimary: "auth-clerk-primary",
          formFieldInput: "auth-clerk-input",
          headerSubtitle: "auth-clerk-subtitle",
          headerTitle: "auth-clerk-title",
          socialButtonsBlockButton: "auth-clerk-social-button",
        },
      }}
    >
      <html
        lang="en"
        data-theme="dark"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}

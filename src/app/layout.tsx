import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { PostHogProvider } from "@/components/posthog-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { AuthSavedSync } from "@/components/auth/auth-saved-sync";
import { NavigationFeedback } from "@/components/navigation-feedback";
import { ScrollDirection } from "@/components/scroll-direction";
import { CompareTray } from "@/components/compare-controls";
import { Suspense } from "react";
import { getSiteUrl } from "@/lib/site-url";
import { siteGraph } from "@/lib/site-schema";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: {
    default: "LibraryNear — Find the Best Libraries Near You",
    template: "%s | LibraryNear",
  },
  description:
    "Discover and compare study libraries, reading rooms, and private coaching halls near you. Filter by locality, metro station, amenities, and fees.",
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: "website",
    siteName: "LibraryNear",
    title: "LibraryNear — Find the Best Libraries Near You",
    description:
      "Discover and compare study libraries near you. Filter by locality, metro, amenities, and fees.",
    url: siteUrl,
    images: [
      {
        url: `${siteUrl}/og-default.png`,
        width: 1200,
        height: 630,
        alt: "LibraryNear — Find Study Libraries Near You",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: [`${siteUrl}/og-default.png`],
  },
  verification: {
    google: "rJBJvfoFMWlJWCWWco0hcovhQEBs0gBmuzibnPiGHCo",
    ...(process.env.BING_SITE_VERIFICATION
      ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION } }
      : {}),
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/logo-icon.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <body
        className="font-sans antialiased min-h-screen flex flex-col selection:bg-primary/20 selection:text-foreground"
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteGraph()).replace(/</g, "\\u003c") }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <PostHogProvider>
            <ScrollDirection />
            <AuthSavedSync />
            <Suspense fallback={null}>
              <NavigationFeedback />
            </Suspense>
            <div className="flex relative flex-col min-h-screen">
              <Navbar />
              <main className="flex-1 flex flex-col">{children}</main>
              <Footer />
              <CompareTray />
            </div>
          </PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

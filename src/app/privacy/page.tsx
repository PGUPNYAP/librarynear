import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Learn how LibraryNear collects, uses, stores, and protects your information.",
  alternates: {
    canonical: "/privacy",
  },
};

const sections = [
  {
    title: "1. Information We Collect",
    paragraphs: [
      "We only collect information that is strictly necessary to provide and improve our library-finding services.",
    ],
    items: [
      "Google Account Information: When you choose to sign in via Google, we collect your Gmail address and username.",
      'Location Data: We collect your precise geographical location only when you explicitly click the "Near Me" button to show you nearby libraries. We also process generalized location data based on your manual text searches.',
      "Usage Data: We may collect standard analytics information via Google Analytics regarding how you interact with our website to improve our platform's user experience.",
    ],
  },
  {
    title: "2. How We Use Your Information",
    items: [
      "Authentication & Verification: We use your Google profile data solely for user verification and account creation.",
      "Service Delivery: We use your location data temporarily to provide search results for libraries in your vicinity.",
      "Platform Improvement: We use aggregated, non-identifiable data to understand traffic patterns and optimize our website.",
    ],
  },
  {
    title: "3. Data Storage and Security",
    items: [
      "Storage Provider: Your data is securely stored using Supabase, a robust backend-as-a-service provider. We implement industry-standard security measures to protect your personal information from unauthorized access.",
      "Retention: We retain your account information for as long as your account is active or as needed to provide you with our services.",
    ],
  },
  {
    title: "4. Third-Party Sharing",
    paragraphs: [
      "We respect your privacy and do not sell your personal data to any third parties. We share information only in the following limited circumstances:",
    ],
    items: [
      "Service Providers: We share necessary data with our trusted service providers: Supabase (for database storage) and Google Analytics (for website performance monitoring).",
      "Legal Requirements: We may disclose your information if required to do so by law or to protect the legal rights and safety of librarynear.com and our users.",
    ],
  },
  {
    title: "5. Your Rights, Choices, and Data Deletion",
    items: [
      "Location Access: You have full control over your location sharing and can revoke location access at any time through your web browser or device settings.",
      "Data Deletion Process: If you wish to delete your account and all associated personal data from our servers, please send a data deletion request to librarynearme.co.in@gmail.com. We will process your request and permanently delete your data within a reasonable timeframe (typically within 15-30 days).",
    ],
  },
  {
    title: "6. Google API Services User Data Policy Disclosure",
    paragraphs: [
      "Our app's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements. Data obtained via Google OAuth is used strictly for authentication and is not used for serving advertisements.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="bg-slate-50/50">
      <section className="border-b border-border/60 bg-white">
        <div className="container mx-auto px-6 py-14 md:px-10 md:py-18">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-black md:text-5xl">
              Privacy Policy
            </h1>
            <p className="mt-4 text-sm text-muted-foreground md:text-base">
              Last Updated: April 25, 2026
            </p>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground">
              Welcome to librarynear.com. This Privacy Policy explains how librarynear.com
              (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) collects, uses, and shares
              information about you when you use our website and services.
            </p>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-6 py-10 md:px-10 md:py-14">
        <div className="mx-auto max-w-4xl rounded-3xl border border-border/70 bg-white p-6 shadow-sm md:p-10">
          <div className="space-y-10">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-2xl font-bold tracking-tight text-black">{section.title}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="mt-4 text-sm leading-7 text-muted-foreground md:text-[15px]">
                    {paragraph}
                  </p>
                ))}
                {section.items ? (
                  <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground md:text-[15px]">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}

            <section>
              <h2 className="text-2xl font-bold tracking-tight text-black">7. Contact Us</h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground md:text-[15px]">
                If you have any questions, concerns, or requests regarding this Privacy Policy or
                how we handle your data, please contact us at:
              </p>
              <div className="mt-4 space-y-2 text-sm leading-7 text-muted-foreground md:text-[15px]">
                <p>
                  Email:{" "}
                  <a
                    href="mailto:librarynearme.co.in@gmail.com"
                    className="font-medium text-primary hover:underline"
                  >
                    librarynearme.co.in@gmail.com
                  </a>
                </p>
                <p>
                  Website:{" "}
                  <a
                    href="https://librarynear.com"
                    className="font-medium text-primary hover:underline"
                  >
                    https://librarynear.com
                  </a>
                </p>
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}

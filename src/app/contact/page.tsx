import { getSiteUrl } from "@/lib/site-url";
import { Mail, MapPin, Phone } from "lucide-react";

export const metadata = {
  alternates: { canonical: `${getSiteUrl()}/contact` },
  title: "Contact",
  description: "Get in touch with LibraryNear.",
};

export default function ContactPage() {
  return (
    <div className="bg-slate-50/40">
      <section className="border-b border-border/60 bg-white">
        <div className="container mx-auto px-6 py-14 md:px-10 md:py-18">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-black md:text-5xl">
              Contact LibraryNear
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              Reach out if you want to list your library, report incorrect information, or collaborate with us.
            </p>
          </div>
        </div>
      </section>

      <section className="container mx-auto grid gap-6 px-6 py-12 md:grid-cols-3 md:px-10">
        <a
          href="tel:+918796190507"
          className="rounded-3xl border border-border bg-white p-6 shadow-sm transition-colors hover:bg-muted/30"
        >
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Phone className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-bold text-black">Phone</h2>
          <p className="mt-2 text-sm text-muted-foreground">Call us for quick owner onboarding support.</p>
          <p className="mt-4 text-sm font-semibold text-black">8796190507</p>
        </a>

        <a
          href="mailto:librarynear.com@gmail.com"
          className="rounded-3xl border border-border bg-white p-6 shadow-sm transition-colors hover:bg-muted/30"
        >
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Mail className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-bold text-black">Email</h2>
          <p className="mt-2 text-sm text-muted-foreground">Send details, corrections, or partnership queries.</p>
          <p className="mt-4 text-sm font-semibold text-black">librarynear.com@gmail.com</p>
        </a>

        <a
          href="https://www.google.com/maps/search/?api=1&query=DTU+IIF+AB-4+Shahbad+Rohini+Delhi+110042"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-3xl border border-border bg-white p-6 shadow-sm transition-colors hover:bg-muted/30"
        >
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MapPin className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-bold text-black">Address</h2>
          <p className="mt-2 text-sm text-muted-foreground">Visit or open directions in Google Maps.</p>
          <p className="mt-4 text-sm font-semibold text-black">
            DTU IIF AB-4, Shahbad,
            <br />
            Rohini, Delhi, 110042
          </p>
        </a>
      </section>
    </div>
  );
}

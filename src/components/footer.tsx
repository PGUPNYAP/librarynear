import Link from "next/link";
import Image from "next/image";
import { MapPin, Phone, Mail } from "lucide-react";

const socialLinks = [
  { label: "YouTube", href: "https://youtube.com/@librarynear?si=YMZlHbfRVbL0MP7e" },
  { label: "Twitter", href: "https://x.com/Librarynear_com" },
  { label: "Instagram", href: "https://www.instagram.com/librarynear.com1/" },
] as const;

function SocialIcon({ label }: { label: (typeof socialLinks)[number]["label"] }) {
  if (label === "YouTube") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    );
  }

  if (label === "Twitter") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-[14px] w-[14px]">
        <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="w-full bg-white mt-auto py-8">
      <div className="container mx-auto px-6 md:px-10">
        <div className="w-full rounded-3xl border border-border/80 bg-white pt-10 pb-6 px-8 md:px-12 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-12">
            <div className="col-span-1 md:col-span-5">
              <Link href="/" className="inline-block group mb-5">
                <Image
                  src="/logo.webp"
                  alt="LibraryNear Logo"
                  width={240}
                  height={40}
                  className="h-9 md:h-10 w-auto object-contain"
                />
              </Link>
              <p className="text-[13px] text-muted-foreground leading-relaxed max-w-[320px]">
                Find, compare, and shortlist study libraries near you. We help students discover reliable spaces and help owners reach the right audience.
              </p>
            </div>

            <div className="col-span-1 md:col-span-3">
              <h3 className="font-bold text-black mb-5 text-[15px]">Menu</h3>
              <ul className="space-y-4">
                <li><Link href="/about" className="text-[13px] text-muted-foreground hover:text-primary transition-colors">About</Link></li>
                <li><Link href="/blog" className="text-[13px] text-muted-foreground hover:text-primary transition-colors">Blog</Link></li>
                <li><Link href="/directory" className="text-[13px] text-muted-foreground hover:text-primary transition-colors">Directory</Link></li>
                <li><Link href="/profile" className="text-[13px] text-muted-foreground hover:text-primary transition-colors">Profile</Link></li>
                <li><Link href="/for-owners" className="text-[13px] text-muted-foreground hover:text-primary transition-colors">List Your Library</Link></li>
                <li><Link href="/saved" className="text-[13px] text-muted-foreground hover:text-primary transition-colors">Favourites</Link></li>
                <li><Link href="/cities" className="text-[13px] text-muted-foreground hover:text-primary transition-colors">Libraries by city</Link></li>
                <li><Link href="/study-room" className="text-[13px] text-muted-foreground hover:text-primary transition-colors">Online study room</Link></li>
                <li><Link href="/guides/moving-to" className="text-[13px] text-muted-foreground hover:text-primary transition-colors">Moving for exam prep</Link></li>
                <li><Link href="/editorial-policy" className="text-[13px] text-muted-foreground hover:text-primary transition-colors">Editorial policy</Link></li>
                <li><Link href="/privacy" className="text-[13px] text-muted-foreground hover:text-primary transition-colors">Privacy Policy</Link></li>
                <li><Link href="/contact" className="text-[13px] text-muted-foreground hover:text-primary transition-colors">Contact</Link></li>
              </ul>
            </div>

            <div className="col-span-1 md:col-span-4">
              <h3 className="font-bold text-black mb-5 text-[15px]">Contact Us</h3>
              <ul className="space-y-4">
                <li className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={2} />
                  <a href="tel:+918796190507" className="text-[13px] text-muted-foreground hover:text-primary transition-colors">
                    8796190507
                  </a>
                </li>
                <li className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-[2px] shrink-0" strokeWidth={2} />
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=DTU+IIF+AB-4+Shahbad+Rohini+Delhi+110042"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] text-muted-foreground leading-relaxed hover:text-primary transition-colors"
                  >
                    DTU IIF AB-4, Shahbad,<br />Rohini, Delhi, 110042
                  </a>
                </li>
                <li className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={2} />
                  <a href="mailto:librarynear.com@gmail.com" className="text-[13px] text-muted-foreground hover:text-primary transition-colors">
                    librarynear.com@gmail.com
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between border-t border-border pt-6">
            <p className="text-[12px] text-muted-foreground text-center md:text-left mb-4 md:mb-0 max-w-lg">
              ©2026 LibraryNear. Explore study spaces, save your shortlist, and connect students with trusted libraries.
              <span className="mt-1 block text-[11px]">
                Place and station data ©{" "}
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
                  OpenStreetMap contributors
                </a>
                .
              </span>
            </p>
            <div className="flex items-center gap-3">
              {socialLinks.map(({ label, href }) =>
                href ? (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="h-[30px] w-[30px] rounded bg-primary/10 flex items-center justify-center text-primary/80 hover:bg-primary/20 transition-colors"
                  >
                    <SocialIcon label={label} />
                  </a>
                ) : (
                  <span
                    key={label}
                    title={`${label} link not added yet`}
                    aria-label={`${label} link not added yet`}
                    className="h-[30px] w-[30px] rounded bg-slate-100 flex items-center justify-center text-muted-foreground/60 cursor-not-allowed"
                  >
                    <SocialIcon label={label} />
                  </span>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

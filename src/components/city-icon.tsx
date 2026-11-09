/**
 * Line-art landmark for a city (stroke = currentColor, 24x24 grid).
 * Known metros get their landmark; every other city gets a generic skyline.
 */

type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Delhi: India Gate */
function IndiaGate({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 21h18" />
      <path d="M5 21V8h14v13" />
      <path d="M9.5 21v-6a2.5 2.5 0 0 1 5 0v6" />
      <path d="M4 8h16" />
      <path d="M6 8V6h12v2" />
      <path d="M9 6V4.5h6V6" />
      <path d="M10.5 4.5c0-1 .7-1.5 1.5-1.5s1.5.5 1.5 1.5" />
    </svg>
  );
}

/** Mumbai: Gateway of India */
function GatewayOfIndia({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M2 21h20" />
      <path d="M4 21V9h16v12" />
      <path d="M9 21v-5a3 3 0 0 1 6 0v5" />
      <path d="M4 9V7h3v2M17 9V7h3v2" />
      <path d="M5.5 7V5.5M18.5 7V5.5" />
      <path d="M8 9V7.5h8V9" />
      <path d="M5.5 13h1M17.5 13h1" />
    </svg>
  );
}

/** Hyderabad: Charminar */
function Charminar({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 21h18" />
      <path d="M4.5 21V7M19.5 21V7" />
      <path d="M4.5 7 4 5h1l-.5 2M19.5 7 19 5h1l-.5 2" />
      <path d="M4.5 10h15" />
      <path d="M9 21v-5a3 3 0 0 1 6 0v5" />
      <path d="M7 10V8.5h10V10" />
      <path d="M10 8.5c0-1.2.9-2 2-2s2 .8 2 2" />
      <path d="M4.5 14h2M17.5 14h2" />
    </svg>
  );
}

/** Kolkata: Howrah Bridge */
function HowrahBridge({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M2 16h20" />
      <path d="M2 19c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1" />
      <path d="M6 16V6M18 16V6" />
      <path d="M5 6h2M17 6h2" />
      <path d="M6 7c2 4 10 4 12 0" />
      <path d="M2 11c1.5 0 3-1.5 4-4M22 11c-1.5 0-3-1.5-4-4" />
      <path d="M9 16v-6.2M12 16v-5.4M15 16v-6.2" />
    </svg>
  );
}

/** Chennai: temple gopuram */
function Gopuram({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 21h18" />
      <path d="M5 21 7 7h10l2 14" />
      <path d="M6.3 16h11.4M6.9 12h10.2" />
      <path d="M8 7 9 4h6l1 3" />
      <path d="M10 4V2.8M12 4V2.2M14 4V2.8" />
      <path d="M10.5 21v-3a1.5 1.5 0 0 1 3 0v3" />
    </svg>
  );
}

/** Bengaluru: Vidhana Soudha */
function VidhanaSoudha({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M2 21h20" />
      <path d="M3 21v-8h18v8" />
      <path d="M7 13v8M10 13v8M14 13v8M17 13v8" />
      <path d="M8 13v-2h8v2" />
      <path d="M8.5 11a3.5 3.5 0 0 1 7 0" />
      <path d="M12 7.5V6" />
      <path d="M3 13l1-1.5h16l1 1.5" />
    </svg>
  );
}

/** Any other city: skyline */
function Skyline({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M2 21h20" />
      <path d="M4 21V11h4v10" />
      <path d="M8 21V5h5v16" />
      <path d="M13 21v-8h4v8" />
      <path d="M17 21V9h3v12" />
      <path d="M10 8h1M10 11h1M10 14h1M10 17h1" />
      <path d="M5.5 14h1M5.5 17h1M15 16h0M18.5 12v0" />
    </svg>
  );
}

const ICONS: Record<string, (props: IconProps) => React.JSX.Element> = {
  delhi: IndiaGate,
  "new-delhi": IndiaGate,
  mumbai: GatewayOfIndia,
  hyderabad: Charminar,
  kolkata: HowrahBridge,
  chennai: Gopuram,
  bengaluru: VidhanaSoudha,
  bangalore: VidhanaSoudha,
};

export function CityIcon({ slug, className = "h-5 w-5" }: { slug: string; className?: string }) {
  const Icon = ICONS[slug.toLowerCase()] ?? Skyline;
  return <Icon className={className} />;
}

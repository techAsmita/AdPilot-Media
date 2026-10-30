// Small brand marks (lucide no longer ships brand icons).
type P = { size?: number; className?: string };
const s = (size = 16) => ({ width: size, height: size, viewBox: "0 0 24 24" });

export const LinkedInIcon = ({ size, className }: P) => (
  <svg {...s(size)} className={className} fill="currentColor" aria-hidden>
    <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3.3 6.8H5v8.6h2.3V9.8ZM6.2 5.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Zm12.8 7.5c0-2.3-1.2-3.5-3-3.5-1.3 0-2 .7-2.3 1.2V9.8h-2.3v8.6h2.3v-4.6c0-1.1.4-1.9 1.4-1.9.9 0 1.5.7 1.5 1.9v4.6H19v-5.3Z" />
  </svg>
);
export const XIcon = ({ size, className }: P) => (
  <svg {...s(size)} className={className} fill="currentColor" aria-hidden>
    <path d="M17.7 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8L17.7 3Zm-1.1 16.2h1.7L7.3 4.7H5.5l11.1 14.5Z" />
  </svg>
);
export const InstagramIcon = ({ size, className }: P) => (
  <svg {...s(size)} className={className} fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4.2" />
    <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
  </svg>
);
export const MetaIcon = ({ size, className }: P) => (
  <svg {...s(size)} className={className} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden>
    <path d="M3 15.5c0-4.5 2-8 4.3-8 3.4 0 5.6 9 9.4 9 1.8 0 3.3-1.6 3.3-4.6 0-3.4-1.8-5.4-3.8-5.4-3.2 0-5.4 9.5-9 9.5C4.6 16 3 15.9 3 15.5Z" />
  </svg>
);
export const GoogleAdsIcon = ({ size, className }: P) => (
  <svg {...s(size)} className={className} aria-hidden>
    <path d="M9.6 3.8a3 3 0 0 1 4.1 1.1l6.9 12a3 3 0 1 1-5.2 3l-6.9-12a3 3 0 0 1 1.1-4.1Z" fill="currentColor" />
    <circle cx="5.6" cy="18.4" r="3" fill="currentColor" opacity=".55" />
  </svg>
);
export const LogoMark = ({ size = 26, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
    <path d="M16 1.5c1 7.8 6.7 13.5 14.5 14.5C22.7 17 17 22.7 16 30.5 15 22.7 9.3 17 1.5 16 9.3 15 15 9.3 16 1.5Z" fill="var(--accent)" />
    <path d="M25.5 3.5c.3 2.3 1.9 3.9 4.2 4.2-2.3.3-3.9 1.9-4.2 4.2-.3-2.3-1.9-3.9-4.2-4.2 2.3-.3 3.9-1.9 4.2-4.2Z" fill="var(--accent)" opacity=".55" />
  </svg>
);

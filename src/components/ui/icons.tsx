import type { SVGProps } from 'react';

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const MenuIcon = (p: P) => <Icon {...p}><path d="M3 6h18M3 12h18M3 18h18" /></Icon>;
export const BackIcon = (p: P) => <Icon {...p}><path d="M15 5l-7 7 7 7" /></Icon>;
export const CloseIcon = (p: P) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const HeartIcon = (p: P) => (
  <Icon {...p}><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" /></Icon>
);
export const ShareIcon = (p: P) => (
  <Icon {...p}><path d="M12 15V3.5M7.5 7.5 12 3l4.5 4.500M5 11.500v8h14v-8" /></Icon>
);
export const NodesIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="6" cy="12" r="2.2" /><circle cx="17.5" cy="6" r="2.2" /><circle cx="17.5" cy="18" r="2.2" />
    <path d="M8 11l7.5-4M8 13l7.5 4" />
  </Icon>
);
export const MouseIcon = (p: P) => (
  <Icon {...p}>
    <rect x="7.5" y="3" width="9" height="18" rx="4.5" />
    <path className="scroll-hint-wheel" d="M12 7v3.5" />
  </Icon>
);
export const SunIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.500v2M12 19.500v2M2.5 12h2M19.5 12h2M5.3 5.300l1.4 1.400M17.3 17.300l1.4 1.400M5.3 18.700l1.4-1.400M17.3 6.700l1.4-1.4" />
  </Icon>
);
export const MoonIcon = (p: P) => <Icon {...p}><path d="M20 14.500A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.500z" /></Icon>;

export function Logo({ className }: { className?: string }) {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" className={className} aria-hidden>
      <path d="M5 35V15L20 4l15 11v20" />
      <path d="M14 35V21l6-4.5 6 4.500v14" />
      <path d="M5 35l9-7M26 28l9 7" />
    </svg>
  );
}

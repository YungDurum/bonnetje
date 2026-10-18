import type { ReactNode } from "react";

function Icon({ size, stroke = 2, children }: { size: number; stroke?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none" }}
    >
      {children}
    </svg>
  );
}

export const BackIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size} stroke={2.2}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);
export const ChevronRight = ({ size = 16 }: { size?: number }) => (
  <Icon size={size} stroke={2.2}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);
export const ChevronDown = ({ size = 16 }: { size?: number }) => (
  <Icon size={size} stroke={2.2}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);
export const PlusIcon = ({ size = 14 }: { size?: number }) => (
  <Icon size={size} stroke={2.4}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const PinIcon = () => (
  <Icon size={14}>
    <path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" />
    <circle cx="12" cy="10" r="2.5" />
  </Icon>
);
export const CheckIcon = ({ size = 15 }: { size?: number }) => (
  <Icon size={size} stroke={2.6}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);
export const TruckIcon = () => (
  <Icon size={19}>
    <path d="M2 7h12v9H2zM14 10h4l3 3v3h-7z" />
    <circle cx="6" cy="18" r="1.8" />
    <circle cx="17" cy="18" r="1.8" />
  </Icon>
);
export const ChartIcon = () => (
  <Icon size={19}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Icon>
);
export const InvoiceIcon = () => (
  <Icon size={20}>
    <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Icon>
);
export const CircleCheckIcon = () => (
  <Icon size={20} stroke={2.4}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l2.8 2.8L16.5 9.5" />
  </Icon>
);
export const CameraIcon = ({ size = 26 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </Icon>
);
export const ImageIcon = () => (
  <Icon size={26}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="M21 16l-5-5-9 9" />
  </Icon>
);
export const FileIcon = () => (
  <Icon size={26}>
    <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
    <path d="M14 3v5h5M8.5 13h7M8.5 17h5" />
  </Icon>
);
export const ListIcon = () => (
  <Icon size={20} stroke={2.2}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </Icon>
);
export const CloseIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size} stroke={2.2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="url(#texpro-logo-bg)" />
      <rect x="0.6" y="0.6" width="30.8" height="30.8" rx="7.4" stroke="#FFD9C6" strokeOpacity="0.18" strokeWidth="0.5" />
      <path d="M7.4 9.2c0-1.2.9-2.1 2.1-2.1h13c1.2 0 2.1.9 2.1 2.1v.2c0 1.2-.9 2.1-2.1 2.1h-13c-1.2 0-2.1-.9-2.1-2.1v-.2Z" fill="#FFF7EE" />
      <path d="M13.95 11.5c0-.9.7-1.6 1.6-1.6h.9c.9 0 1.6.7 1.6 1.6v12.1c0 .9-.7 1.6-1.6 1.6h-.9c-.9 0-1.6-.7-1.6-1.6V11.5Z" fill="#FFF7EE" />
      <path d="M20.2 16.6c.7-.7 1.8-.7 2.5 0l3 3c.7.7.7 1.8 0 2.5l-3 3c-.7.7-1.8.7-2.5 0-.7-.7-.7-1.8 0-2.5l1.8-1.8-1.8-1.8c-.7-.7-.7-1.8 0-2.4Z" fill="#FFD4BE" />
      <circle cx="25.4" cy="8.3" r="0.9" fill="#FFD4BE" fillOpacity="0.9" />
      <defs>
        <linearGradient id="texpro-logo-bg" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E1845F" />
          <stop offset="0.48" stopColor="#BC4F30" />
          <stop offset="1" stopColor="#7C2B18" />
        </linearGradient>
      </defs>
    </svg>
  );
}

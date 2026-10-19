import { cn } from 'cn'

/** Tanda Kashiru (mur segi enam) dalam warna aksen, sama dengan public/logo.svg. */
export function KashiruMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn('size-6 text-brand', className)}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
        d="M32 6 L54.5 19 L54.5 45 L32 58 L9.5 45 L9.5 19 Z M32 21.5 A10.5 10.5 0 1 0 32 42.5 A10.5 10.5 0 1 0 32 21.5 Z"
      />
    </svg>
  )
}

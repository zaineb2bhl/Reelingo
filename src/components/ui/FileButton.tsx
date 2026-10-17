import { useRef, type ReactNode } from 'react';

interface FileButtonProps {
  accept: string;
  onFile: (file: File) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

/** A styled button that opens the native file picker. */
export function FileButton({ accept, onFile, children, className, disabled }: FileButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={
          className ??
          'flex items-center gap-2 rounded-xl border border-ink/12 bg-white px-3.5 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-ink/25 disabled:opacity-50'
        }
      >
        {children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
    </>
  );
}

export const UploadIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 20h14" />
  </svg>
);

interface FolderGlyphProps {
  open?: boolean
  size?: number
  className?: string
}

export function FolderGlyph({
  open = false,
  size = 18,
  className = ''
}: FolderGlyphProps): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      data-testid={open ? 'folder-icon-open' : 'folder-icon-closed'}
      viewBox="0 0 20 16"
      width={size}
      height={Math.round(size * 0.8)}
      className={['flex-none overflow-visible', className].filter(Boolean).join(' ')}
      fill="none"
    >
      {open ? (
        <>
          <path
            d="M2.75 6.4V4.25c0-1 .72-1.7 1.72-1.7h4.05l1.48 1.8h5.6c1 0 1.68.68 1.68 1.68v1.02"
            fill="var(--folder-open-back)"
            stroke="var(--folder-stroke)"
            strokeWidth="1.15"
            strokeLinejoin="round"
          />
          <path
            d="M3.7 6.35h12.95c.9 0 1.46.7 1.28 1.58l-.92 4.45c-.2.95-.93 1.57-1.9 1.57H4.7c-.98 0-1.7-.62-1.9-1.57l-.78-3.78c-.27-1.28.38-2.25 1.68-2.25Z"
            fill="var(--folder-open-front)"
            stroke="var(--folder-stroke)"
            strokeWidth="1.15"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <path
          d="M2.75 5.05c0-1 .72-1.7 1.72-1.7h3.92l1.5 1.8h5.72c1 0 1.7.7 1.7 1.7v5.15c0 1-.7 1.7-1.7 1.7H4.45c-1 0-1.7-.7-1.7-1.7V5.05Z"
          fill="var(--folder-closed-fill)"
          stroke="var(--folder-stroke)"
          strokeWidth="1.15"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

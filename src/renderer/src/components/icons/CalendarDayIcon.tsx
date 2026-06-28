interface CalendarDayIconProps {
  day: number
  className?: string
}

export function CalendarDayIcon({ day, className = '' }: CalendarDayIconProps): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      width={18}
      height={18}
      className={['flex-none overflow-visible', className].filter(Boolean).join(' ')}
      fill="none"
    >
      <rect
        x="3.2"
        y="4.2"
        width="13.6"
        height="12.4"
        rx="3"
        fill="var(--calendar-icon-fill)"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path d="M6.5 2.9v3.1M13.5 2.9v3.1M3.6 7.6h12.8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <text
        x="10"
        y="13.7"
        textAnchor="middle"
        className="fill-current font-[family-name:var(--mono)] text-[7px] font-semibold tabular-nums"
      >
        {day}
      </text>
    </svg>
  )
}

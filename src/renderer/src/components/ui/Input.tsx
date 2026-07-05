import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'h-8 w-full rounded-[var(--radius-control)] border border-[color:var(--border)] bg-[color:var(--bg-elev)] px-2.5 text-[13px] text-[color:var(--text)] placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent-line)] focus:outline-none',
          className
        )}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'

import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes } from 'react'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] text-[13px] font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--accent-line)]',
  {
    variants: {
      variant: {
        primary: 'bg-[color:var(--accent)] text-[color:var(--accent-ink)] hover:opacity-90',
        ghost: 'text-[color:var(--text)] hover:bg-[color:var(--bg-hover)]',
        danger: 'bg-[color:var(--red)] text-[color:var(--accent-ink)] hover:opacity-90'
      },
      size: {
        sm: 'h-7 px-2.5',
        md: 'h-8 px-3'
      }
    },
    defaultVariants: { variant: 'ghost', size: 'md' }
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps): JSX.Element {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

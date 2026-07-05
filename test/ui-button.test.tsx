// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Button } from '@/components/ui/Button'

describe('Button', () => {
  it('默认渲染 ghost variant（含 --text 和 --bg-hover）', () => {
    const { container } = render(<Button>click</Button>)
    const btn = container.querySelector('button')!
    expect(btn.className).toMatch(/var\(--text\)/)
    expect(btn.className).toMatch(/var\(--bg-hover\)/)
  })

  it('primary variant 含 bg-[color:var(--accent)]', () => {
    const { container } = render(<Button variant="primary">click</Button>)
    const btn = container.querySelector('button')!
    expect(btn.className).toMatch(/var\(--accent\)/)
  })

  it('danger variant 含 var(--red)', () => {
    const { container } = render(<Button variant="danger">click</Button>)
    const btn = container.querySelector('button')!
    expect(btn.className).toMatch(/var\(--red\)/)
  })

  it('size sm 含 h-7', () => {
    const { container } = render(<Button size="sm">click</Button>)
    const btn = container.querySelector('button')!
    expect(btn.className).toMatch(/h-7/)
  })

  it('size md 含 h-8', () => {
    const { container } = render(<Button size="md">click</Button>)
    const btn = container.querySelector('button')!
    expect(btn.className).toMatch(/h-8/)
  })

  it('disabled 属性生效', () => {
    const { container } = render(<Button disabled>click</Button>)
    const btn = container.querySelector('button')!
    expect(btn.disabled).toBe(true)
  })

  it('className 合并到基础类', () => {
    const { container } = render(<Button className="custom-class">click</Button>)
    const btn = container.querySelector('button')!
    expect(btn.className).toMatch(/custom-class/)
  })
})

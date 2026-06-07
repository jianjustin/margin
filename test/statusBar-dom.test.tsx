// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { StatusBar } from '@/components/StatusBar'
import { computeStats } from '@/lib/computeStats'

afterEach(cleanup)

describe('StatusBar', () => {
  it('renders counts as separate items', () => {
    const stats = computeStats('你好 hello world')
    render(<StatusBar stats={stats} saveStatus="saved" hasFile />)
    expect(screen.getByText(/2 字符/)).toBeTruthy()
    expect(screen.getByText(/4 词/)).toBeTruthy()
    expect(screen.getByText(/约 \d+ 分钟/)).toBeTruthy()
  })

  it('shows context label and save status when a file is open', () => {
    const stats = computeStats('x')
    render(<StatusBar stats={stats} saveStatus="saving" hasFile />)
    expect(screen.getByText('正文')).toBeTruthy()
    expect(screen.getByText('保存中…')).toBeTruthy()
  })

  it('hides context label and save status when no file is open', () => {
    const stats = computeStats('')
    render(<StatusBar stats={stats} saveStatus="saved" hasFile={false} />)
    expect(screen.queryByText('正文')).toBeNull()
    expect(screen.queryByText('已保存')).toBeNull()
  })
})

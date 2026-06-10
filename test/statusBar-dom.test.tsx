// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { StatusBar } from '@/components/StatusBar'
import { useDocumentStore, type SaveStatus } from '@/stores/documentStore'

afterEach(cleanup)

// StatusBar now subscribes to the document store directly (decoupled from App so
// keystrokes don't re-render the file tree). Drive it via store state.
function seed(content: string, saveStatus: SaveStatus): void {
  useDocumentStore.setState({ content, savedContent: content, saveStatus })
}

describe('StatusBar', () => {
  it('renders counts as separate items', () => {
    seed('你好 hello world', 'saved')
    render(<StatusBar hasFile />)
    expect(screen.getByText(/2 字符/)).toBeTruthy()
    expect(screen.getByText(/4 词/)).toBeTruthy()
    expect(screen.getByText(/约 \d+ 分钟/)).toBeTruthy()
  })

  it('shows context label and save status when a file is open', () => {
    seed('x', 'saving')
    render(<StatusBar hasFile />)
    expect(screen.getByText('正文')).toBeTruthy()
    expect(screen.getByText('保存中…')).toBeTruthy()
  })

  it('hides context label and save status when no file is open', () => {
    seed('', 'saved')
    render(<StatusBar hasFile={false} />)
    expect(screen.queryByText('正文')).toBeNull()
    expect(screen.queryByText('已保存')).toBeNull()
  })
})

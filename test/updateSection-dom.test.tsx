// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { UpdateSection } from '@/components/UpdateSection'
import type { UpdateStatus } from '../src/shared/ipc'

afterEach(cleanup)

function renderSection(status: UpdateStatus, overrides?: Partial<Parameters<typeof UpdateSection>[0]>): void {
  render(
    <UpdateSection
      status={status}
      busy={status.state === 'checking' || status.state === 'downloading' || status.state === 'installing'}
      onCheck={() => Promise.resolve()}
      onInstall={() => Promise.resolve()}
      {...overrides}
    />
  )
}

describe('UpdateSection', () => {
  it('shows current version and check action in idle state', () => {
    const onCheck = vi.fn()
    renderSection({ state: 'idle', currentVersion: '2.0.0' }, { onCheck })

    expect(screen.getByText('版本 2.0.0')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '检查更新' }))
    expect(onCheck).toHaveBeenCalledOnce()
  })

  it('shows checking state', () => {
    renderSection({ state: 'checking', currentVersion: '2.0.0' })

    const button = screen.getByRole<HTMLButtonElement>('button', { name: '正在检查…' })
    expect(button.disabled).toBe(true)
  })

  it('shows not available state', () => {
    renderSection({ state: 'not-available', currentVersion: '2.0.0' })

    expect(screen.getByText('已是最新版本')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重新检查' })).toBeTruthy()
  })

  it('shows available update with install action and notes', () => {
    const onInstall = vi.fn()
    renderSection(
      {
        state: 'available',
        currentVersion: '2.0.0',
        version: '2.1.0',
        body: 'Release notes'
      },
      { onInstall }
    )

    expect(screen.getByText('发现新版本 2.1.0')).toBeTruthy()
    expect(screen.getByText('Release notes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '更新并重启' }))
    expect(onInstall).toHaveBeenCalledOnce()
  })

  it('shows download progress', () => {
    renderSection({
      state: 'downloading',
      currentVersion: '2.0.0',
      version: '2.1.0',
      downloadedBytes: 50,
      contentLength: 100,
      percent: 50
    })

    expect(screen.getByText('正在下载 50%')).toBeTruthy()
  })

  it('shows errors and retry action', () => {
    const onCheck = vi.fn()
    renderSection(
      {
        state: 'error',
        currentVersion: '2.0.0',
        message: 'network fail'
      },
      { onCheck }
    )

    expect(screen.getByText('network fail')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重新检查' }))
    expect(onCheck).toHaveBeenCalledOnce()
  })
})

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { UpdateStatus } from '../../../shared/ipc'

interface UseUpdaterResult {
  status: UpdateStatus
  check: () => Promise<void>
  install: () => Promise<void>
  busy: boolean
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function currentVersionOf(status: UpdateStatus): string {
  return status.currentVersion
}

function isBusyState(status: UpdateStatus): boolean {
  return status.state === 'checking' || status.state === 'downloading' || status.state === 'installing'
}

export function useUpdater(): UseUpdaterResult {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle', currentVersion: '' })
  const statusRef = useRef(status)
  const checkInFlightRef = useRef(false)

  const updateStatus = useCallback((nextStatus: UpdateStatus | ((current: UpdateStatus) => UpdateStatus)): void => {
    if (typeof nextStatus === 'function') {
      setStatus((current) => {
        const resolvedStatus = nextStatus(current)
        statusRef.current = resolvedStatus
        return resolvedStatus
      })
      return
    }
    statusRef.current = nextStatus
    setStatus(nextStatus)
  }, [])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    let cancelled = false
    void api.getCurrentVersion()
      .then((version) => {
        if (!cancelled) {
          updateStatus((current) => {
            if (current.state === 'idle' && current.currentVersion === '') {
              return { state: 'idle', currentVersion: version }
            }
            if (current.currentVersion === '') {
              return { ...current, currentVersion: version }
            }
            return current
          })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          updateStatus((current) => {
            if (current.state !== 'idle' || current.currentVersion !== '') return current
            return {
              state: 'error',
              currentVersion: '',
              message: errorMessage(error)
            }
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [updateStatus])

  const check = useCallback(async (): Promise<void> => {
    if (checkInFlightRef.current || isBusyState(statusRef.current)) {
      return
    }
    checkInFlightRef.current = true
    let current = currentVersionOf(statusRef.current)
    updateStatus({ state: 'checking', currentVersion: current })
    try {
      if (!current) {
        try {
          current = await api.getCurrentVersion()
          updateStatus({ state: 'checking', currentVersion: current })
        } catch {
          current = ''
        }
      }
      const result = await api.checkUpdate()
      if (!result.available) {
        updateStatus({ state: 'not-available', currentVersion: result.currentVersion })
        return
      }
      updateStatus({
        state: 'available',
        currentVersion: result.currentVersion,
        version: result.version,
        date: result.date,
        body: result.body
      })
    } catch (error) {
      updateStatus({
        state: 'error',
        currentVersion: current,
        message: errorMessage(error)
      })
    } finally {
      checkInFlightRef.current = false
    }
  }, [updateStatus])

  const install = useCallback(async (): Promise<void> => {
    const initial = statusRef.current
    if (initial.state !== 'available') return

    let downloadedBytes = 0
    let contentLength: number | undefined

    try {
      updateStatus({
        state: 'downloading',
        currentVersion: initial.currentVersion,
        version: initial.version,
        downloadedBytes
      })

      await api.downloadAndInstallUpdate((progress) => {
        if (progress.event === 'Started') {
          contentLength = progress.contentLength
          downloadedBytes = 0
        } else if (progress.event === 'Progress') {
          downloadedBytes += progress.chunkLength
        } else {
          updateStatus({
            state: 'installing',
            currentVersion: initial.currentVersion,
            version: initial.version
          })
          return
        }

        updateStatus({
          state: 'downloading',
          currentVersion: initial.currentVersion,
          version: initial.version,
          downloadedBytes,
          contentLength,
          percent: contentLength
            ? Math.min(100, Math.round((downloadedBytes / contentLength) * 100))
            : undefined
        })
      })

      updateStatus({
        state: 'installing',
        currentVersion: initial.currentVersion,
        version: initial.version
      })
    } catch (error) {
      updateStatus({
        state: 'error',
        currentVersion: initial.currentVersion,
        message: errorMessage(error)
      })
      return
    }

    try {
      await api.relaunch()
    } catch {
      updateStatus({
        state: 'error',
        currentVersion: initial.currentVersion,
        message: '更新已安装，但无法自动重启。请手动重启 Margin。'
      })
    }
  }, [updateStatus])

  const busy = isBusyState(status)

  return useMemo(() => ({ status, check, install, busy }), [status, check, install, busy])
}

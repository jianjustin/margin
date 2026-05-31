/// <reference types="vite/client" />
import type { MarginApi } from '../../shared/ipc'

declare global {
  interface Window {
    margin: MarginApi
  }
}

export {}

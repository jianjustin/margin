import { contextBridge } from 'electron'

// The real API surface is added in M1 (Task 14).
contextBridge.exposeInMainWorld('margin', {})

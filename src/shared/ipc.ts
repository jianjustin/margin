export const IPC = {
  dialogOpenFile: 'dialog:openFile',
  fileRead: 'file:read',
  fileWrite: 'file:write'
} as const

export interface MarginApi {
  /** Show an open dialog; returns the chosen .md path, or null if cancelled. */
  openFile(): Promise<string | null>
  /** Read a UTF-8 file and return its contents. */
  readFile(path: string): Promise<string>
  /** Write UTF-8 content to a file. */
  writeFile(path: string, content: string): Promise<void>
}

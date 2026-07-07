export function fileExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function isMarkdownFile(name: string): boolean {
  return ['md', 'mdx', 'markdown'].includes(fileExt(name))
}

export function isImagePath(path: string): boolean {
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'].includes(fileExt(path))
}

/** Image + common video/audio types that should be imported as vault assets. */
export function isDroppableAsset(path: string): boolean {
  const ext = fileExt(path)
  return [
    // images
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp',
    // video
    'mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v',
    // audio
    'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'
  ].includes(ext)
}

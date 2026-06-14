export function fileExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function isMarkdownFile(name: string): boolean {
  return ['md', 'mdx', 'markdown'].includes(fileExt(name))
}

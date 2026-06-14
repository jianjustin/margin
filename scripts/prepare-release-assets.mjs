#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))

const args = new Map()
for (const arg of process.argv.slice(2)) {
  const [key, value] = arg.split('=')
  if (!key.startsWith('--') || !value) continue
  args.set(key.slice(2), value)
}

const version = args.get('version') ?? packageJson.version
const repo = args.get('repo') ?? 'jianjustin/margin'
const arch = args.get('arch') ?? (process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : process.arch)
const tauriArch = arch === 'arm64' ? 'aarch64' : arch
const platform = arch === 'arm64' ? 'darwin-aarch64' : arch === 'x64' ? 'darwin-x86_64' : `darwin-${arch}`
const pubDate = args.get('pub-date') ?? new Date().toISOString()
const notes = args.get('notes') ?? `Margin ${version} release.`

const bundleDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle')
const sourceDmg = path.join(bundleDir, 'dmg', `Margin_${version}_${tauriArch}.dmg`)
const sourceUpdater = path.join(bundleDir, 'macos', 'Margin.app.tar.gz')
const sourceSig = `${sourceUpdater}.sig`
const outDir = path.join(root, 'dist', 'release', `v${version}`)

for (const file of [sourceDmg, sourceUpdater, sourceSig]) {
  if (!existsSync(file)) {
    throw new Error(`Missing release artifact: ${path.relative(root, file)}`)
  }
}

mkdirSync(outDir, { recursive: true })

const dmgName = `Margin-${version}-${arch}.dmg`
const dmgOut = path.join(outDir, dmgName)
const updaterOut = path.join(outDir, 'Margin.app.tar.gz')
const sigOut = path.join(outDir, 'Margin.app.tar.gz.sig')
const latestOut = path.join(outDir, 'latest.json')

copyFileSync(sourceDmg, dmgOut)
copyFileSync(sourceUpdater, updaterOut)
copyFileSync(sourceSig, sigOut)

const manifest = {
  version,
  notes,
  pub_date: pubDate,
  platforms: {
    [platform]: {
      signature: readFileSync(sourceSig, 'utf8').trim(),
      url: `https://github.com/${repo}/releases/download/v${version}/Margin.app.tar.gz`
    }
  }
}

writeFileSync(latestOut, `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`Prepared release assets in ${path.relative(root, outDir)}`)
console.log(`- ${dmgName}`)
console.log('- Margin.app.tar.gz')
console.log('- Margin.app.tar.gz.sig')
console.log('- latest.json')

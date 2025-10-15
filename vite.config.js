import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// 生成 public 目录下 PNG 清单，输出到 public/preset-pngs.json
function presetPngManifestPlugin() {
  let rootDir
  let publicDir

  const scanPngs = () => {
    const result = []
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) {
          walk(full)
        } else if (e.isFile() && /\.png$/i.test(e.name)) {
          const rel = path.relative(publicDir, full).replace(/\\/g, '/')
          result.push('/' + rel)
        }
      }
    }
    walk(publicDir)
    result.sort()
    return result
  }

  const writeManifest = () => {
    const images = scanPngs()
    const out = path.join(publicDir, 'preset-pngs.json')
    fs.writeFileSync(out, JSON.stringify(images, null, 2), 'utf-8')
    // 轻量日志，便于观察生效
    console.log(`[preset-pngs] ${images.length} png -> ${path.relative(rootDir, out)}`)
  }

  return {
    name: 'preset-pngs-manifest',
    configResolved(config) {
      rootDir = config.root
      publicDir = path.resolve(config.root, config.publicDir || 'public')
    },
    // 开发模式：启动时生成，并监听 public/**/*.png 的变动重新生成
    configureServer(server) {
      writeManifest()
      const glob = path.join(publicDir, '**/*.png')
      server.watcher.add(glob)
      const regenerate = (filePath) => {
        // 避免监听自己生成的JSON文件，防止无限循环
        if (filePath && filePath.endsWith('preset-pngs.json')) {
          return
        }
        writeManifest()
      }
      server.watcher.on('add', regenerate)
      server.watcher.on('unlink', regenerate)
      server.watcher.on('change', regenerate)
    },
    // 构建模式：在打包开始时生成一次，确保文件被复制到 dist
    buildStart() {
      writeManifest()
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), presetPngManifestPlugin()],
})

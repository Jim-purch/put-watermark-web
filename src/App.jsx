import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import './App.css'

function useObjectUrl(file) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!file) { setUrl(null); return }
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return url
}

async function loadImageFromFile(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    img.crossOrigin = 'anonymous'
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function loadImageFromUrl(url) {
  const img = new Image()
  img.src = url
  img.crossOrigin = 'anonymous'
  await img.decode()
  return img
}

async function loadImageFromSource(src) {
  if (!src) return null
  if (typeof src === 'string') return loadImageFromUrl(src)
  return loadImageFromFile(src)
}

function drawTextWatermark(ctx, opts) {
  const { width, height } = ctx.canvas
  const { text, fontFamily, fontSize, fontWeight, color, opacity, angle, tile, spacingX, spacingY, textShadow, shadowColor, shadowBlur } = opts
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
  if (textShadow) {
    ctx.shadowColor = shadowColor
    ctx.shadowBlur = shadowBlur
  }
  const rad = (angle * Math.PI) / 180
  if (tile) {
    const stepX = Math.max(spacingX, fontSize * 2)
    const stepY = Math.max(spacingY, fontSize * 2)
    for (let y = -stepY; y < height + stepY; y += stepY) {
      for (let x = -stepX; x < width + stepX; x += stepX) {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rad)
        ctx.fillText(text, 0, 0)
        ctx.restore()
      }
    }
  } else {
    ctx.save()
    ctx.translate(width / 2, height / 2)
    ctx.rotate(rad)
    ctx.fillText(text, 0, 0)
    ctx.restore()
  }
  ctx.restore()
}

async function drawImageWatermark(ctx, source, opts) {
  const { width, height } = ctx.canvas
  const { opacity, angle, tile, spacingX, spacingY, scale } = opts
  const wmImg = await loadImageFromSource(source)
  const w = Math.max(16, Math.round(wmImg.width * scale))
  const h = Math.max(16, Math.round(wmImg.height * scale))
  const rad = (angle * Math.PI) / 180
  ctx.save()
  ctx.globalAlpha = opacity
  if (tile) {
    const stepX = Math.max(spacingX, w + 40)
    const stepY = Math.max(spacingY, h + 40)
    for (let y = -stepY; y < height + stepY; y += stepY) {
      for (let x = -stepX; x < width + stepX; x += stepX) {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rad)
        ctx.drawImage(wmImg, -w / 2, -h / 2, w, h)
        ctx.restore()
      }
    }
  } else {
    ctx.save()
    ctx.translate(width / 2, height / 2)
    ctx.rotate(rad)
    ctx.drawImage(wmImg, -w / 2, -h / 2, w, h)
    ctx.restore()
  }
  ctx.restore()
}

async function processOneImage(file, settings) {
  const img = await loadImageFromFile(file)
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { alpha: true })
  ctx.drawImage(img, 0, 0)

  if (settings.type === 'text') {
    drawTextWatermark(ctx, settings.text)
  } else if (settings.type === 'image' && (settings.image.file || settings.image.url)) {
    await drawImageWatermark(ctx, settings.image.file || settings.image.url, settings.image)
  }
  const mime = file.type && file.type.startsWith('image/') ? file.type : 'image/png'
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.92))
  return { name: file.name, blob }
}

function App() {
  const [files, setFiles] = useState([])
  const [processing, setProcessing] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)

  // Watermark settings
  const [wmType, setWmType] = useState('text')
  const [wmText, setWmText] = useState('TMT Waterlogo')
  const [fontFamily, setFontFamily] = useState('Segoe UI, Arial, sans-serif')
  const [fontSize, setFontSize] = useState(48)
  const [fontWeight, setFontWeight] = useState('600')
  const [color, setColor] = useState('#ffffff')
  const [opacity, setOpacity] = useState(0.25)
  const [angle, setAngle] = useState(0)
  const [tile, setTile] = useState(false)
  const [spacingX, setSpacingX] = useState(200)
  const [spacingY, setSpacingY] = useState(200)
  const [textShadow, setTextShadow] = useState(false)
  const [shadowColor, setShadowColor] = useState('#000000')
  const [shadowBlur, setShadowBlur] = useState(6)
  const [wmFile, setWmFile] = useState(null)
  const [wmSource, setWmSource] = useState('preset')
  const [wmPreset, setWmPreset] = useState(null)
  const [scale, setScale] = useState(0.4)

  const settings = useMemo(() => ({
    type: wmType,
    text: { text: wmText, fontFamily, fontSize, fontWeight, color, opacity, angle, tile, spacingX, spacingY, textShadow, shadowColor, shadowBlur },
    image: { file: wmSource === 'upload' ? wmFile : null, url: wmSource === 'preset' ? wmPreset : null, opacity, angle, tile, spacingX, spacingY, scale },
  }), [wmType, wmText, fontFamily, fontSize, fontWeight, color, opacity, angle, tile, spacingX, spacingY, textShadow, shadowColor, shadowBlur, wmSource, wmPreset, wmFile, scale])

  useEffect(() => {
    let canceled = false
    async function genPreview() {
      if (!files.length) { setPreviewUrl(null); return }
      const { blob } = await processOneImage(files[0], settings)
      if (canceled) return
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    genPreview()
    return () => { canceled = true }
  }, [files, settings])

  const onChooseFiles = (e) => {
    const f = Array.from(e.target.files || [])
    setFiles(f)
  }

  const onChooseWatermarkImage = (e) => {
    const f = Array.from(e.target.files || [])
    setWmFile(f[0] || null)
  }

  const [presetImages, setPresetImages] = useState([])

  useEffect(() => {
    let canceled = false
    async function loadPresetList() {
      try {
        const res = await fetch('/preset-pngs.json', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!canceled && Array.isArray(data)) {
          setPresetImages(data)
        }
      } catch (e) {
        console.warn('加载预设 PNG 清单失败', e)
      }
    }
    loadPresetList()
    return () => { canceled = true }
  }, [])

  useEffect(() => {
    if (wmSource === 'preset' && presetImages.length && !wmPreset) {
      setWmPreset(presetImages[0])
    }
  }, [presetImages, wmSource])

  const processZip = async () => {
    if (!files.length) return
    if (wmType === 'image') {
      const hasImage = (wmSource === 'upload' && !!wmFile) || (wmSource === 'preset' && !!wmPreset)
      if (!hasImage) {
        alert('请先选择水印图片（预设或上传）')
        return
      }
    }
    setProcessing(true)
    try {
      const zip = new JSZip()
      for (let i = 0; i < files.length; i++) {
        const result = await processOneImage(files[i], settings)
        zip.file(result.name, result.blob)
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      a.download = `watermarked-${ts}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert('处理失败，请稍后重试')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="container">
      <header>
        <h1>批量图片浮水印工具</h1>
        <p>纯前端，不上传图片到服务器。支持文本/图片水印、平铺/居中。</p>
      </header>

      <section className="panel">
        <div className="field">
          <label>选择待处理图片</label>
          <input type="file" accept="image/*" multiple onChange={onChooseFiles} />
          <small>可多选，支持 PNG/JPEG 等格式。</small>
        </div>

        <div className="field">
          <label>水印类型</label>
          <div className="row">
            <label><input type="radio" name="wmtype" value="text" checked={wmType === 'text'} onChange={() => setWmType('text')} /> 文本</label>
            <label><input type="radio" name="wmtype" value="image" checked={wmType === 'image'} onChange={() => setWmType('image')} /> 图片</label>
          </div>
        </div>

        {wmType === 'text' ? (
          <div className="grid">
            <div className="field"><label>文本</label><input value={wmText} onChange={(e) => setWmText(e.target.value)} /></div>
            <div className="field"><label>字体</label><input value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} /></div>
            <div className="field"><label>字号</label><input type="number" min="8" max="256" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} /></div>
            <div className="field"><label>字重</label>
              <select value={fontWeight} onChange={(e) => setFontWeight(e.target.value)}>
                <option value="400">常规</option>
                <option value="500">中等</option>
                <option value="600">半粗</option>
                <option value="700">粗体</option>
              </select>
            </div>
            <div className="field"><label>颜色</label><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></div>
            <div className="field"><label>不透明度</label><input type="range" min="0" max="1" step="0.01" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /><span className="value">{opacity}</span></div>
            <div className="field"><label>角度(°)</label><input type="number" min="-180" max="180" value={angle} onChange={(e) => setAngle(Number(e.target.value))} /></div>
            <div className="field"><label><input type="checkbox" checked={tile} onChange={(e) => setTile(e.target.checked)} /> 平铺填满</label></div>
            {tile && (
              <>
                <div className="field"><label>水平间距</label><input type="number" min="40" max="2000" value={spacingX} onChange={(e) => setSpacingX(Number(e.target.value))} /></div>
                <div className="field"><label>垂直间距</label><input type="number" min="40" max="2000" value={spacingY} onChange={(e) => setSpacingY(Number(e.target.value))} /></div>
              </>
            )}
            <div className="field"><label><input type="checkbox" checked={textShadow} onChange={(e) => setTextShadow(e.target.checked)} /> 启用阴影</label></div>
            {textShadow && (
              <>
                <div className="field"><label>阴影颜色</label><input type="color" value={shadowColor} onChange={(e) => setShadowColor(e.target.value)} /></div>
                <div className="field"><label>阴影模糊</label><input type="range" min="0" max="20" step="1" value={shadowBlur} onChange={(e) => setShadowBlur(Number(e.target.value))} /><span className="value">{shadowBlur}</span></div>
              </>
            )}
          </div>
        ) : (
          <div className="grid">
            <div className="field">
              <label>水印来源</label>
              <div className="row wm-source">
                <label><input type="radio" name="wmsrc" value="preset" checked={wmSource === 'preset'} onChange={() => setWmSource('preset')} /> 预设（public）</label>
                <label><input type="radio" name="wmsrc" value="upload" checked={wmSource === 'upload'} onChange={() => setWmSource('upload')} /> 上传图片</label>
              </div>
            </div>
            {wmSource === 'preset' ? (
              <div className="field">
                <label>选择预设 PNG</label>
                <div className="preset-grid">
                  {presetImages.map((url) => (
                    <button type="button" key={url} className={`preset ${wmPreset === url ? 'selected' : ''}`} onClick={() => setWmPreset(url)}>
                      <img src={url} alt="预设" />
                    </button>
                  ))}
                </div>
                <small>这些图片位于项目的 public 目录中，刷新后自动更新。</small>
              </div>
            ) : (
              <div className="field"><label>选择水印图片</label><input type="file" accept="image/*" onChange={onChooseWatermarkImage} /></div>
            )}
            <div className="field"><label>缩放</label><input type="range" min="0.1" max="2" step="0.05" value={scale} onChange={(e) => setScale(Number(e.target.value))} /><span className="value">{scale}</span></div>
            <div className="field"><label>不透明度</label><input type="range" min="0" max="1" step="0.01" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /><span className="value">{opacity}</span></div>
            <div className="field"><label>角度(°)</label><input type="number" min="-180" max="180" value={angle} onChange={(e) => setAngle(Number(e.target.value))} /></div>
            <div className="field"><label><input type="checkbox" checked={tile} onChange={(e) => setTile(e.target.checked)} /> 平铺填满</label></div>
            {tile && (
              <>
                <div className="field"><label>水平间距</label><input type="number" min="40" max="2000" value={spacingX} onChange={(e) => setSpacingX(Number(e.target.value))} /></div>
                <div className="field"><label>垂直间距</label><input type="number" min="40" max="2000" value={spacingY} onChange={(e) => setSpacingY(Number(e.target.value))} /></div>
              </>
            )}
          </div>
        )}
      </section>

      <section className="preview">
        <h2>预览（基于第一张图片）</h2>
        {previewUrl ? (
          <img src={previewUrl} alt="预览" className="preview-image" />
        ) : (
          <div className="placeholder">请选择图片后在此预览效果</div>
        )}
      </section>

      <section className="actions">
        <button className="primary" disabled={!files.length || processing} onClick={processZip}>
          {processing ? '正在处理...' : '批量处理并下载 ZIP'}
        </button>
        <button className="ghost" onClick={() => { setFiles([]); setPreviewUrl(null) }}>清空</button>
      </section>

      <footer>
        <small>本工具为纯前端实现，图片不会上传到服务器。建议使用现代浏览器。</small>
      </footer>
    </div>
  )
}

export default App

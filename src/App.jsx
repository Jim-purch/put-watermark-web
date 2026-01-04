import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import './App.css'
import PdfConverter from './PdfConverter'
import FileExtractor from './FileExtractor'
import ImageConverter from './ImageConverter'

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

function getWatermarkPosition(position, canvasWidth, canvasHeight, wmWidth = 0, wmHeight = 0) {
  const margin = 50 // 边距
  let x, y

  switch (position) {
    case 'top-left':
      x = margin + wmWidth / 2
      y = margin + wmHeight / 2
      break
    case 'top-center':
      x = canvasWidth / 2
      y = margin + wmHeight / 2
      break
    case 'top-right':
      x = canvasWidth - margin - wmWidth / 2
      y = margin + wmHeight / 2
      break
    case 'center-left':
      x = margin + wmWidth / 2
      y = canvasHeight / 2
      break
    case 'center':
      x = canvasWidth / 2
      y = canvasHeight / 2
      break
    case 'center-right':
      x = canvasWidth - margin - wmWidth / 2
      y = canvasHeight / 2
      break
    case 'bottom-left':
      x = margin + wmWidth / 2
      y = canvasHeight - margin - wmHeight / 2
      break
    case 'bottom-center':
      x = canvasWidth / 2
      y = canvasHeight - margin - wmHeight / 2
      break
    case 'bottom-right':
      x = canvasWidth - margin - wmWidth / 2
      y = canvasHeight - margin - wmHeight / 2
      break
    default:
      x = canvasWidth / 2
      y = canvasHeight / 2
  }

  return { x, y }
}

function drawTextWatermark(ctx, opts) {
  const { width, height } = ctx.canvas
  const { text, fontFamily, fontSize, fontWeight, color, opacity, angle, tile, spacingX, spacingY, textShadow, shadowColor, shadowBlur, position = 'center' } = opts
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`
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
    // 计算文本尺寸用于位置计算
    const textMetrics = ctx.measureText(text)
    const textWidth = textMetrics.width
    const textHeight = fontSize
    const { x, y } = getWatermarkPosition(position, width, height, textWidth, textHeight)

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rad)
    ctx.fillText(text, 0, 0)
    ctx.restore()
  }
  ctx.restore()
}

async function drawImageWatermark(ctx, source, opts) {
  const { width, height } = ctx.canvas
  const { opacity, angle, tile, spacingX, spacingY, scale, grayscale, position = 'center' } = opts
  const wmImg = await loadImageFromSource(source)
  const w = Math.max(16, Math.round(wmImg.width * scale))
  const h = Math.max(16, Math.round(wmImg.height * scale))
  const rad = (angle * Math.PI) / 180

  // 若启用灰度，将水印图像转换为灰度后再绘制
  let drawSource = wmImg
  if (grayscale) {
    const gCanvas = document.createElement('canvas')
    gCanvas.width = w
    gCanvas.height = h
    const gctx = gCanvas.getContext('2d')
    gctx.drawImage(wmImg, 0, 0, w, h)
    const imgData = gctx.getImageData(0, 0, w, h)
    const data = imgData.data
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
      data[i] = gray
      data[i + 1] = gray
      data[i + 2] = gray
      // alpha 保持不变
    }
    gctx.putImageData(imgData, 0, 0)
    drawSource = gCanvas
  }

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
        ctx.drawImage(drawSource, -w / 2, -h / 2, w, h)
        ctx.restore()
      }
    }
  } else {
    const { x, y } = getWatermarkPosition(position, width, height, w, h)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rad)
    ctx.drawImage(drawSource, -w / 2, -h / 2, w, h)
    ctx.restore()
  }
  ctx.restore()
}

// （已移除去水印相关逻辑）

// 仅加水印
async function processOneWatermark(file, wmSettings) {
  const img = await loadImageFromFile(file)
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { alpha: true })
  ctx.drawImage(img, 0, 0)
  if (wmSettings.type === 'text') {
    drawTextWatermark(ctx, wmSettings.text)
  } else if (wmSettings.type === 'image' && (wmSettings.image.file || wmSettings.image.url)) {
    await drawImageWatermark(ctx, wmSettings.image.file || wmSettings.image.url, wmSettings.image)
  }
  const mime = file.type && file.type.startsWith('image/') ? file.type : 'image/png'
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.92))
  return { name: file.name, blob }
}

function App() {
  const [activeTab, setActiveTab] = useState('watermark')
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
  const [wmGrayscale, setWmGrayscale] = useState(false)
  const [position, setPosition] = useState('center') // 水印位置: top-left, top-center, top-right, center-left, center, center-right, bottom-left, bottom-center, bottom-right

  const watermarkSettings = useMemo(() => ({
    type: wmType,
    text: { text: wmText, fontFamily, fontSize, fontWeight, color, opacity, angle, tile, spacingX, spacingY, textShadow, shadowColor, shadowBlur, position },
    image: { file: wmSource === 'upload' ? wmFile : null, url: wmSource === 'preset' ? wmPreset : null, opacity, angle, tile, spacingX, spacingY, scale, grayscale: wmGrayscale, position },
  }), [wmType, wmText, fontFamily, fontSize, fontWeight, color, opacity, angle, tile, spacingX, spacingY, textShadow, shadowColor, shadowBlur, wmSource, wmPreset, wmFile, scale, wmGrayscale, position])

  // 预览第一张图片的加水印效果
  useEffect(() => {
    let canceled = false
    async function genPreviewAdd() {
      if (!files.length) { setPreviewUrl(null); return }
      const { blob } = await processOneWatermark(files[0], watermarkSettings)
      if (canceled) return
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    genPreviewAdd()
    return () => { canceled = true }
  }, [files, watermarkSettings])


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
        const result = await processOneWatermark(files[i], watermarkSettings)
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
        <h1>TMT 工具集</h1>
        <p>纯前端工具集合，不上传文件到服务器。</p>
        <nav className="tab-nav">
          <button
            className={`tab-button ${activeTab === 'watermark' ? 'active' : ''}`}
            onClick={() => setActiveTab('watermark')}
          >
            图片水印
          </button>
          <button
            className={`tab-button ${activeTab === 'pdf-converter' ? 'active' : ''}`}
            onClick={() => setActiveTab('pdf-converter')}
          >
            PDF转换
          </button>
          <button
            className={`tab-button ${activeTab === 'file-extractor' ? 'active' : ''}`}
            onClick={() => setActiveTab('file-extractor')}
          >
            文件提取
          </button>
          <button
            className={`tab-button ${activeTab === 'image-converter' ? 'active' : ''}`}
            onClick={() => setActiveTab('image-converter')}
          >
            图片转ICO
          </button>
        </nav>
      </header>

      {activeTab === 'watermark' && (
        <>
          <section className="panel">
            <div className="field">
              <label>选择待处理图片（可多选）</label>
              <input type="file" accept="image/*" multiple onChange={onChooseFiles} />
              <small>支持 PNG/JPEG 等格式。</small>
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
                <div className="field">
                  <label>样式预设</label>
                  <div className="style-presets">
                    <button
                      type="button"
                      className="preset-btn"
                      onClick={() => {
                        setWmText('TMT Waterlogo')
                        setFontFamily('Segoe UI, Arial, sans-serif')
                        setFontSize(48)
                        setFontWeight('600')
                        setColor('#ffffff')
                        setOpacity(0.25)
                        setAngle(0)
                        setTextShadow(false)
                      }}
                    >
                      默认水印
                    </button>
                    <button
                      type="button"
                      className="preset-btn"
                      onClick={() => {
                        setWmText('版权所有')
                        setFontFamily('PingFang SC, Microsoft YaHei, SimHei, sans-serif')
                        setFontSize(32)
                        setFontWeight('400')
                        setColor('#000000')
                        setOpacity(0.6)
                        setAngle(0)
                        setTextShadow(false)
                      }}
                    >
                      版权标识
                    </button>
                    <button
                      type="button"
                      className="preset-btn"
                      onClick={() => {
                        setWmText('CONFIDENTIAL')
                        setFontFamily('Impact, sans-serif')
                        setFontSize(64)
                        setFontWeight('700')
                        setColor('#ff0000')
                        setOpacity(0.4)
                        setAngle(-45)
                        setTextShadow(true)
                        setShadowColor('#000000')
                        setShadowBlur(3)
                      }}
                    >
                      机密文件
                    </button>
                    <button
                      type="button"
                      className="preset-btn"
                      onClick={() => {
                        setWmText('SAMPLE')
                        setFontFamily('Arial, sans-serif')
                        setFontSize(72)
                        setFontWeight('700')
                        setColor('#808080')
                        setOpacity(0.3)
                        setAngle(45)
                        setTextShadow(false)
                      }}
                    >
                      样品展示
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label>文本</label>
                  <div className="text-input-group">
                    <input className="pretty-input" value={wmText} onChange={(e) => setWmText(e.target.value)} placeholder="输入自定义文字..." />
                    <select
                      className="text-preset-select"
                      value=""
                      onChange={(e) => e.target.value && setWmText(e.target.value)}
                    >
                      <option value="">选择预设文字</option>
                      <option value="TMT Waterlogo">TMT Waterlogo</option>
                      <option value="版权所有">版权所有</option>
                      <option value="© 2024">© 2024</option>
                      <option value="机密文件">机密文件</option>
                      <option value="内部资料">内部资料</option>
                      <option value="样品展示">样品展示</option>
                      <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                      <option value="SAMPLE">SAMPLE</option>
                      <option value="DRAFT">DRAFT</option>
                      <option value="草稿">草稿</option>
                      <option value="未经授权禁止使用">未经授权禁止使用</option>
                      <option value="仅供参考">仅供参考</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>字体</label>
                  <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
                    <option value="Segoe UI, Arial, sans-serif">Segoe UI (默认)</option>
                    <option value="Arial, sans-serif">Arial</option>
                    <option value="Helvetica, Arial, sans-serif">Helvetica</option>
                    <option value="Times New Roman, serif">Times New Roman</option>
                    <option value="Georgia, serif">Georgia</option>
                    <option value="Courier New, monospace">Courier New</option>
                    <option value="Verdana, sans-serif">Verdana</option>
                    <option value="Tahoma, sans-serif">Tahoma</option>
                    <option value="Impact, sans-serif">Impact</option>
                    <option value="Comic Sans MS, cursive">Comic Sans MS</option>
                    <option value="PingFang SC, Microsoft YaHei, SimHei, sans-serif">苹方/微软雅黑</option>
                    <option value="SimSun, serif">宋体</option>
                    <option value="SimHei, sans-serif">黑体</option>
                    <option value="KaiTi, serif">楷体</option>
                    <option value="FangSong, serif">仿宋</option>
                  </select>
                </div>
                <div className="field">
                  <label>字号</label>
                  <div className="range-input-group">
                    <input type="range" min="8" max="256" step="1" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
                    <input className="input-sm" type="number" min="8" max="256" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
                  </div>
                </div>
                <div className="field"><label>字重</label>
                  <select value={fontWeight} onChange={(e) => setFontWeight(e.target.value)}>
                    <option value="400">常规</option>
                    <option value="500">中等</option>
                    <option value="600">半粗</option>
                    <option value="700">粗体</option>
                  </select>
                </div>
                <div className="field">
                  <label>颜色</label>
                  <div className="color-input-group">
                    <input className="input-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
                    <div className="color-presets">
                      {[
                        { color: '#ffffff', name: '白色' },
                        { color: '#000000', name: '黑色' },
                        { color: '#ff0000', name: '红色' },
                        { color: '#00ff00', name: '绿色' },
                        { color: '#0000ff', name: '蓝色' },
                        { color: '#ffff00', name: '黄色' },
                        { color: '#ff00ff', name: '紫色' },
                        { color: '#00ffff', name: '青色' },
                        { color: '#808080', name: '灰色' },
                        { color: '#ffa500', name: '橙色' }
                      ].map(preset => (
                        <button
                          key={preset.color}
                          type="button"
                          className={`color-preset ${color === preset.color ? 'selected' : ''}`}
                          style={{ backgroundColor: preset.color }}
                          title={preset.name}
                          onClick={() => setColor(preset.color)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="field"><label>不透明度</label><input type="range" min="0" max="1" step="0.01" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /><span className="value">{opacity}</span></div>
                <div className="field"><label>角度(°)</label><input className="input-sm" type="number" min="-180" max="180" value={angle} onChange={(e) => setAngle(Number(e.target.value))} /></div>
                <div className="field"><label><input type="checkbox" checked={tile} onChange={(e) => setTile(e.target.checked)} /> 平铺填满</label></div>
                {tile && (
                  <>
                    <div className="field"><label>水平间距</label><input className="input-sm" type="number" min="40" max="2000" value={spacingX} onChange={(e) => setSpacingX(Number(e.target.value))} /></div>
                    <div className="field"><label>垂直间距</label><input className="input-sm" type="number" min="40" max="2000" value={spacingY} onChange={(e) => setSpacingY(Number(e.target.value))} /></div>
                  </>
                )}
                {!tile && (
                  <div className="field">
                    <label>水印位置</label>
                    <div className="position-grid">
                      {[
                        { value: 'top-left', label: '↖' },
                        { value: 'top-center', label: '↑' },
                        { value: 'top-right', label: '↗' },
                        { value: 'center-left', label: '←' },
                        { value: 'center', label: '●' },
                        { value: 'center-right', label: '→' },
                        { value: 'bottom-left', label: '↙' },
                        { value: 'bottom-center', label: '↓' },
                        { value: 'bottom-right', label: '↘' }
                      ].map(pos => (
                        <button
                          key={pos.value}
                          type="button"
                          className={`position-btn ${position === pos.value ? 'selected' : ''}`}
                          onClick={() => setPosition(pos.value)}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="field"><label><input type="checkbox" checked={textShadow} onChange={(e) => setTextShadow(e.target.checked)} /> 启用阴影</label></div>
                {textShadow && (
                  <>
                    <div className="field"><label>阴影颜色</label><input className="input-color" type="color" value={shadowColor} onChange={(e) => setShadowColor(e.target.value)} /></div>
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
                <div className="field">
                  <label>缩放</label>
                  <div className="range-input-group">
                    <input type="range" min="0.1" max="2" step="0.05" value={scale} onChange={(e) => setScale(Number(e.target.value))} />
                    <input className="input-sm" type="number" min="0.1" max="2" step="0.05" value={scale} onChange={(e) => setScale(Number(e.target.value))} />
                  </div>
                </div>
                <div className="field"><label>不透明度</label><input type="range" min="0" max="1" step="0.01" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /><span className="value">{opacity}</span></div>
                <div className="field"><label><input type="checkbox" checked={wmGrayscale} onChange={(e) => setWmGrayscale(e.target.checked)} /> 灰度</label></div>
                <div className="field"><label>角度(°)</label><input className="input-sm" type="number" min="-180" max="180" value={angle} onChange={(e) => setAngle(Number(e.target.value))} /></div>
                <div className="field"><label><input type="checkbox" checked={tile} onChange={(e) => setTile(e.target.checked)} /> 平铺填满</label></div>
                {tile && (
                  <>
                    <div className="field"><label>水平间距</label><input className="input-sm" type="number" min="40" max="2000" value={spacingX} onChange={(e) => setSpacingX(Number(e.target.value))} /></div>
                    <div className="field"><label>垂直间距</label><input className="input-sm" type="number" min="40" max="2000" value={spacingY} onChange={(e) => setSpacingY(Number(e.target.value))} /></div>
                  </>
                )}
                {!tile && (
                  <div className="field">
                    <label>水印位置</label>
                    <div className="position-grid">
                      {[
                        { value: 'top-left', label: '↖' },
                        { value: 'top-center', label: '↑' },
                        { value: 'top-right', label: '↗' },
                        { value: 'center-left', label: '←' },
                        { value: 'center', label: '●' },
                        { value: 'center-right', label: '→' },
                        { value: 'bottom-left', label: '↙' },
                        { value: 'bottom-center', label: '↓' },
                        { value: 'bottom-right', label: '↘' }
                      ].map(pos => (
                        <button
                          key={pos.value}
                          type="button"
                          className={`position-btn ${position === pos.value ? 'selected' : ''}`}
                          onClick={() => setPosition(pos.value)}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="preview">
            <h2>增加水印预览（基于第一张图片）</h2>
            {previewUrl ? (
              <img src={previewUrl} alt="预览" className="preview-image" />
            ) : (
              <div className="placeholder">请选择图片后在此预览加水印效果</div>
            )}
          </section>

          <section className="actions">
            <button className="primary" disabled={!files.length || processing} onClick={processZip}>
              {processing ? '正在处理...' : '批量处理并下载 ZIP'}
            </button>
            <button className="ghost" onClick={() => { setFiles([]); setPreviewUrl(null) }}>清空</button>
          </section>
        </>
      )}

      {activeTab === 'pdf-converter' && (
        <PdfConverter />
      )}

      {activeTab === 'file-extractor' && (
        <FileExtractor />
      )}

      {activeTab === 'image-converter' && (
        <ImageConverter />
      )}

      <footer>
        <small>本工具为纯前端实现，图片不会上传到服务器。建议使用现代浏览器。</small>
        <div className="copyright">
          <small>
            Copyright © 2025 - toomotoo.online All rights reserved.
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">津ICP备2024026970号-1</a>
            请勿上传违反中国大陆和香港法律的图片，违者后果自负。
          </small>
        </div>
      </footer>
    </div>
  )
}

export default App

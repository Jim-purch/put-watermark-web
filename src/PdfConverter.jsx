import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as pdfjsLib from 'pdfjs-dist';

function PdfConverter() {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [pageNum, setPageNum] = useState(1)
  const [viewZoom, setViewZoom] = useState(1)
  const [dpi, setDpi] = useState(300)
  const [selection, setSelection] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [isSpaceDown, setIsSpaceDown] = useState(false)
  const [status, setStatus] = useState('就绪')
  const [selectedAspect, setSelectedAspect] = useState('free')
  const [customAspect, setCustomAspect] = useState('')
  const [selectedSizes, setSelectedSizes] = useState([512, 1024])
  const [selectedFormats, setSelectedFormats] = useState(['png'])
  const [sizesInput, setSizesInput] = useState('')
  const [removeWhiteBackground, setRemoveWhiteBackground] = useState(false)
  
  const canvasRef = useRef(null)
  const canvasWrapRef = useRef(null)
  const cropRef = useRef(null)
  const fileInputRef = useRef(null)
  const pageJumpRef = useRef(null)
  
  const [viewportScale, setViewportScale] = useState(1)
  const [pageBaseWidth, setPageBaseWidth] = useState(null)
  const [dragStart, setDragStart] = useState(null)
  const [panStart, setPanStart] = useState(null)

  // 键盘事件监听
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') setIsSpaceDown(true)
    }
    const handleKeyUp = (e) => {
      if (e.code === 'Space') setIsSpaceDown(false)
    }
    
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // 配置PDF.js worker
  useEffect(() => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  }, []);

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
  const clampZoom = (z) => Math.max(0.25, Math.min(4.0, z))

  const getAspectRatio = () => {
    const s = customAspect.trim()
    if (s) {
      if (s.includes(':')) {
        const [w, h] = s.split(':')
        const rw = parseFloat(w)
        const rh = parseFloat(h)
        if (rw > 0 && rh > 0) return rw / rh
      }
      const r = parseFloat(s)
      if (r > 0) return r
    }
    
    if (selectedAspect === 'free') return null
    if (selectedAspect.includes(':')) {
      const [w, h] = selectedAspect.split(':')
      const rw = parseFloat(w)
      const rh = parseFloat(h)
      if (rw > 0 && rh > 0) return rw / rh
    }
    const r = parseFloat(selectedAspect)
    if (r > 0) return r
    return null
  }

  const renderPage = async () => {
    if (!pdfDoc || !window.pdfjsLib) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    
    const baseScale = dpi / 72
    const page = await pdfDoc.getPage(pageNum)
    
    const v1 = page.getViewport({ scale: 1 })
    setPageBaseWidth(v1.width)
    
    // 考虑设备像素比以提高显示质量
    const devicePixelRatio = window.devicePixelRatio || 1
    const displayScale = baseScale * viewZoom
    const renderScale = displayScale * devicePixelRatio
    
    // 用于渲染的viewport（高分辨率）
    const renderViewport = page.getViewport({ scale: renderScale })
    // 用于显示的viewport（正常分辨率）
    const displayViewport = page.getViewport({ scale: displayScale })
    
    setViewportScale(displayScale)
    
    // 设置canvas的实际像素尺寸（高分辨率）
    canvas.width = Math.floor(renderViewport.width)
    canvas.height = Math.floor(renderViewport.height)
    
    // 设置canvas的显示尺寸（正常分辨率）
    canvas.style.width = Math.floor(displayViewport.width) + 'px'
    canvas.style.height = Math.floor(displayViewport.height) + 'px'
    
    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise
    
    if (pageJumpRef.current) {
      pageJumpRef.current.value = String(pageNum)
    }
    
    setSelection(null)
    if (cropRef.current) {
      cropRef.current.style.display = 'none'
    }
    setStatus('页面渲染完成')
  }

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file || file.type !== 'application/pdf') return
    
    try {
      setStatus('加载PDF…')
      const buf = await file.arrayBuffer()
      const doc = await pdfjsLib.getDocument({ data: buf }).promise
      setPdfDoc(doc)
      setPageNum(1)
      
      if (pageJumpRef.current) {
        pageJumpRef.current.max = String(doc.numPages)
        pageJumpRef.current.value = '1'
        pageJumpRef.current.disabled = false
      }
      
      await renderPage()
    } catch (error) {
      console.error('PDF加载失败:', error)
      setStatus('PDF加载失败')
    }
  }

  const handlePrevPage = async () => {
    if (!pdfDoc || pageNum <= 1) return
    setPageNum(pageNum - 1)
  }

  const handleNextPage = async () => {
    if (!pdfDoc || pageNum >= pdfDoc.numPages) return
    setPageNum(pageNum + 1)
  }

  const handlePageJump = async (e) => {
    if (!pdfDoc) return
    let n = parseInt(e.target.value, 10)
    if (!Number.isFinite(n)) {
      e.target.value = String(pageNum)
      return
    }
    n = Math.max(1, Math.min(pdfDoc.numPages, n))
    if (n !== pageNum) {
      setPageNum(n)
    } else {
      e.target.value = String(pageNum)
    }
  }

  // 渲染页面当页码或其他参数改变时
  useEffect(() => {
    if (pdfDoc) {
      renderPage()
    }
  }, [pageNum, dpi, viewZoom, pdfDoc])

  const zoomAtFactor = async (factor, clientX, clientY) => {
    if (!pdfDoc) return
    
    const newZoom = clampZoom(viewZoom * factor)
    if (Math.abs(newZoom - viewZoom) < 0.0001) return
    
    const canvasWrap = canvasWrapRef.current
    const canvas = canvasRef.current
    const wrapRect = canvasWrap.getBoundingClientRect()
    
    const preScrollLeft = canvasWrap.scrollLeft
    const preScrollTop = canvasWrap.scrollTop
    const mx = clientX - wrapRect.left + preScrollLeft
    const my = clientY - wrapRect.top + preScrollTop
    const relX = mx / canvas.width
    const relY = my / canvas.height
    
    setViewZoom(newZoom)
    
    // 等待渲染完成后调整滚动位置
    setTimeout(() => {
      const nx = relX * canvas.width
      const ny = relY * canvas.height
      const targetLeft = nx - (clientX - wrapRect.left)
      const targetTop = ny - (clientY - wrapRect.top)
      const maxLeft = Math.max(0, canvas.width - canvasWrap.clientWidth)
      const maxTop = Math.max(0, canvas.height - canvasWrap.clientHeight)
      canvasWrap.scrollLeft = clamp(targetLeft, 0, maxLeft)
      canvasWrap.scrollTop = clamp(targetTop, 0, maxTop)
    }, 50)
  }

  const handleWheel = (e) => {
    if (!pdfDoc) return
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    zoomAtFactor(factor, e.clientX, e.clientY)
  }

  const canvasToImageDataRect = (sel) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0, w: 0, h: 0 }
    
    // 获取canvas的显示尺寸和实际像素尺寸
    const displayWidth = parseFloat(canvas.style.width) || canvas.width
    const displayHeight = parseFloat(canvas.style.height) || canvas.height
    const actualWidth = canvas.width
    const actualHeight = canvas.height
    
    // 计算缩放比例
    const scaleX = actualWidth / displayWidth
    const scaleY = actualHeight / displayHeight
    
    // 将显示坐标转换为实际canvas像素坐标
    let x = Math.floor(Math.min(sel.x0, sel.x1) * scaleX)
    let y = Math.floor(Math.min(sel.y0, sel.y1) * scaleY)
    let w = Math.floor(Math.abs(sel.x1 - sel.x0) * scaleX)
    let h = Math.floor(Math.abs(sel.y1 - sel.y0) * scaleY)
    
    // 边界检查，确保不超出canvas范围
    x = Math.max(0, Math.min(x, actualWidth - 1))
    y = Math.max(0, Math.min(y, actualHeight - 1))
    w = Math.max(1, Math.min(w, actualWidth - x))
    h = Math.max(1, Math.min(h, actualHeight - y))
    
    return { x, y, w, h }
  }

  const parseSizes = () => {
    const manual = sizesInput ? sizesInput.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0) : []
    const all = [...selectedSizes, ...manual]
    return Array.from(new Set(all)).sort((a, b) => a - b)
  }

  // 去除白底背景函数
  const removeWhiteBackgroundFromCanvas = (sourceCanvas) => {
    const canvas = document.createElement('canvas')
    canvas.width = sourceCanvas.width
    canvas.height = sourceCanvas.height
    const ctx = canvas.getContext('2d')
    
    // 绘制原图像
    ctx.drawImage(sourceCanvas, 0, 0)
    
    // 获取图像数据
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    
    // 定义白色阈值（可以调整这个值来控制去除的程度）
    const whiteThreshold = 240
    
    // 遍历每个像素
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      
      // 如果像素接近白色，则设置为透明
      if (r > whiteThreshold && g > whiteThreshold && b > whiteThreshold) {
        data[i + 3] = 0 // 设置alpha为0（透明）
      }
    }
    
    // 将修改后的图像数据放回canvas
    ctx.putImageData(imageData, 0, 0)
    
    return canvas
  }

  const batchExportZip = async () => {
    if (!selection) {
      setStatus('请先拖拽选择裁剪区域')
      return
    }
    
    const sizes = parseSizes()
    if (!sizes.length) {
      setStatus('请填写或选择批量尺寸，如 256,512,1024')
      return
    }
    
    if (!selectedFormats.length) {
      setStatus('请选择导出格式（PNG/WEBP/JPG/SVG）')
      return
    }
    
    const canvas = canvasRef.current
    const { x, y, w, h } = canvasToImageDataRect(selection)
    
    let baseCanvas = document.createElement('canvas')
    baseCanvas.width = w
    baseCanvas.height = h
    baseCanvas.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h)
    
    // 如果启用了去除白底背景，则应用该功能
    if (removeWhiteBackground) {
      baseCanvas = removeWhiteBackgroundFromCanvas(baseCanvas)
    }
    
    const zip = new JSZip()
    
    for (const size of sizes) {
      const scale = size / Math.max(w, h)
      const tw = Math.round(w * scale)
      const th = Math.round(h * scale)
      
      const c = document.createElement('canvas')
      c.width = tw
      c.height = th
      c.getContext('2d').drawImage(baseCanvas, 0, 0, w, h, 0, 0, tw, th)
      
      if (selectedFormats.includes('png')) {
        const png = c.toDataURL('image/png')
        zip.file(`png/page-${pageNum}-${tw}x${th}.png`, png.split(',')[1], { base64: true })
      }
      if (selectedFormats.includes('webp')) {
        const webp = c.toDataURL('image/webp', 0.92)
        zip.file(`webp/page-${pageNum}-${tw}x${th}.webp`, webp.split(',')[1], { base64: true })
      }
      if (selectedFormats.includes('jpg')) {
        const jpg = c.toDataURL('image/jpeg', 0.92)
        zip.file(`jpg/page-${pageNum}-${tw}x${th}.jpg`, jpg.split(',')[1], { base64: true })
      }
      if (selectedFormats.includes('svg')) {
        const pngForSvg = c.toDataURL('image/png')
        const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="${th}" viewBox="0 0 ${tw} ${th}"><image href="${pngForSvg}" x="0" y="0" width="${tw}" height="${th}"/></svg>`
        zip.file(`svg/page-${pageNum}-${tw}x${th}.svg`, svg)
      }
    }
    
    const blob = await zip.generateAsync({ type: 'blob' })
    
    // 使用简单的下载方法
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `page-${pageNum}-batch.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    setStatus('批量导出完成')
  }

  const handleMouseDown = (e) => {
    if (!pdfDoc) return
    
    const canvas = canvasRef.current
    const canvasWrap = canvasWrapRef.current
    
    if (e.button === 2 || e.button === 1 || isSpaceDown) {
      // 右键/中键或空格键：平移
      setIsPanning(true)
      canvasWrap.classList.add('panning')
      setPanStart({
        x: e.clientX,
        y: e.clientY,
        sl: canvasWrap.scrollLeft,
        st: canvasWrap.scrollTop
      })
      return
    }
    
    setIsDragging(true)
    const wrapRect = canvasWrap.getBoundingClientRect()
    const x = e.clientX - wrapRect.left + canvasWrap.scrollLeft
    const y = e.clientY - wrapRect.top + canvasWrap.scrollTop
    setDragStart({ x, y })
    setSelection({ x0: x, y0: y, x1: x, y1: y })
    
    if (cropRef.current) {
      cropRef.current.style.display = 'block'
    }
  }

  const handleMouseMove = (e) => {
    const canvasWrap = canvasWrapRef.current
    
    if (isPanning && panStart) {
      const dx = e.clientX - panStart.x
      const dy = e.clientY - panStart.y
      const maxLeft = Math.max(0, canvasRef.current.width - canvasWrap.clientWidth)
      const maxTop = Math.max(0, canvasRef.current.height - canvasWrap.clientHeight)
      canvasWrap.scrollLeft = clamp(panStart.sl - dx, 0, maxLeft)
      canvasWrap.scrollTop = clamp(panStart.st - dy, 0, maxTop)
      e.preventDefault()
      return
    }
    
    if (!isDragging || !selection) return
    
    const wrapRect = canvasWrap.getBoundingClientRect()
    let x = e.clientX - wrapRect.left + canvasWrap.scrollLeft
    let y = e.clientY - wrapRect.top + canvasWrap.scrollTop
    
    const r = getAspectRatio()
    if (r === null) {
      setSelection(prev => ({ ...prev, x1: x, y1: y }))
    } else {
      const dx = x - selection.x0
      const dy = y - selection.y0
      if (Math.abs(dx) >= Math.abs(dy)) {
        const height = Math.abs(dx) / r
        setSelection(prev => ({
          ...prev,
          x1: x,
          y1: prev.y0 + (dy >= 0 ? height : -height)
        }))
      } else {
        const width = Math.abs(dy) * r
        setSelection(prev => ({
          ...prev,
          y1: y,
          x1: prev.x0 + (dx >= 0 ? width : -width)
        }))
      }
    }
  }

  // 更新裁剪框位置
  useEffect(() => {
    if (selection && cropRef.current) {
      // 选区框应该显示在canvas的显示坐标上，不需要转换
      const x = Math.floor(Math.min(selection.x0, selection.x1))
      const y = Math.floor(Math.min(selection.y0, selection.y1))
      const w = Math.floor(Math.abs(selection.x1 - selection.x0))
      const h = Math.floor(Math.abs(selection.y1 - selection.y0))
      
      cropRef.current.style.left = x + 'px'
      cropRef.current.style.top = y + 'px'
      cropRef.current.style.width = w + 'px'
      cropRef.current.style.height = h + 'px'
    }
  }, [selection])

  const handleMouseUp = () => {
    setIsDragging(false)
    setIsPanning(false)
    if (canvasWrapRef.current) {
      canvasWrapRef.current.classList.remove('panning')
    }
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
    setIsPanning(false)
    if (canvasWrapRef.current) {
      canvasWrapRef.current.classList.remove('panning')
    }
  }

  const clearSelection = () => {
    setSelection(null)
    if (cropRef.current) {
      cropRef.current.style.display = 'none'
    }
    setStatus('已清除选区')
  }

  const aspectOptions = [
    { value: 'free', label: '自由' },
    { value: '1:1', label: '1:1' },
    { value: '4:3', label: '4:3' },
    { value: '3:2', label: '3:2' },
    { value: '16:9', label: '16:9' },
    { value: '9:16', label: '9:16' }
  ]

  const sizeOptions = [48, 72, 96, 192, 64, 128, 256, 512, 1024, 2048]
  const formatOptions = [
    { value: 'png', label: 'PNG' },
    { value: 'webp', label: 'WEBP' },
    { value: 'jpg', label: 'JPG' },
    { value: 'svg', label: 'SVG' }
  ]

  return (
    <div className="pdf-converter">
      <div className="pdf-hero">
        <div className="pdf-panel pdf-left">
          <div className="pdf-title">PDF 转换</div>
          <div className="pdf-subtitle">上传 PDF，预览页面并裁剪导出为 PNG、JPG、WEBP 或嵌入式 SVG</div>
          
          <div className="pdf-row">
            <label>选择文件</label>
            <input
              ref={fileInputRef}
              className="pdf-input"
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
            />
          </div>
          
          <div className="pdf-row">
            <label>DPI</label>
            <input
              className="pdf-input"
              type="number"
              min="72"
              max="600"
              step="12"
              value={dpi}
              onChange={(e) => setDpi(Number(e.target.value))}
            />
          </div>
          
          <div className="pdf-row">
            <label>选框比例</label>
            <div className="pdf-chips">
              {aspectOptions.map(option => (
                <div
                  key={option.value}
                  className={`pdf-chip ${selectedAspect === option.value ? 'selected' : ''}`}
                  onClick={() => setSelectedAspect(option.value)}
                >
                  {option.label}
                </div>
              ))}
            </div>
          </div>
          
          <div className="pdf-row">
            <label>自定义比例</label>
            <input
              className="pdf-input"
              placeholder="W:H 或 单值，如 3:2 或 1.5"
              value={customAspect}
              onChange={(e) => setCustomAspect(e.target.value)}
            />
          </div>
          
          <div className="pdf-row">
            <label>批量尺寸</label>
            <input
              className="pdf-input"
              placeholder="逗号分隔，较长边，如 256,512,1024"
              value={sizesInput}
              onChange={(e) => setSizesInput(e.target.value)}
            />
          </div>
          
          <div className="pdf-row">
            <label>常用尺寸</label>
            <div className="pdf-chips">
              {sizeOptions.map(size => (
                <div
                  key={size}
                  className={`pdf-chip ${selectedSizes.includes(size) ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedSizes(prev => 
                      prev.includes(size) 
                        ? prev.filter(s => s !== size)
                        : [...prev, size]
                    )
                  }}
                >
                  {size}
                </div>
              ))}
            </div>
          </div>
          
          <div className="pdf-row">
            <label>导出格式</label>
            <div className="pdf-chips">
              {formatOptions.map(format => (
                <div
                  key={format.value}
                  className={`pdf-chip ${selectedFormats.includes(format.value) ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedFormats(prev => 
                      prev.includes(format.value) 
                        ? prev.filter(f => f !== format.value)
                        : [...prev, format.value]
                    )
                  }}
                >
                  {format.label}
                </div>
              ))}
            </div>
          </div>
          
          <div className="pdf-row">
            <label>背景处理</label>
            <div className="pdf-chips">
              <div
                className={`pdf-chip ${removeWhiteBackground ? 'selected' : ''}`}
                onClick={() => setRemoveWhiteBackground(!removeWhiteBackground)}
              >
                <i className="fa-solid fa-magic-wand-sparkles"></i>
                去除白底背景
              </div>
            </div>
            {removeWhiteBackground && (
              <div className="pdf-note">
                <i className="fa-solid fa-info-circle"></i>
                仅对PNG和WEBP格式有效，会将接近白色的像素设为透明
              </div>
            )}
          </div>
          
          <div className="pdf-actions">
            <button className="pdf-btn" onClick={batchExportZip}>
              <i className="fa-solid fa-box-archive"></i>批量导出 ZIP
            </button>
            <button className="pdf-btn pdf-secondary" onClick={clearSelection}>
              <i className="fa-solid fa-crop"></i>清除选区
            </button>
          </div>
          
          <div className="pdf-status">{status}</div>
          <div className="pdf-note">说明：SVG为嵌入栅格图片的SVG，不含矢量路径；浏览器不支持导出ICO。</div>
        </div>
        
        <div className="pdf-panel pdf-right">
          <div 
            className="pdf-canvas-wrap"
            ref={canvasWrapRef}
            onWheel={handleWheel}
          >
            <div className="pdf-viewer-controls">
              <div className="pdf-group">
                <button className="pdf-btn" onClick={handlePrevPage}>
                  <i className="fa-solid fa-arrow-left"></i>上一页
                </button>
                <button className="pdf-btn" onClick={handleNextPage}>
                  <i className="fa-solid fa-arrow-right"></i>下一页
                </button>
                <span className="pdf-badge pdf-page-jump">
                  <i className="fa-solid fa-file-pdf"></i>
                  <input
                    ref={pageJumpRef}
                    type="number"
                    min="1"
                    step="1"
                    defaultValue="1"
                    disabled
                    onChange={handlePageJump}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handlePageJump(e)
                      }
                    }}
                  />
                  / <span>{pdfDoc ? pdfDoc.numPages : 0}</span>
                </span>
              </div>
            </div>
            
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onContextMenu={(e) => e.preventDefault()}
            />
            
            <div
              ref={cropRef}
              className="pdf-crop"
              style={{ display: 'none' }}
            />
          </div>
        </div>
      </div>
      
      <div className="pdf-tips">
        <h3>使用提示</h3>
        <div className="pdf-tips-list">
          <div className="pdf-tips-item">
            <i className="fa-solid fa-magnifying-glass"></i>
            <div>滚轮缩放：在视窗内滚动，围绕光标缩放</div>
          </div>
          <div className="pdf-tips-item">
            <i className="fa-solid fa-hand"></i>
            <div>拖拽平移：右/中键拖动，或空格+左键</div>
          </div>
          <div className="pdf-tips-item">
            <i className="fa-solid fa-crop"></i>
            <div>选框比例：点击比例芯片或自定义，导出保持比例</div>
          </div>
          <div className="pdf-tips-item">
            <i className="fa-solid fa-layer-group"></i>
            <div>批量尺寸与格式：勾选尺寸与格式，批量导出 ZIP</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PdfConverter
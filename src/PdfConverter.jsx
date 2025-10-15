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

  // 缩放控制函数
  const handleZoomIn = () => {
    const newZoom = clampZoom(viewZoom * 1.2)
    setViewZoom(newZoom)
  }

  const handleZoomOut = () => {
    const newZoom = clampZoom(viewZoom / 1.2)
    setViewZoom(newZoom)
  }

  const handleZoomReset = () => {
    setViewZoom(1)
  }

  const handleZoomFit = () => {
    if (!pdfDoc || !canvasWrapRef.current) return
    
    const canvasWrap = canvasWrapRef.current
    const wrapWidth = canvasWrap.clientWidth - 40 // 减去一些边距
    const wrapHeight = canvasWrap.clientHeight - 40
    
    // 获取当前页面的原始尺寸
    const page = pdfDoc.getPage(pageNum)
    page.then(p => {
      const viewport = p.getViewport({ scale: 1 })
      const scaleX = wrapWidth / viewport.width
      const scaleY = wrapHeight / viewport.height
      const fitScale = Math.min(scaleX, scaleY)
      
      const newZoom = clampZoom(fitScale)
      setViewZoom(newZoom)
    })
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

  // 生成高质量SVG（先矢量放大到目标尺寸再裁剪）
  const generateVectorSVG = async (selection, targetWidth, targetHeight) => {
    if (!pdfDoc) return null
    
    try {
      // 为每次调用生成唯一ID，避免SVG元素冲突
      const uniqueId = `svg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      const page = await pdfDoc.getPage(pageNum)
      
      // 计算选区在PDF页面中的实际位置和尺寸
      const canvas = canvasRef.current
      const displayWidth = parseFloat(canvas.style.width) || canvas.width
      const displayHeight = parseFloat(canvas.style.height) || canvas.height
      
      // 获取页面的原始viewport
      const originalViewport = page.getViewport({ scale: 1 })
      
      // 计算选区在原始PDF坐标系中的位置
      const scaleX = originalViewport.width / displayWidth
      const scaleY = originalViewport.height / displayHeight
      
      const pdfX = Math.min(selection.x0, selection.x1) * scaleX
      const pdfY = Math.min(selection.y0, selection.y1) * scaleY
      const pdfWidth = Math.abs(selection.x1 - selection.x0) * scaleX
      const pdfHeight = Math.abs(selection.y1 - selection.y0) * scaleY
      
      // 计算目标缩放比例，确保先矢量放大再裁剪
      const targetScale = Math.max(targetWidth / pdfWidth, targetHeight / pdfHeight)
      
      // 尝试使用真正的矢量SVG渲染
      try {
        // 获取操作列表用于SVG渲染
        const operatorList = await page.getOperatorList()
        
        // 创建独立的SVG渲染器实例
        const svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs)
        svgGfx.embedFonts = true
        
        // 使用目标缩放比例设置viewport，先进行矢量放大
        const svgViewport = page.getViewport({ scale: targetScale })
        
        // 生成SVG元素
        const svgElement = await svgGfx.getSVG(operatorList, svgViewport)
        
        // 获取SVG的字符串表示
        const serializer = new XMLSerializer()
        let svgString = serializer.serializeToString(svgElement)
        
        // 计算在放大后的坐标系中的裁剪区域
        const scaledPdfX = pdfX * targetScale
        const scaledPdfY = pdfY * targetScale
        const scaledPdfWidth = pdfWidth * targetScale
        const scaledPdfHeight = pdfHeight * targetScale
        
        // 使用唯一ID创建白底背景去除滤镜（如果需要）
         const backgroundRemovalFilter = removeWhiteBackground ? `
    <filter id="removeWhite_${uniqueId}" x="0%" y="0%" width="100%" height="100%">
      <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1 -1 -1 1 1"/>
    </filter>` : ''
         
         // 创建裁剪后的SVG，使用放大后的坐标进行裁剪
         const croppedSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
     width="${targetWidth}" height="${targetHeight}" 
     viewBox="${scaledPdfX} ${scaledPdfY} ${scaledPdfWidth} ${scaledPdfHeight}">
  <defs>
    <clipPath id="cropClip_${uniqueId}">
      <rect x="${scaledPdfX}" y="${scaledPdfY}" width="${scaledPdfWidth}" height="${scaledPdfHeight}"/>
    </clipPath>${backgroundRemovalFilter}
  </defs>
  <g clip-path="url(#cropClip_${uniqueId})"${removeWhiteBackground ? ` filter="url(#removeWhite_${uniqueId})"` : ''}>
    ${svgString.replace(/<\?xml[^>]*\?>/, '').replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '')}
  </g>
</svg>`
        
        return croppedSvg
        
      } catch (svgError) {
        console.warn('矢量SVG渲染失败，回退到高质量栅格化:', svgError)
        
        // 回退到高质量栅格化方法，使用目标缩放比例确保先放大再裁剪
        const highResScale = Math.max(targetScale * 2, 2) // 确保足够的分辨率
        const viewport = page.getViewport({ scale: highResScale })
        
        // 创建高分辨率canvas
        const tempCanvas = document.createElement('canvas')
        const tempCtx = tempCanvas.getContext('2d')
        tempCanvas.width = viewport.width
        tempCanvas.height = viewport.height
        
        // 渲染PDF页面到canvas
        await page.render({
          canvasContext: tempCtx,
          viewport: viewport
        }).promise
        
        // 计算裁剪区域在高分辨率canvas中的位置
        const cropX = pdfX * highResScale
        const cropY = pdfY * highResScale
        const cropWidth = pdfWidth * highResScale
        const cropHeight = pdfHeight * highResScale
        
        // 创建裁剪后的canvas
        const croppedCanvas = document.createElement('canvas')
        const croppedCtx = croppedCanvas.getContext('2d')
        croppedCanvas.width = targetWidth
        croppedCanvas.height = targetHeight
        
        // 将裁剪区域绘制到目标canvas
        croppedCtx.drawImage(
          tempCanvas,
          cropX, cropY, cropWidth, cropHeight,
          0, 0, targetWidth, targetHeight
        )
        
        // 如果需要去除白底背景，处理canvas
        let finalCanvas = croppedCanvas
        if (removeWhiteBackground) {
          finalCanvas = removeWhiteBackgroundFromCanvas(croppedCanvas)
        }
        
        // 转换为高质量PNG数据URL
        const pngDataUrl = finalCanvas.toDataURL('image/png')
        
        // 创建包含高质量图像的SVG
        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${targetWidth}" height="${targetHeight}" viewBox="0 0 ${targetWidth} ${targetHeight}">
  <image href="${pngDataUrl}" x="0" y="0" width="${targetWidth}" height="${targetHeight}" style="image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;"/>
</svg>`
        
        return svg
      }
      
    } catch (error) {
      console.error('生成SVG失败:', error)
      return null
    }
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
    
    setStatus('正在批量导出...')
    
    const zip = new JSZip()
    
    // 预计算选区信息，避免在循环中重复计算
    const canvas = canvasRef.current
    const baseRect = canvasToImageDataRect(selection)
    
    // 预计算PDF相关信息，避免在循环中重复计算
    const page = await pdfDoc.getPage(pageNum)
    const displayWidth = parseFloat(canvas.style.width) || canvas.width
    const displayHeight = parseFloat(canvas.style.height) || canvas.height
    const originalViewport = page.getViewport({ scale: 1 })
    
    const scaleX = originalViewport.width / displayWidth
    const scaleY = originalViewport.height / displayHeight
    
    const pdfX = Math.min(selection.x0, selection.x1) * scaleX
    const pdfY = Math.min(selection.y0, selection.y1) * scaleY
    const pdfWidth = Math.abs(selection.x1 - selection.x0) * scaleX
    const pdfHeight = Math.abs(selection.y1 - selection.y0) * scaleY

    // 顺序处理每个尺寸，确保SVG异步生成不会冲突
    for (let i = 0; i < sizes.length; i++) {
      const size = sizes[i]
      
      // 使用预计算的选区信息
      const { x, y, w, h } = baseRect
      const scale = size / Math.max(w, h)
      const tw = Math.round(w * scale)
      const th = Math.round(h * scale)
      
      setStatus(`正在处理 ${tw}x${th} (${i + 1}/${sizes.length})...`)
      
      // 为非SVG格式生成高质量图像：先从PDF渲染高分辨率，再裁剪
      let finalCanvas = null
      if (selectedFormats.some(format => ['png', 'webp', 'jpg'].includes(format))) {
        try {
          
          // 计算目标缩放比例，确保先放大再裁剪
          const targetScale = Math.max(tw / pdfWidth, th / pdfHeight)
          const highResScale = Math.max(targetScale * 2, 2) // 确保足够的分辨率
          
          // 创建高分辨率viewport并渲染
          const viewport = page.getViewport({ scale: highResScale })
          const tempCanvas = document.createElement('canvas')
          const tempCtx = tempCanvas.getContext('2d')
          tempCanvas.width = viewport.width
          tempCanvas.height = viewport.height
          
          await page.render({
            canvasContext: tempCtx,
            viewport: viewport
          }).promise
          
          // 计算裁剪区域在高分辨率canvas中的位置
          const cropX = pdfX * highResScale
          const cropY = pdfY * highResScale
          const cropWidth = pdfWidth * highResScale
          const cropHeight = pdfHeight * highResScale
          
          // 创建目标尺寸的canvas并裁剪
          finalCanvas = document.createElement('canvas')
          const finalCtx = finalCanvas.getContext('2d')
          finalCanvas.width = tw
          finalCanvas.height = th
          
          finalCtx.drawImage(
            tempCanvas,
            cropX, cropY, cropWidth, cropHeight,
            0, 0, tw, th
          )
          
          // 如果需要去除白底背景，处理canvas
          if (removeWhiteBackground) {
            finalCanvas = removeWhiteBackgroundFromCanvas(finalCanvas)
          }
          
        } catch (error) {
          console.warn('高质量渲染失败，回退到canvas缩放:', error)
          // 回退到原来的方法（使用预计算的选区信息）
          let baseCanvas = document.createElement('canvas')
          baseCanvas.width = w
          baseCanvas.height = h
          baseCanvas.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h)
          
          if (removeWhiteBackground) {
            baseCanvas = removeWhiteBackgroundFromCanvas(baseCanvas)
          }
          
          finalCanvas = document.createElement('canvas')
          finalCanvas.width = tw
          finalCanvas.height = th
          finalCanvas.getContext('2d').drawImage(baseCanvas, 0, 0, w, h, 0, 0, tw, th)
        }
      }
      
      if (selectedFormats.includes('png') && finalCanvas) {
        const png = finalCanvas.toDataURL('image/png')
        zip.file(`png/page-${pageNum}-${tw}x${th}.png`, png.split(',')[1], { base64: true })
      }
      if (selectedFormats.includes('webp') && finalCanvas) {
        const webp = finalCanvas.toDataURL('image/webp', 0.92)
        zip.file(`webp/page-${pageNum}-${tw}x${th}.webp`, webp.split(',')[1], { base64: true })
      }
      if (selectedFormats.includes('jpg') && finalCanvas) {
        const jpg = finalCanvas.toDataURL('image/jpeg', 0.92)
        zip.file(`jpg/page-${pageNum}-${tw}x${th}.jpg`, jpg.split(',')[1], { base64: true })
      }
      if (selectedFormats.includes('svg')) {
        try {
          // 确保每次SVG生成都是独立的，避免状态冲突（使用原始selection对象）
          const vectorSVG = await generateVectorSVG(selection, tw, th)
          if (vectorSVG) {
            zip.file(`svg/page-${pageNum}-${tw}x${th}.svg`, vectorSVG)
          } else {
            // 如果矢量SVG生成失败，回退到PNG嵌入式SVG
            const pngForSvg = finalCanvas ? finalCanvas.toDataURL('image/png') : 'data:image/png;base64,'
            const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="${th}" viewBox="0 0 ${tw} ${th}"><image href="${pngForSvg}" x="0" y="0" width="${tw}" height="${th}"/></svg>`
            zip.file(`svg/page-${pageNum}-${tw}x${th}.svg`, svg)
          }
        } catch (error) {
          console.error(`SVG生成失败 (${tw}x${th}):`, error)
          // 发生错误时回退到PNG嵌入式SVG
          const pngForSvg = finalCanvas ? finalCanvas.toDataURL('image/png') : 'data:image/png;base64,'
          const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="${th}" viewBox="0 0 ${tw} ${th}"><image href="${pngForSvg}" x="0" y="0" width="${tw}" height="${th}"/></svg>`
          zip.file(`svg/page-${pageNum}-${tw}x${th}.svg`, svg)
        }
      }
      
      // 给浏览器一点时间来处理，避免阻塞UI
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    
    setStatus('正在打包文件...')
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
    // 获取canvas相对于容器的位置
    const canvasRect = canvas.getBoundingClientRect()
    const wrapRect = canvasWrap.getBoundingClientRect()
    
    // 计算相对于canvas的坐标
    const x = e.clientX - canvasRect.left
    const y = e.clientY - canvasRect.top
    
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
    
    // 获取canvas相对于页面的位置
    const canvasRect = canvasRef.current.getBoundingClientRect()
    let x = e.clientX - canvasRect.left
    let y = e.clientY - canvasRect.top
    
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
    if (selection && cropRef.current && canvasRef.current && canvasWrapRef.current) {
      // 获取canvas相对于容器的位置
      const canvas = canvasRef.current
      const canvasWrap = canvasWrapRef.current
      const canvasRect = canvas.getBoundingClientRect()
      const wrapRect = canvasWrap.getBoundingClientRect()
      
      // canvas相对于容器的偏移
      const canvasOffsetX = canvasRect.left - wrapRect.left + canvasWrap.scrollLeft
      const canvasOffsetY = canvasRect.top - wrapRect.top + canvasWrap.scrollTop
      
      // 选区在canvas上的位置
      const x = Math.floor(Math.min(selection.x0, selection.x1))
      const y = Math.floor(Math.min(selection.y0, selection.y1))
      const w = Math.floor(Math.abs(selection.x1 - selection.x0))
      const h = Math.floor(Math.abs(selection.y1 - selection.y0))
      
      // 选区框在容器中的最终位置
      cropRef.current.style.left = (canvasOffsetX + x) + 'px'
      cropRef.current.style.top = (canvasOffsetY + y) + 'px'
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
          <div className="pdf-note">说明：SVG为真正的矢量格式，可无限放大保持清晰，支持白底背景去除；浏览器不支持导出ICO。</div>
        </div>
        
        <div className="pdf-panel pdf-right">
          <div 
            className="pdf-canvas-wrap"
            ref={canvasWrapRef}
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
              
              <div className="pdf-group">
                <button className="pdf-btn" onClick={handleZoomOut} title="缩小">
                  <i className="fa-solid fa-minus"></i>
                </button>
                <span className="pdf-badge">
                  <i className="fa-solid fa-magnifying-glass"></i>
                  {Math.round(viewZoom * 100)}%
                </span>
                <button className="pdf-btn" onClick={handleZoomIn} title="放大">
                  <i className="fa-solid fa-plus"></i>
                </button>
                <button className="pdf-btn" onClick={handleZoomReset} title="重置缩放">
                  <i className="fa-solid fa-arrows-rotate"></i>
                </button>
                <button className="pdf-btn" onClick={handleZoomFit} title="适应页面">
                  <i className="fa-solid fa-expand"></i>
                </button>
              </div>
              
              <div className="pdf-group">
                <button className="pdf-btn" onClick={clearSelection} title="清除选区">
                  <i className="fa-solid fa-xmark"></i>清除选区
                </button>
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
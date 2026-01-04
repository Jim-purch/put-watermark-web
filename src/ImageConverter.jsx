import React, { useState, useEffect, useRef } from 'react';
import './ImageConverter.css';

export default function ImageConverter() {
    // State
    const [originalImage, setOriginalImage] = useState(null);
    const [imageX, setImageX] = useState(0);
    const [imageY, setImageY] = useState(0);
    const [imageScale, setImageScale] = useState(1);
    const [imageRotation, setImageRotation] = useState(0);
    const [bgColor, setBgColor] = useState('#ffffff');
    const [bgOpacity, setBgOpacity] = useState(1);
    const [canvasWidth, setCanvasWidth] = useState(256);
    const [canvasHeight, setCanvasHeight] = useState(256);
    const [exportFormat, setExportFormat] = useState('ico');
    const [exportQuality, setExportQuality] = useState(0.92);
    const [linkSizeEnabled, setLinkSizeEnabled] = useState(true);
    const [borderRadius, setBorderRadius] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    // Refs
    const canvasRef = useRef(null);
    const fileInputRef = useRef(null);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const imageStartRef = useRef({ x: 0, y: 0 });

    // Initialize/Update Canvas
    useEffect(() => {
        updateCanvas();
    }, [originalImage, imageX, imageY, imageScale, imageRotation, bgColor, bgOpacity, canvasWidth, canvasHeight, borderRadius]);

    // Handlers
    const handleFileSelect = (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            loadFile(files[0]);
        }
    };

    const loadFile = (file) => {
        const isICO = file.name.toLowerCase().endsWith('.ico') || file.type === 'image/x-icon';
        if (isICO) {
            loadICO(file);
        } else {
            loadImage(file);
        }
    };

    const loadImage = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                setOriginalImage(img);
                resetTransform();
                centerImage();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    const loadICO = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const buffer = e.target.result;
            parseICO(buffer);
        };
        reader.readAsArrayBuffer(file);
    };

    const parseICO = (buffer) => {
        const view = new DataView(buffer);
        const reserved = view.getUint16(0, true);
        const type = view.getUint16(2, true);
        const count = view.getUint16(4, true);

        if (reserved !== 0 || type !== 1 || count === 0) {
            const blob = new Blob([buffer], { type: 'image/x-icon' });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                setOriginalImage(img);
                resetTransform();
                centerImage();
                URL.revokeObjectURL(url);
            };
            img.onerror = () => {
                alert('无法解析ICO文件');
                URL.revokeObjectURL(url);
            };
            img.src = url;
            return;
        }

        let maxSize = 0;
        let bestEntry = null;
        let entryOffset = 6;

        for (let i = 0; i < count; i++) {
            let width = view.getUint8(entryOffset);
            let height = view.getUint8(entryOffset + 1);
            if (width === 0) width = 256;
            if (height === 0) height = 256;
            const size = width * height;
            if (size > maxSize) {
                maxSize = size;
                bestEntry = {
                    width,
                    height,
                    offset: view.getUint32(entryOffset + 12, true),
                    size: view.getUint32(entryOffset + 8, true)
                };
            }
            entryOffset += 16;
        }

        if (bestEntry) {
            const imageData = new Uint8Array(buffer, bestEntry.offset, bestEntry.size);
            if (imageData[0] === 0x89 && imageData[1] === 0x50 && imageData[2] === 0x4E && imageData[3] === 0x47) {
                const blob = new Blob([imageData], { type: 'image/png' });
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => {
                    setOriginalImage(img);
                    resetTransform();
                    centerImage();
                    URL.revokeObjectURL(url);
                };
                img.src = url;
            } else {
                const blob = new Blob([buffer], { type: 'image/x-icon' });
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => {
                    setOriginalImage(img);
                    resetTransform();
                    centerImage();
                    URL.revokeObjectURL(url);
                };
                img.src = url;
            }
        }
    };

    const resetTransform = () => {
        setImageScale(1);
        setImageRotation(0);
        setImageX(0);
        setImageY(0);
    };

    const centerImage = () => {
        setImageX(0);
        setImageY(0);
    };

    const updateCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        const minDim = Math.min(canvasWidth, canvasHeight);
        const radiusPx = (borderRadius / 100) * (minDim / 2);

        if (borderRadius > 0) {
            ctx.save();
            drawRoundedRect(ctx, 0, 0, canvasWidth, canvasHeight, radiusPx);
            ctx.clip();
        }

        if (bgOpacity > 0) {
            ctx.globalAlpha = bgOpacity;
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            ctx.globalAlpha = 1;
        }

        if (originalImage) {
            ctx.save();
            ctx.translate(canvasWidth / 2 + imageX, canvasHeight / 2 + imageY);
            ctx.rotate(imageRotation * Math.PI / 180);
            ctx.scale(imageScale, imageScale);

            const scale = Math.min(
                canvasWidth / originalImage.width,
                canvasHeight / originalImage.height
            );

            const scaledWidth = originalImage.width * scale;
            const scaledHeight = originalImage.height * scale;

            ctx.drawImage(
                originalImage,
                -scaledWidth / 2,
                -scaledHeight / 2,
                scaledWidth,
                scaledHeight
            );
            ctx.restore();
        }

        if (borderRadius > 0) {
            ctx.restore();
        }
    };

    const drawRoundedRect = (ctx, x, y, width, height, radius) => {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    };

    // Drag Logic
    const startDrag = (e) => {
        if (!originalImage) return;
        setIsDragging(true);
        const pos = getEventPos(e);
        dragStartRef.current = pos;
        imageStartRef.current = { x: imageX, y: imageY };
    };

    const drag = (e) => {
        if (!isDragging) return;
        const pos = getEventPos(e);
        setImageX(imageStartRef.current.x + (pos.x - dragStartRef.current.x));
        setImageY(imageStartRef.current.y + (pos.y - dragStartRef.current.y));
    };

    const endDrag = () => {
        setIsDragging(false);
    };

    const getEventPos = (e) => {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    };

    const handleWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY;
        const scaleStep = 0.1;

        let newScale = imageScale;
        if (delta < 0) {
            newScale += scaleStep;
        } else {
            newScale -= scaleStep;
        }

        // Clamp scale between 0.1 and 5
        newScale = Math.min(Math.max(newScale, 0.1), 5);

        // Round to 2 decimal places to avoid float precision issues
        newScale = Math.round(newScale * 100) / 100;

        setImageScale(newScale);
    };

    const adjustZoom = (delta) => {
        let newScale = imageScale + delta;
        newScale = Math.min(Math.max(newScale, 0.1), 5);
        newScale = Math.round(newScale * 100) / 100;
        setImageScale(newScale);
    };

    // Global drag events
    useEffect(() => {
        const handleMove = (e) => drag(e);
        const handleUp = () => endDrag();

        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);
        document.addEventListener('touchmove', handleMove);
        document.addEventListener('touchend', handleUp);

        return () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleUp);
            document.removeEventListener('touchmove', handleMove);
            document.removeEventListener('touchend', handleUp);
        };
    }, [isDragging]); // Rely on isDragging state? Actually ref values are used inside drag, so safe.

    const removeBackground = () => {
        if (!originalImage) {
            alert('请先上传图片');
            return;
        }

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = originalImage.width;
        tempCanvas.height = originalImage.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(originalImage, 0, 0);

        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;

        // Sample corners
        const corners = [
            { x: 0, y: 0 },
            { x: tempCanvas.width - 1, y: 0 },
            { x: 0, y: tempCanvas.height - 1 },
            { x: tempCanvas.width - 1, y: tempCanvas.height - 1 }
        ];

        let totalR = 0, totalG = 0, totalB = 0;
        corners.forEach(corner => {
            const idx = (corner.y * tempCanvas.width + corner.x) * 4;
            totalR += data[idx];
            totalG += data[idx + 1];
            totalB += data[idx + 2];
        });

        const bg = {
            r: Math.round(totalR / 4),
            g: Math.round(totalG / 4),
            b: Math.round(totalB / 4)
        };

        const tolerance = 30;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const dist = Math.sqrt(Math.pow(r - bg.r, 2) + Math.pow(g - bg.g, 2) + Math.pow(b - bg.b, 2));
            if (dist < tolerance) {
                data[i + 3] = 0;
            }
        }

        tempCtx.putImageData(imageData, 0, 0);
        const newImg = new Image();
        newImg.onload = () => setOriginalImage(newImg);
        newImg.src = tempCanvas.toDataURL('image/png');
    };

    const downloadFile = (url, filename) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportImage = () => {
        if (!originalImage && bgOpacity === 0) {
            alert('请先上传图片');
            return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;

        if (exportFormat === 'png') {
            downloadFile(canvas.toDataURL('image/png'), 'image.png');
        } else if (exportFormat === 'jpg') {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvasWidth;
            tempCanvas.height = canvasHeight;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.fillStyle = '#ffffff';
            tempCtx.fillRect(0, 0, canvasWidth, canvasHeight);
            tempCtx.drawImage(canvas, 0, 0);
            downloadFile(tempCanvas.toDataURL('image/jpeg', exportQuality), 'image.jpg');
        } else if (exportFormat === 'webp') {
            downloadFile(canvas.toDataURL('image/webp', exportQuality), 'image.webp');
        } else if (exportFormat === 'ico') {
            const pngDataURL = canvas.toDataURL('image/png');
            const pngData = dataURLToUint8Array(pngDataURL);
            const width = Math.min(256, canvasWidth);
            const height = Math.min(256, canvasHeight);

            const header = new Uint8Array(6);
            const hv = new DataView(header.buffer);
            hv.setUint16(0, 0, true);
            hv.setUint16(2, 1, true);
            hv.setUint16(4, 1, true);

            const entry = new Uint8Array(16);
            const ev = new DataView(entry.buffer);
            ev.setUint8(0, width >= 256 ? 0 : width);
            ev.setUint8(1, height >= 256 ? 0 : height);
            ev.setUint8(2, 0);
            ev.setUint8(3, 0);
            ev.setUint16(4, 1, true);
            ev.setUint16(6, 32, true);
            ev.setUint32(8, pngData.length, true);
            ev.setUint32(12, 22, true);

            const ico = new Uint8Array(header.length + entry.length + pngData.length);
            ico.set(header, 0);
            ico.set(entry, 6);
            ico.set(pngData, 22);

            const blob = new Blob([ico], { type: 'image/x-icon' });
            const url = URL.createObjectURL(blob);
            downloadFile(url, 'icon.ico');
            URL.revokeObjectURL(url);
        }
    };

    const dataURLToUint8Array = (dataURL) => {
        const base64 = dataURL.split(',')[1];
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
        }
        return array;
    };

    return (
        <div className="ico-converter-root">


            <main className="main-content">
                {!originalImage ? (
                    <section className="upload-section">
                        <div
                            className="upload-zone"
                            onClick={() => fileInputRef.current.click()}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('drag-over'); }}
                            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('drag-over'); }}
                            onDrop={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                e.currentTarget.classList.remove('drag-over');
                                if (e.dataTransfer.files.length > 0) loadFile(e.dataTransfer.files[0]);
                            }}
                        >
                            <div className="upload-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17,8 12,3 7,8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                            </div>
                            <p className="upload-text">拖拽图片到此处，或点击选择文件</p>
                            <p className="upload-hint">支持 PNG, JPG, GIF, BMP, WEBP, ICO 格式</p>
                            <input type="file" ref={fileInputRef} accept="image/*,.ico" hidden onChange={handleFileSelect} />
                        </div>
                    </section>
                ) : (
                    <section className="editor-section">
                        <div className="editor-layout">
                            {/* Canvas Preview */}
                            <div className="canvas-container">
                                <div className="canvas-wrapper" onWheel={handleWheel}>
                                    <canvas
                                        ref={canvasRef}
                                        onMouseDown={startDrag}
                                        onTouchStart={startDrag}
                                    />
                                </div>
                                <div className="canvas-actions">
                                    <div className="zoom-controls">
                                        <button className="btn btn-secondary btn-icon-only" onClick={() => adjustZoom(-0.1)} title="缩小">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <line x1="5" y1="12" x2="19" y2="12" />
                                            </svg>
                                        </button>
                                        <span className="zoom-level">{Math.round(imageScale * 100)}%</span>
                                        <button className="btn btn-secondary btn-icon-only" onClick={() => adjustZoom(0.1)} title="放大">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <line x1="12" y1="5" x2="12" y2="19" />
                                                <line x1="5" y1="12" x2="19" y2="12" />
                                            </svg>
                                        </button>
                                    </div>
                                    <div className="divider"></div>
                                    <button className="btn btn-secondary" onClick={resetTransform}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                            <path d="M3 3v5h5" />
                                        </svg>
                                        重置
                                    </button>
                                    <button className="btn btn-secondary" onClick={centerImage}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="3" y="3" width="18" height="18" rx="2" />
                                            <line x1="12" y1="3" x2="12" y2="21" />
                                            <line x1="3" y1="12" x2="21" y2="12" />
                                        </svg>
                                        居中
                                    </button>
                                    <button className="btn btn-secondary" onClick={() => { setOriginalImage(null); fileInputRef.current.value = ''; }}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                            <polyline points="14,2 14,8 20,8" />
                                            <line x1="12" y1="18" x2="12" y2="12" />
                                            <line x1="9" y1="15" x2="15" y2="15" />
                                        </svg>
                                        新文件
                                    </button>
                                </div>
                            </div>

                            {/* Control Panel */}
                            <div className="control-panel">
                                <div className="control-group">
                                    <h3 className="control-title">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
                                            <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
                                            <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
                                            <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
                                            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                                        </svg>
                                        背景颜色
                                    </h3>
                                    <div className="color-picker-wrapper">
                                        <input type="color" className="color-picker" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
                                        <input type="text" className="color-hex-input" value={bgColor} onChange={(e) => {
                                            const hex = e.target.value;
                                            setBgColor(hex);
                                        }} />
                                    </div>
                                    <div className="opacity-control">
                                        <label>透明度</label>
                                        <input type="range" className="slider" min="0" max="100" value={bgOpacity * 100} onChange={(e) => setBgOpacity(e.target.value / 100)} />
                                        <span>{Math.round(bgOpacity * 100)}%</span>
                                    </div>
                                    <div className="preset-colors">
                                        {['#ffffff', '#000000', '#f3f4f6', '#3b82f6', '#10b981', '#f59e0b'].map(c => (
                                            <button key={c} className="preset-color" style={{ background: c }} onClick={() => { setBgColor(c); setBgOpacity(1); }} />
                                        ))}
                                        <button className="preset-color transparent-preset" title="透明" onClick={() => setBgOpacity(0)} />
                                    </div>
                                </div>

                                <div className="control-group">
                                    <h3 className="control-title">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="15,3 21,3 21,9" />
                                            <polyline points="9,21 3,21 3,15" />
                                            <line x1="21" y1="3" x2="14" y2="10" />
                                            <line x1="3" y1="21" x2="10" y2="14" />
                                        </svg>
                                        图片调整
                                    </h3>
                                    <div className="slider-control">
                                        <label>缩放</label>
                                        <input type="range" className="slider" min="10" max="500" value={imageScale * 100} onChange={(e) => setImageScale(e.target.value / 100)} />
                                        <span>{Math.round(imageScale * 100)}%</span>
                                    </div>
                                    <div className="slider-control">
                                        <label>旋转</label>
                                        <input type="range" className="slider" min="0" max="360" value={imageRotation} onChange={(e) => setImageRotation(parseInt(e.target.value))} />
                                        <span>{imageRotation}°</span>
                                    </div>
                                    <button className="btn btn-secondary" style={{ width: '100%', marginTop: '0.75rem' }} onClick={removeBackground}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                                            <line x1="7" y1="7" x2="7.01" y2="7" />
                                        </svg>
                                        移除纯色背景
                                    </button>
                                </div>

                                <div className="control-group">
                                    <h3 className="control-title">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="3" y="3" width="18" height="18" rx="2" />
                                        </svg>
                                        画布尺寸
                                    </h3>
                                    <div className="size-inputs">
                                        <div className="size-input-group">
                                            <label>宽度</label>
                                            <input type="number" value={canvasWidth} min="16" max="3000" onChange={(e) => {
                                                const val = parseInt(e.target.value) || 256;
                                                setCanvasWidth(val);
                                                if (linkSizeEnabled) setCanvasHeight(val);
                                            }} />
                                        </div>
                                        <button className={`link-btn ${linkSizeEnabled ? 'active' : ''}`} onClick={() => setLinkSizeEnabled(!linkSizeEnabled)}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                            </svg>
                                        </button>
                                        <div className="size-input-group">
                                            <label>高度</label>
                                            <input type="number" value={canvasHeight} min="16" max="3000" onChange={(e) => {
                                                const val = parseInt(e.target.value) || 256;
                                                setCanvasHeight(val);
                                                if (linkSizeEnabled) setCanvasWidth(val);
                                            }} />
                                        </div>
                                    </div>
                                    <div className="preset-sizes">
                                        {[16, 32, 48, 64, 128, 256, 512, 1024].map(s => (
                                            <button
                                                key={s}
                                                className={`preset-size ${canvasWidth === s && canvasHeight === s ? 'active' : ''}`}
                                                onClick={() => { setCanvasWidth(s); setCanvasHeight(s); }}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="slider-control" style={{ marginTop: '1rem' }}>
                                        <label>圆角</label>
                                        <input type="range" className="slider" min="0" max="100" value={borderRadius} onChange={(e) => setBorderRadius(parseInt(e.target.value))} />
                                        <span>{borderRadius}%</span>
                                    </div>
                                </div>

                                <div className="control-group export-group">
                                    <h3 className="control-title">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                            <polyline points="7,10 12,15 17,10" />
                                            <line x1="12" y1="15" x2="12" y2="3" />
                                        </svg>
                                        导出
                                    </h3>
                                    <div className="export-format">
                                        <label>格式</label>
                                        <div className="format-buttons">
                                            {['png', 'jpg', 'ico', 'webp'].map(f => (
                                                <button
                                                    key={f}
                                                    className={`format-btn ${exportFormat === f ? 'active' : ''}`}
                                                    onClick={() => setExportFormat(f)}
                                                >
                                                    {f.toUpperCase()}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {exportFormat === 'jpg' && (
                                        <div className="export-quality">
                                            <label>质量</label>
                                            <input type="range" className="slider" min="1" max="100" value={exportQuality * 100} onChange={(e) => setExportQuality(e.target.value / 100)} />
                                            <span>{Math.round(exportQuality * 100)}%</span>
                                        </div>
                                    )}
                                    <button className="btn btn-primary btn-export" onClick={exportImage}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                            <polyline points="7,10 12,15 17,10" />
                                            <line x1="12" y1="15" x2="12" y2="3" />
                                        </svg>
                                        导出图片
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}

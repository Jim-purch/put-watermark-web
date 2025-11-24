import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

function FileExtractor() {
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [selectedColumn, setSelectedColumn] = useState('');
  const [urlPrefix, setUrlPrefix] = useState('');
  const [threadCount, setThreadCount] = useState(3);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef(null);
  
  // 新增状态：用于处理空格分列
  const [showColumnSplitter, setShowColumnSplitter] = useState(false);
  const [splitColumnData, setSplitColumnData] = useState([]);
  const [selectedSplitIndex, setSelectedSplitIndex] = useState(0);
  
  // 新增状态：用于行范围和文件夹选择
  const [rowRange, setRowRange] = useState({ start: 1, end: 100 });
  const [destinationFolder, setDestinationFolder] = useState('');
  const [exporting, setExporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResults, setValidationResults] = useState([]);

  // 解析CSV文件
  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return { headers: [], data: [] };
    
    // 解析CSV行，处理逗号和引号
    const parseLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      
      result.push(current.trim());
      return result;
    };
    
    const headers = parseLine(lines[0]);
    const data = lines.slice(1).map(line => parseLine(line));
    
    return { headers, data };
  };

  // 处理空格分列
  const handleColumnSplit = (columnName) => {
    const columnIndex = headers.indexOf(columnName);
    if (columnIndex === -1) return;
    
    // 获取该列的所有值
    const columnValues = csvData.map(row => row[columnIndex] || '');
    
    // 检查是否有空格
    const hasSpaces = columnValues.some(value => value.includes(' '));
    
    if (!hasSpaces) {
      // 没有空格，直接使用原列
      setShowColumnSplitter(false);
      return;
    }
    
    // 按空格分割所有值，并找出最大分割数
    const splitValues = columnValues.map(value => value.split(/\s+/));
    const maxSplits = Math.max(...splitValues.map(values => values.length));
    
    // 创建预览数据
    const previewData = splitValues.slice(0, 5).map((values, index) => {
      const row = { original: columnValues[index] };
      for (let i = 0; i < maxSplits; i++) {
        row[i] = values[i] || '';
      }
      return row;
    });
    
    setSplitColumnData({
      columnName,
      maxSplits,
      previewData,
      splitValues
    });
    setShowColumnSplitter(true);
    setSelectedSplitIndex(0);
  };
  
  // 处理文件选择
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file || !file.name.endsWith('.csv')) {
      alert('请选择CSV文件');
      return;
    }
    
    setCsvFile(file);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const { headers, data } = parseCSV(text);
      setHeaders(headers);
      setCsvData(data);
      setSelectedColumn('');
      setShowColumnSplitter(false);
      // 设置行范围默认为全部行
      setRowRange({ start: 1, end: data.length });
    };
    reader.readAsText(file);
  };

  // 验证单个URL是否可访问
  const validateUrl = async (url) => {
    try {
      const response = await fetch(url, {
        method: 'HEAD', // 只获取头部信息，不下载内容
        mode: 'cors',
        cache: 'no-cache'
      });
      return { url, accessible: response.ok, status: response.status };
    } catch (error) {
      return { url, accessible: false, error: error.message };
    }
  };

  // 下载单个文件
  const downloadFile = async (url, filename) => {
    try {
      // 添加更详细的请求配置，包括跨域处理
      const response = await fetch(url, {
        mode: 'cors', // 明确指定CORS模式
        cache: 'no-cache', // 避免缓存问题
        headers: {
          // 可以根据需要添加特定头部
        }
      });
      
      if (!response.ok) {
        throw new Error(`下载失败: ${response.status} ${response.statusText}`);
      }
      
      const blob = await response.blob();
      return { filename, blob, success: true };
    } catch (error) {
      console.error(`下载 ${filename} 失败:`, error);
      
      // 提供更详细的错误信息
      let errorMessage = error.message;
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        errorMessage = `网络错误或跨域问题: ${url}`;
      }
      
      return { filename, success: false, error: errorMessage };
    }
  };

  // 验证第一个URL的可访问性
  const validateFirstUrl = async () => {
    if (!csvData.length || !selectedColumn) {
      alert('请先选择CSV文件和URL列');
      return;
    }
    
    // 获取指定行范围的数据
    const startIndex = Math.max(0, rowRange.start - 1);
    const endIndex = Math.min(csvData.length, rowRange.end);
    const rangeData = csvData.slice(startIndex, endIndex);
    
    // 只获取第一个URL进行验证
    const firstRow = rangeData[0];
    if (!firstRow) {
      alert('没有找到数据行');
      return;
    }
    
    const columnIndex = headers.indexOf(selectedColumn);
    if (columnIndex === -1) {
      alert('选择的列不存在');
      return;
    }
    
    let fieldValue = firstRow[columnIndex] || '';
    
    // 如果使用了空格分列功能，则使用分割后的特定部分
    if (showColumnSplitter && splitColumnData.columnName === selectedColumn) {
      const rowIndex = startIndex;
      if (rowIndex >= 0 && rowIndex < splitColumnData.splitValues.length) {
        const splitValues = splitColumnData.splitValues[rowIndex];
        if (splitValues[selectedSplitIndex]) {
          fieldValue = splitValues[selectedSplitIndex];
        }
      }
    }
    
    const firstUrl = urlPrefix + fieldValue;
    
    if (!firstUrl || !firstUrl.trim()) {
      alert('第一个URL为空');
      return;
    }
    
    setValidating(true);
    setValidationResults([]);
    
    try {
      const result = await validateUrl(firstUrl);
      setValidationResults([result]);
      
      if (result.accessible) {
        alert(`第一个URL可访问: ${firstUrl}`);
      } else {
        alert(`第一个URL不可访问: ${firstUrl}\n错误: ${result.error || `状态码: ${result.status}`}`);
      }
    } catch (error) {
      console.error('URL验证失败:', error);
      alert('URL验证过程中发生错误');
    } finally {
      setValidating(false);
    }
  };

  // 批量下载文件
  const batchDownload = async () => {
    if (!csvData.length || !selectedColumn) {
      alert('请先选择CSV文件和URL列');
      return;
    }
    
    // 获取指定行范围的数据
    const startIndex = Math.max(0, rowRange.start - 1); // 转换为0基索引
    const endIndex = Math.min(csvData.length, rowRange.end); // 确保不超过数据长度
    const rangeData = csvData.slice(startIndex, endIndex);
    
    // 获取指定行范围的URL
    const urls = rangeData
      .map((row, index) => {
        const columnIndex = headers.indexOf(selectedColumn);
        if (columnIndex === -1) return null;
        
        let fieldValue = row[columnIndex] || '';
        
        // 如果使用了空格分列功能，则使用分割后的特定部分
        if (showColumnSplitter && splitColumnData.columnName === selectedColumn) {
          const rowIndex = startIndex + index;
          if (rowIndex >= 0 && rowIndex < splitColumnData.splitValues.length) {
            const splitValues = splitColumnData.splitValues[rowIndex];
            if (splitValues[selectedSplitIndex]) {
              fieldValue = splitValues[selectedSplitIndex];
            }
          }
        }
        
        const fullUrl = urlPrefix + fieldValue;
        
        // 生成文件名
        let filename = '';
        try {
          const urlObj = new URL(fullUrl);
          const pathname = urlObj.pathname;
          const lastSlashIndex = pathname.lastIndexOf('/');
          filename = lastSlashIndex !== -1 ? pathname.substring(lastSlashIndex + 1) : `file_${startIndex + index + 1}`;
        } catch {
          // 如果URL解析失败，使用字段值作为文件名
          const extension = getFileExtension(fullUrl);
          filename = fieldValue.includes('.') ? fieldValue : `${fieldValue}.${extension}`;
        }
        
        // 如果设置了目的文件夹，则在文件名前添加文件夹路径
        if (destinationFolder) {
          // 确保文件夹路径以/结尾
          const folderPath = destinationFolder.endsWith('/') ? destinationFolder : `${destinationFolder}/`;
          filename = `${folderPath}${filename}`;
        }
        
        return { url: fullUrl, filename };
      })
      .filter(item => item.url && item.url.trim());
    
    if (!urls.length) {
      alert('没有找到有效的URL');
      return;
    }
    
    setDownloading(true);
    setDownloadProgress({ current: 0, total: urls.length });
    
    try {
      // 创建ZIP文件
      const zip = new JSZip();
      
      // 分批处理下载
      const batchSize = Math.ceil(urls.length / threadCount);
      const batches = [];
      
      for (let i = 0; i < urls.length; i += batchSize) {
        batches.push(urls.slice(i, i + batchSize));
      }
      
      // 并行下载批次
      const downloadPromises = batches.map(async (batch, batchIndex) => {
        const results = [];
        for (let j = 0; j < batch.length; j++) {
          const { url, filename } = batch[j];
          
          const result = await downloadFile(url, filename);
          results.push(result);
          
          // 更新进度
          setDownloadProgress(prev => ({ 
            ...prev, 
            current: prev.current + 1 
          }));
        }
        return results;
      });
      
      // 等待所有批次完成
      const batchResults = await Promise.all(downloadPromises);
      const allResults = batchResults.flat();
      
      // 添加成功下载的文件到ZIP
      let successCount = 0;
      let failCount = 0;
      
      allResults.forEach(result => {
        if (result.success && result.blob) {
          zip.file(result.filename, result.blob);
          successCount++;
        } else {
          failCount++;
        }
      });
      
      // 生成并下载ZIP文件
      if (successCount > 0) {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        saveAs(zipBlob, `extracted_files_${timestamp}.zip`);
        
        alert(`下载完成！成功: ${successCount}, 失败: ${failCount}`);
      } else {
        alert('所有文件下载失败');
      }
    } catch (error) {
      console.error('批量下载失败:', error);
      alert('批量下载过程中发生错误');
    } finally {
      setDownloading(false);
      setDownloadProgress({ current: 0, total: 0 });
    }
  };

  // 获取文件扩展名
  const getFileExtension = (url) => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const lastDotIndex = pathname.lastIndexOf('.');
      return lastDotIndex !== -1 ? pathname.substring(lastDotIndex + 1) : 'bin';
    } catch {
      // 如果URL解析失败，尝试从字符串中提取
      const lastDotIndex = url.lastIndexOf('.');
      return lastDotIndex !== -1 ? url.substring(lastDotIndex + 1).split('?')[0] : 'bin';
    }
  };

  // 导出文件目录功能
  const exportFileDirectory = async () => {
    if (!csvData.length || !selectedColumn) {
      alert('请先选择CSV文件和URL列');
      return;
    }
    
    setExporting(true);
    
    try {
      // 获取指定行范围的数据
      const startIndex = Math.max(0, rowRange.start - 1); // 转换为0基索引
      const endIndex = Math.min(csvData.length, rowRange.end); // 确保不超过数据长度
      const rangeData = csvData.slice(startIndex, endIndex);
      
      // 为每行生成文件名
      const fileNames = rangeData.map((row, index) => {
        const columnIndex = headers.indexOf(selectedColumn);
        if (columnIndex === -1) return '';
        
        let fieldValue = row[columnIndex] || '';
        
        // 如果使用了空格分列功能，则使用分割后的特定部分
        if (showColumnSplitter && splitColumnData.columnName === selectedColumn) {
          const rowIndex = startIndex + index;
          if (rowIndex < splitColumnData.splitValues.length) {
            const splitValues = splitColumnData.splitValues[rowIndex];
            if (splitValues[selectedSplitIndex]) {
              fieldValue = splitValues[selectedSplitIndex];
            }
          }
        }
        
        const fullUrl = urlPrefix + fieldValue;
        const extension = getFileExtension(fullUrl);
        
        // 生成文件名：使用原始字段值或URL的最后一部分
        let fileName = '';
        try {
          const urlObj = new URL(fullUrl);
          const pathname = urlObj.pathname;
          const lastSlashIndex = pathname.lastIndexOf('/');
          fileName = lastSlashIndex !== -1 ? pathname.substring(lastSlashIndex + 1) : `file_${startIndex + index + 1}`;
          
          // 确保文件名包含扩展名
          if (!fileName.includes('.')) {
            fileName += `.${extension}`;
          }
        } catch {
          // 如果URL解析失败，使用字段值作为文件名
          fileName = fieldValue.includes('.') ? fieldValue : `${fieldValue}.${extension}`;
        }
        
        return fileName;
      });
      
      // 创建新的CSV数据，添加文件名列
      const newHeaders = [...headers, '文件名'];
      const newData = csvData.map((row, index) => {
        if (index >= startIndex && index < endIndex) {
          const arrayIndex = index - startIndex;
          return [...row, fileNames[arrayIndex]];
        }
        return [...row, '']; // 不在范围内的行添加空值
      });
      
      // 转换为CSV格式
      const csvContent = [
        newHeaders.join(','),
        ...newData.map(row => 
          row.map(cell => {
            // 如果单元格包含逗号或引号，需要用引号包围并转义内部引号
            if (cell.includes(',') || cell.includes('"')) {
              return `"${cell.replace(/"/g, '""')}"`;
            }
            return cell;
          }).join(',')
        )
      ].join('\n');
      
      // 创建Blob并下载
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      saveAs(blob, `file_directory_${timestamp}.csv`);
      
      alert(`文件目录导出成功！共导出 ${fileNames.length} 个文件名`);
    } catch (error) {
      console.error('导出文件目录失败:', error);
      alert('导出文件目录过程中发生错误');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="file-extractor">
      <section className="panel">
        <div className="field">
          <label>选择CSV文件</label>
          <input 
            type="file" 
            accept=".csv" 
            onChange={handleFileChange} 
            ref={fileInputRef}
          />
          <small>支持CSV格式文件，选择后可在下方预览内容。</small>
        </div>

        {csvData.length > 0 && (
          <>
            <div className="field">
              <label>CSV预览（前10行）</label>
              <div className="csv-preview">
                <table>
                  <thead>
                    <tr>
                      {headers.map((header, index) => (
                        <th key={index}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 10).map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvData.length > 10 && (
                  <p className="csv-more-info">还有 {csvData.length - 10} 行数据...</p>
                )}
              </div>
            </div>

            <div className="field">
              <label>选择URL列</label>
              <select 
                value={selectedColumn} 
                onChange={(e) => {
                  setSelectedColumn(e.target.value);
                  if (e.target.value) {
                    handleColumnSplit(e.target.value);
                  } else {
                    setShowColumnSplitter(false);
                  }
                }}
              >
                <option value="">请选择列</option>
                {headers.map((header, index) => (
                  <option key={index} value={header}>{header}</option>
                ))}
              </select>
            </div>
            
            {showColumnSplitter && splitColumnData.columnName === selectedColumn && (
              <div className="field">
                <label>检测到空格分隔，请选择URL所在的列序号</label>
                <div className="split-column-preview">
                  <table>
                    <thead>
                      <tr>
                        <th>原始值</th>
                        {Array.from({ length: splitColumnData.maxSplits }, (_, i) => (
                          <th key={i}>列 {i + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {splitColumnData.previewData.map((row, index) => (
                        <tr key={index}>
                          <td>{row.original}</td>
                          {Array.from({ length: splitColumnData.maxSplits }, (_, i) => (
                            <td 
                              key={i} 
                              className={selectedSplitIndex === i ? 'selected-split' : ''}
                            >
                              {row[i] || ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="split-column-selector">
                  <label>选择URL列序号：</label>
                  <div className="split-options">
                    {Array.from({ length: splitColumnData.maxSplits }, (_, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`split-option ${selectedSplitIndex === i ? 'selected' : ''}`}
                        onClick={() => setSelectedSplitIndex(i)}
                      >
                        列 {i + 1}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="field">
              <label>URL前缀（可选）</label>
              <input 
                type="text" 
                value={urlPrefix} 
                onChange={(e) => setUrlPrefix(e.target.value)}
                placeholder="例如: https://example.com/files/"
              />
              <small>将拼接在所选列值的前面，可以为空。</small>
            </div>

            <div className="field">
              <label>行范围选择</label>
              <div className="row-range-inputs">
                <div className="input-group">
                  <label>起始行</label>
                  <input 
                    type="number" 
                    min="1" 
                    max={csvData.length || 1} 
                    value={rowRange.start} 
                    onChange={(e) => setRowRange(prev => ({ ...prev, start: Number(e.target.value) }))} 
                  />
                </div>
                <div className="input-group">
                  <label>结束行</label>
                  <input 
                    type="number" 
                    min="1" 
                    max={csvData.length || 1} 
                    value={rowRange.end} 
                    onChange={(e) => setRowRange(prev => ({ ...prev, end: Number(e.target.value) }))} 
                  />
                </div>
              </div>
              <small>选择要下载的行范围，当前CSV共有 {csvData.length} 行数据。</small>
            </div>

            <div className="field">
              <label>目的文件夹（可选）</label>
              <input 
                type="text" 
                value={destinationFolder} 
                onChange={(e) => setDestinationFolder(e.target.value)}
                placeholder="例如: images/documents"
              />
              <small>在ZIP文件中创建的文件夹路径，可以为空。</small>
            </div>

            <div className="field">
              <label>并发线程数</label>
              <div className="range-input-group">
                <input 
                  type="range" 
                  min="1" 
                  max="10" 
                  step="1" 
                  value={threadCount} 
                  onChange={(e) => setThreadCount(Number(e.target.value))} 
                />
                <input 
                  className="input-sm" 
                  type="number" 
                  min="1" 
                  max="10" 
                  value={threadCount} 
                  onChange={(e) => setThreadCount(Number(e.target.value))} 
                />
              </div>
              <small>同时下载的文件数量，建议根据网络情况调整。</small>
            </div>

            {selectedColumn && (
              <div className="field">
                <label>预览URL</label>
                <div className="url-preview">
                  {(() => {
                    // 只取第一行数据进行预览
                    const firstRow = csvData[0];
                    if (!firstRow) return null;
                    
                    const columnIndex = headers.indexOf(selectedColumn);
                    if (columnIndex === -1) return null;
                    
                    let fieldValue = firstRow[columnIndex] || '';
                    
                    // 如果使用了空格分列功能，则使用分割后的特定部分
                    if (showColumnSplitter && splitColumnData.columnName === selectedColumn) {
                      const rowIndex = 0;
                      if (rowIndex < splitColumnData.splitValues.length) {
                        const splitValues = splitColumnData.splitValues[rowIndex];
                        if (splitValues[selectedSplitIndex]) {
                          fieldValue = splitValues[selectedSplitIndex];
                        }
                      }
                    }
                    
                    const fullUrl = urlPrefix + fieldValue;
                    return (
                      <div className="url-item">
                        <span className="url-full">{fullUrl}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            <div className="field">
              <div className="button-group">
                <button 
                  className="button ghost" 
                  onClick={validateFirstUrl}
                  disabled={validating || !selectedColumn}
                >
                  {validating ? '验证中...' : '验证第一个URL'}
                </button>
                <button 
                  className="button primary" 
                  onClick={batchDownload}
                  disabled={downloading || !selectedColumn}
                >
                  {downloading ? '下载中...' : '开始批量下载'}
                </button>
                <button 
                  className="button ghost" 
                  onClick={exportFileDirectory}
                  disabled={exporting || !selectedColumn}
                >
                  {exporting ? '导出中...' : '导出文件目录'}
                </button>
              </div>
              
              {validationResults.length > 0 && (
                <div className="validation-results">
                  <h3>URL验证结果</h3>
                  <div className="validation-list">
                    {validationResults.map((result, index) => (
                      <div key={index} className={`validation-item ${result.accessible ? 'success' : 'error'}`}>
                        <span className="validation-status">{result.accessible ? '✓' : '✗'}</span>
                        <span className="validation-url">{result.url}</span>
                        {!result.accessible && (
                          <span className="validation-error">{result.error || `状态码: ${result.status}`}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {downloading && (
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${(downloadProgress.current / downloadProgress.total) * 100}%` }}
                ></div>
                <span className="progress-text">
                  {downloadProgress.current} / {downloadProgress.total}
                </span>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default FileExtractor;
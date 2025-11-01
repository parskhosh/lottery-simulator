// Canvas charts module
import { State } from './state.js';
import { fmtBase } from './currency.js';

const chartContexts = {};

// Initialize chart
function initChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  
  const ctx = canvas.getContext('2d');
  chartContexts[canvasId] = ctx;
  
  // Set canvas size
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  
  return ctx;
}

// Draw line chart
function drawLine(canvasId, data, options = {}) {
  const ctx = chartContexts[canvasId];
  if (!ctx || !data || data.length === 0) return;
  
  const canvas = document.getElementById(canvasId);
  const width = canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.height / (window.devicePixelRatio || 1);
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const { isMoney = false, labelLast = true } = options;
  
  // Calculate bounds
  const xMin = Math.min(...data.map(d => d.x));
  const xMax = Math.max(...data.map(d => d.x));
  const yMin = Math.min(0, ...data.map(d => d.y));
  const yMax = Math.max(0, ...data.map(d => d.y));
  
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  
  // Draw zero line
  if (yMin < 0 && yMax > 0) {
    const zeroY = padding + chartHeight * (1 - (-yMin) / yRange);
    ctx.strokeStyle = '#8FA4C7';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding, zeroY);
    ctx.lineTo(width - padding, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  
  // Draw line
  ctx.strokeStyle = options.color || '#11A7FF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  data.forEach((point, idx) => {
    const x = padding + (point.x - xMin) / xRange * chartWidth;
    const y = padding + chartHeight * (1 - (point.y - yMin) / yRange);
    
    if (idx === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  
  ctx.stroke();
  
  // Draw last point with label
  if (labelLast && data.length > 0) {
    const last = data[data.length - 1];
    const lastX = padding + (last.x - xMin) / xRange * chartWidth;
    const lastY = padding + chartHeight * (1 - (last.y - yMin) / yRange);
    
    ctx.fillStyle = options.color || '#11A7FF';
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Label
    const label = isMoney ? fmtBase(last.y) : `${last.y.toFixed(2)}%`;
    ctx.fillStyle = '#E4E8F0';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, lastX, lastY - 8);
  }
}

// Draw bar chart
function drawBars(canvasId, data, options = {}) {
  const ctx = chartContexts[canvasId];
  if (!ctx || !data || data.length === 0) return;
  
  const canvas = document.getElementById(canvasId);
  const width = canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.height / (window.devicePixelRatio || 1);
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const { zeroMid = false } = options;
  
  const padding = 30;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const barWidth = chartWidth / data.length * 0.8;
  const barGap = chartWidth / data.length * 0.2;
  
  // Calculate bounds
  const yMin = Math.min(0, ...data.map(d => d.pl || d.y || 0));
  const yMax = Math.max(0, ...data.map(d => d.pl || d.y || 0));
  const yRange = yMax - yMin || 1;
  
  // Draw zero line if needed
  if (zeroMid && yMin < 0 && yMax > 0) {
    const zeroY = padding + chartHeight * (1 - (-yMin) / yRange);
    ctx.strokeStyle = '#8FA4C7';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding, zeroY);
    ctx.lineTo(width - padding, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  
  // Draw bars
  data.forEach((item, idx) => {
    const x = padding + idx * (barWidth + barGap) + barGap / 2;
    const value = item.pl || item.y || 0;
    const barHeight = Math.abs(value) / yRange * chartHeight;
    const y = padding + chartHeight * (1 - (value - yMin) / yRange) - (value < 0 ? barHeight : 0);
    
    ctx.fillStyle = value >= 0 ? '#2BD67B' : '#FF5E6A';
    ctx.fillRect(x, y, barWidth, barHeight);
  });
}

// Draw category bars
function drawCategoryBars(canvasId, counts, labels) {
  const ctx = chartContexts[canvasId];
  if (!ctx || !counts || Object.keys(counts).length === 0) return;
  
  const canvas = document.getElementById(canvasId);
  const width = canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.height / (window.devicePixelRatio || 1);
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const padding = 30;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  
  const entries = Object.entries(counts).sort((a, b) => {
    const aKey = a[0];
    const bKey = b[0];
    if (aKey.includes('b')) return 1;
    if (bKey.includes('b')) return -1;
    return parseInt(aKey) - parseInt(bKey);
  });
  
  const maxCount = Math.max(...entries.map(e => e[1]), 1);
  const barWidth = chartWidth / entries.length * 0.8;
  const barGap = chartWidth / entries.length * 0.2;
  
  entries.forEach(([key, count], idx) => {
    const x = padding + idx * (barWidth + barGap) + barGap / 2;
    const barHeight = (count / maxCount) * chartHeight;
    const y = padding + chartHeight - barHeight;
    
    ctx.fillStyle = '#11A7FF';
    ctx.fillRect(x, y, barWidth, barHeight);
    
    // Label
    ctx.fillStyle = '#E4E8F0';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(key, x + barWidth / 2, height - 5);
    ctx.fillText(count.toString(), x + barWidth / 2, y - 5);
  });
}

// Update all charts
let chartUpdateTimer = null;
function updateCharts(immediate = false) {
  if (chartUpdateTimer && !immediate) return;
  
  const delay = immediate ? 0 : State.settings.perf.chartDelay;
  
  chartUpdateTimer = setTimeout(() => {
    // P/L line
    if (State.chartData.pl.length > 0) {
      drawLine('chart-pl', State.chartData.pl, { isMoney: true, color: '#11A7FF' });
    }
    
    // ROI line
    if (State.chartData.roi.length > 0) {
      drawLine('chart-roi', State.chartData.roi, { isMoney: false, color: '#2FECBB' });
    }
    
    // Daily bars
    if (State.chartData.daily.length > 0) {
      drawBars('chart-daily', State.chartData.daily, { zeroMid: true });
    }
    
    // Hit distribution
    if (Object.keys(State.chartData.hits).length > 0) {
      drawCategoryBars('chart-hits', State.chartData.hits, null);
    }
    
    chartUpdateTimer = null;
  }, delay);
}

// Initialize all charts
function initCharts() {
  initChart('chart-pl');
  initChart('chart-roi');
  initChart('chart-daily');
  initChart('chart-hits');
  
  // Resize handler
  window.addEventListener('resize', () => {
    initChart('chart-pl');
    initChart('chart-roi');
    initChart('chart-daily');
    initChart('chart-hits');
    updateCharts(true);
  });
}

export { initCharts, updateCharts, drawLine, drawBars, drawCategoryBars };


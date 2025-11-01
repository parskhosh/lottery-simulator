// CSV export module (chunked)
import { State } from './state.js';
import { fmtBase } from './currency.js';
import { T } from './i18n.js';

const CHUNK_SIZE = 5000;

// Export CSV
async function exportCSV() {
  const rows = State.purchaseLog;
  if (rows.length === 0) {
    showToast('No data to export', 'warn');
    return;
  }
  
  try {
    // Headers
    const headers = [
      T('index') || 'Index',
      T('type') || 'Type',
      T('matches') || 'Matches',
      T('bonus') || 'Bonus',
      T('prize') || 'Prize',
      T('cost') || 'Cost',
      T('net') || 'Net',
      T('day') || 'Day',
      T('time') || 'Time'
    ];
    
    const chunks = [];
    
    // Header chunk
    chunks.push(encodeText(headers.join(',') + '\n'));
    
    // Data chunks
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const lines = chunk.map(row => {
        const date = new Date(row.time);
        const timeStr = date.toISOString();
        return [
          row.idx,
          row.type || 'auto',
          row.matches,
          row.bonus ? '1' : '0',
          fmtBase(row.prize),
          fmtBase(row.cost),
          fmtBase(row.prize - row.cost),
          row.day,
          timeStr
        ].join(',');
      });
      
      chunks.push(encodeText(lines.join('\n') + '\n'));
      
      // Yield to UI
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Create blob
    const blob = new Blob(chunks, { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lottery-export-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    
    showToast('CSV exported successfully', 'success');
  } catch (e) {
    console.error('Export error:', e);
    showToast('Export failed: ' + e.message, 'error');
  }
}

// Encode text to Uint8Array
function encodeText(text) {
  const encoder = new TextEncoder();
  return encoder.encode(text);
}

// Show toast (temporary, will be in UI module)
function showToast(message, type = 'info') {
  const event = new CustomEvent('showToast', { detail: { message, type } });
  document.dispatchEvent(event);
}

export { exportCSV };


import React, { useState } from 'react'
import { Search, Play, Download } from 'lucide-react'
import * as api from '../api/client'

export default function QueryEditor() {
  const [sql, setSql] = useState('SELECT 1 AS test')
  const [catalog, setCatalog] = useState('iceberg')
  const [schema, setSchema] = useState('bronze')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleExecute() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await api.executeQuery({ sql, catalog, schema_name: schema })
      setResult(data)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleExecute()
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const start = e.target.selectionStart
      const end = e.target.selectionEnd
      const newVal = sql.substring(0, start) + '  ' + sql.substring(end)
      setSql(newVal)
      setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = start + 2 }, 0)
    }
  }

  function exportCSV() {
    if (!result) return
    const header = result.columns.join(',')
    const rows = result.rows.map(r => r.map(v => JSON.stringify(v ?? '')).join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'query_result.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="top-bar">
        <h1><Search size={18} /> SQL Editor</h1>
        <div className="flex gap-2">
          <select className="form-select" style={{ width: '120px', padding: '6px 10px' }} value={catalog} onChange={e => setCatalog(e.target.value)}>
            <option value="iceberg">iceberg</option>
            <option value="system">system</option>
          </select>
          <input className="form-input" style={{ width: '120px', padding: '6px 10px' }} placeholder="schema" value={schema} onChange={e => setSchema(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={handleExecute} disabled={loading}>
            <Play size={14} /> {loading ? 'Đang chạy...' : 'Chạy (Ctrl+Enter)'}
          </button>
        </div>
      </div>
      <div className="page-container">
        {/* Editor */}
        <div className="card mb-4">
          <div className="card-body" style={{ padding: '0' }}>
            <textarea
              className="code-editor"
              value={sql}
              onChange={e => setSql(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập SQL query..."
              style={{ borderRadius: 'var(--radius-lg)', border: 'none', minHeight: '180px' }}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="card mb-4" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
            <div className="card-body" style={{ color: '#f87171', fontSize: '13px' }}>
              ❌ {error}
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="card">
            <div className="card-header">
              <h2>Kết quả ({result.row_count} rows)</h2>
              <button className="btn btn-secondary btn-sm" onClick={exportCSV}><Download size={12} /> CSV</button>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div className="table-container" style={{ maxHeight: '500px', overflow: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      {result.columns.map((col, i) => <th key={i}>{col}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i}>
                        <td className="text-muted">{i + 1}</td>
                        {row.map((val, j) => (
                          <td key={j} className="font-mono text-sm">{val === null ? <span className="text-muted">NULL</span> : String(val)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

import React, { useState, useEffect, useRef } from 'react'
import {
  RefreshCw, Trash2, FileX, Database,
  HardDrive, Camera, Zap, GitBranch, HeartPulse,
  AlertTriangle, CheckCircle2, Shield
} from 'lucide-react'

const API_BASE = '/api'

function fmtBytes(b) {
  if (!b || b === 0) return '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function Toast({ toast }) {
  if (!toast) return null
  return (
    <div style={{
      position: 'fixed', top: 20, right: 24, zIndex: 9999,
      background: toast.type === 'error' ? 'var(--danger)' : 'var(--success)',
      color: '#fff', padding: '12px 20px', borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-lg)', fontSize: 13, maxWidth: 420,
      display: 'flex', alignItems: 'center', gap: 8, animation: 'slideUp 0.3s ease'
    }}>
      {toast.type === 'error' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
      {toast.msg}
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, colorClass, sub, highlight }) {
  const colors = {
    purple: { icon: 'rgba(99,102,241,0.15)', text: '#818cf8', border: 'rgba(99,102,241,0.3)' },
    green:  { icon: 'rgba(16,185,129,0.15)',  text: '#34d399', border: 'rgba(16,185,129,0.3)'  },
    red:    { icon: 'rgba(239,68,68,0.15)',   text: '#f87171', border: 'rgba(239,68,68,0.3)'   },
    yellow: { icon: 'rgba(245,158,11,0.15)',  text: '#fbbf24', border: 'rgba(245,158,11,0.3)'  },
    cyan:   { icon: 'rgba(6,182,212,0.15)',   text: '#22d3ee', border: 'rgba(6,182,212,0.3)'   },
  }
  const c = colors[colorClass] || colors.purple
  return (
    <div className="stat-card" style={{ borderLeft: highlight ? `3px solid ${c.text}` : undefined }}>
      <div className={`stat-card-icon`} style={{ background: c.icon, color: c.text }}>
        <Icon size={18} />
      </div>
      <div className="stat-value" style={{ color: highlight ? c.text : undefined }}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div style={{ fontSize: 11, color: c.text, marginTop: 4, fontWeight: 500 }}>{sub}</div>}
    </div>
  )
}

function HealthBadge({ orphan, snapshots }) {
  if (orphan > 0)
    return <span className="badge badge-danger">⚠ {orphan} orphan</span>
  if (snapshots > 20)
    return <span className="badge badge-warning">📸 {snapshots} snaps</span>
  return <span className="badge badge-success">✓ Healthy</span>
}

function TableRow({ row, branch, onCleanupDone }) {
  const [cleaning, setCleaning] = useState(false)

  async function handleCleanup() {
    if (!window.confirm(`Dọn dẹp ${row.schema}.${row.table}?\n\nThao tác này sẽ:\n• Expire snapshots cũ hơn 7 ngày\n• Xóa vĩnh viễn orphan files`)) return
    setCleaning(true)
    try {
      const res = await fetch(`${API_BASE}/maintenance/tables/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, schema_name: row.schema, table_name: row.table, retention_threshold: '7d', retain_last: 1 })
      })
      const data = await res.json()
      if (data.status === 'success') onCleanupDone?.(row.schema, row.table, data.messages)
    } catch (e) {
      alert('Lỗi: ' + e.message)
    }
    setCleaning(false)
  }

  return (
    <tr>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{row.schema}</span>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <span style={{ fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>{row.table}</span>
        </div>
      </td>
      <td style={{ textAlign: 'center' }}>
        <span style={{ color: row.snapshot_count > 20 ? 'var(--warning)' : 'var(--text-secondary)', fontWeight: 500 }}>
          {row.snapshot_count ?? '—'}
        </span>
      </td>
      <td style={{ textAlign: 'center' }}>
        <span style={{ color: row.orphan_files > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700, fontSize: 15 }}>
          {row.orphan_files ?? '—'}
        </span>
      </td>
      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        {fmtBytes(row.size_bytes)}
      </td>
      <td style={{ textAlign: 'center' }}>
        <HealthBadge orphan={row.orphan_files} snapshots={row.snapshot_count} />
      </td>
      <td style={{ textAlign: 'right' }}>
        <button className="btn btn-danger btn-sm" onClick={handleCleanup} disabled={cleaning}>
          {cleaning ? <RefreshCw size={12} className="spin" /> : <Trash2 size={12} />}
          {cleaning ? 'Đang dọn...' : 'Dọn dẹp'}
        </button>
      </td>
    </tr>
  )
}

export default function CatalogHealth() {
  const [branch, setBranch] = useState('main')
  const [branches, setBranches] = useState(['main'])
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState([])
  const [meta, setMeta] = useState(null)
  const [summary, setSummary] = useState(null)
  const [progress, setProgress] = useState(0)
  const [cleanAllLoading, setCleanAllLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const esRef = useRef(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    fetch('/api/nessie/branches')
      .then(r => r.json())
      .then(d => { if (d.branches) setBranches(d.branches.map(b => b.name || b)) })
      .catch(() => {})
  }, [])

  function startScan() {
    if (esRef.current) esRef.current.close()
    setScanned([]); setSummary(null); setMeta(null); setProgress(0); setScanning(true)

    const es = new EventSource(`${API_BASE}/maintenance/catalog-health/scan?branch=${encodeURIComponent(branch)}`)
    esRef.current = es

    es.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'meta')  setMeta(data)
      else if (data.type === 'table') { setScanned(prev => [...prev, data]); setProgress(data.index) }
      else if (data.type === 'done')  { setSummary(data); setScanning(false); es.close() }
      else if (data.type === 'error') { showToast('Lỗi scan: ' + data.message, 'error'); setScanning(false); es.close() }
    }
    es.onerror = () => { setScanning(false); es.close() }
  }

  function stopScan() { if (esRef.current) esRef.current.close(); setScanning(false) }

  async function handleCleanAll() {
    if (!window.confirm(`Dọn dẹp toàn bộ ${scanned.length} bảng trong catalog (branch: ${branch})?\n\nThao tác này không thể hoàn tác!`)) return
    setCleanAllLoading(true)
    try {
      const res = await fetch(`${API_BASE}/maintenance/catalog/cleanup-all`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, retention_threshold: '7d', retain_last: 1 })
      })
      const data = await res.json()
      showToast(`Đã dọn dẹp xong ${data.results?.length ?? 0} bảng!`)
      startScan()
    } catch (e) { showToast('Lỗi: ' + e.message, 'error') }
    setCleanAllLoading(false)
  }

  function handleCleanupDone(schema, table, messages) {
    showToast(`${schema}.${table}: ${messages.join(' | ')}`)
    setScanned(prev => prev.map(r =>
      r.schema === schema && r.table === table ? { ...r, orphan_files: 0 } : r
    ))
  }

  const totalOrphan = summary?.total_orphan_files ?? scanned.reduce((a, r) => a + (r.orphan_files || 0), 0)
  const totalSnaps  = summary?.total_snapshots   ?? scanned.reduce((a, r) => a + (r.snapshot_count || 0), 0)
  const totalSize   = summary?.total_size_bytes  ?? scanned.reduce((a, r) => a + (r.size_bytes || 0), 0)
  const pct = meta?.total ? Math.round((progress / meta.total) * 100) : 0

  return (
    <>
      <Toast toast={toast} />

      {/* Top bar */}
      <div className="top-bar">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <HeartPulse size={18} style={{ color: 'var(--accent-primary)' }} />
          Catalog Health Center
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Branch selector */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--bg-glass)', border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)', padding: '5px 10px'
          }}>
            <GitBranch size={13} color="var(--text-muted)" />
            <select value={branch} onChange={e => setBranch(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
              {branches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <button
            className={`btn ${scanning ? 'btn-danger' : 'btn-primary'}`}
            onClick={scanning ? stopScan : startScan}
          >
            {scanning
              ? <><RefreshCw size={14} className="spin" /> Dừng Scan</>
              : <><Zap size={14} /> {scanned.length > 0 ? 'Scan lại' : 'Bắt đầu Scan'}</>
            }
          </button>

          {scanned.length > 0 && !scanning && (
            <button className="btn btn-danger" onClick={handleCleanAll} disabled={cleanAllLoading}>
              {cleanAllLoading ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
              Dọn sạch tất cả
            </button>
          )}
        </div>
      </div>

      {/* Main scrollable content */}
      <div className="page-container">

        {/* Progress bar */}
        {scanning && meta && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <RefreshCw size={12} className="spin" />
                Đang scan... {progress}/{meta.total} bảng
              </span>
              <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: 'var(--border-color)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: 'var(--accent-gradient)',
                width: `${pct}%`, transition: 'width 0.4s ease'
              }} />
            </div>
          </div>
        )}

        {/* Summary Cards */}
        {scanned.length > 0 && (
          <div className="stats-grid" style={{ marginBottom: 20 }}>
            <SummaryCard icon={Database}  label="Tổng bảng đã scan" value={meta?.total ?? scanned.length} colorClass="purple" />
            <SummaryCard icon={FileX}     label="Orphan Files" value={totalOrphan}
              colorClass={totalOrphan > 0 ? 'red' : 'green'}
              sub={totalOrphan > 0 ? 'Cần dọn dẹp ngay' : 'Catalog sạch sẽ'}
              highlight={totalOrphan > 0}
            />
            <SummaryCard icon={Camera}    label="Tổng Snapshots" value={totalSnaps}
              colorClass={totalSnaps > 50 ? 'yellow' : 'cyan'}
              sub={totalSnaps > 50 ? 'Có thể expire bớt' : 'Bình thường'}
            />
            <SummaryCard icon={HardDrive} label="Tổng dung lượng" value={fmtBytes(totalSize)} colorClass="cyan" />
          </div>
        )}

        {/* Empty state */}
        {scanned.length === 0 && !scanning && (
          <div className="empty-state" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-card)' }}>
            <Shield size={48} style={{ color: 'var(--accent-primary)', opacity: 0.5, marginBottom: 16 }} />
            <h3>Chưa có dữ liệu Health</h3>
            <p>Chọn branch và nhấn "Bắt đầu Scan" để quét toàn bộ catalog Iceberg.<br />
            Hệ thống sẽ hiển thị từng bảng theo thời gian thực.</p>
            <button className="btn btn-primary" onClick={startScan} style={{ marginTop: 8 }}>
              <Zap size={14} /> Bắt đầu Scan ngay
            </button>
          </div>
        )}

        {/* Table results */}
        {scanned.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Database size={15} color="var(--accent-primary)" />
                Kết quả Scan — {scanned.length} bảng
                {scanning && <span className="badge badge-info" style={{ marginLeft: 4 }}>
                  <RefreshCw size={10} className="spin" style={{ marginRight: 4 }} />Đang scan...
                </span>}
              </h2>
              {!scanning && summary && (
                <span className="badge badge-success">✓ Hoàn tất</span>
              )}
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>BẢNG</th>
                    <th style={{ textAlign: 'center' }}>SNAPSHOTS</th>
                    <th style={{ textAlign: 'center' }}>ORPHAN FILES</th>
                    <th style={{ textAlign: 'center' }}>DUNG LƯỢNG</th>
                    <th style={{ textAlign: 'center' }}>TRẠNG THÁI</th>
                    <th style={{ textAlign: 'right' }}>HÀNH ĐỘNG</th>
                  </tr>
                </thead>
                <tbody>
                  {scanned.map((row) => (
                    <TableRow key={`${row.schema}.${row.table}`} row={row} branch={branch} onCleanupDone={handleCleanupDone} />
                  ))}
                  {scanning && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '14px 0' }}>
                        <RefreshCw size={13} className="spin" style={{ marginRight: 6 }} />
                        Đang quét bảng tiếp theo...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

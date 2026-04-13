import React, { useState, useEffect, useRef } from 'react'
import {
  RefreshCw, Trash2, FileX, Database,
  HardDrive, Camera, Zap, GitBranch, HeartPulse,
  AlertTriangle, CheckCircle2, Shield, Activity
} from 'lucide-react'

const API_BASE = '/api'

async function pollJob(jobId, onProgress, onComplete, onError) {
  try {
    while (true) {
      await new Promise(r => setTimeout(r, 2000))
      const res = await fetch(`${API_BASE}/maintenance/jobs/${jobId}`)
      if (!res.ok) throw new Error(`Mất kết nối: HTTP ${res.status}`)
      const data = await res.json()
      if (data.progress) onProgress?.(data.progress)
      if (data.status === 'success' || data.status === 'error') {
        onComplete?.(data)
        return
      }
    }
  } catch (err) {
    onError?.(err)
  }
}

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
      position: 'fixed', top: 24, right: 24, zIndex: 9999,
      background: toast.type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)',
      color: '#fff', padding: '14px 24px', borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)', fontSize: 14, fontWeight: 500,
      backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', gap: 10, animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      {toast.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
      {toast.msg}
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, colorClass, sub, highlight }) {
  const colors = {
    purple: { bg: 'rgba(99,102,241,0.08)', iconBtn: 'rgba(99,102,241,0.15)', text: '#818cf8', glow: 'rgba(99,102,241,0.4)', border: 'rgba(99,102,241,0.3)' },
    green:  { bg: 'rgba(16,185,129,0.08)',  iconBtn: 'rgba(16,185,129,0.15)',  text: '#34d399', glow: 'rgba(16,185,129,0.4)', border: 'rgba(16,185,129,0.3)'  },
    red:    { bg: 'rgba(239,68,68,0.08)',   iconBtn: 'rgba(239,68,68,0.15)',   text: '#f87171', glow: 'rgba(239,68,68,0.5)', border: 'rgba(239,68,68,0.4)'   },
    yellow: { bg: 'rgba(245,158,11,0.08)',  iconBtn: 'rgba(245,158,11,0.15)',  text: '#fbbf24', glow: 'rgba(245,158,11,0.4)', border: 'rgba(245,158,11,0.3)'  },
    cyan:   { bg: 'rgba(6,182,212,0.08)',   iconBtn: 'rgba(6,182,212,0.15)',   text: '#22d3ee', glow: 'rgba(6,182,212,0.4)', border: 'rgba(6,182,212,0.3)'   },
  }
  const c = colors[colorClass] || colors.purple

  return (
    <div style={{
      background: highlight ? c.bg : 'var(--bg-glass)',
      border: `1px solid ${highlight ? c.border : 'var(--border-color)'}`,
      borderRadius: '16px',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: highlight ? `0 0 24px ${colors[colorClass].iconBtn}` : 'var(--shadow-sm)',
      transition: 'all 0.3s ease',
      display: 'flex', flexDirection: 'column'
    }}
    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 12px 30px ${colors[colorClass].iconBtn}` }}
    onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = highlight ? `0 0 24px ${colors[colorClass].iconBtn}` : 'var(--shadow-sm)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{
          width: 48, height: 48, borderRadius: '12px',
          background: c.iconBtn, color: c.text,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 16px ${c.glow}`
        }}>
          <Icon size={24} strokeWidth={2.5} />
        </div>
        {highlight && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', background: c.iconBtn, color: c.text, borderRadius: 20, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Action Needed
          </span>
        )}
      </div>
      <div>
        <div style={{ fontSize: 32, fontWeight: 800, color: highlight ? c.text : 'var(--text-primary)', lineHeight: 1.2, fontFamily: 'var(--font-family)', textShadow: highlight ? `0 0 12px ${c.glow}` : 'none' }}>
          {value}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.02em', textTransform: 'uppercase', marginTop: 4 }}>
          {label}
        </div>
        {sub && <div style={{ fontSize: 12, color: c.text, marginTop: 8, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
          {highlight && <Activity size={14} />} {sub}
        </div>}
      </div>
    </div>
  )
}

function HealthBadge({ orphan, snapshots }) {
  if (orphan > 0)
    return <span style={{ padding: '6px 12px', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 20, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14}/> {orphan} Orphan</span>
  if (snapshots > 20)
    return <span style={{ padding: '6px 12px', background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 20, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Camera size={14}/> {snapshots} Snaps</span>
  return <span style={{ padding: '6px 12px', background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 20, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={14}/> Healthy</span>
}

function TableRow({ row, branch, onCleanupDone, index, activeJobId }) {
  const [cleaning, setCleaning] = useState(false)

  useEffect(() => {
    if (activeJobId && !cleaning) {
      setCleaning('Đang khôi phục tiến trình ngầm...')
      pollJob(activeJobId,
        (prog) => setCleaning(prog),
        (finalData) => {
          if (finalData.status === 'success' || finalData.status === 'partial') {
            onCleanupDone?.(row.schema, row.table, finalData.messages)
          } else {
            alert('Lỗi: ' + JSON.stringify(finalData.error || finalData.messages))
          }
          setCleaning(false)
        },
        (err) => {
          alert('Lỗi theo dõi tiến trình: ' + err.message)
          setCleaning(false)
        }
      )
    }
  }, [activeJobId])

  async function handleCleanup() {
    if (!window.confirm(`Dọn dẹp ${row.schema}.${row.table}?\n\nThao tác này sẽ cắm cờ chạy ngầm trên server, bạn có thể rảnh tay làm việc khác.`)) return
    setCleaning('Đang khởi tạo...')
    try {
      const res = await fetch(`${API_BASE}/maintenance/tables/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, schema_name: row.schema, table_name: row.table, retention_threshold: '7d', retain_last: 1 })
      })
      const initData = await res.json()
      if (initData.status === 'processing') {
         pollJob(initData.job_id, 
            (prog) => setCleaning(prog),
            (finalData) => {
               if (finalData.status === 'success' || finalData.status === 'partial') {
                  onCleanupDone?.(row.schema, row.table, finalData.messages)
               } else {
                  alert('Lỗi: ' + JSON.stringify(finalData.error || finalData.messages))
               }
               setCleaning(false)
            },
            (err) => {
               alert('Lỗi theo dõi tiến trình: ' + err.message)
               setCleaning(false)
            }
         )
      } else {
         alert('Lỗi khởi tạo: ' + JSON.stringify(initData))
         setCleaning(false)
      }
    } catch (e) {
      alert('Lỗi gọi API: ' + e.message)
      setCleaning(false)
    }
  }

  const isWarning = row.orphan_files > 0 || row.snapshot_count > 20

  return (
    <tr style={{
      background: isWarning ? 'rgba(255,255,255,0.05)' : 'var(--bg-glass)',
      transition: 'background 0.2s',
      animation: `fadeInUp 0.4s ease forwards ${index * 0.05}s`,
      borderBottom: '1px solid rgba(255,255,255,0.05)'
    }}>
      <td style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
            <Database size={18} color="var(--text-secondary)" />
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 500, marginBottom: 2 }}>{row.schema}</div>
            <div style={{ fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: 'var(--text-primary)' }}>{row.table}</div>
          </div>
        </div>
      </td>
      <td style={{ textAlign: 'center', padding: '20px 24px' }}>
        <span style={{ color: row.snapshot_count > 20 ? '#fbbf24' : 'var(--text-secondary)', fontWeight: 600, fontSize: 15 }}>
          {row.snapshot_count ?? '—'}
        </span>
      </td>
      <td style={{ textAlign: 'center', padding: '20px 24px' }}>
        <span style={{
          color: row.orphan_files > 0 ? '#f87171' : '#34d399',
          fontWeight: 800, fontSize: 16,
          textShadow: row.orphan_files > 0 ? '0 0 10px rgba(239,68,68,0.5)' : 'none'
        }}>
          {row.orphan_files ?? '—'}
        </span>
      </td>
      <td style={{ textAlign: 'center', padding: '20px 24px', color: 'var(--text-muted)', fontWeight: 500 }}>
        {fmtBytes(row.size_bytes)}
      </td>
      <td style={{ textAlign: 'center', padding: '20px 24px' }}>
        <HealthBadge orphan={row.orphan_files} snapshots={row.snapshot_count} />
      </td>
      <td style={{ textAlign: 'right', padding: '20px 24px' }}>
        <button
          onClick={handleCleanup}
          disabled={!!cleaning}
          style={{
            background: cleaning ? 'var(--bg-active)' : 'rgba(239, 68, 68, 0.1)',
            color: cleaning ? 'var(--text-muted)' : '#f87171',
            border: `1px solid ${cleaning ? 'var(--border-color)' : 'rgba(239, 68, 68, 0.3)'}`,
            padding: '8px 16px', borderRadius: '8px', cursor: cleaning ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8,
            transition: 'all 0.2s', boxShadow: cleaning ? 'none' : '0 4px 12px rgba(239, 68, 68, 0.1)'
          }}
          onMouseEnter={(e) => { if (!cleaning) e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)' }}
          onMouseLeave={(e) => { if (!cleaning) e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)' }}
        >
          {cleaning ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
          {cleaning ? (typeof cleaning === 'string' ? cleaning : 'Đang dọn...') : 'Dọn dẹp'}
        </button>
      </td>
    </tr>
  )
}

function ActiveJobsPanel() {
  const [jobs, setJobs] = useState({})
  
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await fetch(`${API_BASE}/maintenance/jobs`)
        if (res.ok) {
          const data = await res.json()
          setJobs(data.jobs || {})
        }
      } catch (e) {}
    }
    fetchJobs()
    const int = setInterval(fetchJobs, 2000)
    return () => clearInterval(int)
  }, [])
  
  const jobList = Object.entries(jobs).sort((a,b) => {
    if (a[1].status === 'running' && b[1].status !== 'running') return -1;
    if (a[1].status !== 'running' && b[1].status === 'running') return 1;
    return 0;
  });
  if (jobList.length === 0) return null

  return (
    <div style={{ padding: '0 32px', marginTop: 32 }}>
      <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 16, padding: '20px 24px', boxShadow: '0 0 24px rgba(99,102,241,0.15)' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#818cf8', display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px 0' }}>
           <RefreshCw size={16} className={jobList.some(j => j[1].status === 'running') ? "spin" : ""} />
           Lịch sử tiến trình ngầm ({jobList.length})
        </h3>
        <div style={{ display: 'grid', gap: 12, maxHeight: 300, overflowY: 'auto' }}>
          {jobList.map(([jobId, job]) => {
             const isRunning = job.status === 'running'
             const isSuccess = job.status === 'success'
             const themeColor = isRunning ? '#34d399' : (isSuccess ? '#10b981' : '#ef4444')
             const bg = isRunning ? 'rgba(16, 185, 129, 0.1)' : (isSuccess ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.1)')
             
             return (
               <div key={jobId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)', padding: '12px 20px', borderRadius: 12, border: '1px solid var(--border-color)', opacity: isRunning ? 1 : 0.7 }}>
                 <div style={{ display: 'flex', flexDirection: 'column' }}>
                   <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                     {job.type === 'catalog_cleanup' ? 'Tiến trình: Dọn dẹp toàn bộ Catalog' : `Tiến trình: Dọn dẹp bảng ${job.schema}.${job.table}`}
                   </span>
                   <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                     <Activity size={12} color="#818cf8" /> Job ID: <span style={{ fontFamily: 'monospace' }}>{jobId.split('-')[0]}</span>
                     <span style={{ marginLeft: 8, color: themeColor, fontWeight: 500 }}>• {job.status.toUpperCase()}</span>
                   </span>
                 </div>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: bg, padding: '6px 14px', borderRadius: 20, border: `1px solid ${bg}` }}>
                   <span style={{ fontSize: 13, color: themeColor, fontWeight: 600 }}>
                     {isRunning ? (job.progress || 'Đang xử lý dọn dẹp...') : (isSuccess ? 'Hoàn tất' : 'Lỗi truy vấn')}
                   </span>
                   {isRunning && <Activity size={14} color={themeColor} className="spin" />}
                   {isSuccess && <CheckCircle2 size={14} color={themeColor} />}
                 </div>
               </div>
             )
          })}
        </div>
      </div>
    </div>
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
  const [activeTableJobs, setActiveTableJobs] = useState({})
  const esRef = useRef(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  function doScan(targetBranch) {
    if (esRef.current) esRef.current.close()
    setScanned([]); setSummary(null); setMeta(null); setProgress(0); setScanning(true)

    const es = new EventSource(`${API_BASE}/maintenance/catalog-health/scan?branch=${encodeURIComponent(targetBranch)}`)
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

  useEffect(() => {
    let defaultBranch = 'main';
    fetch('/api/nessie/branches')
      .then(r => r.json())
      .then(d => { 
        if (d.branches) {
           setBranches(d.branches.map(b => b.name || b));
           defaultBranch = d.branches[0]?.name || 'main';
        }
        setTimeout(() => doScan(defaultBranch), 50); // Mặc định auto-scan lên bảng luôn, để thấy orphan
      })
      .catch(() => {
        setTimeout(() => doScan(defaultBranch), 50);
      })

    fetch(`${API_BASE}/maintenance/jobs`)
      .then(r => r.json())
      .then(d => {
         if (d.jobs && Object.keys(d.jobs).length > 0) {
            const catalogJobs = Object.entries(d.jobs).filter(([k,v]) => v.type === 'catalog_cleanup' && v.status === 'running')
            if (catalogJobs.length > 0) {
               const [jobId, jobData] = catalogJobs[0]
               setCleanAllLoading(jobData.progress || 'Đang khôi phục tiến trình...')
               pollJob(jobId, setCleanAllLoading, (finalData) => {
                  showToast(`Đã dọn dẹp xong ${finalData.results?.length ?? 0} bảng!`)
                  setCleanAllLoading(false)
                  doScan(defaultBranch)
               }, () => setCleanAllLoading(false))
            }

            const tblJobs = Object.entries(d.jobs).filter(([k,v]) => v.type === 'table_cleanup' && v.status === 'running')
            const activeTbls = {}
            tblJobs.forEach(([k,v]) => { activeTbls[`${v.schema}.${v.table}`] = k })
            if (Object.keys(activeTbls).length > 0) {
              setActiveTableJobs(activeTbls)
            }
         }
      })
      .catch(() => {})
  }, [])

  function startScan() {
    doScan(branch)
  }

  function stopScan() { if (esRef.current) esRef.current.close(); setScanning(false) }

  async function handleCleanAll() {
    if (!window.confirm(`Dọn dẹp ngầm toàn bộ ${scanned.length} bảng trong catalog (branch: ${branch})?\n\nBạn có thể rảnh tay thu nhỏ web hoặc đi làm việc khác.`)) return
    setCleanAllLoading('Đang khởi tạo...')
    try {
      const res = await fetch(`${API_BASE}/maintenance/catalog/cleanup-all`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, retention_threshold: '7d', retain_last: 1 })
      })
      const initData = await res.json()
      if (initData.status === 'processing') {
         pollJob(initData.job_id,
            (prog) => setCleanAllLoading(prog),
            (finalData) => {
               if (finalData.status === 'success') {
                  showToast(`Đã dọn dẹp xong ${finalData.results?.length ?? 0} bảng!`)
                  startScan()
               } else {
                  showToast('Lỗi: ' + JSON.stringify(finalData.error), 'error')
               }
               setCleanAllLoading(false)
            },
            (err) => {
               showToast('Lỗi giao tiếp API: ' + err.message, 'error')
               setCleanAllLoading(false)
            }
         )
      } else {
         showToast('Lỗi API khởi tạo: ' + JSON.stringify(initData), 'error')
         setCleanAllLoading(false)
      }
    } catch (e) { 
      showToast('Lỗi mạng API: ' + e.message, 'error') 
      setCleanAllLoading(false)
    }
  }

  function handleCleanupDone(schema, table, messages) {
    showToast(`${schema}.${table}: ${messages.join(' | ')}`)
    setScanned(prev => prev.map(r =>
      r.schema === schema && r.table === table ? { ...r, orphan_files: 0, snapshot_count: Math.min(1, r.snapshot_count) } : r
    ))
  }

  const totalOrphan = summary?.total_orphan_files ?? scanned.reduce((a, r) => a + (r.orphan_files || 0), 0)
  const totalSnaps  = summary?.total_snapshots   ?? scanned.reduce((a, r) => a + (r.snapshot_count || 0), 0)
  const totalSize   = summary?.total_size_bytes  ?? scanned.reduce((a, r) => a + (r.size_bytes || 0), 0)
  const pct = meta?.total ? Math.round((progress / meta.total) * 100) : 0

  return (
    <div style={{
      animation: 'fadeIn 0.5s ease'
    }}>
      <Toast toast={toast} />
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulseGlow { 0% { box-shadow: 0 0 15px rgba(99,102,241,0.4); } 50% { box-shadow: 0 0 30px rgba(99,102,241,0.8); } 100% { box-shadow: 0 0 15px rgba(99,102,241,0.4); } }
      `}</style>

      {/* Top Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '24px 32px', background: 'linear-gradient(180deg, rgba(17,24,39,0.8) 0%, rgba(17,24,39,0) 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.05)'
      }}>
        <div>
          <h1 style={{
            display: 'flex', alignItems: 'center', gap: 12, margin: 0,
            fontSize: 28, fontWeight: 800,
            background: 'linear-gradient(to right, #fff, #a5b4fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>
            <div style={{ background: 'rgba(99,102,241,0.1)', padding: 10, borderRadius: 12 }}>
               <HeartPulse size={24} color="#818cf8" />
            </div>
            Catalog Health
          </h1>
          <p style={{ margin: '6px 0 0 56px', color: 'var(--text-muted)', fontSize: 14 }}>Giám sát, phân tích và dọn dẹp các tệp mồ côi, snapshots trên Iceberg.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Branch selector */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '10px', padding: '8px 14px', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
          }}>
            <GitBranch size={16} color="#818cf8" />
            <select value={branch} onChange={e => setBranch(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 14, fontWeight: 500, outline: 'none', cursor: 'pointer' }}>
              {branches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <button
            style={{
               background: scanning ? 'rgba(239, 68, 68, 0.1)' : 'var(--accent-gradient)',
               color: scanning ? '#f87171' : '#fff',
               border: scanning ? '1px solid rgba(239, 68, 68, 0.3)' : 'none',
               padding: '10px 20px', borderRadius: '10px', fontSize: 14, fontWeight: 600,
               display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
               boxShadow: scanning ? 'none' : '0 8px 20px rgba(99,102,241,0.3)',
               transition: 'all 0.3s'
            }}
            onClick={scanning ? stopScan : startScan}
          >
            {scanning
              ? <><RefreshCw size={16} className="spin" /> Dừng Scan</>
              : <><Zap size={16} /> Bắt đầu Scan</>
            }
          </button>

          {scanned.length > 0 && !scanning && (
            <button
               style={{
                  background: 'rgba(239, 68, 68, 0.15)', color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.4)', padding: '10px 20px',
                  borderRadius: '10px', fontSize: 14, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 8, cursor: cleanAllLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s'
               }}
               onClick={handleCleanAll} disabled={!!cleanAllLoading}
               onMouseEnter={(e) => { if(!cleanAllLoading) e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)' }}
               onMouseLeave={(e) => { if(!cleanAllLoading) e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)' }}
            >
              {cleanAllLoading ? <RefreshCw size={16} className="spin" /> : <Trash2 size={16} />}
              {cleanAllLoading ? (typeof cleanAllLoading === 'string' ? cleanAllLoading : 'Đang xử lý...') : 'Dọn sạch tất cả'}
            </button>
          )}
        </div>
      </div>

      <ActiveJobsPanel />

      <div style={{ padding: '32px' }}>
        {/* Progress bar */}
        {scanning && meta && (
          <div style={{ marginBottom: 32, background: 'rgba(0,0,0,0.2)', padding: '16px 24px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12, fontWeight: 500 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <RefreshCw size={16} className="spin" color="#818cf8" />
                Đang quét thông tin Metadata... {progress}/{meta.total} bảng
              </span>
              <span style={{ fontWeight: 700, color: '#818cf8' }}>{pct}%</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: 'linear-gradient(90deg, #6366f1, #22d3ee)',
                width: `${pct}%`, transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 0 10px rgba(34,211,238,0.5)'
              }} />
            </div>
          </div>
        )}

        {/* Summary Cards */}
        {scanned.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, marginBottom: 36 }}>
            <SummaryCard icon={Database}  label="Tổng bảng" value={meta?.total ?? scanned.length} colorClass="purple" />
            <SummaryCard icon={FileX}     label="Orphan Files" value={totalOrphan}
              colorClass={totalOrphan > 0 ? 'red' : 'green'}
              sub={totalOrphan > 0 ? 'Tốn dung lượng vô ích' : 'Sạch sẽ'}
              highlight={totalOrphan > 0}
            />
            <SummaryCard icon={Camera}    label="Snapshots" value={totalSnaps}
              colorClass={totalSnaps > 50 ? 'yellow' : 'cyan'}
              sub={totalSnaps > 50 ? 'Nên Dọn dẹp' : 'Trong giới hạn'}
            />
            <SummaryCard icon={HardDrive} label="Tổng kích thước" value={fmtBytes(totalSize)} colorClass="cyan" />
          </div>
        )}

        {/* Empty state */}
        {scanned.length === 0 && !scanning && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '80px 40px', background: 'rgba(0,0,0,0.2)', border: '1px dashed rgba(255,255,255,0.05)',
            borderRadius: 24, textAlign: 'center'
          }}>
            <div style={{ width: 80, height: 80, borderRadius: 40, background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, animation: 'pulseGlow 3s infinite' }}>
               <Shield size={40} color="#818cf8" />
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Check Sức Khỏe Data Catalog</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 15, maxWidth: 500, lineHeight: 1.6, marginBottom: 30 }}>
              Không có gì hiển thị hiện tại. Chọn một Branch Iceberg và nhấn nút Scan để hệ thống phân tích dung lượng, orphan files và snapshots trên mọi bảng.
            </p>
            <button
               style={{
                  background: 'var(--accent-gradient)', color: '#fff', border: 'none',
                  padding: '14px 32px', borderRadius: '12px', fontSize: 15, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  boxShadow: '0 8px 24px rgba(99,102,241,0.4)', transition: 'transform 0.2s, box-shadow 0.2s'
               }}
               onClick={startScan}
               onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(99,102,241,0.6)' }}
               onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.4)' }}
            >
              <Zap size={18} /> Bắt đầu Scan Hệ Thống
            </button>
          </div>
        )}

        {/* Table List */}
        {scanned.length > 0 && (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: 20, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
          }}>
            <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                Chi tiết Bảng
                <span style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.1)', borderRadius: 20, fontSize: 12 }}>{scanned.length}</span>
              </h3>
              {!scanning && <span style={{ color: '#34d399', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={14}/> Hoàn tất</span>}
            </div>
            
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bảng</th>
                  <th style={{ padding: '16px 24px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Snapshots</th>
                  <th style={{ padding: '16px 24px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Orphan Files</th>
                  <th style={{ padding: '16px 24px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Kích thước</th>
                  <th style={{ padding: '16px 24px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trạng thái</th>
                  <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {scanned.map((row, idx) => (
                  <TableRow key={`${row.schema}.${row.table}`} index={idx} row={row} branch={branch} onCleanupDone={handleCleanupDone} activeJobId={activeTableJobs[`${row.schema}.${row.table}`]} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}


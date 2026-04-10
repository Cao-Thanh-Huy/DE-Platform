import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Database, Table, Plus, Trash2, RefreshCw, ChevronRight,
  BarChart2, Eye, Code, Camera, Settings2, Check, X,
  Pencil, Copy, CheckCheck, AlertTriangle, Layers,
  FileText, HardDrive, Hash, Clock, Zap, Search
} from 'lucide-react'
import * as api from '../api/client'

// ── Constants ────────────────────────────────────────────────
const COL_TYPES = [
  'VARCHAR', 'BIGINT', 'INTEGER', 'SMALLINT', 'TINYINT',
  'DOUBLE', 'REAL', 'DECIMAL(18,6)', 'BOOLEAN',
  'DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE',
  'VARBINARY', 'JSON', 'ARRAY(VARCHAR)', 'MAP(VARCHAR,VARCHAR)',
]

const FILE_FORMATS = ['PARQUET', 'ORC', 'AVRO']

function fmtBytes(b) {
  if (!b) return '0 B'
  if (b < 1_024) return `${b} B`
  if (b < 1_048_576) return `${(b / 1_024).toFixed(1)} KB`
  if (b < 1_073_741_824) return `${(b / 1_048_576).toFixed(1)} MB`
  return `${(b / 1_073_741_824).toFixed(2)} GB`
}

function fmtNum(n) {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString()
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('vi-VN')
}

function schemaColor(s) {
  if (s === 'bronze') return 'bronze'
  if (s === 'silver') return 'silver'
  if (s === 'gold')   return 'gold'
  return 'other'
}

// ── Loading Dots ──────────────────────────────────────────────
function LoadingDots() {
  return (
    <div className="loading-dots">
      <span /><span /><span />
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────
function Toast({ toasts, remove }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} onClick={() => remove(t.id)} style={{
          background: t.type === 'error' ? 'rgba(239,68,68,0.95)' : 'rgba(16,185,129,0.95)',
          color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)', cursor: 'pointer',
          animation: 'slideUp 0.3s ease', display: 'flex', gap: 8, alignItems: 'center',
          maxWidth: 320,
        }}>
          {t.type === 'error' ? <AlertTriangle size={14} /> : <Check size={14} />}
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────

function ConfirmModal({ title, message, confirmText = 'Xác nhận', onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.6)', zIndex: 9999 }}>
      <div className="modal-content" style={{ maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--warning)' }}>
           <AlertTriangle size={20} /> <h3 style={{ margin: 0, color: 'var(--text)' }}>{title}</h3>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
          <button className="btn btn-secondary" onClick={onCancel}>Hủy thao tác</button>
          <button className="btn btn-primary" style={{ background: 'var(--warning)', borderColor: 'var(--warning)' }} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  )
}


function TabMaintenance({ branch, schema, table, toast, confirm }) {
  const [retention, setRetention] = useState("7d")
  const [loadingOpt, setLoadingOpt] = useState(false)
  const [loadingVac, setLoadingVac] = useState(false)

  async function handleOptimize() {
    confirm({
      title: "Chạy Compaction",
      message: "Bạn có chắc chắn muốn chạy Compaction? Lệnh này sẽ kết hợp các file dữ liệu nhỏ thành các block hiệu quả hơn.",
      onConfirm: async () => {
        setLoadingOpt(true)
        try {
          const res = await api.optimizeTable(schema, table, branch)
          toast(res.message || "Đã tối ưu hóa file layout xong!", "success")
        } catch (err) {
          toast("Lỗi khi Optimize: " + err.message, "error")
        }
        setLoadingOpt(false)
        confirm(null)
      },
      onCancel: () => confirm(null)
    })
  }

  async function handleVacuum() {
    confirm({
      title: "Dọn dẹp lịch sử Time-Travel",
      message: `Bạn có chắc muốn xóa vĩnh viễn các file snapshot cũ hơn [${retention}] (Trừ snapshot hiện tại)? Việc này làm mất khả năng Rollback về mốc trước thời hạn đó!`,
      onConfirm: async () => {
        setLoadingVac(true)
        try {
          const res = await api.vacuumTable(schema, table, retention, 1, branch)
          toast(res.message || "Đã dọn dẹp snapshots cũ!", "success")
        } catch (err) {
          toast("Lỗi khi Vacuum: " + err.message, "error")
        }
        setLoadingVac(false)
        confirm(null)
      },
      onCancel: () => confirm(null)
    })
  }

  return (
    <div style={{ padding: '20px 0' }}>

      {/* Card 1: Compaction */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🚀</span> Data Compaction
            <span className="badge badge-info" style={{ fontWeight: 400, fontSize: 11 }}>EXECUTE OPTIMIZE</span>
          </h2>
        </div>
        <div className="card-body">
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>
            Streaming/Micro-batch pipelines thường sinh ra hàng ngàn file nhỏ lẻ (small files problem).
            Lệnh <code style={{ background: 'var(--bg-glass)', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace' }}>OPTIMIZE</code> sẽ
            gom nhóm chúng thành các file Parquet lớn chuẩn mực (~512MB), giúp tăng tốc query đáng kể.
          </p>
          <button className="btn btn-primary" onClick={handleOptimize} disabled={loadingOpt}>
            {loadingOpt ? <RefreshCw size={14} className="spin" /> : <RefreshCw size={14} />}
            {loadingOpt ? 'Đang chạy...' : 'Run File Compaction'}
          </button>
        </div>
      </div>

      {/* Card 2: Vacuum */}
      <div className="card">
        <div className="card-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🧹</span> Vacuum — Expire Snapshots
            <span className="badge badge-warning" style={{ fontWeight: 400, fontSize: 11 }}>Không thể hoàn tác</span>
          </h2>
        </div>
        <div className="card-body">
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>
            Iceberg tích lũy Snapshots theo thời gian để phục vụ Time-Travel & Rollback. Tính năng <strong>Vacuum</strong> sẽ
            vĩnh viễn xóa các Snapshot cũ hơn ngưỡng thời gian bạn đặt (giữ lại ít nhất 1 snapshot gần nhất).
            Sau khi chạy, Time-Travel về các mốc trước ngưỡng này sẽ không còn khả dụng.
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0, width: 200 }}>
              <label className="form-label">Thời hạn giữ lại (Retention)</label>
              <input
                type="text"
                value={retention}
                onChange={e => setRetention(e.target.value)}
                className="form-input"
                placeholder="VD: 7d, 24h, 30d"
                title="Cú pháp: Nd = N ngày, Nh = N giờ"
              />
            </div>
            <button
              className="btn btn-danger"
              onClick={handleVacuum}
              disabled={loadingVac}
              style={{ marginBottom: 0, flexShrink: 0 }}
            >
              {loadingVac ? <RefreshCw size={14} className="spin" /> : <AlertTriangle size={14} />}
              {loadingVac ? 'Đang dọn...' : 'Run Vacuum'}
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            💡 Khuyến nghị: <strong>7d</strong> cho Production. Để <strong>30d</strong> nếu cần nhiều lịch sử Time-Travel.
          </p>
        </div>
      </div>

    </div>
  )
}

export default function ModelManager() {

  const [schemas, setSchemas]           = useState([])
  const [openSchemas, setOpenSchemas]   = useState({})
  const [schemaTables, setSchemaTables] = useState({}) // {schemaName: [tableName,...]}
  const [selected, setSelected]         = useState(null) // {schema, table}
  const [activeTab, setActiveTab]       = useState('overview')
  const [previewSnapshotId, setPreviewSnapshotId] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [toasts, setToasts]             = useState([])
  const [showCreateSchema, setShowCreateSchema] = useState(false)
  const [showCreateTable, setShowCreateTable]   = useState(false)
    const [branches, setBranches]         = useState([])
  const [activeBranch, setActiveBranch] = useState('main')

  // Toast helpers
  const toast = (msg, type = 'success') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500)
  }
  const removeToast = (id) => setToasts(p => p.filter(t => t.id !== id))

  useEffect(() => { api.listBranches().then(d => setBranches(d.branches || [])).catch(()=>{}) }, [])
  useEffect(() => { loadSchemas(activeBranch) }, [activeBranch])

  async function loadSchemas(branch) {
    try {
      const data = await api.getSchemas(branch)
      const list = data.schemas || []
      setSchemas(list)
      // auto-open bronze/silver/gold
      const autoOpen = {}
      list.forEach(s => { if (['bronze','silver','gold'].includes(s)) { autoOpen[s] = true; loadTablesForSchema(s, branch); } })
      setOpenSchemas(prev => ({ ...autoOpen, ...prev }))
    } catch (e) { toast('Không load được schemas', 'error') }
  }

  async function loadTablesForSchema(schema, branch = activeBranch) {
    try {
      const data = await api.getTables(schema, branch)
      setSchemaTables(prev => ({ ...prev, [schema]: data.tables || [] }))
    } catch { setSchemaTables(prev => ({ ...prev, [schema]: [] })) }
  }

  function toggleSchema(schema) {
    const next = !openSchemas[schema]
    setOpenSchemas(prev => ({ ...prev, [schema]: next }))
    if (next && !schemaTables[schema]) loadTablesForSchema(schema, activeBranch)
  }

  function selectTable(schema, table) {
    setSelected({ schema, table })
    setActiveTab('overview')
    setPreviewSnapshotId(null)
  }

  async function handleDropSchema(schema) {
    if (!window.confirm(`Xóa schema "${schema}"? Schema phải EMPTY.`)) return
    try {
      await api.dropSchema(schema, activeBranch)
      toast(`Đã xóa schema "${schema}"`)
      setSchemas(p => p.filter(s => s !== schema))
      setSchemaTables(p => { const n = {...p}; delete n[schema]; return n })
      if (selected?.schema === schema) setSelected(null)
    } catch (e) { toast(e.message, 'error') }
  }

  async function handleDropTable(schema, table) {
    if (!window.confirm(`Xóa bảng "${schema}.${table}"?\nThao tác này KHÔNG THỂ hoàn tác.`)) return
    try {
      await api.dropTable(schema, table, activeBranch)
      toast(`Đã xóa bảng "${table}"`)
      setSchemaTables(prev => ({ ...prev, [schema]: (prev[schema] || []).filter(t => t !== table) }))
      if (selected?.schema === schema && selected?.table === table) setSelected(null)
    } catch (e) { toast(e.message, 'error') }
  }

  function refreshCurrentSchema() {
    if (selected) loadTablesForSchema(selected.schema, activeBranch)
  }

  const tabs = [
    { id: 'overview',   label: 'Overview',   icon: <BarChart2 size={13} /> },
    { id: 'schema',     label: 'Schema',     icon: <Table size={13} /> },
    { id: 'preview',    label: 'Preview',    icon: <Eye size={13} /> },
    { id: 'snapshots',  label: 'Snapshots',  icon: <Camera size={13} /> },
    { id: 'ddl',        label: 'DDL',        icon: <Code size={13} /> },
    { id: 'maintenance', label: 'Optimize',  icon: <Settings2 size={13} /> },
  ]

  return (
    <>
      {/* Top bar */}
      <div className="top-bar">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Database size={18} /> Data Models
        </h1>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={() => loadSchemas(activeBranch)}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowCreateSchema(true)}>
            <Layers size={13} /> New Schema
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreateTable(true)}>
            <Plus size={13} /> New Table
          </button>
        </div>
      </div>

      {/* Main 2-panel layout */}
      <div className="model-layout" style={{ height: 'calc(100vh - 56px)' }}>
        {/* LEFT — Schema Tree */}
        <div className="schema-panel">
          <div className="schema-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Catalog Explorer</h3>
            <select
              className="form-select"
              style={{ width: 100, fontSize: 12, padding: '2px 8px' }}
              value={activeBranch}
              onChange={e => {
                const b = e.target.value;
                setActiveBranch(b);
                setSchemas([]);
                setSchemaTables({});
                setSelected(null);
                setOpenSchemas({});
              }}
            >
              {branches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
          </div>
          <div className="schema-tree">
            {schemas.length === 0 ? (
              <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                Không có schema nào
              </div>
            ) : schemas.map(schema => (
              <div className="schema-node" key={schema}>
                {/* Schema row */}
                <div
                  className="schema-node-header"
                  onClick={() => toggleSchema(schema)}
                >
                  <div className={`schema-icon ${schemaColor(schema)}`}>
                    {schema[0].toUpperCase()}
                  </div>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {schema}
                  </span>
                  {schemaTables[schema] && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-glass)', padding: '1px 5px', borderRadius: 8 }}>
                      {schemaTables[schema].length}
                    </span>
                  )}
                  <ChevronRight size={13} className={`schema-node-chevron${openSchemas[schema] ? ' open' : ''}`} />
                </div>

                {/* Tables list */}
                {openSchemas[schema] && (
                  <div className="table-nodes">
                    {!schemaTables[schema] ? (
                      <div style={{ padding: '8px 16px 8px 40px' }}><LoadingDots /></div>
                    ) : schemaTables[schema].length === 0 ? (
                      <div style={{ padding: '8px 16px 8px 40px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Chưa có bảng nào
                      </div>
                    ) : schemaTables[schema].map(t => (
                      <div
                        key={t}
                        className={`table-node${selected?.schema === schema && selected?.table === t ? ' active' : ''}`}
                        onClick={() => selectTable(schema, t)}
                      >
                        <Table size={12} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span>
                        <button
                          className="btn btn-danger btn-sm"
                          style={{ padding: '2px 6px', opacity: 0, fontSize: 10 }}
                          onMouseEnter={e => e.currentTarget.style.opacity = 1}
                          onMouseLeave={e => e.currentTarget.style.opacity = 0}
                          onClick={ev => { ev.stopPropagation(); handleDropTable(schema, t) }}
                          title="Xóa bảng"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — Detail Panel */}
        <div className="detail-panel">
          {!selected ? (
            <div className="detail-empty">
              <Database size={56} />
              <h3>Chọn một bảng để xem chi tiết</h3>
              <p>Expand schema bên trái và click vào tên bảng bất kỳ</p>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => setShowCreateTable(true)}>
                <Plus size={13} /> Tạo bảng đầu tiên
              </button>
            </div>
          ) : (
            <>
              {/* Detail Header */}
              <div className="detail-header">
                <div className="breadcrumb">
                  <span className="breadcrumb-schema">{selected.schema}</span>
                  <span className="breadcrumb-sep">/</span>
                  <span className="breadcrumb-table">{selected.table}</span>
                </div>
                <div className="detail-actions">
                  <RenameTableInline
                    branch={activeBranch}
                    schema={selected.schema}
                    table={selected.table}
                    onSuccess={(newName) => {
                      toast(`Đã đổi tên → ${newName}`)
                      setSchemaTables(prev => ({
                        ...prev,
                        [selected.schema]: (prev[selected.schema] || []).map(t => t === selected.table ? newName : t)
                      }))
                      setSelected({ schema: selected.schema, table: newName })
                    }}
                    onError={e => toast(e, 'error')}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={refreshCurrentSchema}>
                    <RefreshCw size={13} />
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDropTable(selected.schema, selected.table)}>
                    <Trash2 size={13} /> Drop
                  </button>
                </div>
              </div>

              {/* Tab bar */}
              <div className="tab-bar">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="tab-content">
                {activeTab === 'overview' && (
                  <TabOverview branch={activeBranch} schema={selected.schema} table={selected.table} toast={toast} />
                )}
                {activeTab === 'schema' && (
                  <TabSchema
                    branch={activeBranch}
                    schema={selected.schema}
                    table={selected.table}
                    toast={toast}
                  />
                )}
                {activeTab === 'preview' && (
                  <TabPreview branch={activeBranch} schema={selected.schema} table={selected.table} toast={toast} initialSnapshotId={previewSnapshotId} />
                )}
                {activeTab === 'snapshots' && (
                  <TabSnapshots branch={activeBranch} schema={selected.schema} table={selected.table} onTimeTravelPreview={(snapId) => { setPreviewSnapshotId(String(snapId)); setActiveTab('preview') }} toast={toast} confirm={setConfirmDialog} />
                )}
                {activeTab === 'ddl' && (
                  <TabDDL branch={activeBranch} schema={selected.schema} table={selected.table} toast={toast} />
                )}
                {activeTab === 'maintenance' && (
                  <TabMaintenance branch={activeBranch} schema={selected.schema} table={selected.table} toast={toast} confirm={setConfirmDialog} />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {confirmDialog && <ConfirmModal {...confirmDialog} />}
      {showCreateSchema && (
        <CreateSchemaModal
          branch={activeBranch}
          onClose={() => setShowCreateSchema(false)}
          onSuccess={(name) => {
            toast(`Đã tạo schema "${name}"`)
            setSchemas(p => [...p, name])
            setShowCreateSchema(false)
          }}
          onError={e => toast(e, 'error')}
        />
      )}
      {showCreateTable && (
        <CreateTableWizard
          branch={activeBranch}
          schemas={schemas}
          defaultSchema={selected?.schema || schemas[0] || 'bronze'}
          onClose={() => setShowCreateTable(false)}
          onSuccess={(schema, table) => {
            toast(`Đã tạo bảng "${schema}.${table}"`)
            loadTablesForSchema(schema)
            setSelected({ schema, table })
            setShowCreateTable(false)
          }}
          onError={e => toast(e, 'error')}
        />
      )}

      
      <Toast toasts={toasts} remove={removeToast} />
    </>
  )
}

// ── Rename inline button ──────────────────────────────────────
function RenameTableInline({ branch, schema, table, onSuccess, onError }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(table)
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!val.trim() || val === table) { setEditing(false); return }
    setLoading(true)
    try {
      await api.renameTable(schema, table, { new_name: val.trim() }, branch)
      onSuccess(val.trim())
      setEditing(false)
    } catch (e) { onError(e.message) }
    setLoading(false)
  }

  if (!editing) return (
    <button className="btn btn-secondary btn-sm" onClick={() => { setVal(table); setEditing(true) }}>
      <Pencil size={13} /> Rename
    </button>
  )

  return (
    <div className="inline-confirm">
      <input
        className="form-input"
        style={{ padding: '4px 8px', width: 160, fontSize: 13 }}
        value={val}
        onChange={e => setVal(e.target.value)}
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setEditing(false) }}
      />
      <button className="btn btn-primary btn-sm" onClick={submit} disabled={loading}>
        {loading ? <LoadingDots /> : <Check size={13} />}
      </button>
      <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
        <X size={13} />
      </button>
    </div>
  )
}

// ── Tab: Overview ─────────────────────────────────────────────
function TabOverview({ branch, schema, table, toast }) {
  const [stats, setStats]   = useState(null)
  const [props, setProps]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setStats(null); setProps(null)
    Promise.all([
      api.getTableStats(schema, table, branch).catch(() => null),
      api.getTableProps(schema, table, branch).catch(() => null),
    ]).then(([s, p]) => { setStats(s); setProps(p); setLoading(false) })
  }, [schema, table, branch])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><LoadingDots /></div>
  )

  const location = props?.properties?.['write.target-file-size-bytes']
    ? `s3a://warehouse/${schema}/${table}`
    : `s3a://warehouse/${schema}/${table}/`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stats row */}
      <div className="stats-mini-grid">
        <div className="stat-mini-card">
          <div className="stat-mini-label"><Hash size={12} /> Rows</div>
          <div className="stat-mini-value">{fmtNum(stats?.row_count)}</div>
          <div className="stat-mini-sub">total records</div>
        </div>
        <div className="stat-mini-card">
          <div className="stat-mini-label"><FileText size={12} /> Files</div>
          <div className="stat-mini-value">{fmtNum(stats?.file_count)}</div>
          <div className="stat-mini-sub">parquet files</div>
        </div>
        <div className="stat-mini-card">
          <div className="stat-mini-label"><HardDrive size={12} /> Size</div>
          <div className="stat-mini-value">{fmtBytes(stats?.total_size_bytes)}</div>
          <div className="stat-mini-sub">on disk</div>
        </div>
        <div className="stat-mini-card">
          <div className="stat-mini-label"><Camera size={12} /> Snapshots</div>
          <div className="stat-mini-value">{fmtNum(stats?.snapshot_count)}</div>
          <div className="stat-mini-sub">versions</div>
        </div>
      </div>

      {/* Properties */}
      <div className="card">
        <div className="card-header"><h2>Table Properties</h2></div>
        <div className="card-body" style={{ padding: '0 0' }}>
          <table className="prop-table">
            <tbody>
              <tr><td>Full name</td><td><span className="font-mono" style={{ fontSize: 13 }}>iceberg.{schema}.{table}</span></td></tr>
              <tr><td>Storage</td><td><span className="font-mono" style={{ fontSize: 12 }}>{location}</span></td></tr>
              <tr><td>Format</td><td><span className="badge badge-info">PARQUET</span></td></tr>
              {props?.properties && Object.entries(props.properties).slice(0, 8).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td><span className="font-mono" style={{ fontSize: 12 }}>{v}</span></td>
                </tr>
              ))}
              {props?.file_stats && (
                <tr>
                  <td>File count</td>
                  <td>{props.file_stats.file_count} files / {fmtBytes(props.file_stats.total_size_bytes)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Schema ───────────────────────────────────────────────
function TabSchema({ branch, schema, table, toast }) {
  const [columns, setColumns]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [renaming, setRenaming]   = useState(null) // col name being renamed
  const [renameVal, setRenameVal] = useState('')
  const [dropping, setDropping]   = useState(null)
  const [addForm, setAddForm]     = useState(null)  // null | {name, type, comment}
  const [busy, setBusy]           = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.describeTable(schema, table, branch)
      setColumns(data.columns || [])
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [schema, table, branch])

  useEffect(() => { load() }, [load])

  async function handleRename(oldName) {
    if (!renameVal.trim() || renameVal === oldName) { setRenaming(null); return }
    setBusy(true)
    try {
      await api.alterTable(schema, table, { rename_column: { from: oldName, to: renameVal.trim() } }, branch)
      toast(`Đã đổi tên column "${oldName}" → "${renameVal}"`)
      load()
    } catch (e) { toast(e.message, 'error') }
    setBusy(false); setRenaming(null)
  }

  async function handleDrop(colName) {
    setBusy(true)
    try {
      await api.alterTable(schema, table, { drop_columns: [colName] }, branch)
      toast(`Đã xóa column "${colName}"`)
      load()
    } catch (e) { toast(e.message, 'error') }
    setBusy(false); setDropping(null)
  }

  async function handleAdd() {
    if (!addForm?.name.trim()) return
    setBusy(true)
    try {
      await api.alterTable(schema, table, {
        add_columns: [{ name: addForm.name.trim(), type: addForm.type, comment: addForm.comment }]
      }, branch)
      toast(`Đã thêm column "${addForm.name}"`)
      setAddForm(null)
      load()
    } catch (e) { toast(e.message, 'error') }
    setBusy(false)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><LoadingDots /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{columns.length} columns</span>
        <button className="btn btn-primary btn-sm" onClick={() => setAddForm({ name: '', type: 'VARCHAR', comment: '' })}>
          <Plus size={13} /> Add Column
        </button>
      </div>

      <div className="col-list">
        {/* Header */}
        <div className="col-row-header">
          <span>Column Name</span>
          <span>Type</span>
          <span>Comment</span>
          <span style={{ width: 64 }}></span>
        </div>

        {/* Columns */}
        {columns.map((col) => (
          <div className="col-row" key={col.name}>
            {/* Name cell */}
            <div className="col-name-cell">
              {renaming === col.name ? (
                <input
                  className="col-name-input"
                  value={renameVal}
                  onChange={e => setRenameVal(e.target.value)}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRename(col.name)
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                />
              ) : (
                <span>{col.name}</span>
              )}
            </div>

            {/* Type */}
            <div>
              <span className="badge badge-info" style={{ fontSize: 11 }}>{col.type}</span>
            </div>

            {/* Comment */}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {col.comment || <span style={{ opacity: 0.4 }}>—</span>}
            </div>

            {/* Actions */}
            <div className="col-actions">
              {dropping === col.name ? (
                <div className="inline-confirm">
                  <span style={{ fontSize: 11, color: 'var(--danger)' }}>Xóa?</span>
                  <button className="btn btn-danger btn-sm" style={{ padding: '2px 6px' }} onClick={() => handleDrop(col.name)} disabled={busy}>
                    <Check size={11} />
                  </button>
                  <button className="btn btn-secondary btn-sm" style={{ padding: '2px 6px' }} onClick={() => setDropping(null)}>
                    <X size={11} />
                  </button>
                </div>
              ) : renaming === col.name ? (
                <div className="inline-confirm">
                  <button className="btn btn-primary btn-sm" style={{ padding: '2px 6px' }} onClick={() => handleRename(col.name)} disabled={busy}>
                    <Check size={11} />
                  </button>
                  <button className="btn btn-secondary btn-sm" style={{ padding: '2px 6px' }} onClick={() => setRenaming(null)}>
                    <X size={11} />
                  </button>
                </div>
              ) : (
                <>
                  <button className="btn btn-secondary btn-sm" style={{ padding: '3px 7px' }}
                    title="Đổi tên column"
                    onClick={() => { setRenaming(col.name); setRenameVal(col.name) }}>
                    <Pencil size={11} />
                  </button>
                  <button className="btn btn-danger btn-sm" style={{ padding: '3px 7px' }}
                    title="Xóa column"
                    onClick={() => setDropping(col.name)}>
                    <Trash2 size={11} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Add column form */}
        {addForm && (
          <div className="add-col-row">
            <input
              className="form-input"
              placeholder="column_name"
              value={addForm.name}
              onChange={e => setAddForm({ ...addForm, name: e.target.value })}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}
              autoFocus
            />
            <select
              className="form-select"
              value={addForm.type}
              onChange={e => setAddForm({ ...addForm, type: e.target.value })}
              style={{ fontSize: 12 }}
            >
              {COL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              className="form-input"
              placeholder="comment (optional)"
              value={addForm.comment}
              onChange={e => setAddForm({ ...addForm, comment: e.target.value })}
              style={{ fontSize: 12 }}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAddForm(null) }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={busy || !addForm.name.trim()}>
                {busy ? <LoadingDots /> : <Check size={13} />}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setAddForm(null)}>
                <X size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab: Preview ──────────────────────────────────────────────
function TabPreview({ branch, schema, table, toast, initialSnapshotId }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [limit, setLimit]     = useState(50)
  const [snapshotId, setSnapshotId] = useState(initialSnapshotId || '')
  const [search, setSearch]   = useState('')
  
  const [newRows, setNewRows] = useState([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { 
    setSnapshotId(initialSnapshotId || '')
    load(limit, initialSnapshotId || null) 
  }, [schema, table, branch, initialSnapshotId])

  async function load(lim = limit, snap = null) {
    setLoading(true)
    setNewRows([])
    try {
      const res = await api.previewTable(schema, table, lim, snap || undefined, branch)
      setData(res)
    } catch { setData(null) }
    setLoading(false)
  }

  function handleAddRow() {
    if (!data?.columns) return
    const row = {}
    data.columns.forEach(c => row[c] = '')
    setNewRows([row, ...newRows])
  }

  function handleUpdateNewRow(index, col, val) {
    const list = [...newRows]
    list[index][col] = val
    setNewRows(list)
  }

  function handleRemoveNewRow(index) {
    const list = [...newRows]
    list.splice(index, 1)
    setNewRows(list)
  }

  async function handleExecuteInsert() {
    if (newRows.length === 0) return
    setSubmitting(true)
    try {
      const payload = newRows.map(row => {
        const parsed = {}
        for (let k in row) {
          let val = row[k]
          if (val === '') {
            parsed[k] = null
            continue
          }
          if (typeof val === 'string' && val.includes('T') && val.includes('-') && val.includes(':')) {
              // Convert built-in HTML5 datetime-local string (2024-01-01T12:00) into SQL string
              val = val.replace('T', ' ');
              // Add seconds if missing since some browsers only output HH:mm
              if (val.split(':').length === 2) {
                  val += ':00';
              }
          }
          const typeInfo = data.column_details?.find(d => d.name === k)?.type || ''
          if (typeInfo.includes('INT') || typeInfo.includes('DOUBLE') || typeInfo.includes('DECIMAL')) {
            const num = Number(val)
            parsed[k] = isNaN(num) ? val : num
          } else if (typeInfo.includes('BOOLEAN')) {
            parsed[k] = val === 'true' || val === '1'
          } else {
            parsed[k] = val
          }
        }
        return parsed
      })
      await api.insertTableData(schema, table, { rows: payload }, branch)
      setNewRows([])
      load(limit)
      toast && toast(`Đã chèn ${newRows.length} dòng thành công`, 'success')
    } catch (e) {
      let msg = e.message;
      if (msg.includes('Cannot cast') || msg.includes('TYPE_MISMATCH')) {
        msg = "Dữ liệu nhập bị sai định dạng Type (ví dụ chữ nhập vào ô số).";
      } else if (msg.includes('not allow nulls')) {
        msg = "Cột này bắt buộc phải điền giá trị (Not Null).";
      } else if (msg.includes('date/time') || msg.includes('timestamp')) {
         msg = "Thời gian sai format, xin kiểm tra lại.";
      } else if (msg.includes('value is not acceptable')) {
         msg = "Giá trị nhập vào không hợp lệ với cột.";
      }
      toast && toast("Lỗi: " + msg, 'error')
    }
    setSubmitting(false)
  }

  const filtered = data?.rows?.filter(row =>
    !search || Object.values(row).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase()))
  )

  function getPlaceholder(type) {
    if (!type) return '...'
    if (type.includes('TIMESTAMP(6)')) return 'YYYY-MM-DD HH:mm:ss.SSSSSS'
    if (type.includes('TIMESTAMP')) return 'YYYY-MM-DD HH:mm:ss'
    if (type.includes('DATE')) return 'YYYY-MM-DD'
    if (type.includes('DECIMAL') || type.includes('DOUBLE')) return '0.00'
    if (type.includes('INT')) return '123'
    if (type.includes('BOOLEAN')) return 'true/false'
    return type
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" onClick={handleAddRow} disabled={!data?.columns}>
          <Plus size={13} /> + Thêm Dòng
        </button>
        {newRows.length > 0 && (
          <button className="btn btn-primary btn-sm" style={{ background: 'var(--success)', borderColor: 'var(--success)' }} onClick={handleExecuteInsert} disabled={submitting}>
            {submitting ? <LoadingDots /> : <><CheckCheck size={13} /> Lưu {newRows.length} dòng</>}
          </button>
        )}
        {newRows.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={() => setNewRows([])}>
            Hủy
          </button>
        )}
      
        <div style={{ position: 'relative', flex: '0 0 200px', marginLeft: 16 }}>
          <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="form-input"
            placeholder="Filter rows..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 28, fontSize: 12 }}
          />
        </div>
        <select
          className="form-select"
          value={limit}
          onChange={e => { setLimit(+e.target.value); load(+e.target.value) }}
          style={{ width: 100, fontSize: 12 }}
        >
          {[20, 50, 100, 200].map(n => <option key={n} value={n}>{n} rows</option>)}
        </select>
        <input
          className="form-input"
          placeholder="Snapshot ID (time travel)..."
          value={snapshotId}
          onChange={e => setSnapshotId(e.target.value)}
          style={{ width: 220, fontSize: 12 }}
        />
        <button className="btn btn-secondary btn-sm" onClick={() => load(limit, snapshotId || null)}>
          <RefreshCw size={13} /> Query
        </button>
        {data && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {filtered?.length ?? data.count} / {data.count} rows
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}><LoadingDots /></div>
      ) : !data ? (
        <div className="detail-empty">
          <Eye size={40} />
          <h3>Không có data</h3>
          <p>Bảng trống hoặc có lỗi khi query</p>
        </div>
      ) : (
        <div className="data-grid-wrap" style={{ flex: 1 }}>
          <table className="data-grid">
            <thead>
              <tr>
                <th style={{ width: 48, color: 'var(--text-muted)', textAlign: 'center' }}>
                  <Zap size={13} style={{ color: 'var(--text-muted)' }} />
                </th>
                {data.columns.map(c => {
                  const typeInfo = data.column_details?.find(d => d.name === c)?.type;
                  return (
                    <th key={c}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span>{c}</span>
                        {typeInfo && <span style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 'normal', marginTop: 2 }}>{typeInfo}</span>}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* Render New Rows for Editing at the TOP */}
              {newRows.map((row, i) => (
                <tr key={`new-${i}`} style={{ background: 'var(--bg-card)', boxShadow: 'inset 0 0 0 1px rgba(99, 102, 241, 0.2)' }}>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn btn-secondary btn-sm" style={{ padding: '4px', background: 'transparent', border: 'none', color: 'var(--text-muted)' }} onClick={() => handleRemoveNewRow(i)} title="Hủy dòng này">
                      <Trash2 size={13} />
                    </button>
                  </td>
                  {data.columns.map(c => {
                    const typeInfo = data.column_details?.find(d => d.name === c)?.type || '';
                    return (
                      <td key={`new-${i}-${c}`} style={{ padding: 4 }}>
                        {(() => {
                          let inputType = 'text';
                          let stepStr = undefined;
                          if (typeInfo.includes('TIMESTAMP')) {
                             inputType = 'datetime-local';
                             stepStr = "0.000001"; // support microseconds
                          } else if (typeInfo.includes('DATE')) {
                             inputType = 'date';
                          } else if (typeInfo.includes('INT') || typeInfo.includes('DECIMAL') || typeInfo.includes('DOUBLE')) {
                             inputType = 'number';
                             if (typeInfo.includes('DECIMAL') || typeInfo.includes('DOUBLE')) stepStr = "any";
                          }
                          return (
                            <input
                              className="form-input"
                              type={inputType}
                              step={stepStr}
                              style={{ width: '100%', height: '28px', fontSize: 12, borderRadius: 4, background: 'var(--bg-body)' }}
                              value={row[c] || ''}
                              placeholder={getPlaceholder(typeInfo)}
                              title={`Type: ${typeInfo}`}
                              autoComplete="off"
                              onChange={e => handleUpdateNewRow(i, c, e.target.value)}
                            />
                          )
                        })()}
                      </td>
                    );
                  })}
                </tr>
              ))}
              
              {/* Existing Data */}
              {(filtered || data.rows).map((row, i) => (
                <tr key={`old-${i}`}>
                  <td style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'center' }}>{i + 1}</td>
                  {data.columns.map(c => (
                    <td key={c}>
                      {row[c] === null || row[c] === undefined
                        ? <span className="data-grid-null">null</span>
                        : String(row[c])
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab: Snapshots ────────────────────────────────────────────
function TabSnapshots({ branch, schema, table, onTimeTravelPreview, toast, confirm }) {
  const [snaps, setSnaps]     = useState([])
  const [currId, setCurrId]   = useState('')
  const [loading, setLoading] = useState(true)

  async function loadData() {
    setLoading(true)
    try {
      const d = await api.getSnapshots(schema, table, branch)
      setSnaps(d.snapshots || [])
      setCurrId(d.current_snapshot_id || '')
    } catch {
      setSnaps([])
    }
    setLoading(false)
  }

  async function handleRollback(snapId) {
    confirm({
       title: "Khôi phục Snapshot",
       message: `Bạn đang chuẩn bị khôi phục bảng dữ liệu này quay trở về thời điểm của Snapshot ID #${String(snapId).slice(-8)}. Các dữ liệu sinh ra sau mốc này sẽ bị ẩn đi. Dữ liệu quay trở về trạng thái mốc đã chọn.`,
       confirmText: "Xác nhận khôi phục",
       onConfirm: async () => {
         confirm(null);
         try {
           toast && toast(`Đang tiến hành Time Travel...`, 'success');
           await api.rollbackToSnapshot(schema, table, snapId, branch);
           toast && toast(`[Thành công] Đã khôi phục về snapshot ${snapId}`, 'success');
           setLoading(true);
           loadData();
         } catch (e) {
           toast && toast(`Lỗi khôi phục (Trino): ${e.message}`, 'error');
         }
       },
       onCancel: () => confirm(null)
    })
  }

  useEffect(() => {
    loadData()
  }, [schema, table, branch])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><LoadingDots /></div>

  if (snaps.length === 0) return (
    <div className="detail-empty">
      <Camera size={40} />
      <h3>Chưa có snapshot</h3>
      <p>Snapshots xuất hiện sau khi có dữ liệu được INSERT/DELETE vào bảng</p>
    </div>
  )

  const opColor = (op) => {
    if (!op) return 'other'
    const o = op.toLowerCase()
    if (o === 'append') return 'append'
    if (o === 'overwrite' || o === 'replace') return 'overwrite'
    if (o === 'delete') return 'delete'
    return 'replace'
  }

  const opBadge = (op) => {
    const cls = { append: 'badge-success', overwrite: 'badge-warning', delete: 'badge-danger', replace: 'badge-info' }
    return cls[opColor(op)] || 'badge-purple'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
        {snaps.length} snapshots — newest first
      </div>
      <div className="snapshot-list">
        {snaps.map((s, i) => {
          const summary = s.summary || {}
          return (
            <div className="snapshot-item" key={s.snapshot_id}>
              <div className={`snapshot-dot ${opColor(s.operation)}`} />
              <div className="snapshot-content">
                <div className="snapshot-header">
                  {s.snapshot_id === currId && (
                    <span className="badge badge-primary" style={{ fontSize: 10, background: 'var(--primary)', color: '#fff' }}>
                      CURRENT
                    </span>
                  )}
                  {s.operation && (
                    <span className={`badge ${opBadge(s.operation)}`} style={{ fontSize: 10 }}>
                      {s.operation}
                    </span>
                  )}
                  <span className="snapshot-id">#{String(s.snapshot_id).slice(-8)}</span>
                  <span className="snapshot-time">{fmtDate(s.committed_at)}</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '2px 8px', fontSize: 11 }}
                      onClick={() => {
                        navigator.clipboard.writeText(String(s.snapshot_id))
                        toast && toast(`Đã copy ID: ${s.snapshot_id}`, 'success')
                      }}
                      title="Copy snapshot ID"
                    >
                      <Copy size={11} /> ID
                    </button>
                    {s.snapshot_id !== currId && (
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '2px 8px', fontSize: 11, background: 'var(--bg-card)', color: 'var(--warning)', borderColor: 'var(--warning)' }}
                        onClick={() => handleRollback(s.snapshot_id)}
                        title="Khôi phục bảng về snapshot này"
                      >
                        <RefreshCw size={11} /> Khôi phục
                      </button>
                    )}
                    <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '2px 8px', fontSize: 11, background: 'var(--bg-card)', color: 'var(--primary)', borderColor: 'var(--primary)' }}
                        onClick={() => onTimeTravelPreview(s.snapshot_id)}
                        title="Xem dữ liệu tại mốc thời gian này"
                      >
                        <Eye size={11} /> Xem
                      </button>
                  </div>
                </div>
                {Object.keys(summary).length > 0 && (
                  <div className="snapshot-summary">
                    {Object.entries(summary).slice(0, 6).map(([k, v]) => (
                      <span className="snapshot-kv" key={k}>
                        <span style={{ opacity: 0.6 }}>{k}:</span> {v}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tab: DDL ──────────────────────────────────────────────────
function TabDDL({ branch, schema, table, toast }) {
  const [ddl, setDdl]         = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    setLoading(true)
    api.getTableProps(schema, table, branch)
      .then(d => setDdl(d.ddl || ''))
      .catch(() => setDdl('-- Không thể lấy DDL'))
      .finally(() => setLoading(false))
  }, [schema, table, branch])

  function copyDDL() {
    navigator.clipboard.writeText(ddl)
    setCopied(true)
    toast('Đã copy DDL vào clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><LoadingDots /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Generated CREATE TABLE statement
        </span>
        <button className="btn btn-secondary btn-sm" onClick={copyDDL}>
          {copied ? <><CheckCheck size={13} /> Copied!</> : <><Copy size={13} /> Copy DDL</>}
        </button>
      </div>
      <div className="ddl-block">
        {ddl || '-- Bảng chưa có DDL (bảng rỗng hoặc metadata chưa ready)'}
      </div>
    </div>
  )
}

// ── Modal: Create Schema ──────────────────────────────────────
function CreateSchemaModal({ branch, onClose, onSuccess, onError }) {
  const [name, setName]     = useState('')
  const [loc, setLoc]       = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setLoading(true)
    try {
      await api.createSchema({ schema_name: name.trim(), location: loc.trim() || undefined })
      onSuccess(name.trim())
    } catch (e) { onError(e.message) }
    setLoading(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Layers size={16} /> Tạo Schema mới</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Tên Schema *</label>
            <input className="form-input" placeholder="vd: staging" value={name}
              onChange={e => setName(e.target.value.toLowerCase().replace(/\s/g, '_'))}
              onKeyDown={e => e.key === 'Enter' && submit()}
              autoFocus
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Location mặc định: s3a://warehouse/{name || 'schema_name'}/
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Custom Location (optional)</label>
            <input className="form-input" placeholder="s3a://your-bucket/path/" value={loc}
              onChange={e => setLoc(e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Hủy</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading || !name.trim()}>
            {loading ? <LoadingDots /> : <><Check size={14} /> Tạo Schema</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Wizard: Create Table (3 steps) ───────────────────────────
function CreateTableWizard({ branch, schemas, defaultSchema, onClose, onSuccess, onError }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  // Step 1
  const [info, setInfo] = useState({
    schema_name: defaultSchema,
    table_name: '',
    comment: '',
  })

  // Step 2
  const [cols, setCols] = useState([
    { name: 'id', type: 'BIGINT', comment: 'Primary key' },
    { name: 'created_at', type: 'TIMESTAMP', comment: '' },
  ])

  // Step 3
  const [adv, setAdv] = useState({
    file_format: 'PARQUET',
    partition_by: '',
    sort_by: '',
  })

  function addCol() {
    setCols(p => [...p, { name: '', type: 'VARCHAR', comment: '' }])
  }
  function removeCol(i) {
    setCols(p => p.filter((_, idx) => idx !== i))
  }
  function updateCol(i, field, val) {
    setCols(p => p.map((c, idx) => idx === i ? { ...c, [field]: val } : c))
  }

  function generateSQL() {
    const colsSql = cols.filter(c => c.name.trim()).map(c => {
      let s = `  ${c.name} ${c.type}`
      if (c.comment) s += ` COMMENT '${c.comment}'`
      return s
    }).join(',\n')
    let sql = `CREATE TABLE IF NOT EXISTS iceberg.${info.schema_name}.${info.table_name || '<table>'} (\n${colsSql}\n)`
    if (info.comment) sql += `\nCOMMENT '${info.comment}'`
    const withParts = [`format = '${adv.file_format}'`]
    if (adv.partition_by.trim()) {
      const parts = adv.partition_by.split(',').map(p => `'${p.trim()}'`).join(', ')
      withParts.push(`partitioning = ARRAY[${parts}]`)
    }
    sql += `\nWITH (\n  ${withParts.join(',\n  ')}\n)`
    return sql
  }

  async function submit() {
    setLoading(true)
    try {
      const payload = {
        schema_name: info.schema_name,
        table_name: info.table_name.trim(),
        comment: info.comment || undefined,
        columns: cols.filter(c => c.name.trim()).map(c => ({
          name: c.name.trim(), type: c.type, comment: c.comment || undefined
        })),
        file_format: adv.file_format,
        partition_by: adv.partition_by.trim()
          ? adv.partition_by.split(',').map(p => p.trim()).filter(Boolean)
          : undefined,
        sort_by: adv.sort_by.trim()
          ? adv.sort_by.split(',').map(s => s.trim()).filter(Boolean)
          : undefined,
      }
      await api.createTable(payload, branch)
      onSuccess(info.schema_name, info.table_name.trim())
    } catch (e) { onError(e.message) }
    setLoading(false)
  }

  const stepDefs = [
    { num: 1, label: 'Thông tin' },
    { num: 2, label: 'Columns' },
    { num: 3, label: 'Advanced' },
  ]

  const canNext1 = info.schema_name && info.table_name.trim()
  const canNext2 = cols.filter(c => c.name.trim()).length > 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Database size={16} /> Tạo Iceberg Table
          </h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}><X size={14} /></button>
        </div>

        {/* Step indicator */}
        <div className="wizard-steps">
          {stepDefs.map((s, i) => (
            <React.Fragment key={s.num}>
              <div className={`wizard-step${step === s.num ? ' active' : ''}${step > s.num ? ' done' : ''}`}>
                <div className="wizard-step-num">
                  {step > s.num ? <Check size={10} /> : s.num}
                </div>
                {s.label}
              </div>
              {i < stepDefs.length - 1 && <div className="wizard-step-sep" />}
            </React.Fragment>
          ))}
        </div>

        {/* Step content */}
        <div className="modal-body">
          {/* Step 1: Info */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Schema *</label>
                <select className="form-select" value={info.schema_name}
                  onChange={e => setInfo({ ...info, schema_name: e.target.value })}>
                  {schemas.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tên bảng *</label>
                <input
                  className="form-input"
                  placeholder="vd: raw_orders"
                  value={info.table_name}
                  onChange={e => setInfo({ ...info, table_name: e.target.value.toLowerCase().replace(/\s/g, '_') })}
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  autoFocus
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Full name: iceberg.{info.schema_name}.{info.table_name || '<table>'}
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Description (optional)</label>
                <textarea className="form-textarea" style={{ minHeight: 70 }}
                  placeholder="Mô tả ngắn về bảng..."
                  value={info.comment}
                  onChange={e => setInfo({ ...info, comment: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Step 2: Columns */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{cols.filter(c=>c.name).length} columns</span>
                <button className="btn btn-secondary btn-sm" onClick={addCol}>
                  <Plus size={13} /> Add Row
                </button>
              </div>
              {/* Col list header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 1fr auto', gap: 6, padding: '4px 10px',
                fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                <span>Name *</span><span>Type *</span><span>Comment</span><span></span>
              </div>
              <div className="wizard-col-list">
                {cols.map((col, i) => (
                  <div className="wizard-col-item" key={i}>
                    <input
                      className="form-input"
                      placeholder="col_name"
                      value={col.name}
                      onChange={e => updateCol(i, 'name', e.target.value.toLowerCase().replace(/\s/g, '_'))}
                      style={{ padding: '6px 8px', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}
                    />
                    <select
                      className="form-select"
                      value={col.type}
                      onChange={e => updateCol(i, 'type', e.target.value)}
                      style={{ padding: '6px 8px', fontSize: 12 }}
                    >
                      {COL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      className="form-input"
                      placeholder="comment..."
                      value={col.comment}
                      onChange={e => updateCol(i, 'comment', e.target.value)}
                      style={{ padding: '6px 8px', fontSize: 12 }}
                    />
                    <button
                      className="btn btn-danger btn-sm"
                      style={{ padding: '4px 8px' }}
                      onClick={() => removeCol(i)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Advanced */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">File Format</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {FILE_FORMATS.map(f => (
                    <button key={f}
                      className={`btn ${adv.file_format === f ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                      onClick={() => setAdv({ ...adv, file_format: f })}
                    >{f}</button>
                  ))}
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Partition By (optional)</label>
                <input className="form-input"
                  placeholder="vd: month(order_date), region"
                  value={adv.partition_by}
                  onChange={e => setAdv({ ...adv, partition_by: e.target.value })}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Nhiều columns cách nhau bởi dấu phẩy. Hỗ trợ: year(), month(), day(), hour(), bucket(N,...), truncate(N,...)
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Sort By (optional)</label>
                <input className="form-input"
                  placeholder="vd: id, created_at DESC"
                  value={adv.sort_by}
                  onChange={e => setAdv({ ...adv, sort_by: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">SQL Preview</label>
                <div className="sql-preview">{generateSQL()}</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Hủy</button>
          {step > 1 && (
            <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)}>← Quay lại</button>
          )}
          {step < 3 ? (
            <button
              className="btn btn-primary"
              onClick={() => setStep(s => s + 1)}
              disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
            >
              Tiếp theo →
            </button>
          ) : (
            <button className="btn btn-primary" onClick={submit} disabled={loading}>
              {loading ? <LoadingDots /> : <><Zap size={14} /> Tạo bảng</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}


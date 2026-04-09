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
export default function ModelManager() {
  const [schemas, setSchemas]           = useState([])
  const [openSchemas, setOpenSchemas]   = useState({})
  const [schemaTables, setSchemaTables] = useState({}) // {schemaName: [tableName,...]}
  const [selected, setSelected]         = useState(null) // {schema, table}
  const [activeTab, setActiveTab]       = useState('overview')
  const [toasts, setToasts]             = useState([])
  const [showCreateSchema, setShowCreateSchema] = useState(false)
  const [showCreateTable, setShowCreateTable]   = useState(false)

  // Toast helpers
  const toast = (msg, type = 'success') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500)
  }
  const removeToast = (id) => setToasts(p => p.filter(t => t.id !== id))

  useEffect(() => { loadSchemas() }, [])

  async function loadSchemas() {
    try {
      const data = await api.getSchemas()
      const list = data.schemas || []
      setSchemas(list)
      // auto-open bronze/silver/gold
      const autoOpen = {}
      list.forEach(s => { if (['bronze','silver','gold'].includes(s)) autoOpen[s] = true })
      setOpenSchemas(prev => ({ ...autoOpen, ...prev }))
    } catch (e) { toast('Không load được schemas', 'error') }
  }

  async function loadTablesForSchema(schema) {
    try {
      const data = await api.getTables(schema)
      setSchemaTables(prev => ({ ...prev, [schema]: data.tables || [] }))
    } catch { setSchemaTables(prev => ({ ...prev, [schema]: [] })) }
  }

  function toggleSchema(schema) {
    const next = !openSchemas[schema]
    setOpenSchemas(prev => ({ ...prev, [schema]: next }))
    if (next && !schemaTables[schema]) loadTablesForSchema(schema)
  }

  function selectTable(schema, table) {
    setSelected({ schema, table })
    setActiveTab('overview')
  }

  async function handleDropSchema(schema) {
    if (!window.confirm(`Xóa schema "${schema}"? Schema phải EMPTY.`)) return
    try {
      await api.dropSchema(schema)
      toast(`Đã xóa schema "${schema}"`)
      setSchemas(p => p.filter(s => s !== schema))
      setSchemaTables(p => { const n = {...p}; delete n[schema]; return n })
      if (selected?.schema === schema) setSelected(null)
    } catch (e) { toast(e.message, 'error') }
  }

  async function handleDropTable(schema, table) {
    if (!window.confirm(`Xóa bảng "${schema}.${table}"?\nThao tác này KHÔNG THỂ hoàn tác.`)) return
    try {
      await api.dropTable(schema, table)
      toast(`Đã xóa bảng "${table}"`)
      setSchemaTables(prev => ({ ...prev, [schema]: (prev[schema] || []).filter(t => t !== table) }))
      if (selected?.schema === schema && selected?.table === table) setSelected(null)
    } catch (e) { toast(e.message, 'error') }
  }

  function refreshCurrentSchema() {
    if (selected) loadTablesForSchema(selected.schema)
  }

  const tabs = [
    { id: 'overview',   label: 'Overview',   icon: <BarChart2 size={13} /> },
    { id: 'schema',     label: 'Schema',     icon: <Table size={13} /> },
    { id: 'preview',    label: 'Preview',    icon: <Eye size={13} /> },
    { id: 'snapshots',  label: 'Snapshots',  icon: <Camera size={13} /> },
    { id: 'ddl',        label: 'DDL',        icon: <Code size={13} /> },
  ]

  return (
    <>
      {/* Top bar */}
      <div className="top-bar">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Database size={18} /> Data Models
        </h1>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={loadSchemas}>
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
          <div className="schema-panel-header">
            <h3>Catalog Explorer</h3>
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
                  <TabOverview schema={selected.schema} table={selected.table} toast={toast} />
                )}
                {activeTab === 'schema' && (
                  <TabSchema
                    schema={selected.schema}
                    table={selected.table}
                    toast={toast}
                  />
                )}
                {activeTab === 'preview' && (
                  <TabPreview schema={selected.schema} table={selected.table} />
                )}
                {activeTab === 'snapshots' && (
                  <TabSnapshots schema={selected.schema} table={selected.table} onTimeTravelPreview={() => setActiveTab('preview')} />
                )}
                {activeTab === 'ddl' && (
                  <TabDDL schema={selected.schema} table={selected.table} toast={toast} />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateSchema && (
        <CreateSchemaModal
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
function RenameTableInline({ schema, table, onSuccess, onError }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(table)
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!val.trim() || val === table) { setEditing(false); return }
    setLoading(true)
    try {
      await api.renameTable(schema, table, { new_name: val.trim() })
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
function TabOverview({ schema, table, toast }) {
  const [stats, setStats]   = useState(null)
  const [props, setProps]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setStats(null); setProps(null)
    Promise.all([
      api.getTableStats(schema, table).catch(() => null),
      api.getTableProps(schema, table).catch(() => null),
    ]).then(([s, p]) => { setStats(s); setProps(p); setLoading(false) })
  }, [schema, table])

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
function TabSchema({ schema, table, toast }) {
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
      const data = await api.describeTable(schema, table)
      setColumns(data.columns || [])
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [schema, table])

  useEffect(() => { load() }, [load])

  async function handleRename(oldName) {
    if (!renameVal.trim() || renameVal === oldName) { setRenaming(null); return }
    setBusy(true)
    try {
      await api.alterTable(schema, table, { rename_column: { from: oldName, to: renameVal.trim() } })
      toast(`Đã đổi tên column "${oldName}" → "${renameVal}"`)
      load()
    } catch (e) { toast(e.message, 'error') }
    setBusy(false); setRenaming(null)
  }

  async function handleDrop(colName) {
    setBusy(true)
    try {
      await api.alterTable(schema, table, { drop_columns: [colName] })
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
      })
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
function TabPreview({ schema, table }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [limit, setLimit]     = useState(50)
  const [snapshotId, setSnapshotId] = useState('')
  const [search, setSearch]   = useState('')

  useEffect(() => { load() }, [schema, table])

  async function load(lim = limit, snap = null) {
    setLoading(true)
    try {
      const res = await api.previewTable(schema, table, lim, snap || undefined)
      setData(res)
    } catch { setData(null) }
    setLoading(false)
  }

  const filtered = data?.rows?.filter(row =>
    !search || Object.values(row).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '0 0 200px' }}>
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
                <th style={{ width: 48, color: 'var(--text-muted)' }}>#</th>
                {data.columns.map(c => <th key={c}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {(filtered || data.rows).map((row, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
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
function TabSnapshots({ schema, table, onTimeTravelPreview }) {
  const [snaps, setSnaps]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.getSnapshots(schema, table)
      .then(d => setSnaps(d.snapshots || []))
      .catch(() => setSnaps([]))
      .finally(() => setLoading(false))
  }, [schema, table])

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
                      }}
                      title="Copy snapshot ID"
                    >
                      <Copy size={11} /> ID
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
function TabDDL({ schema, table, toast }) {
  const [ddl, setDdl]         = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    setLoading(true)
    api.getTableProps(schema, table)
      .then(d => setDdl(d.ddl || ''))
      .catch(() => setDdl('-- Không thể lấy DDL'))
      .finally(() => setLoading(false))
  }, [schema, table])

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
function CreateSchemaModal({ onClose, onSuccess, onError }) {
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
function CreateTableWizard({ schemas, defaultSchema, onClose, onSuccess, onError }) {
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
      await api.createTable(payload)
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

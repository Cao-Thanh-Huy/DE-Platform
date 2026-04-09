import React, { useState, useEffect } from 'react'
import { Play, Plus, Trash2, Clock, RefreshCw, Zap, ChevronDown, ChevronUp } from 'lucide-react'
import * as api from '../api/client'

export default function PipelineStudio() {
  const [pipelines, setPipelines] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [expandedPipeline, setExpandedPipeline] = useState(null)
  const [runs, setRuns] = useState({})
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    name: '', description: '', schedule: '', branch: 'main',
    steps: [{ name: '', type: 'sql', sql: '', description: '' }]
  })

  useEffect(() => { loadPipelines() }, [])

  async function loadPipelines() {
    setLoading(true)
    try {
      const data = await api.listPipelines()
      setPipelines(data.pipelines || [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  async function handleCreate() {
    try {
      await api.createPipeline(form)
      setShowCreate(false)
      setForm({ name: '', description: '', schedule: '', branch: 'main', steps: [{ name: '', type: 'sql', sql: '', description: '' }] })
      loadPipelines()
    } catch (e) { alert(e.message) }
  }

  async function handleTrigger(name) {
    try {
      const data = await api.triggerPipeline(name)
      alert(`Pipeline "${name}" đã được trigger!\nRun ID: ${data.run_id}`)
      loadRuns(name)
    } catch (e) { alert(e.message) }
  }

  async function handleDelete(name) {
    if (!confirm(`Xóa pipeline "${name}"?`)) return
    try {
      await api.deletePipeline(name)
      loadPipelines()
    } catch (e) { alert(e.message) }
  }

  async function loadRuns(name) {
    try {
      const data = await api.getPipelineRuns(name)
      setRuns(prev => ({ ...prev, [name]: data.runs || [] }))
    } catch (e) { console.error(e) }
  }

  function toggleExpand(name) {
    if (expandedPipeline === name) {
      setExpandedPipeline(null)
    } else {
      setExpandedPipeline(name)
      loadRuns(name)
    }
  }

  function addStep() {
    setForm({ ...form, steps: [...form.steps, { name: '', type: 'sql', sql: '', description: '' }] })
  }

  function updateStep(i, field, val) {
    const steps = [...form.steps]
    steps[i][field] = val
    setForm({ ...form, steps })
  }

  function removeStep(i) {
    const steps = form.steps.filter((_, idx) => idx !== i)
    setForm({ ...form, steps })
  }

  const statusColor = (status) => {
    const map = { SUCCESS: 'badge-success', FAILURE: 'badge-danger', STARTED: 'badge-warning', QUEUED: 'badge-info' }
    return map[status] || 'badge-purple'
  }

  return (
    <>
      <div className="top-bar">
        <h1><Play size={18} /> Pipeline Studio</h1>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={loadPipelines}><RefreshCw size={14} /></button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}><Plus size={14} /> Tạo Pipeline</button>
        </div>
      </div>
      <div className="page-container">
        {pipelines.length === 0 ? (
          <div className="card">
            <div className="card-body">
              <div className="empty-state">
                <Play size={40} />
                <h3>Chưa có Pipeline nào</h3>
                <p>Tạo pipeline đầu tiên để bắt đầu transform data</p>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={14} /> Tạo Pipeline</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pipelines.map(p => (
              <div key={p.name} className="card">
                <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => toggleExpand(p.name)}>
                  <div className="flex items-center gap-3">
                    <h2>{p.name}</h2>
                    {p.schedule && <span className="badge badge-info"><Clock size={10} /> {p.schedule}</span>}
                    <span className="badge badge-purple">{p.branch}</span>
                    <span className="text-muted text-xs">{p.steps?.length || 0} steps</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); handleTrigger(p.name) }}><Zap size={12} /> Run</button>
                    <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); handleDelete(p.name) }}><Trash2 size={12} /></button>
                    {expandedPipeline === p.name ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>
                {expandedPipeline === p.name && (
                  <div className="card-body">
                    {p.description && <p className="text-sm text-muted mb-4">{p.description}</p>}
                    
                    {/* Steps */}
                    <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>📋 Steps</h3>
                    <div className="flex flex-col gap-2 mb-6">
                      {(p.steps || []).map((step, i) => (
                        <div key={i} style={{ padding: '12px', background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                          <div className="flex items-center gap-2 mb-4">
                            <span className="badge badge-purple">#{i + 1}</span>
                            <strong className="text-sm">{step.name}</strong>
                            <span className="badge badge-info">{step.type}</span>
                          </div>
                          {step.sql && <pre className="code-editor" style={{ minHeight: '60px', fontSize: '12px' }}>{step.sql}</pre>}
                        </div>
                      ))}
                    </div>

                    {/* Runs */}
                    <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>📊 Lịch sử chạy</h3>
                    {(runs[p.name] || []).length === 0 ? (
                      <p className="text-muted text-sm">Chưa có lần chạy nào</p>
                    ) : (
                      <div className="table-container">
                        <table>
                          <thead><tr><th>Run ID</th><th>Status</th><th>Start</th><th>End</th></tr></thead>
                          <tbody>
                            {(runs[p.name] || []).map(r => (
                              <tr key={r.runId}>
                                <td className="font-mono text-xs">{r.runId?.slice(0, 12)}...</td>
                                <td><span className={`badge ${statusColor(r.status)}`}>{r.status}</span></td>
                                <td className="text-xs text-muted">{r.startTime ? new Date(r.startTime * 1000).toLocaleString('vi') : '-'}</td>
                                <td className="text-xs text-muted">{r.endTime ? new Date(r.endTime * 1000).toLocaleString('vi') : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Create Pipeline Modal */}
        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal" style={{ maxWidth: '750px' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header"><h2>Tạo Pipeline mới</h2></div>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Tên pipeline</label>
                    <input className="form-input" placeholder="bronze_to_silver_orders" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nessie Branch</label>
                    <input className="form-input" placeholder="main" value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Mô tả</label>
                  <input className="form-input" placeholder="Transform raw orders to silver layer" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Schedule (Cron) — để trống nếu chỉ manual</label>
                  <input className="form-input font-mono" placeholder="0 */6 * * *" value={form.schedule} onChange={e => setForm({ ...form, schedule: e.target.value })} />
                </div>

                <div className="form-group">
                  <label className="form-label">Steps</label>
                  {form.steps.map((step, i) => (
                    <div key={i} style={{ padding: '12px', background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', marginBottom: '10px' }}>
                      <div className="flex items-center justify-between mb-4">
                        <span className="badge badge-purple">Step #{i + 1}</span>
                        {form.steps.length > 1 && <button className="btn btn-danger btn-sm" onClick={() => removeStep(i)}><Trash2 size={10} /></button>}
                      </div>
                      <div className="flex gap-2 mb-4">
                        <input className="form-input" placeholder="step_name" value={step.name} onChange={e => updateStep(i, 'name', e.target.value)} />
                        <select className="form-select" style={{ maxWidth: '120px' }} value={step.type} onChange={e => updateStep(i, 'type', e.target.value)}>
                          <option value="sql">SQL</option>
                        </select>
                      </div>
                      <textarea className="code-editor" placeholder="SELECT * FROM iceberg.bronze.raw_orders" value={step.sql} onChange={e => updateStep(i, 'sql', e.target.value)} style={{ minHeight: '80px' }} />
                    </div>
                  ))}
                  <button className="btn btn-secondary btn-sm" onClick={addStep}><Plus size={12} /> Thêm Step</button>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Hủy</button>
                <button className="btn btn-primary" onClick={handleCreate}>Tạo Pipeline</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

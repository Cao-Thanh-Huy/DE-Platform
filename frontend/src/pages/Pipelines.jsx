/**
 * Pipelines — Pipeline List & Management
 * Full UI overhaul: card layout, enable/disable, schedule (cron + onetime), bug fixes.
 */
import React, { useState, useEffect, useRef } from 'react'
import {
  Plus, Play, Archive, Trash2, Clock, Copy, RefreshCw,
  Settings, User, Calendar, Eye, Power, PowerOff, Edit3,
  CheckCircle, XCircle, AlertCircle, ChevronDown, Zap, Timer, Globe,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api/client'

// ── Constants ────────────────────────────────────────────────────────────────

const SCHEDULE_PRESETS = [
  { label: 'Mỗi phút',   value: '* * * * *',    desc: 'Every minute' },
  { label: 'Mỗi giờ',   value: '0 * * * *',    desc: 'Every hour' },
  { label: 'Mỗi ngày',  value: '0 0 * * *',    desc: 'Daily at midnight' },
  { label: 'Mỗi tuần',  value: '0 0 * * 0',    desc: 'Every Sunday' },
  { label: 'Mỗi tháng', value: '0 0 1 * *',    desc: 'First of month' },
]

const TIMEZONES = [
  'UTC', 'Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Singapore',
  'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris',
]

const STATUS_STYLE = {
  active:   { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.25)',  dot: '#22c55e' },
  draft:    { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)', dot: '#94a3b8' },
  archived: { color: '#475569', bg: 'rgba(71,85,105,0.1)',   border: 'rgba(71,85,105,0.2)',   dot: '#475569' },
}

const ENGINE_STYLE = {
  trino: { icon: '🔍', label: 'Trino', color: '#3b82f6' },
  spark: { icon: '⚡', label: 'Spark', color: '#f59e0b' },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function describeCron(cron) {
  const preset = SCHEDULE_PRESETS.find(p => p.value === cron)
  return preset ? preset.label : cron
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Pipelines() {
  const [pipelines, setPipelines] = useState([])
  const [loading, setLoading] = useState(false)
  const [togglingId, setTogglingId] = useState(null)

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', description: '', engine: 'trino' })
  const [createLoading, setCreateLoading] = useState(false)

  const [showCloneModal, setShowCloneModal] = useState(false)
  const [cloneForm, setCloneForm] = useState({ id: null, name: '' })

  const [showScheduleModal, setShowScheduleModal] = useState(false)

  // Schedule form default
  const defaultScheduleForm = {
    pipelineId: null,
    pipelineName: '',
    run_type: 'scheduled',       // 'scheduled' | 'onetime'
    cron_expr: '0 * * * *',
    cron_custom: false,
    run_at: '',
    timezone: 'Asia/Ho_Chi_Minh',
    enabled: true,
  }
  const [scheduleForm, setScheduleForm] = useState(defaultScheduleForm)
  const [scheduleLoading, setScheduleLoading] = useState(false)

  // Toast
  const [toast, setToast] = useState(null)

  const navigate = useNavigate()

  useEffect(() => { loadPipelines() }, [])

  // ── Data ──────────────────────────────────────────────────────────────────

  async function loadPipelines() {
    setLoading(true)
    try {
      const data = await api.listPipelines()
      setPipelines(data.pipelines || [])
    } catch (e) {
      showToast('error', e.message)
    }
    setLoading(false)
  }

  function showToast(type, msg) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Pipeline Actions ──────────────────────────────────────────────────────

  async function handleCreate() {
    if (!createForm.name.trim()) return
    setCreateLoading(true)
    try {
      const data = await api.createPipeline(createForm)
      setShowCreateModal(false)
      setCreateForm({ name: '', description: '', engine: 'trino' })
      navigate(`/pipelines/${data.pipeline.id}`)
    } catch (e) {
      showToast('error', e.message)
    }
    setCreateLoading(false)
  }

  async function handleDelete(p, e) {
    e.stopPropagation()
    if (!confirm(`Archive pipeline "${p.name}"? Có thể khôi phục sau.`)) return
    try {
      await api.deletePipeline(p.id)
      showToast('success', `Archived "${p.name}"`)
      loadPipelines()
    } catch (e) {
      showToast('error', e.message)
    }
  }

  async function handleToggleEnabled(p, e) {
    e.stopPropagation()
    if (togglingId) return
    setTogglingId(p.id)
    try {
      const data = await api.togglePipelineEnabled(p.id)
      showToast('success', `Pipeline "${p.name}" ${data.is_enabled ? 'enabled' : 'disabled'}`)
      loadPipelines()
    } catch (err) {
      showToast('error', err.message)
    }
    setTogglingId(null)
  }

  async function handleClone(p, e) {
    e.stopPropagation()
    setCloneForm({ id: p.id, name: p.name + ' - Copy' })
    setShowCloneModal(true)
  }

  async function submitClone() {
    if (!cloneForm.name.trim()) return
    try {
      await api.clonePipeline(cloneForm.id, { name: cloneForm.name })
      setShowCloneModal(false)
      showToast('success', `Cloned thành "${cloneForm.name}"`)
      loadPipelines()
    } catch (e) {
      showToast('error', e.message)
    }
  }

  // ── Schedule ──────────────────────────────────────────────────────────────

  async function handleSchedule(p, e) {
    e.stopPropagation()
    const form = { ...defaultScheduleForm, pipelineId: p.id, pipelineName: p.name }
    try {
      const data = await api.getPipelineSchedule(p.id)
      if (data.schedule) {
        const s = data.schedule
        form.run_type = s.run_type || 'scheduled'
        form.cron_expr = s.cron_expr || '0 * * * *'
        form.run_at = s.run_at ? s.run_at.slice(0, 16) : ''   // YYYY-MM-DDTHH:MM for input
        form.timezone = s.timezone || 'Asia/Ho_Chi_Minh'
        form.enabled = s.enabled
        form.cron_custom = !SCHEDULE_PRESETS.some(pr => pr.value === form.cron_expr)
      }
    } catch (e) { console.error(e) }
    setScheduleForm(form)
    setShowScheduleModal(true)
  }

  async function submitSchedule() {
    setScheduleLoading(true)
    try {
      const payload = {
        run_type: scheduleForm.run_type,
        timezone: scheduleForm.timezone,
        enabled: scheduleForm.enabled,
      }
      if (scheduleForm.run_type === 'scheduled') {
        payload.cron_expr = scheduleForm.cron_expr
      } else {
        payload.run_at = scheduleForm.run_at ? new Date(scheduleForm.run_at).toISOString() : null
      }
      await api.setPipelineSchedule(scheduleForm.pipelineId, payload)
      setShowScheduleModal(false)
      showToast('success', `Schedule đã được cập nhật cho "${scheduleForm.pipelineName}"`)
      loadPipelines()   // ← Bug #1 fix: was missing before
    } catch (e) {
      showToast('error', e.message)
    }
    setScheduleLoading(false)
  }

  async function handleDeleteSchedule(p, e) {
    e.stopPropagation()
    if (!confirm(`Xóa schedule của "${p.name}"?`)) return
    try {
      await api.deletePipelineSchedule(p.id)
      showToast('success', 'Schedule đã được xóa')
      loadPipelines()
    } catch (e) {
      showToast('error', e.message)
    }
  }

  async function toggleScheduleEnabled(p, e) {
    e.stopPropagation()
    if (!p.schedule) return
    try {
      await api.setPipelineSchedule(p.id, {
        run_type: p.schedule.run_type,
        cron_expr: p.schedule.cron_expr,
        run_at: p.schedule.run_at,
        timezone: p.schedule.timezone,
        enabled: !p.schedule.enabled,
      })
      loadPipelines()
    } catch (err) {
      showToast('error', err.message)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const visible = pipelines.filter(p => p.status !== 'archived')
  const stats = {
    total: visible.length,
    active: visible.filter(p => p.status === 'active').length,
    scheduled: visible.filter(p => p.schedule?.enabled).length,
    enabled: visible.filter(p => p.is_enabled).length,
  }

  return (
    <div style={{ padding: 28, flex: 1, overflowY: 'auto', background: 'var(--bg-primary)' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f1f5f9', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28 }}>⚡</span> Pipelines
          </h1>
          <p style={{ color: '#64748b', fontSize: 13 }}>Manage data transformation workflows</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={loadPipelines} disabled={loading} title="Refresh">
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={14} /> New Pipeline
          </button>
        </div>
      </div>

      {/* ── Stats Bar ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Total', value: stats.total, icon: '📋', color: '#6366f1' },
          { label: 'Active', value: stats.active, icon: '✅', color: '#22c55e' },
          { label: 'Enabled', value: stats.enabled, icon: '🔛', color: '#3b82f6' },
          { label: 'Scheduled', value: stats.scheduled, icon: '🕐', color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: 12, padding: '16px 20px', backdropFilter: 'blur(12px)',
            transition: 'all 0.2s',
          }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Empty ── */}
      {visible.length === 0 && !loading && (
        <div style={{
          textAlign: 'center', padding: '80px 20px',
          background: 'var(--bg-card)', borderRadius: 16,
          border: '2px dashed var(--border-color)',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>⚡</div>
          <h3 style={{ fontSize: 20, color: '#e2e8f0', marginBottom: 10 }}>No pipelines yet</h3>
          <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
            Create your first pipeline to start transforming data.
          </p>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={14} /> Create Pipeline
          </button>
        </div>
      )}

      {/* ── Pipeline Cards Grid ── */}
      {visible.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visible.map(p => {
            const st = STATUS_STYLE[p.status] || STATUS_STYLE.draft
            const eng = ENGINE_STYLE[p.engine] || ENGINE_STYLE.trino
            const isToggling = togglingId === p.id
            const isDisabled = !p.is_enabled

            return (
              <div
                key={p.id}
                onClick={() => navigate(`/pipelines/${p.id}`)}
                style={{
                  background: 'var(--bg-card)',
                  border: `1px solid ${isDisabled ? 'rgba(71,85,105,0.3)' : 'var(--border-color)'}`,
                  borderRadius: 14,
                  padding: '18px 22px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  backdropFilter: 'blur(12px)',
                  opacity: isDisabled ? 0.65 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                }}
                onMouseEnter={e => {
                  if (!isDisabled) {
                    e.currentTarget.style.borderColor = 'var(--border-accent)'
                    e.currentTarget.style.boxShadow = 'var(--shadow-glow)'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = isDisabled ? 'rgba(71,85,105,0.3)' : 'var(--border-color)'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.transform = 'none'
                }}
              >
                {/* Status dot */}
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: isDisabled ? '#475569' : st.dot,
                  flexShrink: 0,
                  boxShadow: !isDisabled && p.status === 'active' ? `0 0 8px ${st.dot}` : 'none',
                }} />

                {/* Name + Description */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: isDisabled ? '#64748b' : '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280 }}>
                      {p.name}
                    </span>
                    {/* Status badge */}
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      padding: '2px 7px', borderRadius: 20,
                      color: st.color, background: st.bg, border: `1px solid ${st.border}`,
                      textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0,
                    }}>
                      {p.status}
                    </span>
                    {isDisabled && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, color: '#64748b', background: 'rgba(71,85,105,0.15)', border: '1px solid rgba(71,85,105,0.3)', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>
                        DISABLED
                      </span>
                    )}
                    {/* Engine badge */}
                    <span style={{ fontSize: 10, color: eng.color, background: `${eng.color}18`, padding: '2px 7px', borderRadius: 20, border: `1px solid ${eng.color}30`, flexShrink: 0 }}>
                      {eng.icon} {eng.label}
                    </span>
                    {/* Version */}
                    {p.latest_version > 0 && (
                      <span style={{ fontSize: 11, color: '#64748b', flexShrink: 0 }}>v{p.latest_version}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      {p.description ? (p.description.length > 60 ? p.description.slice(0, 60) + '…' : p.description) : 'No description'}
                    </span>
                  </div>
                </div>

                {/* Schedule Info */}
                <div style={{ flexShrink: 0, minWidth: 160, textAlign: 'left' }}>
                  {p.schedule ? (
                    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Toggle */}
                        <label className="ios-switch" style={{ flexShrink: 0, margin: 0 }}>
                          <input
                            type="checkbox"
                            checked={p.schedule.enabled}
                            onChange={e => toggleScheduleEnabled(p, e)}
                          />
                          <span className="slider" />
                        </label>
                        <span style={{ fontSize: 12, color: p.schedule.enabled ? '#e2e8f0' : '#64748b', fontWeight: 500 }}>
                          {p.schedule.run_type === 'onetime' ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Timer size={12} style={{ color: '#f59e0b' }} />
                              {p.schedule.run_at ? formatDate(p.schedule.run_at) : 'One-time'}
                            </span>
                          ) : (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={12} style={{ color: '#6366f1' }} />
                              {describeCron(p.schedule.cron_expr)}
                            </span>
                          )}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#475569', paddingLeft: 44 }}>
                        {p.schedule.timezone} · {p.schedule.run_type}
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Clock size={12} /> Not scheduled
                    </span>
                  )}
                </div>

                {/* Dates */}
                <div style={{ flexShrink: 0, fontSize: 11, color: '#475569', textAlign: 'right', minWidth: 120, lineHeight: 1.8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                    <Calendar size={11} /> {p.created_at ? new Date(p.created_at).toLocaleDateString('vi') : '—'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end', color: '#334155' }}>
                    <User size={11} /> {p.owner || 'admin'}
                  </div>
                </div>

                {/* Action Buttons */}
                <div
                  onClick={e => e.stopPropagation()}
                  style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}
                >
                  {/* Enable/Disable toggle — first & most prominent */}
                  <button
                    title={p.is_enabled ? 'Disable pipeline' : 'Enable pipeline'}
                    disabled={isToggling}
                    onClick={e => handleToggleEnabled(p, e)}
                    style={{
                      height: 34, padding: '0 14px', borderRadius: 8,
                      border: `1px solid ${p.is_enabled ? 'rgba(245,158,11,0.35)' : 'rgba(34,197,94,0.35)'}`,
                      background: p.is_enabled ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
                      color: p.is_enabled ? '#f59e0b' : '#22c55e',
                      fontSize: 11, fontWeight: 700, cursor: isToggling ? 'wait' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5,
                      transition: 'all 0.15s', flexShrink: 0,
                      letterSpacing: 0.3,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = p.is_enabled ? 'rgba(245,158,11,0.22)' : 'rgba(34,197,94,0.22)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = p.is_enabled ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)'
                    }}
                  >
                    {isToggling
                      ? <RefreshCw size={12} className="spin" />
                      : (p.is_enabled ? <PowerOff size={12} /> : <Power size={12} />)
                    }
                    {p.is_enabled ? 'Disable' : 'Enable'}
                  </button>

                  <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

                  {/* View/Open button */}
                  <ActionBtn
                    title="Open in Studio"
                    color="#6366f1"
                    onClick={e => { e.stopPropagation(); navigate(`/pipelines/${p.id}`) }}
                  >
                    <Eye size={14} />
                  </ActionBtn>

                  {/* Schedule button */}
                  <ActionBtn
                    title={p.schedule ? 'Edit schedule' : 'Add schedule'}
                    color={p.schedule ? '#a855f7' : '#64748b'}
                    onClick={e => handleSchedule(p, e)}
                  >
                    <Clock size={14} />
                  </ActionBtn>

                  {/* Clone button */}
                  <ActionBtn
                    title="Clone pipeline"
                    color="#3b82f6"
                    onClick={e => handleClone(p, e)}
                  >
                    <Copy size={14} />
                  </ActionBtn>

                  {/* Archive button */}
                  <ActionBtn
                    title="Archive pipeline"
                    color="#ef4444"
                    onClick={e => handleDelete(p, e)}
                  >
                    <Trash2 size={14} />
                  </ActionBtn>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Create Pipeline Modal ── */}
      {showCreateModal && (
        <Modal onClose={() => setShowCreateModal(false)}>
          <ModalHeader icon={<Plus size={18} />} title="New Pipeline" onClose={() => setShowCreateModal(false)} />
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Pipeline Name *</label>
              <input
                className="form-input"
                placeholder="bronze_to_silver_orders"
                value={createForm.name}
                onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input
                className="form-input"
                placeholder="Mô tả pipeline..."
                value={createForm.description}
                onChange={e => setCreateForm({ ...createForm, description: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Execution Engine</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { value: 'trino', label: '🔍 Trino', desc: 'CTE SQL · Fast queries' },
                  { value: 'spark', label: '⚡ Spark', desc: 'Coming soon · Complex ETL', disabled: true },
                ].map(opt => (
                  <div
                    key={opt.value}
                    onClick={() => !opt.disabled && setCreateForm({ ...createForm, engine: opt.value })}
                    style={{
                      padding: '14px', borderRadius: 10, cursor: opt.disabled ? 'not-allowed' : 'pointer',
                      border: `2px solid ${createForm.engine === opt.value ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      background: createForm.engine === opt.value ? 'rgba(99,102,241,0.1)' : 'transparent',
                      opacity: opt.disabled ? 0.45 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{opt.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={!createForm.name.trim() || createLoading}>
              {createLoading ? <RefreshCw size={13} className="spin" /> : <Plus size={13} />}
              Create Pipeline
            </button>
          </div>
        </Modal>
      )}

      {/* ── Clone Pipeline Modal ── */}
      {showCloneModal && (
        <Modal onClose={() => setShowCloneModal(false)}>
          <ModalHeader icon={<Copy size={18} />} title="Clone Pipeline" onClose={() => setShowCloneModal(false)} />
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">New Pipeline Name *</label>
              <input
                className="form-input"
                value={cloneForm.name}
                onChange={e => setCloneForm({ ...cloneForm, name: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && submitClone()}
                autoFocus
              />
              <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                Copies the workflow graph and SQL. Runs & Schedules are not copied.
              </p>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setShowCloneModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={submitClone} disabled={!cloneForm.name.trim()}>
              <Copy size={13} /> Duplicate
            </button>
          </div>
        </Modal>
      )}

      {/* ── Schedule Modal ── */}
      {showScheduleModal && (
        <Modal onClose={() => setShowScheduleModal(false)} maxWidth={540}>
          <ModalHeader icon={<Clock size={18} />} title="Configure Schedule" onClose={() => setShowScheduleModal(false)} />
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Pipeline name */}
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
              fontSize: 13, color: '#94a3b8',
            }}>
              Pipeline: <strong style={{ color: '#e2e8f0' }}>{scheduleForm.pipelineName}</strong>
            </div>

            {/* Run Type Selector */}
            <div>
              <label className="form-label">Execution Mode</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { value: 'scheduled', icon: '🔄', label: 'Scheduled (Cron)', desc: 'Recurring schedule với cron expression' },
                  { value: 'onetime',   icon: '📅', label: 'One-time', desc: 'Chạy một lần tại thời điểm cụ thể' },
                ].map(opt => (
                  <div
                    key={opt.value}
                    onClick={() => setScheduleForm(f => ({ ...f, run_type: opt.value }))}
                    style={{
                      padding: 14, borderRadius: 10, cursor: 'pointer',
                      border: `2px solid ${scheduleForm.run_type === opt.value ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      background: scheduleForm.run_type === opt.value ? 'rgba(99,102,241,0.1)' : 'transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{opt.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 3 }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{opt.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Scheduled: Cron fields */}
            {scheduleForm.run_type === 'scheduled' && (
              <div>
                <label className="form-label">Frequency</label>
                <select
                  className="form-input form-select"
                  value={scheduleForm.cron_custom ? 'custom' : scheduleForm.cron_expr}
                  onChange={e => {
                    if (e.target.value === 'custom') {
                      setScheduleForm(f => ({ ...f, cron_custom: true }))
                    } else {
                      setScheduleForm(f => ({ ...f, cron_expr: e.target.value, cron_custom: false }))
                    }
                  }}
                >
                  {SCHEDULE_PRESETS.map(p => (
                    <option key={p.value} value={p.value}>{p.label} — {p.desc} ({p.value})</option>
                  ))}
                  <option value="custom">✏️ Custom cron expression...</option>
                </select>

                {scheduleForm.cron_custom && (
                  <input
                    className="form-input"
                    style={{ marginTop: 10, fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}
                    placeholder="0 6 * * 1-5"
                    value={scheduleForm.cron_expr}
                    onChange={e => setScheduleForm(f => ({ ...f, cron_expr: e.target.value }))}
                    autoFocus
                  />
                )}
                <div style={{ marginTop: 8, padding: '8px 12px', background: '#0f172a', borderRadius: 6, fontSize: 11, color: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}>
                  Format: <span style={{ color: '#94a3b8' }}>minute hour day(month) month day(week)</span>
                  <span style={{ color: '#6366f1', marginLeft: 12 }}>{scheduleForm.cron_expr || '* * * * *'}</span>
                </div>
              </div>
            )}

            {/* One-time: datetime picker */}
            {scheduleForm.run_type === 'onetime' && (
              <div>
                <label className="form-label">Run At (Date & Time)</label>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={scheduleForm.run_at}
                  onChange={e => setScheduleForm(f => ({ ...f, run_at: e.target.value }))}
                  min={new Date().toISOString().slice(0, 16)}
                />
                <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
                  Pipeline sẽ chạy một lần tại thời điểm này (theo timezone đã chọn).
                </div>
              </div>
            )}

            {/* Timezone */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Globe size={11} /> Timezone
                </label>
                <select
                  className="form-input form-select"
                  value={scheduleForm.timezone}
                  onChange={e => setScheduleForm(f => ({ ...f, timezone: e.target.value }))}
                >
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>

              {/* Enable toggle */}
              <div>
                <label className="form-label">Status</label>
                <div
                  style={{
                    padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'var(--bg-secondary)', cursor: 'pointer',
                  }}
                  onClick={() => setScheduleForm(f => ({ ...f, enabled: !f.enabled }))}
                >
                  <span style={{ fontSize: 13, color: scheduleForm.enabled ? '#22c55e' : '#64748b' }}>
                    {scheduleForm.enabled ? '🟢 Enabled' : '⚫ Disabled'}
                  </span>
                  <label className="ios-switch" style={{ margin: 0 }} onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={scheduleForm.enabled}
                      onChange={e => setScheduleForm(f => ({ ...f, enabled: e.target.checked }))}
                    />
                    <span className="slider" />
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            {/* Delete schedule button */}
            <button
              className="btn btn-danger"
              style={{ marginRight: 'auto' }}
              onClick={async () => {
                await handleDeleteSchedule({ id: scheduleForm.pipelineId, name: scheduleForm.pipelineName }, { stopPropagation: () => {} })
                setShowScheduleModal(false)
              }}
            >
              <Trash2 size={13} /> Remove Schedule
            </button>
            <button className="btn btn-secondary" onClick={() => setShowScheduleModal(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={submitSchedule}
              disabled={scheduleLoading || (scheduleForm.run_type === 'scheduled' && !scheduleForm.cron_expr.trim()) || (scheduleForm.run_type === 'onetime' && !scheduleForm.run_at)}
            >
              {scheduleLoading ? <RefreshCw size={13} className="spin" /> : <CheckCircle size={13} />}
              Save Schedule
            </button>
          </div>
        </Modal>
      )}

      {/* ── Toast ── */}
      {toast && <Toast type={toast.type} msg={toast.msg} />}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ActionBtn({ children, title, color, onClick, loading }) {
  return (
    <button
      title={title}
      disabled={loading}
      onClick={onClick}
      style={{
        width: 34, height: 34, borderRadius: 8, border: `1px solid ${color}30`,
        background: `${color}12`, color, cursor: loading ? 'wait' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s', flexShrink: 0,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = `${color}25`
        e.currentTarget.style.borderColor = `${color}60`
        e.currentTarget.style.transform = 'scale(1.05)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = `${color}12`
        e.currentTarget.style.borderColor = `${color}30`
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      {children}
    </button>
  )
}

function Modal({ children, onClose, maxWidth = 500 }) {
  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ zIndex: 2000 }}
    >
      <div
        className="modal"
        style={{ maxWidth }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ icon, title, onClose }) {
  return (
    <div className="modal-header">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8',
        }}>
          {icon}
        </span>
        {title}
      </h2>
      <button
        onClick={onClose}
        style={{
          background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
          width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = '#e2e8f0' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#64748b' }}
      >
        <XCircle size={16} />
      </button>
    </div>
  )
}

function Toast({ type, msg }) {
  const isSuccess = type === 'success'
  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
      padding: '14px 22px', borderRadius: 12,
      background: isSuccess ? 'rgba(5,46,22,0.95)' : 'rgba(45,10,10,0.95)',
      border: `1px solid ${isSuccess ? '#22c55e40' : '#ef444440'}`,
      color: isSuccess ? '#22c55e' : '#f87171',
      fontSize: 13, fontWeight: 500,
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(12px)',
      animation: 'slideIn 0.25s cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      {isSuccess ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {msg}
    </div>
  )
}

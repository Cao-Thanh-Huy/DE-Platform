/**
 * RunHistory — Timeline-style run history with task breakdown
 */
import React, { useEffect, useState } from 'react'
import { RefreshCw, ExternalLink, ChevronDown, ChevronRight, XCircle, Clock, Zap, AlertCircle } from 'lucide-react'
import * as api from '../../../api/client'

const STATUS_STYLE = {
  success:   { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)',   dot: '#22c55e',  glow: '0 0 8px rgba(34,197,94,0.4)'  },
  failed:    { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   dot: '#ef4444',  glow: 'none' },
  running:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  dot: '#f59e0b',  glow: '0 0 8px rgba(245,158,11,0.4)'  },
  pending:   { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)', dot: '#94a3b8',  glow: 'none' },
  cancelled: { color: '#f97316', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.3)',  dot: '#f97316',  glow: 'none' },
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      textTransform: 'uppercase', letterSpacing: 0.5,
      display: 'inline-flex', alignItems: 'center', gap: 5,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: s.dot,
        boxShadow: status === 'running' ? s.glow : 'none',
        animation: status === 'running' ? 'pulse 1.5s ease-in-out infinite' : 'none',
      }} />
      {status?.toUpperCase()}
    </span>
  )
}

function duration(run) {
  if (!run.started_at) return '—'
  const end = run.ended_at ? new Date(run.ended_at) : new Date()
  const diff = (end - new Date(run.started_at)) / 1000
  if (diff < 60) return `${diff.toFixed(1)}s`
  if (diff < 3600) return `${(diff / 60).toFixed(1)}m`
  return `${(diff / 3600).toFixed(1)}h`
}

function RowCell({ children, style = {} }) {
  return (
    <td style={{
      padding: '13px 16px',
      fontSize: 13,
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      verticalAlign: 'middle',
      ...style,
    }}>
      {children}
    </td>
  )
}

export default function RunHistory({ pipelineId }) {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (pipelineId) loadRuns()
  }, [pipelineId])

  async function loadRuns() {
    setLoading(true)
    try {
      const data = await api.getPipelineRuns(pipelineId)
      setRuns(data.runs || [])
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  async function handleCancel(runId) {
    try {
      await api.cancelPipelineRun(runId)
      loadRuns()
    } catch (e) {
      alert(e.message)
    }
  }

  if (!pipelineId) {
    return (
      <div style={{ padding: 40, color: '#334155', fontSize: 14, textAlign: 'center' }}>
        Select a pipeline to see run history.
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto', background: '#080c18' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: '#0d1117', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={14} style={{ color: '#6366f1' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Run History</span>
          {runs.length > 0 && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 10,
              background: 'rgba(99,102,241,0.15)', color: '#818cf8',
              fontWeight: 600,
            }}>
              {runs.length} runs
            </span>
          )}
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={loadRuns}
          disabled={loading}
          style={{ gap: 6 }}
        >
          <RefreshCw size={12} className={loading ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Empty state */}
      {runs.length === 0 && !loading && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Zap size={40} style={{ color: '#1e293b' }} />
          <div style={{ color: '#334155', fontSize: 14, textAlign: 'center' }}>
            No runs yet.<br />
            <span style={{ fontSize: 12, color: '#1e293b' }}>Click <strong style={{ color: '#6366f1' }}>Run</strong> to execute this pipeline.</span>
          </div>
        </div>
      )}

      {/* Table */}
      {runs.length > 0 && (
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              <tr style={{ background: '#0a0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Run ID', 'Status', 'Version', 'Trigger', 'Start Time', 'Duration', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '11px 16px', fontSize: 10, textTransform: 'uppercase',
                    letterSpacing: 1, color: '#334155', fontWeight: 700,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map(run => {
                const isExpanded = expanded === run.id
                const st = STATUS_STYLE[run.status] || STATUS_STYLE.pending
                return (
                  <React.Fragment key={run.id}>
                    <tr
                      style={{
                        background: isExpanded ? 'rgba(30,41,59,0.5)' : 'transparent',
                        transition: 'background 0.2s',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}
                      onClick={() => setExpanded(isExpanded ? null : run.id)}
                    >
                      <RowCell>
                        <span style={{
                          fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
                          color: '#6366f1', background: 'rgba(99,102,241,0.1)',
                          padding: '2px 8px', borderRadius: 5,
                        }}>
                          {run.id.slice(0, 8)}
                        </span>
                      </RowCell>
                      <RowCell>
                        <StatusBadge status={run.status} />
                      </RowCell>
                      <RowCell style={{ color: '#94a3b8', fontWeight: 500 }}>
                        v{run.version}
                      </RowCell>
                      <RowCell style={{ color: '#64748b', textTransform: 'capitalize' }}>
                        {run.triggered_by === 'schedule' ? (
                          <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={12} /> schedule
                          </span>
                        ) : (
                          <span style={{ color: '#64748b' }}>manual</span>
                        )}
                      </RowCell>
                      <RowCell style={{ color: '#64748b', fontSize: 12 }}>
                        {run.started_at ? new Date(run.started_at).toLocaleString('vi') : '—'}
                      </RowCell>
                      <RowCell>
                        <span style={{
                          fontSize: 12, fontWeight: 600,
                          color: run.status === 'success' ? '#22c55e' : run.status === 'failed' ? '#ef4444' : '#94a3b8',
                        }}>
                          {duration(run)}
                        </span>
                      </RowCell>
                      <RowCell>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={e => { e.stopPropagation(); setExpanded(isExpanded ? null : run.id) }}
                            style={{ gap: 4, padding: '5px 10px', fontSize: 11 }}
                          >
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            {isExpanded ? 'Hide' : 'Logs'}
                          </button>
                          {run.status === 'running' && (
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={e => { e.stopPropagation(); handleCancel(run.id) }}
                              style={{ gap: 4, padding: '5px 10px', fontSize: 11 }}
                            >
                              <XCircle size={12} /> Cancel
                            </button>
                          )}
                        </div>
                      </RowCell>
                    </tr>

                    {/* ── Expanded: Task breakdown ── */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} style={{
                          padding: '0 20px 20px',
                          background: 'rgba(8,12,24,0.6)',
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                        }}>
                          {/* Error message */}
                          {run.error_message && (
                            <div style={{
                              margin: '14px 0 10px',
                              padding: '12px 16px',
                              background: 'rgba(45,10,10,0.8)', borderRadius: 8,
                              border: '1px solid rgba(239,68,68,0.3)',
                              fontSize: 13, color: '#f87171',
                              display: 'flex', gap: 8, alignItems: 'flex-start',
                            }}>
                              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                              {run.error_message}
                            </div>
                          )}

                          {/* Task timeline */}
                          <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {(run.task_runs || []).length === 0 ? (
                              <div style={{ fontSize: 13, color: '#334155', padding: '8px 0' }}>
                                No task details available.
                              </div>
                            ) : (run.task_runs || []).map((task, idx) => {
                              const ts = STATUS_STYLE[task.status] || STATUS_STYLE.pending
                              return (
                                <div key={task.id} style={{
                                  padding: '14px 18px',
                                  background: '#0d1117',
                                  borderRadius: 10,
                                  border: `1px solid ${ts.border}`,
                                  borderLeft: `3px solid ${ts.color}`,
                                }}>
                                  {/* Task header */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: task.compiled_sql || task.trino_query_id ? 10 : 0 }}>
                                    <StatusBadge status={task.status} />
                                    <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13 }}>
                                      {task.node_label || task.node_id}
                                    </span>
                                    {task.rows_affected != null && (
                                      <span style={{
                                        marginLeft: 'auto', fontSize: 12, color: '#64748b',
                                        background: 'rgba(255,255,255,0.04)', padding: '2px 10px',
                                        borderRadius: 20, border: '1px solid rgba(255,255,255,0.07)',
                                      }}>
                                        <strong style={{ color: '#94a3b8' }}>{task.rows_affected.toLocaleString()}</strong> rows
                                      </span>
                                    )}
                                    {task.started_at && task.ended_at && (
                                      <span style={{ fontSize: 11, color: '#475569', flexShrink: 0 }}>
                                        {((new Date(task.ended_at) - new Date(task.started_at)) / 1000).toFixed(2)}s
                                      </span>
                                    )}
                                  </div>

                                  {/* Trino query ID */}
                                  {task.trino_query_id && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                      <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#475569' }}>
                                        Query: {task.trino_query_id}
                                      </span>
                                      <a
                                        href={`http://localhost:8080/ui/query.html?${task.trino_query_id}`}
                                        target="_blank" rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        style={{
                                          color: '#6366f1', display: 'inline-flex', alignItems: 'center',
                                          gap: 4, fontSize: 12, fontWeight: 500,
                                          textDecoration: 'none',
                                        }}
                                      >
                                        <ExternalLink size={11} /> Trino UI
                                      </a>
                                    </div>
                                  )}

                                  {/* SQL */}
                                  {task.compiled_sql && (
                                    <div>
                                      <div style={{ fontSize: 10, color: '#334155', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        Executed SQL
                                      </div>
                                      <pre style={{
                                        margin: 0, padding: '10px 14px',
                                        background: '#060910', borderRadius: 7,
                                        border: '1px solid rgba(255,255,255,0.05)',
                                        fontSize: 11, color: '#64748b',
                                        overflowX: 'auto', maxHeight: 180,
                                        whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                        fontFamily: 'JetBrains Mono, monospace',
                                        lineHeight: 1.6,
                                      }}>
                                        {task.compiled_sql}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

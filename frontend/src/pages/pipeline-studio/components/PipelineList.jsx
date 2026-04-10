/**
 * PipelineList — Pipeline list panel (left side of main view)
 */
import React from 'react'
import { Plus, Play, Archive, Trash2, Clock, Copy } from 'lucide-react'

const STATUS_COLOR = {
  active:   '#22c55e',
  draft:    '#94a3b8',
  archived: '#475569',
}

export default function PipelineList({ pipelines, selected, onSelect, onCreate, onRun, onDelete }) {
  return (
    <div style={{
      width: 320, flexShrink: 0,
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px', borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
          Pipelines
          <span style={{ marginLeft: 8, fontSize: 11, color: '#64748b', fontWeight: 400 }}>
            {pipelines.length} total
          </span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onCreate}>
          <Plus size={12} /> New
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {pipelines.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔧</div>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 12 }}>No pipelines yet</div>
            <button className="btn btn-primary btn-sm" onClick={onCreate}>
              <Plus size={12} /> Create Pipeline
            </button>
          </div>
        ) : pipelines.filter(p => p.status !== 'archived').map(p => (
          <PipelineCard
            key={p.id}
            pipeline={p}
            isSelected={selected?.id === p.id}
            onSelect={() => onSelect(p)}
            onRun={() => onRun(p)}
            onDelete={() => onDelete(p)}
          />
        ))}
      </div>
    </div>
  )
}

function PipelineCard({ pipeline: p, isSelected, onSelect, onRun, onDelete }) {
  const statusColor = STATUS_COLOR[p.status] || '#94a3b8'

  return (
    <div
      onClick={onSelect}
      style={{
        padding: '12px', marginBottom: 6,
        background: isSelected ? 'var(--bg-glass)' : 'transparent',
        border: `1px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
        borderRadius: 8, cursor: 'pointer',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-glass)' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.name}
            </span>
          </div>
          {p.description && (
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.description}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, color: statusColor,
              background: `${statusColor}15`, padding: '1px 6px', borderRadius: 10, border: `1px solid ${statusColor}30`
            }}>
              {p.status?.toUpperCase()}
            </span>
            <span style={{ fontSize: 10, color: '#475569' }}>
              {p.engine === 'spark' ? '⚡ Spark' : '🔍 Trino'}
            </span>
            {p.latest_version > 0 && (
              <span style={{ fontSize: 10, color: '#475569' }}>v{p.latest_version}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 8, flexShrink: 0 }}>
          <button
            className="btn btn-primary btn-sm"
            title="Run pipeline"
            onClick={e => { e.stopPropagation(); onRun() }}
            disabled={p.latest_version === 0}
          >
            <Play size={10} />
          </button>
          <button
            className="btn btn-danger btn-sm"
            title="Archive pipeline"
            onClick={e => { e.stopPropagation(); onDelete() }}
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>
    </div>
  )
}

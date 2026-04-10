/**
 * Custom React Flow Node Types for Pipeline Studio
 * Each node type has: a unique color, icon, input/output handles
 */
import React from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import {
  Database, Filter, Columns, GitMerge,
  BarChart2, Layers, Target, X
} from 'lucide-react'

// ── Node colours ──
const NODE_STYLES = {
  source:    { bg: '#1e3a5f', border: '#3b82f6', icon: Database,  iconColor: '#60a5fa', label: 'Source'    },
  filter:    { bg: '#1e3a2f', border: '#22c55e', icon: Filter,    iconColor: '#4ade80', label: 'Filter'    },
  select:    { bg: '#2a2a1e', border: '#eab308', icon: Columns,   iconColor: '#facc15', label: 'Select'    },
  join:      { bg: '#2a1e3a', border: '#a855f7', icon: GitMerge,  iconColor: '#c084fc', label: 'Join'      },
  aggregate: { bg: '#1e2a3a', border: '#06b6d4', icon: BarChart2, iconColor: '#22d3ee', label: 'Aggregate' },
  union:     { bg: '#3a1e2a', border: '#f97316', icon: Layers,    iconColor: '#fb923c', label: 'Union'     },
  sink:      { bg: '#3a1e1e', border: '#ef4444', icon: Target,    iconColor: '#f87171', label: 'Sink'      },
}

function BaseNode({ id, data, type, children, hasLeft = false, hasRight = false }) {
  const style = NODE_STYLES[type] || NODE_STYLES.source
  const Icon = style.icon
  const isSelected = data.selected
  const { setNodes, setEdges } = useReactFlow()

  const handleDelete = (e) => {
    e.stopPropagation()
    setNodes((nds) => nds.filter((n) => n.id !== id))
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id))
  }

  return (
    <div
      style={{
        background: style.bg,
        border: `2px solid ${isSelected ? '#fff' : style.border}`,
        borderRadius: 10,
        minWidth: 180,
        boxShadow: isSelected
          ? `0 0 0 3px ${style.border}55, 0 8px 32px #0008`
          : `0 4px 16px #0006`,
        transition: 'all 0.15s',
        cursor: 'pointer',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        borderBottom: `1px solid ${style.border}44`,
        background: `${style.border}18`,
        borderRadius: '8px 8px 0 0',
      }}>
        <Icon size={14} color={style.iconColor} />
        <span style={{ fontSize: 11, fontWeight: 700, color: style.iconColor, textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>
          {style.label}
        </span>
        <button
          onClick={handleDelete}
          style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', padding: 2, borderRadius: 4 }}
          onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
          onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
          title="Delete Node"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>
          {data.label || `${style.label} Node`}
        </div>
        {children}
      </div>

      {/* Handles */}
      {!hasLeft && !hasRight && type !== 'source' && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: style.border, width: 10, height: 10, border: '2px solid #1a1a2e' }}
        />
      )}
      {hasLeft && (
        <Handle
          id="left"
          type="target"
          position={Position.Top}
          style={{ background: style.border, width: 10, height: 10, border: '2px solid #1a1a2e', left: '30%' }}
        />
      )}
      {hasRight && (
        <Handle
          id="right"
          type="target"
          position={Position.Top}
          style={{ background: '#a855f7', width: 10, height: 10, border: '2px solid #1a1a2e', left: '70%' }}
        />
      )}
      {type !== 'sink' && (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ background: style.border, width: 10, height: 10, border: '2px solid #1a1a2e' }}
        />
      )}
    </div>
  )
}

function MetaText({ children }) {
  return (
    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
      {children}
    </div>
  )
}

// ── Node Components ───────────────────────────────────────────────────────────

export function SourceNode({ id, data }) {
  return (
    <BaseNode id={id} data={data} type="source">
      {data.schema && data.table && (
        <MetaText>{data.catalog || 'iceberg'}.{data.schema}.{data.table}</MetaText>
      )}
    </BaseNode>
  )
}

export function FilterNode({ id, data }) {
  return (
    <BaseNode id={id} data={data} type="filter">
      {data.condition && <MetaText>WHERE {data.condition}</MetaText>}
    </BaseNode>
  )
}

export function SelectNode({ id, data }) {
  const cols = Array.isArray(data.columns) ? data.columns : []
  return (
    <BaseNode id={id} data={data} type="select">
      <MetaText>{cols.length ? cols.join(', ') : 'SELECT *'}</MetaText>
    </BaseNode>
  )
}

export function JoinNode({ id, data }) {
  return (
    <BaseNode id={id} data={data} type="join" hasLeft={true} hasRight={true}>
      <MetaText>{data.join_type || 'INNER'} JOIN</MetaText>
      {data.on_condition && <MetaText>ON {data.on_condition}</MetaText>}
      <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
        <span style={{ fontSize: 10, color: '#c084fc', background: '#2a1e3a', padding: '2px 6px', borderRadius: 4 }}>▲ Left</span>
        <span style={{ fontSize: 10, color: '#94a3b8', background: '#2a1e3a', padding: '2px 6px', borderRadius: 4 }}>▲ Right</span>
      </div>
    </BaseNode>
  )
}

export function AggregateNode({ id, data }) {
  const aggs = Array.isArray(data.aggregations) ? data.aggregations : []
  return (
    <BaseNode id={id} data={data} type="aggregate">
      {data.group_by?.length > 0 && <MetaText>GROUP BY {data.group_by.join(', ')}</MetaText>}
      {aggs.length > 0 && <MetaText>{aggs.map(a => a.alias || a.expr).join(', ')}</MetaText>}
    </BaseNode>
  )
}

export function UnionNode({ id, data }) {
  return (
    <BaseNode id={id} data={data} type="union">
      <MetaText>{data.union_all !== false ? 'UNION ALL' : 'UNION DISTINCT'}</MetaText>
    </BaseNode>
  )
}

export function SinkNode({ id, data }) {
  return (
    <BaseNode id={id} data={data} type="sink">
      {data.schema && data.table && (
        <MetaText>{data.catalog || 'iceberg'}.{data.schema}.{data.table}</MetaText>
      )}
      {data.write_mode && (
        <MetaText>Mode: {data.write_mode?.toUpperCase()}</MetaText>
      )}
    </BaseNode>
  )
}

export const NODE_TYPES = {
  source: SourceNode,
  filter: FilterNode,
  select: SelectNode,
  join: JoinNode,
  aggregate: AggregateNode,
  union: UnionNode,
  sink: SinkNode,
}

export const NODE_META = [
  { type: 'source',    label: 'Source',    description: 'Read from Iceberg table',   color: '#3b82f6' },
  { type: 'filter',    label: 'Filter',    description: 'WHERE condition',            color: '#22c55e' },
  { type: 'select',    label: 'Select',    description: 'Column projection',          color: '#eab308' },
  { type: 'join',      label: 'Join',      description: 'Join two datasets',          color: '#a855f7' },
  { type: 'aggregate', label: 'Aggregate', description: 'GROUP BY + aggregations',    color: '#06b6d4' },
  { type: 'union',     label: 'Union',     description: 'Combine multiple datasets',  color: '#f97316' },
  { type: 'sink',      label: 'Sink',      description: 'Write to Iceberg table',     color: '#ef4444' },
]

/**
 * NodePanel — Left sidebar with draggable node palette
 * Production design: colored icons, grouped nodes, keyboard hints
 */
import React from 'react'
import { NODE_META } from '../nodes/NodeTypes'

const NODE_ICONS = {
  source:    '🗄️',
  filter:    '🔽',
  select:    '📋',
  join:      '🔗',
  aggregate: '📊',
  union:     '🔀',
  sink:      '🎯',
}

export default function NodePanel() {
  function onDragStart(e, nodeType) {
    e.dataTransfer.setData('application/reactflow', nodeType)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div style={{
      width: 220,
      flexShrink: 0,
      background: 'linear-gradient(180deg, #0d1117 0%, #111827 100%)',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      padding: '16px 10px 20px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      {/* Header */}
      <div style={{
        fontSize: 10, fontWeight: 700, color: '#334155',
        textTransform: 'uppercase', letterSpacing: 1.5,
        marginBottom: 10, paddingLeft: 4,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ width: 3, height: 12, background: '#6366f1', borderRadius: 2, display: 'inline-block' }} />
        Node Palette
      </div>

      {/* Node items */}
      {NODE_META.map(meta => (
        <div
          key={meta.type}
          draggable
          onDragStart={e => onDragStart(e, meta.type)}
          title={`Drag to add ${meta.label} node`}
          style={{
            padding: '10px 12px',
            background: `${meta.color}0e`,
            border: `1px solid ${meta.color}25`,
            borderRadius: 9,
            cursor: 'grab',
            transition: 'all 0.15s',
            userSelect: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = `${meta.color}22`
            e.currentTarget.style.borderColor = `${meta.color}55`
            e.currentTarget.style.transform = 'translateX(3px)'
            e.currentTarget.style.boxShadow = `0 0 12px ${meta.color}18`
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = `${meta.color}0e`
            e.currentTarget.style.borderColor = `${meta.color}25`
            e.currentTarget.style.transform = 'none'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>
            {NODE_ICONS[meta.type] || '📦'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: meta.color, marginBottom: 2 }}>
              {meta.label}
            </div>
            <div style={{ fontSize: 10, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {meta.description}
            </div>
          </div>
          {/* Drag handle indicator */}
          <div style={{ color: '#1e293b', fontSize: 12, flexShrink: 0 }}>⠿</div>
        </div>
      ))}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Tips */}
      <div style={{
        padding: '12px 14px',
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 9,
        border: '1px solid rgba(255,255,255,0.05)',
        marginTop: 8,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Quick Tips
        </div>
        {[
          { key: 'Drag', desc: 'Drag nodes onto canvas' },
          { key: 'Click', desc: 'Configure node' },
          { key: 'Del', desc: 'Delete selected' },
          { key: 'Shift', desc: 'Multi-select' },
        ].map(tip => (
          <div key={tip.key} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 5 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#64748b',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              padding: '1px 5px', borderRadius: 4, flexShrink: 0, lineHeight: 1.5,
            }}>
              {tip.key}
            </span>
            <span style={{ fontSize: 11, color: '#334155', lineHeight: 1.4 }}>{tip.desc}</span>
          </div>
        ))}
        <div style={{ marginTop: 8, padding: '6px 8px', background: 'rgba(99,102,241,0.08)', borderRadius: 6, fontSize: 10, color: '#475569', lineHeight: 1.5 }}>
          <span style={{ color: '#6366f1', fontWeight: 600 }}>Join node:</span>
          <br />▲ Left handle (30%) = left table
          <br />▲ Right handle (70%) = right table
        </div>
      </div>
    </div>
  )
}

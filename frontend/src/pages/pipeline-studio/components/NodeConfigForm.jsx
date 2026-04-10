/**
 * NodeConfigForm — Right panel config for selected node
 * Shows type-specific fields for each node type
 */
import React, { useState, useEffect } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import * as api from '../../../api/client'

const JOIN_TYPES = ['INNER', 'LEFT', 'RIGHT', 'FULL OUTER', 'CROSS']
const WRITE_MODES = [
  { value: 'merge', label: 'Merge (Upsert)' },
  { value: 'overwrite', label: 'Overwrite' },
  { value: 'append', label: 'Append' },
]

export default function NodeConfigForm({ node, nodes = [], edges = [], onChange, onClose }) {
  const [data, setData] = useState(node?.data || {})
  const [schemas, setSchemas] = useState([])
  const [tables, setTables] = useState([])
  const [targetColumns, setTargetColumns] = useState([])
  const [availableColumns, setAvailableColumns] = useState([])
  const [availableColumnTypes, setAvailableColumnTypes] = useState({})
  const [loadingCols, setLoadingCols] = useState(false)

  useEffect(() => {
    setData(node?.data || {})
  }, [node?.id])

  useEffect(() => {
    if (node?.type === 'source' || node?.type === 'sink') {
      api.getSchemas().then(res => setSchemas(res.schemas || [])).catch(console.error)
    }
  }, [node?.type])

  useEffect(() => {
    if ((node?.type === 'source' || node?.type === 'sink') && data.schema) {
      api.getTables(data.schema).then(res => setTables(res.tables || [])).catch(console.error)
    } else {
      setTables([])
    }
  }, [node?.type, data.schema])

  useEffect(() => {
    if (node?.type === 'sink' && data.schema && data.table) {
      api.describeTable(data.schema, data.table)
        .then(res => setTargetColumns((res.columns || []).map(c => c.name)))
        .catch(console.error)
    } else {
      setTargetColumns([])
    }
  }, [node?.type, data.schema, data.table])

  // ── Resolve upstream columns ───────────────────────────────────────────────
  useEffect(() => {
    if (!node || node.type === 'source') {
      setAvailableColumns([])
      return
    }

    let isCancelled = false
    async function fetchUpstream() {
      setLoadingCols(true)

      const parentNodeIds = edges.filter(e => e.target === node.id).map(e => e.source)
      
      async function resolveNodeOutput(nId, visited = new Set()) {
        if (visited.has(nId)) return []
        visited.add(nId)
        const currNode = nodes.find(n => n.id === nId)
        if (!currNode) return []

        // If source, fetch from Trino API
        if (currNode.type === 'source') {
          if (currNode.data?.schema && currNode.data?.table) {
            try {
              const res = await api.describeTable(currNode.data.schema, currNode.data.table)
              return (res.columns || []).map(c => ({ name: c.name, type: c.type || 'unknown' }))
            } catch (e) {
              return []
            }
          }
          return []
        }

        // Aggregate inputs of currNode
        const pEdges = edges.filter(e => e.target === nId)
        let inCols = []
        for (const e of pEdges) {
          inCols.push(...await resolveNodeOutput(e.source, visited))
        }
        
        const uniqueCols = {}
        inCols.forEach(c => uniqueCols[c.name] = c)
        inCols = Object.values(uniqueCols)

        if (currNode.type === 'select') {
          if (currNode.data?.columns && currNode.data.columns.length > 0 && currNode.data.columns[0] !== '*') {
            return currNode.data.columns.map(name => uniqueCols[name] || { name, type: 'unknown' })
          }
          return inCols
        }
        if (currNode.type === 'aggregate') {
          const gb = currNode.data?.group_by || []
          const agg = (currNode.data?.aggregations || []).map(a => a.alias).filter(Boolean)
          const allNames = [...new Set([...gb, ...agg])]
          return allNames.map(name => uniqueCols[name] || { name, type: 'unknown' })
        }
        return inCols // filter, join, union passthrough
      }

      let allInputCols = []
      let typesMap = {}
      for (const pId of parentNodeIds) {
        const cols = await resolveNodeOutput(pId)
        cols.forEach(c => {
          allInputCols.push(c.name)
          typesMap[c.name] = c.type
        })
      }

      if (!isCancelled) {
        setAvailableColumns([...new Set(allInputCols)])
        setAvailableColumnTypes(typesMap)
        setLoadingCols(false)
      }
    }
    
    fetchUpstream()
    return () => { isCancelled = true }
  }, [node?.id, nodes, edges])

  if (!node) return null

  function update(field, value) {
    const next = { ...data, [field]: value }
    setData(next)
    onChange(node.id, next)
  }

  function updateNested(field, idx, key, value) {
    const arr = [...(data[field] || [])]
    arr[idx] = { ...arr[idx], [key]: value }
    update(field, arr)
  }

  function addToArray(field, defaultItem) {
    update(field, [...(data[field] || []), defaultItem])
  }

  function removeFromArray(field, idx) {
    update(field, (data[field] || []).filter((_, i) => i !== idx))
  }

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border-color)' }}>
        <div>
          <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{node.type}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginTop: 2 }}>Configure Node</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}>
          <X size={16} />
        </button>
      </div>

      {/* Fields */}
      <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
        {/* Common: label */}
        <Field label="Node Label">
          <input className="form-input" value={data.label || ''} onChange={e => update('label', e.target.value)} placeholder="My Node" />
        </Field>

        {/* Source */}
        {node.type === 'source' && <>
          <Field label="Catalog">
            <input className="form-input" value={data.catalog || 'iceberg'} onChange={e => update('catalog', e.target.value)} placeholder="iceberg" />
          </Field>
          <Field label="Schema *">
            <select className="form-select" value={data.schema || ''} onChange={e => update('schema', e.target.value)}>
              <option value="" disabled>Select a schema...</option>
              {schemas.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Table *">
            <select className="form-select" value={data.table || ''} onChange={e => update('table', e.target.value)} disabled={!data.schema}>
              <option value="" disabled>Select a table...</option>
              {tables.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </>}

        {/* Filter */}
        {node.type === 'filter' && <>
          <Field label="WHERE Condition *">
            <textarea
              className="code-editor"
              style={{ minHeight: 80 }}
              value={data.condition || ''}
              onChange={e => update('condition', e.target.value)}
              placeholder="amount > 100 AND status = 'active'"
            />
          </Field>
        </>}

        {/* Select */}
        {node.type === 'select' && <>
          <Field label="Target Columns (Select to keep)">
            {loadingCols ? (
              <div style={{ fontSize: 13, color: '#64748b' }}>Loading available columns...</div>
            ) : availableColumns.length > 0 ? (
              <div style={{ background: '#0f172a', border: '1px solid var(--border-color)', borderRadius: 6, maxHeight: 180, overflowY: 'auto', padding: 8 }}>
                {availableColumns.map(col => {
                  const currentlySelected = data.columns ? data.columns.includes(col) : false
                  return (
                    <label key={col} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', cursor: 'pointer', fontSize: 13, color: '#e2e8f0', borderRadius: 4, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#1e293b'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <input 
                        type="checkbox" 
                        checked={currentlySelected}
                        onChange={e => {
                          let newCols = data.columns ? [...data.columns] : []
                          if (e.target.checked) newCols.push(col)
                          else newCols = newCols.filter(c => c !== col)
                          update('columns', newCols)
                        }}
                      />
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{col}</span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#f59e0b', display: 'flex', flexDirection: 'column', gap: 6, background: '#451a03', padding: 10, borderRadius: 6 }}>
                <div>No upstream columns found.</div>
                <div style={{ color: '#94a3b8' }}>Connect a Source node and provide Schema/Table first. Or type manually below:</div>
                <textarea
                  className="code-editor"
                  style={{ minHeight: 60, marginTop: 4 }}
                  value={(data.columns || []).join(', ')}
                  onChange={e => update('columns', e.target.value.split(',').map(c => c.trim()).filter(Boolean))}
                  placeholder="order_id, amount"
                />
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
              Select columns from parents. If empty, it equals SELECT *.
            </div>
          </Field>
        </>}

        {/* Join */}
        {node.type === 'join' && <>
          <Field label="Join Type *">
            <select className="form-select" value={data.join_type || 'INNER'} onChange={e => update('join_type', e.target.value)}>
              {JOIN_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="ON Condition *">
            <textarea
              className="code-editor"
              style={{ minHeight: 80 }}
              value={data.on_condition || ''}
              onChange={e => update('on_condition', e.target.value)}
              placeholder="l.user_id = r.user_id"
            />
          </Field>
          <Field label="Left Table Alias">
            <input className="form-input" value={data.left_alias || 'l'} onChange={e => update('left_alias', e.target.value)} placeholder="l" />
          </Field>
          <Field label="Right Table Alias">
            <input className="form-input" value={data.right_alias || 'r'} onChange={e => update('right_alias', e.target.value)} placeholder="r" />
          </Field>
          <Field label="Select Columns (optional)">
            <input className="form-input" value={(data.select_columns || ['*']).join(', ')}
              onChange={e => update('select_columns', e.target.value.split(',').map(c => c.trim()).filter(Boolean))}
              placeholder="* (all columns)" />
          </Field>
        </>}

        {/* Aggregate */}
        {node.type === 'aggregate' && <>
          <Field label="GROUP BY Columns">
            {loadingCols ? (
              <div style={{ fontSize: 13, color: '#64748b' }}>Loading available columns...</div>
            ) : availableColumns.length > 0 ? (
              <div style={{ background: '#0f172a', border: '1px solid var(--border-color)', borderRadius: 6, maxHeight: 140, overflowY: 'auto', padding: 8 }}>
                {availableColumns.map(col => {
                  const currentlySelected = data.group_by ? data.group_by.includes(col) : false
                  return (
                    <label key={col} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', cursor: 'pointer', fontSize: 13, color: '#e2e8f0', borderRadius: 4, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#1e293b'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <input 
                        type="checkbox" 
                        checked={currentlySelected}
                        onChange={e => {
                          let newCols = data.group_by ? [...data.group_by] : []
                          if (e.target.checked) newCols.push(col)
                          else newCols = newCols.filter(c => c !== col)
                          update('group_by', newCols)
                        }}
                      />
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{col}</span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <input className="form-input" value={(data.group_by || []).join(', ')}
                onChange={e => update('group_by', e.target.value.split(',').map(c => c.trim()).filter(Boolean))}
                placeholder="user_id, category" />
            )}
          </Field>
          <Field label="Aggregations">
            {(data.aggregations || []).map((agg, i) => {
              // Warning logic
              const colName = agg.column;
              const colType = availableColumnTypes[colName] || '';
              const numericRules = ['SUM', 'AVG'];
              const isNumeric = colType.includes('int') || colType.includes('decimal') || colType.includes('double') || colType.includes('real');
              let warning = null;
              if (colName && agg.rule && colType !== 'unknown' && numericRules.includes(agg.rule) && !isNumeric) {
                warning = `Hàm ${agg.rule} yêu cầu type kiểu số, nhưng cột báo là '${colType}'!`;
              }
              
              return (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ display: 'flex', flex: 1, gap: 4 }}>
                    <select 
                      className="form-select" style={{ flex: '0 0 90px', padding: '6px 8px', borderColor: warning ? '#ef4444' : '' }}
                      value={agg.rule || ''}
                      onChange={e => {
                        const rule = e.target.value;
                        const col = agg.column || '*';
                        const expr = rule === 'COUNT_DISTINCT' ? `COUNT(DISTINCT ${col})` : `${rule}(${col})`;
                        const newAggs = [...data.aggregations];
                        newAggs[i] = { ...newAggs[i], rule, expr };
                        update('aggregations', newAggs);
                      }}
                    >
                      <option value="" disabled>Rule</option>
                      <option value="SUM">SUM</option>
                      <option value="MIN">MIN</option>
                      <option value="MAX">MAX</option>
                      <option value="AVG">AVG</option>
                      <option value="COUNT">COUNT</option>
                      <option value="COUNT_DISTINCT">COUNT DISTINCT</option>
                    </select>
                    
                    {availableColumns.length > 0 ? (
                      <select
                        className="form-select" style={{ flex: 1, padding: '6px 8px', borderColor: warning ? '#ef4444' : '' }}
                        value={agg.column || ''}
                        onChange={e => {
                          const col = e.target.value;
                          const rule = agg.rule || 'SUM';
                          const expr = rule === 'COUNT_DISTINCT' ? `COUNT(DISTINCT ${col})` : `${rule}(${col})`;
                          const newAggs = [...data.aggregations];
                          newAggs[i] = { ...newAggs[i], column: col, rule, expr };
                          update('aggregations', newAggs);
                        }}
                      >
                        <option value="" disabled>Column</option>
                        <option value="*">*</option>
                        {availableColumns.map(c => <option key={c} value={c}>
                          {c} {availableColumnTypes[c] && availableColumnTypes[c] !== 'unknown' ? `(${availableColumnTypes[c]})` : ''}
                        </option>)}
                      </select>
                    ) : (
                      <input 
                        className="form-input" style={{ flex: 1, padding: '6px 8px', borderColor: warning ? '#ef4444' : '' }} 
                        placeholder="column_name" value={agg.column || ''}
                        onChange={e => {
                          const col = e.target.value;
                          const rule = agg.rule || 'SUM';
                          const expr = rule === 'COUNT_DISTINCT' ? `COUNT(DISTINCT ${col})` : `${rule}(${col})`;
                          const newAggs = [...data.aggregations];
                          newAggs[i] = { ...newAggs[i], column: col, rule, expr };
                          update('aggregations', newAggs);
                        }}
                      />
                    )}
                  </div>
                  <span style={{ color: '#64748b', fontSize: 12 }}>AS</span>
                  <input className="form-input" style={{ flex: '0 0 100px', padding: '6px 8px' }} placeholder="Alias" value={agg.alias || ''}
                    onChange={e => updateNested('aggregations', i, 'alias', e.target.value)} />
                  <button onClick={() => removeFromArray('aggregations', i)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                {warning && (
                  <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4, paddingLeft: 2 }}>
                    ⚠️ {warning}
                  </div>
                )}
              </div>
            )})}
            <button className="btn btn-secondary btn-sm" onClick={() => addToArray('aggregations', { expr: '', alias: '' })}>
              <Plus size={11} /> Add Aggregation
            </button>
          </Field>
        </>}

        {/* Union */}
        {node.type === 'union' && <>
          <Field label="Union Type">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#e2e8f0' }}>
              <input type="checkbox" checked={data.union_all !== false} onChange={e => update('union_all', e.target.checked)} />
              UNION ALL (keep duplicates)
            </label>
          </Field>
        </>}

        {/* Sink */}
        {node.type === 'sink' && <>
          <Field label="Catalog">
            <input className="form-input" value={data.catalog || 'iceberg'} onChange={e => update('catalog', e.target.value)} placeholder="iceberg" />
          </Field>
          <Field label="Schema *">
            <select className="form-select" value={data.schema || ''} onChange={e => update('schema', e.target.value)}>
              <option value="" disabled>Select a schema...</option>
              {schemas.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Table *">
            <select className="form-select" value={data.table || ''} onChange={e => update('table', e.target.value)} disabled={!data.schema}>
              <option value="" disabled>Select a table...</option>
              {tables.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Write Mode">
            <select className="form-select" value={data.write_mode || 'merge'} onChange={e => update('write_mode', e.target.value)}>
              {WRITE_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
          {(data.write_mode === 'merge' || !data.write_mode) && (
            <Field label="Merge Keys (for UPSERT)">
              {targetColumns.length > 0 ? (
                <div style={{ background: '#0f172a', border: '1px solid var(--border-color)', borderRadius: 6, maxHeight: 120, overflowY: 'auto', padding: 8 }}>
                  {targetColumns.map(col => {
                    const currentlySelected = data.merge_keys ? data.merge_keys.includes(col) : false
                    return (
                      <label key={col} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', cursor: 'pointer', fontSize: 13, color: '#e2e8f0', borderRadius: 4, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#1e293b'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <input 
                          type="checkbox" 
                          checked={currentlySelected}
                          onChange={e => {
                            let newKeys = data.merge_keys ? [...data.merge_keys] : []
                            if (e.target.checked) newKeys.push(col)
                            else newKeys = newKeys.filter(c => c !== col)
                            update('merge_keys', newKeys)
                          }}
                        />
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{col}</span>
                      </label>
                    )
                  })}
                </div>
              ) : (
                <input className="form-input" value={(data.merge_keys || []).join(', ')}
                  onChange={e => update('merge_keys', e.target.value.split(',').map(c => c.trim()).filter(Boolean))}
                  placeholder="id, user_id" />
              )}
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Columns used to match existing rows in target table</div>
            </Field>
          )}
          {targetColumns.length > 0 && (
            <Field label="Column Mapping (Target ← Source)">
              <div style={{ background: '#0f172a', border: '1px solid var(--border-color)', borderRadius: 6, padding: '8px 12px', maxHeight: 200, overflowY: 'auto' }}>
                <div style={{ display: 'flex', fontSize: 10, color: '#64748b', textTransform: 'uppercase', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ flex: 1 }}>Target Table Col</div>
                  <div style={{ flex: 1 }}>Input Pipeline Col</div>
                </div>
                {targetColumns.map(tgtCol => {
                  const mappedSrc = data.column_mapping?.[tgtCol] !== undefined ? data.column_mapping[tgtCol] : 'NULL'
                  return (
                    <div key={tgtCol} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <span style={{ flex: 1, fontFamily: 'JetBrains Mono', fontSize: 12, color: '#e2e8f0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} title={tgtCol}>{tgtCol}</span>
                      <select 
                        className="form-select" 
                        style={{ flex: 1, padding: '4px 8px', fontSize: 12, minWidth: 0 }}
                        value={mappedSrc === null ? 'NULL' : mappedSrc}
                        onChange={e => {
                          const mapping = { ...(data.column_mapping || {}) }
                          mapping[tgtCol] = e.target.value === 'NULL' ? null : e.target.value
                          update('column_mapping', mapping)
                        }}
                      >
                        <option value="NULL">-- NULL --</option>
                        {availableColumns.map(srcCol => <option key={srcCol} value={srcCol}>{srcCol}</option>)}
                      </select>
                    </div>
                  )
                })}
              </div>
            </Field>
          )}
        </>}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const panelStyle = {
  width: 280,
  flexShrink: 0,
  background: 'var(--bg-secondary)',
  borderLeft: '1px solid var(--border-color)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

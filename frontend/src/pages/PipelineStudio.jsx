/**
 * Pipeline Studio — Main Page
 * Visual DAG editor with React Flow + DAG → Backend pipeline registry
 * Full UI overhaul: premium dark theme, better UX, enable/disable aware.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ReactFlow, addEdge, useNodesState, useEdgesState,
  Background, Controls, MiniMap, BackgroundVariant, MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import {
  Play, Upload, Code, History, Zap, AlertCircle, CheckCircle,
  X, ChevronRight, Loader, ArrowLeft, Layers, Power, PowerOff,
  GitBranch, Terminal, Info,
} from 'lucide-react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'

import * as api from '../api/client'
import { NODE_TYPES } from './pipeline-studio/nodes/NodeTypes'
import NodePanel from './pipeline-studio/components/NodePanel'
import NodeConfigForm from './pipeline-studio/components/NodeConfigForm'
import RunHistory from './pipeline-studio/components/RunHistory'

// ── Unique ID generator ───────────────────────────────────────────────────────
let nodeCounter = 0
const genId = () => `node_${Date.now()}_${++nodeCounter}`

// ── Edge style ────────────────────────────────────────────────────────────────
const DEFAULT_EDGE_OPTIONS = {
  animated: false,
  style: { stroke: '#3b4a6b', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#3b4a6b', width: 16, height: 16 },
}

// ─────────────────────────────────────────────────────────────────────────────
export default function PipelineStudio() {
  const { id } = useParams()
  const navigate = useNavigate()

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedPipeline, setSelectedPipeline] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [mainTab, setMainTab] = useState('visual')   // 'visual' | 'sql' | 'history'
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [togging, setToggling] = useState(false)
  const [toast, setToast] = useState(null)
  const [showValidationPanel, setShowValidationPanel] = useState(false)
  const [validationErrors, setValidationErrors] = useState([])
  const [compiledSQL, setCompiledSQL] = useState('')

  // ── React Flow state ───────────────────────────────────────────────────────
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const reactFlowWrapper = useRef(null)
  const [reactFlowInstance, setReactFlowInstance] = useState(null)

  // ── Load pipeline ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (id) loadPipeline(id)
  }, [id])

  // ── Sync tab from URL query ───────────────────────────────────────────────
  const location = useLocation()
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tab = params.get('tab')
    if (tab === 'runs' || tab === 'history') {
      setMainTab('history')
    } else if (tab === 'sql') {
      setMainTab('sql')
    }
  }, [location.search])

  async function loadPipeline(pipelineId) {
    setLoading(true)
    try {
      const p = await api.getPipeline(pipelineId)
      setSelectedPipeline(p)

      const def = p.definition_json
      if (def?.nodes && def?.edges) {
        const rfNodes = def.nodes.map(n => ({
          id: n.id,
          type: n.type,
          position: n.position || { x: Math.random() * 600, y: Math.random() * 300 },
          data: { ...n.data, label: n.data?.label || n.type },
        }))
        const rfEdges = def.edges.map(e => ({
          ...e,
          ...DEFAULT_EDGE_OPTIONS,
        }))
        setNodes(rfNodes)
        setEdges(rfEdges)
      } else {
        setNodes([])
        setEdges([])
      }
      if (p.compiled_sql) setCompiledSQL(p.compiled_sql)
    } catch (e) {
      showToast('error', e.message)
      navigate('/pipelines')
    }
    setLoading(false)
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  function showToast(type, msg) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  // ── React Flow: drag-drop ─────────────────────────────────────────────────
  const onDragOver = useCallback(e => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(e => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/reactflow')
    if (!type || !reactFlowInstance) return

    const bounds = reactFlowWrapper.current.getBoundingClientRect()
    const position = reactFlowInstance.screenToFlowPosition({
      x: e.clientX - bounds.left,
      y: e.clientY - bounds.top,
    })

    const nodeId = genId()
    setNodes(prev => [...prev, {
      id: nodeId,
      type,
      position,
      data: { label: type.charAt(0).toUpperCase() + type.slice(1), selected: false },
    }])
  }, [reactFlowInstance])

  // ── Edge connection validation ─────────────────────────────────────────────
  const isValidConnection = useCallback(
    (connection) => {
      const targetNode = nodes.find((n) => n.id === connection.target)
      if (!targetNode) return false
      if (targetNode.type === 'source') return false
      const incomingEdges = edges.filter((e) => e.target === connection.target)
      if (targetNode.type === 'join') {
        const handleEdges = incomingEdges.filter(e => e.targetHandle === connection.targetHandle)
        return handleEdges.length < 1
      }
      if (targetNode.type === 'union') return true
      return incomingEdges.length < 1
    },
    [nodes, edges]
  )

  const onConnect = useCallback(params => {
    setEdges(prev => addEdge({ ...params, ...DEFAULT_EDGE_OPTIONS }, prev))
  }, [])

  // ── Node interactions ─────────────────────────────────────────────────────
  const onNodeClick = useCallback((_, node) => setSelectedNode(node), [])
  const onPaneClick = useCallback(() => setSelectedNode(null), [])

  function handleNodeDataChange(nodeId, newData) {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, data: newData } : n))
    setSelectedNode(prev => prev?.id === nodeId ? { ...prev, data: newData } : prev)
  }

  // ── Build definition JSON ──────────────────────────────────────────────────
  function buildDefinitionJSON() {
    return {
      nodes: nodes.map(n => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
      })),
      edges: edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      })),
    }
  }

  // ── Publish ────────────────────────────────────────────────────────────────
  async function handlePublish() {
    if (!selectedPipeline) return
    setPublishing(true)
    setValidationErrors([])
    setCompiledSQL('')

    try {
      const definition_json = buildDefinitionJSON()
      const data = await api.publishPipeline(selectedPipeline.id, { definition_json, validate_schema: true })

      if (!data.success) {
        setValidationErrors(data.errors || [])
        setShowValidationPanel(true)
        showToast('error', `Validation failed: ${data.errors?.length} error(s)`)
      } else {
        setCompiledSQL(data.compiled_sql || '')
        setShowValidationPanel(false)
        showToast('success', `✓ Published v${data.version}`)
        setSelectedPipeline(prev => ({ ...prev, latest_version: data.version, status: 'active' }))
        setMainTab('sql')
      }
    } catch (e) {
      showToast('error', e.message)
    }
    setPublishing(false)
  }

  // ── Run ────────────────────────────────────────────────────────────────────
  async function handleRun() {
    if (!selectedPipeline) return
    if (!selectedPipeline.is_enabled) {
      showToast('error', 'Pipeline đang bị disabled. Enable trước khi chạy.')
      return
    }
    if (selectedPipeline.latest_version === 0) {
      showToast('error', 'Publish pipeline trước khi chạy')
      return
    }
    setRunning(true)
    try {
      const data = await api.triggerPipelineRun(selectedPipeline.id)
      showToast('success', `🚀 Run started! ID: ${data.run_id.slice(0, 8)}`)
      setMainTab('history')
    } catch (e) {
      showToast('error', e.message)
    }
    setRunning(false)
  }

  // ── Toggle Enable/Disable ─────────────────────────────────────────────────
  async function handleToggleEnabled() {
    if (!selectedPipeline) return
    setToggling(true)
    try {
      const data = await api.togglePipelineEnabled(selectedPipeline.id)
      setSelectedPipeline(prev => ({ ...prev, is_enabled: data.is_enabled }))
      showToast('success', `Pipeline ${data.is_enabled ? 'enabled ✓' : 'disabled'}`)
    } catch (e) {
      showToast('error', e.message)
    }
    setToggling(false)
  }

  // ─────────────────────────────────────────────────────────────────────────
  const isDisabled = selectedPipeline && !selectedPipeline.is_enabled
  const canRun = selectedPipeline?.latest_version > 0 && selectedPipeline?.is_enabled

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#080c18' }}>

      {/* ── Top Bar ── */}
      <div style={{
        flexShrink: 0,
        padding: '0 20px',
        height: 58,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'linear-gradient(135deg, #0d1117 0%, #111827 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 1px 20px rgba(0,0,0,0.4)',
      }}>
        {/* Left: back + pipeline name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => navigate('/pipelines')}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#94a3b8', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 7, fontSize: 12, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.background = 'rgba(255,255,255,0.09)' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
            title="Back to Pipelines"
          >
            <ArrowLeft size={14} /> Back
          </button>

          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.08)' }} />

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader size={16} className="spin" style={{ color: '#6366f1' }} />
              <span style={{ fontSize: 14, color: '#64748b' }}>Loading...</span>
            </div>
          ) : selectedPipeline ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Status indicator */}
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: isDisabled ? '#475569' : (selectedPipeline.status === 'active' ? '#22c55e' : '#94a3b8'),
                boxShadow: !isDisabled && selectedPipeline.status === 'active' ? '0 0 8px #22c55e' : 'none',
              }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: isDisabled ? '#64748b' : '#f1f5f9' }}>
                {selectedPipeline.name}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{
                  fontSize: 11, color: '#6366f1',
                  background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
                  padding: '2px 8px', borderRadius: 20, fontWeight: 500,
                }}>
                  {selectedPipeline.engine === 'spark' ? '⚡ Spark' : '🔍 Trino'}
                </span>
                {selectedPipeline.latest_version > 0 && (
                  <span style={{ fontSize: 11, color: '#64748b', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)' }}>
                    v{selectedPipeline.latest_version}
                  </span>
                )}
                {isDisabled && (
                  <span style={{ fontSize: 11, color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
                    DISABLED
                  </span>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Right: action buttons */}
        {selectedPipeline && !loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Enable/Disable toggle */}
            <button
              onClick={handleToggleEnabled}
              disabled={togging}
              title={selectedPipeline.is_enabled ? 'Disable pipeline' : 'Enable pipeline'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                borderRadius: 8, border: `1px solid ${selectedPipeline.is_enabled ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}`,
                background: selectedPipeline.is_enabled ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
                color: selectedPipeline.is_enabled ? '#f59e0b' : '#22c55e',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {togging ? <Loader size={13} className="spin" /> : (selectedPipeline.is_enabled ? <PowerOff size={13} /> : <Power size={13} />)}
              {selectedPipeline.is_enabled ? 'Disable' : 'Enable'}
            </button>

            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)' }} />

            {/* Publish */}
            <button
              className="btn btn-secondary btn-sm"
              onClick={handlePublish}
              disabled={publishing || nodes.length === 0}
              title="Validate + Compile + Save version"
              style={{ gap: 6 }}
            >
              {publishing ? <Loader size={13} className="spin" /> : <Upload size={13} />}
              {publishing ? 'Publishing…' : 'Publish'}
            </button>

            {/* Run */}
            <button
              className="btn btn-sm"
              onClick={handleRun}
              disabled={running || !canRun}
              title={!selectedPipeline.is_enabled ? 'Enable pipeline first' : selectedPipeline.latest_version === 0 ? 'Publish first' : 'Run latest version'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: !canRun ? 'not-allowed' : 'pointer',
                background: canRun ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(99,102,241,0.15)',
                color: canRun ? 'white' : '#64748b',
                border: 'none',
                boxShadow: canRun ? '0 2px 12px rgba(99,102,241,0.35)' : 'none',
                transition: 'all 0.2s',
                opacity: !canRun ? 0.6 : 1,
              }}
            >
              {running ? <Loader size={13} className="spin" /> : <Zap size={13} />}
              {running ? 'Running…' : 'Run'}
            </button>
          </div>
        )}
      </div>

      {/* ── Tab Bar ── */}
      {selectedPipeline && !loading && (
        <div style={{
          display: 'flex', gap: 0,
          background: '#0d1117',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0, padding: '0 20px',
        }}>
          {[
            { key: 'visual',  Icon: Layers,   label: 'Visual Editor' },
            { key: 'history', Icon: History,  label: 'Run History' },
            { key: 'sql',     Icon: Terminal, label: 'Compiled SQL' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setMainTab(tab.key)}
              style={{
                padding: '11px 18px', border: 'none', cursor: 'pointer',
                background: 'none', fontSize: 12.5, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 7,
                color: mainTab === tab.key ? '#a5b4fc' : '#64748b',
                borderBottom: mainTab === tab.key ? '2px solid #6366f1' : '2px solid transparent',
                marginBottom: -1,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (mainTab !== tab.key) e.currentTarget.style.color = '#94a3b8' }}
              onMouseLeave={e => { if (mainTab !== tab.key) e.currentTarget.style.color = '#64748b' }}
            >
              <tab.Icon size={13} />
              {tab.label}
              {tab.key === 'history' && selectedPipeline && (
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 10,
                  background: mainTab === 'history' ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.08)',
                  color: mainTab === 'history' ? '#a5b4fc' : '#64748b',
                }}>
                  v{selectedPipeline.latest_version}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {!selectedPipeline && !loading ? (
          <EmptyEditorState />
        ) : loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080c18' }}>
            <div style={{ textAlign: 'center' }}>
              <Loader size={32} className="spin" style={{ color: '#6366f1', marginBottom: 16 }} />
              <div style={{ fontSize: 14, color: '#64748b' }}>Loading pipeline…</div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

            {/* ── VISUAL TAB ── */}
            {mainTab === 'visual' && (
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <NodePanel />
                <div ref={reactFlowWrapper} style={{ flex: 1, position: 'relative' }}>
                  {/* Disabled overlay */}
                  {isDisabled && (
                    <div style={{
                      position: 'absolute', inset: 0, zIndex: 10,
                      background: 'rgba(8,12,24,0.6)', backdropFilter: 'blur(2px)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      pointerEvents: 'none',
                    }}>
                      <div style={{
                        textAlign: 'center', padding: '20px 32px',
                        background: 'rgba(17,24,39,0.9)', borderRadius: 12,
                        border: '1px solid rgba(239,68,68,0.3)',
                      }}>
                        <PowerOff size={28} style={{ color: '#ef4444', marginBottom: 10 }} />
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#f87171', marginBottom: 6 }}>Pipeline Disabled</div>
                        <div style={{ fontSize: 13, color: '#64748b' }}>Enable the pipeline to run it.</div>
                      </div>
                    </div>
                  )}
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    isValidConnection={isValidConnection}
                    onInit={setReactFlowInstance}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onNodeClick={onNodeClick}
                    onPaneClick={onPaneClick}
                    nodeTypes={NODE_TYPES}
                    defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
                    fitView
                    deleteKeyCode={['Backspace', 'Delete']}
                    selectionKeyCode="Shift"
                    style={{ background: '#080c18' }}
                  >
                    <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="#1a2035" />
                    <Controls style={{
                      background: '#111827', border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 8, overflow: 'hidden',
                    }} />
                    <MiniMap
                      style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
                      nodeColor={n => {
                        const colors = { source: '#3b82f6', filter: '#22c55e', sink: '#ef4444', join: '#a855f7', aggregate: '#06b6d4', select: '#eab308', union: '#f97316' }
                        return colors[n.type] || '#64748b'
                      }}
                    />
                    {nodes.length === 0 && (
                      <div style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center', pointerEvents: 'none',
                      }}>
                        <div style={{ fontSize: 52, marginBottom: 16, opacity: 0.4 }}>🎨</div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: '#2d3a57', marginBottom: 8 }}>
                          Drag nodes from the left panel
                        </div>
                        <div style={{ fontSize: 13, color: '#1e293b' }}>
                          Build your pipeline visually
                        </div>
                      </div>
                    )}
                  </ReactFlow>
                </div>
                <NodeConfigForm
                  node={selectedNode}
                  nodes={nodes}
                  edges={edges}
                  onChange={handleNodeDataChange}
                  onClose={() => setSelectedNode(null)}
                />
              </div>
            )}

            {/* ── SQL TAB ── */}
            {mainTab === 'sql' && (
              <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto', background: '#080c18' }}>
                {showValidationPanel && validationErrors.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                      <AlertCircle size={14} /> {validationErrors.length} Validation Error(s)
                    </div>
                    {validationErrors.map((err, i) => (
                      <div key={i} style={{
                        padding: '12px 16px', marginBottom: 8,
                        background: 'rgba(45,10,10,0.8)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
                        fontSize: 13, color: '#f87171',
                      }}>
                        <strong>[{err.code}]</strong> {err.message}
                        {err.node_id && <span style={{ color: '#94a3b8', marginLeft: 8 }}>({err.node_id})</span>}
                      </div>
                    ))}
                  </div>
                )}

                {compiledSQL ? (
                  <>
                    <div style={{ fontSize: 12, color: '#22c55e', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                      <CheckCircle size={14} /> Compiled CTE SQL — Trino
                    </div>
                    <pre style={{
                      fontFamily: 'JetBrains Mono, Fira Code, monospace',
                      fontSize: 13, color: '#e2e8f0', lineHeight: 1.7,
                      whiteSpace: 'pre-wrap', margin: 0, wordBreak: 'break-all',
                      background: '#0a0f1e', padding: '20px 24px',
                      borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)',
                      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                    }}>
                      {compiledSQL}
                    </pre>
                  </>
                ) : (
                  <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', height: '60vh', gap: 12,
                  }}>
                    <Terminal size={40} style={{ color: '#1e293b' }} />
                    <div style={{ color: '#475569', fontSize: 14, textAlign: 'center' }}>
                      Click <strong style={{ color: '#6366f1' }}>Publish</strong> in the Visual Editor<br />
                      to validate and compile SQL
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── HISTORY TAB ── */}
            {mainTab === 'history' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#080c18' }}>
                <RunHistory pipelineId={selectedPipeline?.id} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          padding: '14px 22px', borderRadius: 12,
          background: toast.type === 'success' ? 'rgba(5,46,22,0.95)' : 'rgba(45,10,10,0.95)',
          border: `1px solid ${toast.type === 'success' ? '#22c55e40' : '#ef444440'}`,
          color: toast.type === 'success' ? '#22c55e' : '#f87171',
          fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(12px)',
          animation: 'slideIn 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyEditorState() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#080c18',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px', fontSize: 36,
        }}>⚡</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>
          Pipeline Studio
        </div>
        <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.8, marginBottom: 28 }}>
          Build visual data pipelines with drag-and-drop nodes.<br />
          Powered by <strong style={{ color: '#6366f1' }}>Trino CTE SQL</strong> with automatic compilation.
        </div>
      </div>
    </div>
  )
}

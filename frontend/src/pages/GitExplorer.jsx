import React, { useState, useEffect } from 'react'
import { GitBranch, Plus, Trash2, GitMerge, GitCommit, RefreshCw, Tag } from 'lucide-react'
import * as api from '../api/client'

export default function GitExplorer() {
  const [branches, setBranches] = useState([])
  const [tags, setTags] = useState([])
  const [selectedBranch, setSelectedBranch] = useState(null)
  const [log, setLog] = useState([])
  const [contents, setContents] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [showMerge, setShowMerge] = useState(false)
  const [newBranch, setNewBranch] = useState({ name: '', source_branch: 'main' })
  const [mergeForm, setMergeForm] = useState({ from_branch: '', to_branch: 'main', message: '' })

  useEffect(() => { loadBranches(); loadTags() }, [])

  async function loadBranches() {
    try {
      const data = await api.listBranches()
      setBranches(data.branches || [])
    } catch (e) { console.error(e) }
  }

  async function loadTags() {
    try {
      const data = await api.listTags()
      setTags(data.tags || [])
    } catch (e) { console.error(e) }
  }

  async function selectBranch(name) {
    setSelectedBranch(name)
    try {
      const [logData, contentsData] = await Promise.all([
        api.getBranchLog(name),
        api.getBranchContents(name),
      ])
      setLog(logData.log || [])
      setContents(contentsData.contents || [])
    } catch (e) { console.error(e) }
  }

  async function handleCreateBranch() {
    try {
      await api.createBranch(newBranch)
      setShowCreate(false)
      setNewBranch({ name: '', source_branch: 'main' })
      loadBranches()
    } catch (e) { alert(e.message) }
  }

  async function handleDeleteBranch(name) {
    if (!confirm(`Xóa branch "${name}"?`)) return
    try {
      await api.deleteBranch(name)
      if (selectedBranch === name) setSelectedBranch(null)
      loadBranches()
    } catch (e) { alert(e.message) }
  }

  async function handleMerge() {
    try {
      await api.mergeBranches(mergeForm)
      setShowMerge(false)
      alert('Merge thành công!')
      loadBranches()
    } catch (e) { alert(e.message) }
  }

  return (
    <>
      <div className="top-bar">
        <h1><GitBranch size={18} /> Git Explorer (Nessie)</h1>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={loadBranches}><RefreshCw size={14} /></button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowMerge(true)}><GitMerge size={14} /> Merge</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}><Plus size={14} /> Branch</button>
        </div>
      </div>
      <div className="page-container">
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '16px' }}>
          {/* Branches panel */}
          <div className="flex flex-col gap-3">
            <div className="card">
              <div className="card-header"><h2>Branches</h2></div>
              <div className="card-body" style={{ padding: '8px' }}>
                {branches.map(b => (
                  <div key={b.name}
                    className={`sidebar-link ${selectedBranch === b.name ? 'active' : ''}`}
                    onClick={() => selectBranch(b.name)}
                  >
                    <GitBranch size={14} />
                    <span className="truncate" style={{ flex: 1 }}>{b.name}</span>
                    {b.name !== 'main' && (
                      <button className="btn btn-danger btn-sm" style={{ padding: '2px 6px' }} onClick={(e) => { e.stopPropagation(); handleDeleteBranch(b.name) }}><Trash2 size={10} /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h2><Tag size={14} /> Tags</h2></div>
              <div className="card-body" style={{ padding: '8px' }}>
                {tags.length === 0 ? <p className="text-muted text-sm" style={{ padding: '8px' }}>Không có tags</p> : (
                  tags.map(t => (
                    <div key={t.name} className="sidebar-link">
                      <Tag size={14} />
                      <span>{t.name}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Branch details */}
          <div className="flex flex-col gap-3">
            {selectedBranch ? (
              <>
                {/* Contents */}
                <div className="card">
                  <div className="card-header"><h2>Objects trên "{selectedBranch}"</h2></div>
                  <div className="card-body">
                    {contents.length === 0 ? (
                      <p className="text-muted text-sm">Không có objects</p>
                    ) : (
                      <div className="table-container">
                        <table>
                          <thead><tr><th>Name</th><th>Type</th></tr></thead>
                          <tbody>
                            {contents.map((c, i) => (
                              <tr key={i}>
                                <td className="font-mono text-sm">{c.name?.elements?.join('.') || JSON.stringify(c.name)}</td>
                                <td><span className="badge badge-info">{c.type}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* Commit log */}
                <div className="card">
                  <div className="card-header"><h2><GitCommit size={14} /> Commit Log</h2></div>
                  <div className="card-body">
                    {log.length === 0 ? (
                      <p className="text-muted text-sm">Không có commits</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {log.map((entry, i) => (
                          <div key={i} style={{ padding: '10px 12px', borderLeft: '2px solid var(--accent-primary)', background: 'var(--bg-glass)', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0' }}>
                            <div className="text-sm" style={{ fontWeight: 500 }}>{entry.commitMeta?.message || 'No message'}</div>
                            <div className="text-xs text-muted mt-4">
                              {entry.commitMeta?.hash?.slice(0, 12)} • {entry.commitMeta?.authorTime || ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="card"><div className="card-body"><div className="empty-state"><GitBranch size={40} /><h3>Chọn một branch</h3><p>Chọn branch từ panel bên trái để xem chi tiết</p></div></div></div>
            )}
          </div>
        </div>

        {/* Create Branch Modal */}
        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header"><h2>Tạo Branch mới</h2></div>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Tên branch</label>
                  <input className="form-input" placeholder="feature/add-silver-tables" value={newBranch.name} onChange={e => setNewBranch({ ...newBranch, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tạo từ branch</label>
                  <select className="form-select" value={newBranch.source_branch} onChange={e => setNewBranch({ ...newBranch, source_branch: e.target.value })}>
                    {branches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Hủy</button>
                <button className="btn btn-primary" onClick={handleCreateBranch}>Tạo Branch</button>
              </div>
            </div>
          </div>
        )}

        {/* Merge Modal */}
        {showMerge && (
          <div className="modal-overlay" onClick={() => setShowMerge(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header"><h2>Merge Branches</h2></div>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">From branch</label>
                  <select className="form-select" value={mergeForm.from_branch} onChange={e => setMergeForm({ ...mergeForm, from_branch: e.target.value })}>
                    <option value="">-- Chọn --</option>
                    {branches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">To branch</label>
                  <select className="form-select" value={mergeForm.to_branch} onChange={e => setMergeForm({ ...mergeForm, to_branch: e.target.value })}>
                    {branches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Commit message</label>
                  <input className="form-input" placeholder="Merge feature branch" value={mergeForm.message} onChange={e => setMergeForm({ ...mergeForm, message: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowMerge(false)}>Hủy</button>
                <button className="btn btn-primary" onClick={handleMerge}><GitMerge size={14} /> Merge</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

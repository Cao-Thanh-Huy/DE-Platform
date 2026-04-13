import React, { useState, useEffect } from 'react'
import { GitBranch, Plus, Trash2, GitMerge, GitCommit, RefreshCw, Tag, CheckCircle, AlertTriangle } from 'lucide-react'
import * as api from '../api/client'

export default function GitExplorer() {
  const [branches, setBranches] = useState([])
  const [tags, setTags] = useState([])
  const [selectedBranch, setSelectedBranch] = useState(null)
  const [log, setLog] = useState([])
  const [contents, setContents] = useState([])
  const [diffs, setDiffs] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [showMerge, setShowMerge] = useState(false)
  const [showMRDetails, setShowMRDetails] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [toast, setToast] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [newBranch, setNewBranch] = useState({ name: '', source_branch: 'main' })
  const [mergeForm, setMergeForm] = useState({ from_branch: '', to_branch: 'main', message: '' })

  const showMessage = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 6000)
  }

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
      const pLog = api.getBranchLog(name);
      const pContents = api.getBranchContents(name);
      const pDiff = name !== 'main' ? api.diffBranches(name, 'main') : Promise.resolve({ diff: [] });
      
      const [logData, contentsData, diffData] = await Promise.all([pLog, pContents, pDiff])
      setLog(logData.log || [])
      setContents(contentsData.contents || [])
      setDiffs(diffData.diff || [])
    } catch (e) { console.error(e) }
  }

  async function handleCreateBranch() {
    try {
      await api.createBranch(newBranch)
      setShowCreate(false)
      setNewBranch({ name: '', source_branch: 'main' })
      loadBranches()
      showMessage('Tạo branch thành công!', 'success')
    } catch (e) { showMessage(e.message, 'error') }
  }

  const promptDeleteBranch = (name) => {
    setConfirmDialog({
      title: 'Xác nhận xoá nhánh',
      message: `Bạn có chắc chắn muốn xoá nhánh "${name}"? Thao tác này không thể phục hồi.`,
      confirmLabel: 'Xoá nhánh',
      confirmClass: 'btn-danger',
      action: () => handleDeleteBranch(name)
    });
  }

  async function handleDeleteBranch(name) {
    try {
      await api.deleteBranch(name)
      if (selectedBranch === name) setSelectedBranch(null)
      loadBranches()
      showMessage(`Đã xoá branch ${name}`, 'success')
    } catch (e) { showMessage(e.message, 'error') }
  }

  async function handleMerge() {
    try {
      await api.mergeBranches(mergeForm)
      setShowMerge(false)
      showMessage('Merge thành công!', 'success')
      loadBranches()
    } catch (e) { 
      if (e.message && e.message.includes('409 Conflict')) {
        showMessage('❌ LỖI XUNG ĐỘT (CONFLICT):\n\nNhánh đích (main) đã cập nhật phiên bản mới. Nessie không thể tự động gộp (Merge) do có sự chồng chéo dữ liệu.\nVui lòng kiểm tra lại sự đồng bộ giữa các nhánh.', 'error');
      } else {
        showMessage('Lỗi: ' + e.message, 'error');
      }
    }
  }

  const promptApproveMR = (name) => {
    setConfirmDialog({
      title: 'Xác nhận Merge & Approve',
      message: `Dữ liệu từ pipeline "${name}" sẽ được gộp thẳng vào nhánh "main".\n\nTrạng thái dữ liệu Production của bạn sẽ bị thay đổi. Hành động này không thể hoàn tác.\nBạn có chắc chắn muốn thực hiện không?`,
      confirmLabel: 'Approve & Merge',
      confirmClass: 'btn-success',
      action: () => handleApproveMR(name)
    });
  }

  async function handleApproveMR(name) {
    try {
      await api.mergeBranches({ from_branch: name, to_branch: 'main', message: `Merge pipeline run: ${name}` })
      await api.deleteBranch(name)
      if (selectedBranch === name) setSelectedBranch(null)
      showMessage('Đã Merge thành công dữ liệu vào main!', 'success')
      loadBranches()
    } catch (e) { 
      if (e.message && e.message.includes('409 Conflict')) {
        showMessage('❌ LỖI XUNG ĐỘT DỮ LIỆU (MERGE CONFLICT):\n\nNhánh main đã bị thay đổi bởi một pipeline khác kể từ lúc nhánh này được tạo ra.\nNessie đã tự động chặn hành động Merge này để tránh làm hỏng dữ liệu chồng chéo.\n\n👉 Cách xử lý: Vui lòng nhấn REJECT nhánh này, và chạy lại Pipeline để lấy dữ liệu mới nhất từ main!', 'error');
      } else {
        showMessage('Lỗi khi Merge: ' + e.message, 'error');
      }
    }
  }

  const normalBranches = branches.filter(b => !b.name.startsWith('pipeline_'))
  const mrBranches = branches.filter(b => b.name.startsWith('pipeline_')).sort((a, b) => {
    // Branch format: pipeline_{timestamp}_{name}_run_{id} OR pipeline_{name}_run_{id}
    const partsA = a.name.split('_');
    const partsB = b.name.split('_');
    const timeA = (partsA.length > 2 && !isNaN(parseInt(partsA[1]))) ? parseInt(partsA[1]) : 0;
    const timeB = (partsB.length > 2 && !isNaN(parseInt(partsB[1]))) ? parseInt(partsB[1]) : 0;
    return timeB - timeA; // Newest first
  })
  const hasDeleted = diffs.some(d => !d.from && d.to)

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
                {normalBranches.map(b => (
                  <div key={b.name}
                    className={`sidebar-link ${selectedBranch === b.name ? 'active' : ''}`}
                    onClick={() => selectBranch(b.name)}
                  >
                    <GitBranch size={14} />
                    <span className="truncate" style={{ flex: 1 }}>{b.name}</span>
                    {b.name !== 'main' && (
                      <button className="btn btn-danger btn-sm" style={{ padding: '2px 6px' }} onClick={(e) => { e.stopPropagation(); promptDeleteBranch(b.name) }}><Trash2 size={10} /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {mrBranches.length > 0 && (
              <div className="card" style={{ borderColor: 'var(--accent-success)' }}>
                <div className="card-header" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                  <h2 style={{ color: 'var(--accent-success)' }}>Merge Requests</h2>
                </div>
                <div className="card-body" style={{ padding: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                  {mrBranches.map(b => {
                    // Extract human-readable name by stripping prefix and run_id
                    let displayName = b.name.replace('pipeline_', '');
                    const parts = b.name.split('_');
                    if (parts.length > 2 && !isNaN(parseInt(parts[1]))) {
                      // Has timestamp: pipeline_{timestamp}_{name}_run_{id}
                      // Extract just the {name} part for UI
                      const runIndex = b.name.indexOf('_run_');
                      if (runIndex > -1) {
                        displayName = b.name.substring(`pipeline_${parts[1]}_`.length, runIndex);
                      }
                    }
                    
                    return (
                      <div key={b.name}
                        className={`sidebar-link ${selectedBranch === b.name ? 'active' : ''}`}
                        onClick={() => selectBranch(b.name)}
                        style={{ borderLeft: selectedBranch === b.name ? '3px solid var(--accent-success)' : 'none' }}
                      >
                        <GitMerge size={14} style={{ color: 'var(--accent-success)' }} />
                        <span className="truncate text-xs" style={{ flex: 1 }} title={b.name}>{displayName}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
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
                <div className="flex justify-between align-center" style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                  <h2 style={{ fontSize: '1.25rem', margin: 0 }}>
                    <GitBranch size={16} className="inline-block mr-2" style={{ verticalAlign: 'text-bottom' }} /> 
                    {selectedBranch}
                  </h2>
                  {selectedBranch.startsWith('pipeline_') && (
                    <div className="flex gap-2">
                      <button 
                        className="btn btn-sm" 
                        style={{ 
                          background: hasDeleted ? 'var(--border-color)' : 'var(--accent-success)', 
                          color: hasDeleted ? 'var(--text-muted)' : '#fff',
                          cursor: hasDeleted ? 'not-allowed' : 'pointer',
                          opacity: hasDeleted ? 0.6 : 1
                        }} 
                        onClick={() => { if (!hasDeleted) promptApproveMR(selectedBranch) }}
                        title={hasDeleted ? "Bị khóa vì phát hiện có lệnh DROP bảng." : ""}
                        disabled={hasDeleted}
                      >
                        Approve & Merge
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => promptDeleteBranch(selectedBranch)}>
                        Reject
                      </button>
                    </div>
                  )}
                </div>

                {selectedBranch.startsWith('pipeline_') && hasDeleted && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.15)', borderLeft: '4px solid var(--accent-danger)', padding: '12px 16px', marginBottom: '12px', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                    <div className="flex align-center gap-2 mb-1">
                      <Trash2 size={16} color="var(--accent-danger)" />
                      <strong style={{ color: 'var(--accent-danger)' }}>Hành động nguy hiểm bị chặn!</strong>
                    </div>
                    <p style={{ margin: 0, opacity: 0.9 }}>Merge Request này chứa yêu cầu xoá (Drop) đối tượng lưu trữ! Hệ thống đã tự động vô hiệu hoá tính năng Merge để bảo vệ bảng dữ liệu trên nhánh <code style={{color: 'var(--accent-danger)'}}>main</code>. Bạn chỉ có thể Reject lệnh này.</p>
                  </div>
                )}

                <div className="flex gap-2 mb-2">
                  <button className={`btn btn-sm ${activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('overview')}>Overview</button>
                  <button className={`btn btn-sm ${activeTab === 'commits' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('commits')}>Commit Log</button>
                </div>

                {activeTab === 'overview' && (
                  <>
                    {/* Diff summary vs main */}
                    {selectedBranch !== 'main' && (
                      <div className="card">
                        <div className="card-header"><h2>Sự thay đổi so với "main"</h2></div>
                        <div className="card-body">
                          {diffs.length === 0 ? (
                            <p className="text-muted text-sm">Không có thay đổi dữ liệu nào.</p>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {diffs.map((d, i) => {
                                const tableName = d.key?.elements?.join('.') || 'Unknown';
                                let status = 'Unknown';
                                let color = 'var(--text-muted)';
                                let icon = <GitCommit size={14} />;
                                let badgeClass = '';
                                
                                if (d.from && !d.to) {
                                  status = 'Added';
                                  color = 'var(--accent-success)';
                                  icon = <Plus size={14} color={color} />;
                                  badgeClass = 'badge-success';
                                } else if (!d.from && d.to) {
                                  status = 'Deleted';
                                  color = 'var(--accent-danger)';
                                  icon = <Trash2 size={14} color={color} />;
                                  badgeClass = 'badge-danger';
                                } else if (d.from && d.to) {
                                  status = 'Modified';
                                  color = 'var(--accent-warning)';
                                  icon = <GitCommit size={14} color={color} />;
                                  badgeClass = 'badge-warning';
                                }
                                
                                return (
                                  <div key={i} className="flex justify-between align-center" style={{ padding: '8px 12px', borderLeft: `3px solid ${color}`, background: 'var(--bg-glass)', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0' }}>
                                    <div className="flex gap-2 align-center">
                                      {icon}
                                      <span className="font-mono text-sm">{tableName}</span>
                                    </div>
                                    <div>
                                      <span className={`badge ${badgeClass}`}>{status}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Contents */}
                    <div className="card">
                      <div className="card-header">
                        <h2>Tất cả Objects trên nhánh</h2>
                      </div>
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
                  </>
                )}

                {activeTab === 'commits' && (
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
                )}
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

        {/* Generic Confirm Modal */}
        {confirmDialog && (
          <div className="modal-overlay" onClick={() => setConfirmDialog(null)} style={{ zIndex: 10000 }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
              <div className="modal-header">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {confirmDialog.confirmClass === 'btn-success' ? <GitMerge size={18} color="var(--accent-success)" /> : <AlertTriangle size={18} color="var(--accent-danger)" />}
                  {confirmDialog.title}
                </h2>
              </div>
              <div className="modal-body">
                <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{confirmDialog.message}</p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setConfirmDialog(null)}>Hủy</button>
                <button 
                  className={`btn ${confirmDialog.confirmClass || 'btn-primary'}`} 
                  style={confirmDialog.confirmClass === 'btn-success' ? { background: 'var(--accent-success)', color: '#fff' } : {}}
                  onClick={() => {
                    confirmDialog.action();
                    setConfirmDialog(null);
                  }}
                >
                  {confirmDialog.confirmLabel || 'Xác nhận'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast Notification positioned absolutely */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 9999,
          background: toast.type === 'success' ? 'rgba(5, 46, 22, 0.95)' : 'rgba(69, 10, 10, 0.95)',
          border: `1px solid ${toast.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          color: toast.type === 'success' ? '#4ade80' : '#fca5a5',
          padding: '16px 20px',
          borderRadius: '8px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'baseline',
          gap: '12px',
          maxWidth: '450px',
          backdropFilter: 'blur(10px)',
          animation: 'slideIn 0.3s ease-out forwards'
        }}>
          <div>{toast.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}</div>
          <div style={{ fontSize: '0.95rem', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{toast.msg}</div>
        </div>
      )}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  )
}

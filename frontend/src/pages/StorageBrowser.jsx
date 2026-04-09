import React, { useState, useEffect } from 'react'
import { HardDrive, Folder, File, Trash2, RefreshCw, ChevronRight } from 'lucide-react'
import * as api from '../api/client'

export default function StorageBrowser() {
  const [buckets, setBuckets] = useState([])
  const [selectedBucket, setSelectedBucket] = useState(null)
  const [objects, setObjects] = useState([])
  const [prefix, setPrefix] = useState('')
  const [breadcrumb, setBreadcrumb] = useState([])

  useEffect(() => { loadBuckets() }, [])

  async function loadBuckets() {
    try {
      const data = await api.listBuckets()
      setBuckets(data.buckets || [])
    } catch (e) { console.error(e) }
  }

  async function selectBucket(name) {
    setSelectedBucket(name)
    setPrefix('')
    setBreadcrumb([])
    await loadObjects(name, '')
  }

  async function loadObjects(bucket, pfx) {
    try {
      const data = await api.listObjects(bucket || selectedBucket, pfx)
      setObjects(data.objects || [])
    } catch (e) { console.error(e) }
  }

  async function navigateTo(pfx) {
    setPrefix(pfx)
    const parts = pfx.split('/').filter(Boolean)
    setBreadcrumb(parts)
    await loadObjects(selectedBucket, pfx)
  }

  async function handleDelete(objectName) {
    if (!confirm(`Xóa "${objectName}"?`)) return
    try {
      await api.deleteObject(selectedBucket, objectName)
      loadObjects(selectedBucket, prefix)
    } catch (e) { alert(e.message) }
  }

  function formatSize(bytes) {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <>
      <div className="top-bar">
        <h1><HardDrive size={18} /> Storage Browser (MinIO)</h1>
        <button className="btn btn-secondary btn-sm" onClick={loadBuckets}><RefreshCw size={14} /></button>
      </div>
      <div className="page-container">
        <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '16px' }}>
          {/* Buckets */}
          <div className="card">
            <div className="card-header"><h2>Buckets</h2></div>
            <div className="card-body" style={{ padding: '8px' }}>
              {buckets.map(b => (
                <div key={b.name}
                  className={`sidebar-link ${selectedBucket === b.name ? 'active' : ''}`}
                  onClick={() => selectBucket(b.name)}
                >
                  <HardDrive size={14} />
                  <span>{b.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Objects */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <h2>{selectedBucket || 'Chọn bucket'}</h2>
                {breadcrumb.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span style={{ cursor: 'pointer', color: 'var(--accent-primary)' }} onClick={() => navigateTo('')}>root</span>
                    {breadcrumb.map((part, i) => (
                      <React.Fragment key={i}>
                        <ChevronRight size={10} />
                        <span style={{ cursor: 'pointer', color: 'var(--accent-primary)' }}
                          onClick={() => navigateTo(breadcrumb.slice(0, i + 1).join('/') + '/')}
                        >{part}</span>
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="card-body">
              {!selectedBucket ? (
                <div className="empty-state"><HardDrive size={40} /><h3>Chọn một bucket</h3></div>
              ) : objects.length === 0 ? (
                <div className="empty-state"><Folder size={40} /><h3>Thư mục trống</h3></div>
              ) : (
                <div className="table-container">
                  <table>
                    <thead><tr><th>Tên</th><th>Kích thước</th><th>Cập nhật</th><th></th></tr></thead>
                    <tbody>
                      {objects.map((obj, i) => (
                        <tr key={i}>
                          <td>
                            {obj.is_dir ? (
                              <span className="flex items-center gap-2" style={{ cursor: 'pointer', color: 'var(--accent-primary)' }}
                                onClick={() => navigateTo(obj.name)}
                              >
                                <Folder size={14} /> {obj.name}
                              </span>
                            ) : (
                              <span className="flex items-center gap-2 font-mono text-sm"><File size={14} /> {obj.name}</span>
                            )}
                          </td>
                          <td className="text-muted text-sm">{obj.is_dir ? '-' : formatSize(obj.size)}</td>
                          <td className="text-muted text-xs">{obj.last_modified || '-'}</td>
                          <td>
                            {!obj.is_dir && (
                              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(obj.name)}><Trash2 size={10} /></button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

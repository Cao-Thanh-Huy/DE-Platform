import React, { useState, useEffect } from 'react'
import { Database, Play, GitBranch, HardDrive, Activity, CheckCircle, AlertCircle } from 'lucide-react'
import * as api from '../api/client'

export default function Dashboard() {
  const [health, setHealth] = useState(null)
  const [stats, setStats] = useState({ schemas: 0, pipelines: 0, branches: 0, buckets: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [h, s, p, b, bk] = await Promise.allSettled([
        api.checkHealth(),
        api.getSchemas(),
        api.listPipelines(),
        api.listBranches(),
        api.listBuckets(),
      ])
      setHealth(h.status === 'fulfilled' ? h.value : null)
      setStats({
        schemas: s.status === 'fulfilled' ? s.value.schemas?.length || 0 : 0,
        pipelines: p.status === 'fulfilled' ? p.value.total || 0 : 0,
        branches: b.status === 'fulfilled' ? b.value.branches?.length || 0 : 0,
        buckets: bk.status === 'fulfilled' ? bk.value.buckets?.length || 0 : 0,
      })
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const services = [
    { name: 'FastAPI Backend', port: 8000, icon: '⚡' },
    { name: 'Trino Engine', port: 8080, icon: '🔍' },
    { name: 'Nessie Catalog', port: 19120, icon: '🌿' },
    { name: 'MinIO Storage', port: 9001, icon: '💾' },
    { name: 'Dagster Webserver', port: 3001, icon: '📊' },
    { name: 'Vault', port: 8200, icon: '🔐' },
  ]

  return (
    <>
      <div className="top-bar">
        <h1>Dashboard</h1>
        <div className="flex items-center gap-2">
          {health ? (
            <span className="badge badge-success"><CheckCircle size={12} />&nbsp;API Online</span>
          ) : (
            <span className="badge badge-danger"><AlertCircle size={12} />&nbsp;API Offline</span>
          )}
        </div>
      </div>
      <div className="page-container">
        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-icon purple"><Database size={20} /></div>
            <div className="stat-value">{stats.schemas}</div>
            <div className="stat-label">Schemas</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-icon green"><Play size={20} /></div>
            <div className="stat-value">{stats.pipelines}</div>
            <div className="stat-label">Pipelines</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-icon blue"><GitBranch size={20} /></div>
            <div className="stat-value">{stats.branches}</div>
            <div className="stat-label">Branches</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-icon orange"><HardDrive size={20} /></div>
            <div className="stat-value">{stats.buckets}</div>
            <div className="stat-label">Buckets</div>
          </div>
        </div>

        {/* Services Status */}
        <div className="card">
          <div className="card-header">
            <h2><Activity size={16} /> Trạng thái Services</h2>
          </div>
          <div className="card-body">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Port</th>
                    <th>URL</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((svc) => (
                    <tr key={svc.name}>
                      <td>{svc.icon} {svc.name}</td>
                      <td><span className="badge badge-purple">{svc.port}</span></td>
                      <td className="text-muted font-mono text-sm">localhost:{svc.port}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

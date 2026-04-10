import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Database, GitBranch, Play, Search,
  HardDrive, Settings, ChevronRight, HeartPulse, PanelLeftClose, PanelLeftOpen
} from 'lucide-react'

import Dashboard from './pages/Dashboard'
import ModelManager from './pages/ModelManager'
import Pipelines from './pages/Pipelines'
import PipelineStudio from './pages/PipelineStudio'
import GitExplorer from './pages/GitExplorer'
import QueryEditor from './pages/QueryEditor'
import StorageBrowser from './pages/StorageBrowser'
import CatalogHealth from './pages/CatalogHealth'

const NAV_ITEMS = [
  { section: 'Tổng quan' },
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { section: 'Data Studio' },
  { path: '/models', icon: Database, label: 'Data Models' },
  { path: '/pipelines', icon: Play, label: 'Pipeline Studio' },
  { path: '/query', icon: Search, label: 'SQL Editor' },
  { section: 'Quản lý' },
  { path: '/git', icon: GitBranch, label: 'Git (Nessie)' },
  { path: '/storage', icon: HardDrive, label: 'Storage (MinIO)' },
  { path: '/catalog-health', icon: HeartPulse, label: 'Catalog Health' },
]

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  return (
    <BrowserRouter>
      <div className="app-layout">
        {/* Sidebar */}
        <aside className={`sidebar ${isSidebarOpen ? '' : 'collapsed'}`}>
          <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'space-between' : 'center', padding: isSidebarOpen ? '20px 16px' : '20px 0' }}>
            <div className="sidebar-logo" style={{ display: isSidebarOpen ? 'flex' : 'none' }}>
              <div className="sidebar-logo-icon">DE</div>
              <div>
                <div className="sidebar-logo-text">DE Studio</div>
                <div className="sidebar-logo-sub">Data Engineering Platform</div>
              </div>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 4 }}
              title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
            >
              {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
          </div>
          <nav className="sidebar-nav">
            {NAV_ITEMS.map((item, i) =>
              item.section ? (
                <div key={i} className="sidebar-section-label">{item.section}</div>
              ) : (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    `sidebar-link ${isActive ? 'active' : ''}`
                  }
                >
                  <item.icon />
                  <span>{item.label}</span>
                </NavLink>
              )
            )}
          </nav>
        </aside>

        {/* Main */}
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/models" element={<ModelManager />} />
            <Route path="/pipelines" element={<Pipelines />} />
            <Route path="/pipelines/:id" element={<PipelineStudio />} />
            <Route path="/query" element={<QueryEditor />} />
            <Route path="/git" element={<GitExplorer />} />
            <Route path="/storage" element={<StorageBrowser />} />
            <Route path="/catalog-health" element={<CatalogHealth />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

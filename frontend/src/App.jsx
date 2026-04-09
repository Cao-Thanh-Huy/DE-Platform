import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Database, GitBranch, Play, Search,
  HardDrive, Settings, ChevronRight
} from 'lucide-react'

import Dashboard from './pages/Dashboard'
import ModelManager from './pages/ModelManager'
import PipelineStudio from './pages/PipelineStudio'
import GitExplorer from './pages/GitExplorer'
import QueryEditor from './pages/QueryEditor'
import StorageBrowser from './pages/StorageBrowser'

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
]

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <div className="sidebar-logo-icon">DE</div>
              <div>
                <div className="sidebar-logo-text">DE Studio</div>
                <div className="sidebar-logo-sub">Data Engineering Platform</div>
              </div>
            </div>
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
            <Route path="/pipelines" element={<PipelineStudio />} />
            <Route path="/query" element={<QueryEditor />} />
            <Route path="/git" element={<GitExplorer />} />
            <Route path="/storage" element={<StorageBrowser />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

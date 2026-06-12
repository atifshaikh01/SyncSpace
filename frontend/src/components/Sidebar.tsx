import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronDown,
  ChevronsLeft,
  Clock3,
  FileText,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'
import type { DocumentMetadata, User } from '../types'

interface SidebarProps {
  documents: DocumentMetadata[]
  onCreateDocument: () => void
  onDeleteDocument: (id: string) => Promise<void>
  onRenameDocument: (id: string, newTitle: string) => Promise<void>
  currentUser: User
  onSignOut: () => void
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({
  documents,
  onCreateDocument,
  onDeleteDocument,
  onRenameDocument,
  currentUser,
  onSignOut,
  isOpen,
  onClose,
}: SidebarProps) {
  const { docId } = useParams<{ docId: string }>()
  const navigate = useNavigate()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const saveRename = (id: string) => {
    if (editTitle.trim()) void onRenameDocument(id, editTitle.trim())
    setEditingId(null)
  }

  return (
    <>
      <div className={`sidebar-scrim ${isOpen ? 'is-open' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${isOpen ? 'is-open' : ''}`}>
        <div className="workspace-switcher">
          <div className="brand-mark"><Sparkles size={17} /></div>
          <button className="workspace-name" onClick={() => navigate('/')}>SyncSpace <ChevronDown size={14} /></button>
          <button className="sidebar-icon" onClick={onClose} aria-label="Close sidebar"><ChevronsLeft size={17} /></button>
        </div>

        <div className="sidebar-actions">
          <button><Search size={16} /><span>Search</span><kbd>Ctrl K</kbd></button>
          <button onClick={onCreateDocument}><Plus size={16} /><span>New page</span></button>
        </div>

        <nav className="sidebar-nav">
          <button onClick={() => navigate('/')}><Clock3 size={16} /><span>Recent</span></button>
          <button onClick={() => navigate('/')}><Users size={16} /><span>Shared with me</span></button>
        </nav>

        <div className="document-section">
          <div className="section-heading">
            <span>Private</span>
            <button aria-label="Add document" onClick={onCreateDocument}><Plus size={14} /></button>
          </div>
          <div className="document-list">
            {documents.map((document) => {
              const isActive = document.id === docId
              const isEditing = editingId === document.id
              const canRename = document.ownedByCurrentUser !== false
                || document.sharePermission === 'edit'
              const canDelete = document.ownedByCurrentUser !== false
              return (
                <div
                  key={document.id}
                  className={`document-item ${isActive ? 'is-active' : ''}`}
                  onClick={() => {
                    navigate(`/document/${document.id}`)
                    onClose()
                  }}
                >
                  <FileText size={15} />
                  {isEditing ? (
                    <input
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onBlur={() => saveRename(document.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') saveRename(document.id)
                        if (event.key === 'Escape') setEditingId(null)
                      }}
                      autoFocus
                    />
                  ) : (
                    <span>{document.title}</span>
                  )}
                  <div className="document-item-actions">
                    {canRename && (
                      <button
                        aria-label="Rename document"
                        onClick={(event) => {
                          event.stopPropagation()
                          setEditTitle(document.title)
                          setEditingId(document.id)
                        }}
                      >
                        <MoreHorizontal size={15} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        aria-label="Delete document"
                        onClick={(event) => {
                          event.stopPropagation()
                          void onDeleteDocument(document.id)
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="identity-picker">
            <div className="identity-copy">
              <span className="avatar" style={{ background: currentUser.color }}>{currentUser.name[0]}</span>
              <div><strong>{currentUser.name}</strong><small>Personal workspace</small></div>
            </div>
          </div>
          <button className="settings-row"><Settings size={16} /><span>Settings</span></button>
          <button className="settings-row sign-out-row" onClick={onSignOut}>
            <LogOut size={16} /><span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  )
}

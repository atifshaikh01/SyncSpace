import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  Check,
  ChevronRight,
  Clock3,
  FilePlus2,
  FileText,
  FolderOpen,
  Grid2X2,
  List,
  LogOut,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Share2,
  Sparkles,
  Star,
  Trash2,
  Users,
} from 'lucide-react'
import type { DocumentMetadata, PendingInvitation, User } from '../types'

interface DashboardProps {
  user: User
  documents: DocumentMetadata[]
  invitations: PendingInvitation[]
  onCreateDocument: () => void
  onDeleteDocument: (id: string) => Promise<void>
  onAcceptInvitation: (id: string) => Promise<void>
  onDeclineInvitation: (id: string) => Promise<void>
  onSignOut: () => void
}

const formatRelativeDate = (value: string) => {
  const difference = Date.now() - new Date(value).getTime()
  const minutes = Math.max(1, Math.floor(difference / 60000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'Yesterday' : `${days}d ago`
}

const accessLabel = (document: DocumentMetadata) => {
  if (document.access !== 'shared') return 'Private'
  return document.sharePermission === 'edit' ? 'Can edit' : 'Can view'
}

export function Dashboard({
  user,
  documents,
  invitations,
  onCreateDocument,
  onDeleteDocument,
  onAcceptInvitation,
  onDeclineInvitation,
  onSignOut,
}: DashboardProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!openMenuId) return
    const closeMenu = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpenMenuId(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenuId(null)
    }
    window.addEventListener('mousedown', closeMenu)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('mousedown', closeMenu)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [openMenuId])

  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return documents
    return documents.filter((document) => document.title.toLowerCase().includes(normalized))
  }, [documents, query])

  const recentDocuments = [...filteredDocuments]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4)
  const sharedDocuments = filteredDocuments.filter((document) => document.access === 'shared')
  const privateDocuments = filteredDocuments.filter((document) => document.access !== 'shared')

  const openDocument = (id: string) => navigate(`/document/${id}`)

  const deleteDocument = async (document: DocumentMetadata) => {
    setOpenMenuId(null)
    if (!window.confirm(`Delete "${document.title}"? This cannot be undone.`)) return
    setActionError('')
    setDeletingId(document.id)
    try {
      await onDeleteDocument(document.id)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to delete document.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        <button className="dashboard-brand" onClick={() => navigate('/')}>
          <span className="brand-mark"><Sparkles size={17} /></span>
          <strong>SyncSpace</strong>
        </button>

        <button className="dashboard-new-button" onClick={onCreateDocument}>
          <Plus size={16} /> New document
        </button>

        <nav className="dashboard-nav">
          <button className="is-active"><Grid2X2 size={16} /><span>Home</span></button>
          <button><Clock3 size={16} /><span>Recent</span></button>
          <button><Share2 size={16} /><span>Shared with me</span></button>
          <button><Star size={16} /><span>Favorites</span></button>
        </nav>

        <div className="dashboard-spaces">
          <div><span>Spaces</span><button aria-label="Add space"><Plus size={14} /></button></div>
          <button><FolderOpen size={16} /><span>Personal</span></button>
          <button><Users size={16} /><span>Team workspace</span></button>
        </div>

        <div className="dashboard-sidebar-footer">
          <button><Settings size={16} /><span>Settings</span></button>
          <button onClick={onSignOut}><LogOut size={16} /><span>Sign out</span></button>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="dashboard-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your workspace"
              aria-label="Search documents"
            />
            <kbd>Ctrl K</kbd>
          </div>
          <div className="dashboard-account">
            <button className="dashboard-icon-button" aria-label="Notifications"><Bell size={17} /></button>
            <span className="avatar" style={{ background: user.color }}>{user.name[0]}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.accountType === 'account' ? 'Personal workspace' : 'Guest workspace'}</small>
            </div>
          </div>
        </header>

        <div className="dashboard-content">
          <div className="dashboard-welcome">
            <div>
              <span className="dashboard-eyebrow">Your workspace</span>
              <h1>Good to see you, {user.name.split(' ')[0]}.</h1>
              <p>Pick up where you left off or start with a fresh page.</p>
            </div>
            <button onClick={onCreateDocument}><FilePlus2 size={17} /> Create document</button>
          </div>
          {actionError && (
            <div className="dashboard-action-error">
              <span>{actionError}</span>
              <button onClick={() => setActionError('')}>Dismiss</button>
            </div>
          )}

          {!query && (
            invitations.length > 0 && (
              <section className="pending-invitations">
                <div className="pending-invitations-heading">
                  <div><Mail size={16} /><h2>Pending invitations</h2></div>
                  <span>{invitations.length}</span>
                </div>
                <div className="pending-invitations-list">
                  {invitations.map((invitation) => (
                    <div key={invitation.id} className="pending-invitation-row">
                      <span className="document-card-icon"><FileText size={14} /></span>
                      <div>
                        <strong>{invitation.documentTitle}</strong>
                        <small>
                          {invitation.invitedBy} invited you · Can {invitation.permission}
                        </small>
                      </div>
                      <button
                        className="decline-invite"
                        onClick={() => onDeclineInvitation(invitation.id)}
                      >
                        Decline
                      </button>
                      <button
                        className="accept-invite"
                        onClick={() => onAcceptInvitation(invitation.id)}
                      >
                        <Check size={13} /> Accept
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )
          )}

          {!query && (
            <section className="quick-start">
              <button className="quick-start-card new" onClick={onCreateDocument}>
                <span><Plus size={22} /></span>
                <strong>Blank document</strong>
                <small>Start from a clean page</small>
              </button>
              <button className="quick-start-card">
                <span className="template-icon">Aa</span>
                <strong>Meeting notes</strong>
                <small>Agenda, notes and actions</small>
              </button>
              <button className="quick-start-card">
                <span className="template-icon roadmap">↗</span>
                <strong>Project brief</strong>
                <small>Goals, scope and timeline</small>
              </button>
            </section>
          )}

          <section className="dashboard-section">
            <div className="dashboard-section-heading">
              <div>
                <h2>{query ? 'Search results' : 'Recent documents'}</h2>
                <span>{filteredDocuments.length} documents</span>
              </div>
              <div className="dashboard-view-toggle">
                <button className={view === 'grid' ? 'is-active' : ''} onClick={() => setView('grid')} aria-label="Grid view"><Grid2X2 size={15} /></button>
                <button className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')} aria-label="List view"><List size={16} /></button>
              </div>
            </div>

            {recentDocuments.length === 0 ? (
              <div className="dashboard-empty">
                <FileText size={24} />
                <strong>No documents found</strong>
                <span>Try another search or create a new document.</span>
              </div>
            ) : (
              <div className={`dashboard-documents ${view}`}>
                {recentDocuments.map((document) => (
                  <article
                    key={document.id}
                    className={`dashboard-document-card ${deletingId === document.id ? 'is-deleting' : ''}`}
                    onClick={() => openDocument(document.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') openDocument(document.id)
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="document-preview">
                      <span className="preview-kicker">SYNCSPACE</span>
                      <strong>{document.title}</strong>
                      <span className="preview-line wide" />
                      <span className="preview-line" />
                      <span className="preview-line short" />
                    </div>
                    <div className="document-card-copy">
                      <span className="document-card-icon"><FileText size={15} /></span>
                      <div>
                        <strong>{document.title}</strong>
                        <small>{formatRelativeDate(document.updatedAt)} · {accessLabel(document)}</small>
                      </div>
                      {(document.collaborators?.length ?? 0) > 0 && (
                        <div className="document-collaborators" aria-label="Invited collaborators">
                          {document.collaborators?.slice(0, 3).map((collaborator) => (
                            <span
                              key={collaborator.id}
                              style={{ background: collaborator.color }}
                              title={collaborator.email}
                            >
                              {collaborator.name[0]}
                            </span>
                          ))}
                          {(document.collaborators?.length ?? 0) > 3 && (
                            <span className="more">+{(document.collaborators?.length ?? 0) - 3}</span>
                          )}
                        </div>
                      )}
                      <div
                        className="dashboard-card-actions"
                        ref={openMenuId === document.id ? menuRef : undefined}
                      >
                        <button
                          className="dashboard-more-button"
                          aria-label={`Actions for ${document.title}`}
                          aria-expanded={openMenuId === document.id}
                          onKeyDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation()
                            setOpenMenuId((current) =>
                              current === document.id ? null : document.id)
                          }}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {openMenuId === document.id && (
                          <div className="dashboard-card-menu" role="menu">
                            {document.ownedByCurrentUser !== false ? (
                              <button
                                className="is-danger"
                                role="menuitem"
                                onKeyDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void deleteDocument(document)
                                }}
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            ) : (
                              <span>No document actions available</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {!query && (
            <div className="dashboard-libraries">
              <DocumentLibrary
                title="Shared with me"
                icon={<Users size={16} />}
                documents={sharedDocuments}
                empty="Documents shared with you will appear here."
                onOpen={openDocument}
              />
              <DocumentLibrary
                title="Private"
                icon={<FileText size={16} />}
                documents={privateDocuments}
                empty="Your private documents will appear here."
                onOpen={openDocument}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function DocumentLibrary({
  title,
  icon,
  documents,
  empty,
  onOpen,
}: {
  title: string
  icon: ReactNode
  documents: DocumentMetadata[]
  empty: string
  onOpen: (id: string) => void
}) {
  return (
    <section className="document-library">
      <div className="library-heading">
        <span>{icon}</span>
        <h2>{title}</h2>
        <small>{documents.length}</small>
        <button>View all <ChevronRight size={13} /></button>
      </div>
      <div className="library-list">
        {documents.length === 0 ? (
          <p>{empty}</p>
        ) : documents.slice(0, 3).map((document) => (
          <button key={document.id} onClick={() => onOpen(document.id)}>
            <span className="document-card-icon"><FileText size={14} /></span>
            <div>
              <strong>{document.title}</strong>
              <small>Edited {formatRelativeDate(document.updatedAt)} · {accessLabel(document)}</small>
            </div>
            <ChevronRight size={15} />
          </button>
        ))}
      </div>
    </section>
  )
}

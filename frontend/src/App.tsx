import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Check,
  AlertCircle,
  ChevronDown,
  CloudOff,
  Clock3,
  Eye,
  Lock,
  LoaderCircle,
  Menu,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Pencil,
  Save,
  Share2,
  Star,
  Sun,
} from 'lucide-react'
import { ActiveUsers } from './components/ActiveUsers'
import { CollaborativeEditor } from './components/CollaborativeEditor'
import { Dashboard } from './components/Dashboard'
import { LoginPage } from './components/LoginPage'
import { ShareModal } from './components/ShareModal'
import { Sidebar } from './components/Sidebar'
import { authApi } from './lib/auth'
import { documentsApi, invitationsApi } from './lib/documents'
import type {
  DocumentCollaborator,
  DocumentMetadata,
  OnlineUser,
  PendingInvitation,
  SharePermission,
  User,
} from './types'

const SESSION_KEY = 'syncspace_guest_session'

const createShareToken = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replaceAll('-', '').slice(0, 16)
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

const PRESET_USERS: User[] = [
  { id: 'user-alice', name: 'Alice Smith', color: '#ef6f5e' },
  { id: 'user-bob', name: 'Bob Jones', color: '#6f7de8' },
  { id: 'user-charlie', name: 'Charlie Green', color: '#26a37b' },
]

const LEGACY_SEED_DOCUMENT_IDS = new Set(['get-started-doc', 'project-roadmap'])

const normalizeStoredTitle = (title: string) => title
  .replace(/^ðŸš€\s*/, '')
  .replace(/^ðŸ—ºï¸\s*/, '')

interface WorkspaceShellProps {
  sessionUser: User
  documents: DocumentMetadata[]
  onCreateDocument: () => void
  onDeleteDocument: (id: string) => Promise<void>
  onChangeDocumentTitle: (id: string, title: string) => void
  onRenameDocument: (id: string, title: string) => Promise<void>
  onSaveDocumentContent: (id: string, content: string) => Promise<void>
  onRefreshDocument: (id: string) => Promise<void>
  onChangePermission: (id: string, permission: SharePermission) => Promise<void>
  onInviteCollaborator: (
    id: string,
    collaborator: Omit<DocumentCollaborator, 'id' | 'status'>,
  ) => Promise<void>
  onUpdateCollaborator: (
    documentId: string,
    collaboratorId: string,
    permission: DocumentCollaborator['permission'],
  ) => Promise<void>
  onRemoveCollaborator: (documentId: string, collaboratorId: string) => Promise<void>
  onSignOut: () => void
}

function WorkspaceShell({
  sessionUser,
  documents,
  onCreateDocument,
  onDeleteDocument,
  onChangeDocumentTitle,
  onRenameDocument,
  onSaveDocumentContent,
  onRefreshDocument,
  onChangePermission,
  onInviteCollaborator,
  onUpdateCollaborator,
  onRemoveCollaborator,
  onSignOut,
}: WorkspaceShellProps) {
  const { docId } = useParams<{ docId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [editorSaveStatus, setEditorSaveStatus] =
    useState<'saved' | 'saving' | 'offline'>('saving')
  const [titleSaveStatus, setTitleSaveStatus] =
    useState<'idle' | 'saving' | 'error'>('idle')
  const [saveRequest, setSaveRequest] = useState(0)
  const [actionError, setActionError] = useState('')
  const titleSaveTimer = useRef<number | null>(null)
  const [darkMode, setDarkMode] = useState(() =>
    localStorage.getItem('theme') === 'dark'
    || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches),
  )
  const [currentUser, setCurrentUser] = useState<User>(sessionUser)
  const [connectionStatus, setConnectionStatus] =
    useState<'connected' | 'connecting' | 'disconnected'>('disconnected')
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const currentDoc = documents.find((document) => document.id === docId)
  const requestedShareToken = searchParams.get('share')
  const isSharedLink = Boolean(requestedShareToken)
  const hasValidShareAccess = Boolean(
    currentDoc
    && requestedShareToken
    && currentDoc.access === 'shared'
    && currentDoc.shareToken === requestedShareToken,
  )
  const sharedPermission = hasValidShareAccess
    ? currentDoc?.sharePermission ?? 'view'
    : null
  const membershipPermission = currentDoc?.ownedByCurrentUser === false
    ? currentDoc.sharePermission
    : null
  const isReadOnly = sharedPermission === 'view' || membershipPermission === 'view'

  useEffect(() => () => {
    if (titleSaveTimer.current) window.clearTimeout(titleSaveTimer.current)
  }, [])

  useEffect(() => {
    if (isSharedLink) return
    if (documents.length > 0 && !currentDoc) {
      navigate(`/document/${documents[0].id}`, { replace: true })
    } else if (documents.length === 0) {
      navigate('/', { replace: true })
    }
  }, [currentDoc, documents, isSharedLink, navigate])

  useEffect(() => {
    if (!docId) return
    let active = true
    onRefreshDocument(docId).catch((error) => {
      if (active) {
        setActionError(error instanceof Error ? error.message : 'Unable to load document.')
      }
    })
    return () => {
      active = false
    }
  }, [docId, onRefreshDocument])

  const handleDeleteDocument = async (idToDelete: string) => {
    const documentToDelete = documents.find((document) => document.id === idToDelete)
    if (!window.confirm(`Delete "${documentToDelete?.title || 'this document'}"? This cannot be undone.`)) {
      return
    }
    const updated = documents.filter((document) => document.id !== idToDelete)
    setActionError('')
    try {
      await onDeleteDocument(idToDelete)
      if (docId === idToDelete && updated.length > 0) {
        navigate(`/document/${updated[0].id}`)
      } else if (updated.length === 0) {
        navigate('/')
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to delete document.')
    }
  }

  const saveTitle = async (id: string, title: string) => {
    const normalizedTitle = title.trim()
    if (!normalizedTitle) {
      setTitleSaveStatus('error')
      return
    }
    setTitleSaveStatus('saving')
    try {
      await onRenameDocument(id, normalizedTitle)
      setTitleSaveStatus('idle')
    } catch {
      setTitleSaveStatus('error')
    }
  }

  const scheduleTitleSave = (id: string, title: string) => {
    onChangeDocumentTitle(id, title)
    setTitleSaveStatus('saving')
    if (titleSaveTimer.current) window.clearTimeout(titleSaveTimer.current)
    titleSaveTimer.current = window.setTimeout(() => {
      titleSaveTimer.current = null
      void saveTitle(id, title)
    }, 700)
  }

  const flushTitleSave = (id: string, title: string) => {
    if (!titleSaveTimer.current) return
    if (titleSaveTimer.current) window.clearTimeout(titleSaveTimer.current)
    titleSaveTimer.current = null
    void saveTitle(id, title)
  }

  const saveDocument = async () => {
    if (!currentDoc || isReadOnly || connectionStatus !== 'connected') return

    if (titleSaveTimer.current) {
      window.clearTimeout(titleSaveTimer.current)
      titleSaveTimer.current = null
      await saveTitle(currentDoc.id, currentDoc.title)
    }
    setEditorSaveStatus('saving')
    setSaveRequest((request) => request + 1)
  }

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveDocument()
      }
    }
    window.addEventListener('keydown', handleSaveShortcut)
    return () => window.removeEventListener('keydown', handleSaveShortcut)
  })

  const handleSelectUser = (user: User) => {
    setCurrentUser(user)
    localStorage.setItem('syncspace_simulated_user_id', user.id)
  }

  if (isSharedLink && (!currentDoc || !hasValidShareAccess)) {
    return (
      <div className="share-access-denied">
        <span><Lock size={22} /></span>
        <h1>This link is no longer available</h1>
        <p>The document is private, the link was changed, or the document no longer exists.</p>
        <button onClick={() => navigate('/')}>Back to workspace</button>
      </div>
    )
  }

  if (!currentDoc) {
    return (
      <div className="loading-screen">
        <div className="loading-mark" />
      </div>
    )
  }

  const saveStatus = titleSaveStatus === 'error'
    ? 'error'
    : titleSaveStatus === 'saving'
      ? 'saving'
      : editorSaveStatus
  const saveStatusLabel = {
    saved: 'Saved',
    saving: 'Saving...',
    offline: 'Offline',
    error: 'Save failed',
  }[saveStatus]
  const SaveStatusIcon = saveStatus === 'saving'
    ? LoaderCircle
    : saveStatus === 'offline'
      ? CloudOff
      : saveStatus === 'error'
        ? AlertCircle
        : Check

  return (
    <div className="workspace">
      {!isSharedLink && (
        <Sidebar
          documents={documents}
          onCreateDocument={onCreateDocument}
          onDeleteDocument={handleDeleteDocument}
          onRenameDocument={onRenameDocument}
          users={[sessionUser, ...PRESET_USERS.filter((user) => user.id !== sessionUser.id)]}
          currentUser={currentUser}
          onSelectUser={handleSelectUser}
          onSignOut={onSignOut}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      <main className="workspace-main">
        <header className="document-header">
          <div className="document-identity">
            {!isSharedLink && (
              <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
                <Menu size={18} />
              </button>
            )}
            <div className="document-title-wrap">
              <div className="document-title-row">
                <input
                  aria-label="Document title"
                  value={currentDoc.title}
                  readOnly={isReadOnly}
                  onChange={(event) => scheduleTitleSave(currentDoc.id, event.target.value)}
                  onBlur={() => flushTitleSave(currentDoc.id, currentDoc.title)}
                  className={`document-title ${isReadOnly ? 'is-readonly' : ''}`}
                />
                <button className="quiet-icon" aria-label="Favorite document"><Star size={16} /></button>
              </div>
              <div className="document-meta">
                <span className={`save-status ${saveStatus}`}>
                  <SaveStatusIcon size={12} className={saveStatus === 'saving' ? 'is-spinning' : ''} />
                  {saveStatusLabel}
                </span>
                <span className="meta-divider" />
                <span>
                  {isSharedLink
                    ? (isReadOnly ? 'Viewing shared document' : 'Editing shared document')
                    : (currentDoc.access === 'shared' ? 'Shared document' : 'Private workspace')}
                </span>
                <ChevronDown size={12} />
              </div>
            </div>
          </div>

          <div className="header-actions">
            <ActiveUsers onlineUsers={onlineUsers} connectionStatus={connectionStatus} />
            {!isReadOnly && (
              <button
                className="save-button"
                onClick={() => void saveDocument()}
                disabled={connectionStatus !== 'connected'}
                title="Save document (Ctrl+S)"
              >
                {saveStatus === 'saving'
                  ? <LoaderCircle size={15} className="is-spinning" />
                  : <Save size={15} />}
                <span>{saveStatus === 'saving' ? 'Saving' : 'Save'}</span>
                <kbd>Ctrl S</kbd>
              </button>
            )}
            <button className="icon-button hide-compact" aria-label="Version history"><Clock3 size={17} /></button>
            <button className="icon-button hide-compact" aria-label="Comments"><MessageSquare size={17} /></button>
            {isSharedLink || currentDoc.ownedByCurrentUser === false ? (
              <span className={`shared-mode-badge ${isReadOnly ? 'view' : 'edit'}`}>
                {isReadOnly ? <Eye size={14} /> : <Pencil size={14} />}
                {isReadOnly ? 'View only' : 'Can edit'}
              </span>
            ) : (
              <button className="share-button" onClick={() => setShareOpen(true)}>
                <Share2 size={15} /> Share
              </button>
            )}
            <button
              className="icon-button"
              onClick={() => setDarkMode((value) => !value)}
              aria-label="Toggle color theme"
            >
              {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className="icon-button hide-compact" aria-label="More options"><MoreHorizontal size={18} /></button>
          </div>
        </header>
        {actionError && (
          <div className="workspace-action-error">
            <AlertCircle size={14} />
            <span>{actionError}</span>
            <button onClick={() => setActionError('')} aria-label="Dismiss error">Dismiss</button>
          </div>
        )}

        <section className="editor-viewport">
          <CollaborativeEditor
            key={`${currentDoc.id}-${currentUser.id}`}
            docId={currentDoc.id}
            currentUser={currentUser}
            title={currentDoc.title}
            content={currentDoc.content || ''}
            readOnly={isReadOnly}
            saveRequest={saveRequest}
            onSaveContent={(content) => onSaveDocumentContent(currentDoc.id, content)}
            onSaveStatusChange={setEditorSaveStatus}
            onConnectionStatusChange={setConnectionStatus}
            onOnlineUsersChange={setOnlineUsers}
          />
        </section>
      </main>

      {shareOpen && (
        <ShareModal
          document={currentDoc}
          onChangePermission={(permission) => onChangePermission(currentDoc.id, permission)}
          onInvite={(collaborator) => onInviteCollaborator(currentDoc.id, collaborator)}
          onUpdateCollaborator={(collaboratorId, permission) =>
            onUpdateCollaborator(currentDoc.id, collaboratorId, permission)}
          onRemoveCollaborator={(collaboratorId) =>
            onRemoveCollaborator(currentDoc.id, collaboratorId)}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}

function App() {
  const [sessionUser, setSessionUser] = useState<User | null>(() => {
    const saved = localStorage.getItem(SESSION_KEY)
    if (!saved) return null
    try {
      return JSON.parse(saved) as User
    } catch {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
  })
  const [authReady, setAuthReady] = useState(() => Boolean(localStorage.getItem(SESSION_KEY)))
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [documents, setDocuments] = useState<DocumentMetadata[]>(() => {
    const saved = localStorage.getItem('syncspace_documents')
    if (!saved) return []
    try {
      return (JSON.parse(saved) as DocumentMetadata[])
        .filter((document) => !LEGACY_SEED_DOCUMENT_IDS.has(document.id))
        .map((document) => ({
          ...document,
          title: normalizeStoredTitle(document.title),
          access: document.access ?? 'private',
          sharePermission: document.sharePermission
            ?? (document.access === 'shared' ? 'view' : 'private'),
          shareToken: document.shareToken
            ?? (document.access === 'shared' ? createShareToken() : undefined),
          collaborators: document.collaborators ?? [],
        }))
    } catch {
      return []
    }
  })

  useEffect(() => {
    if (sessionUser?.accountType !== 'account') {
      localStorage.setItem('syncspace_documents', JSON.stringify(documents))
    }
  }, [documents, sessionUser?.accountType])

  useEffect(() => {
    if (localStorage.getItem(SESSION_KEY)) return

    let active = true
    authApi.me()
      .then(({ user }) => {
        if (active) setSessionUser({ ...user, accountType: 'account' })
      })
      .catch(() => {
        if (active) setSessionUser(null)
      })
      .finally(() => {
        if (active) setAuthReady(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (sessionUser?.accountType !== 'account') return
    let active = true
    Promise.all([documentsApi.list(), invitationsApi.list()])
      .then(([documentResponse, invitationResponse]) => {
        if (!active) return
        setDocuments(documentResponse.documents)
        setPendingInvitations(invitationResponse.invitations)
      })
      .catch((error) => console.error('Unable to load account workspace:', error))
    return () => {
      active = false
    }
  }, [sessionUser?.id, sessionUser?.accountType])

  const createDocument = async () => {
    if (sessionUser?.accountType === 'account') {
      const { document } = await documentsApi.create()
      setDocuments((previous) => [document, ...previous])
      window.history.pushState({}, '', `/document/${document.id}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
      return
    }
    const newDocument: DocumentMetadata = {
      id: `doc-${Math.random().toString(36).substring(2, 11)}`,
      title: 'Untitled document',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      access: 'private',
      sharePermission: 'private',
    }
    setDocuments((previous) => [newDocument, ...previous])
    window.history.pushState({}, '', `/document/${newDocument.id}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const deleteDocument = async (id: string) => {
    if (sessionUser?.accountType === 'account') await documentsApi.remove(id)
    setDocuments((previous) => previous.filter((document) => document.id !== id))
  }

  const renameDocument = async (id: string, title: string) => {
    setDocuments((previous) => previous.map((document) =>
      document.id === id
        ? { ...document, title, updatedAt: new Date().toISOString() }
        : document,
    ))
    if (sessionUser?.accountType === 'account') {
      await documentsApi.update(id, { title })
    }
  }

  const changeDocumentTitle = (id: string, title: string) => {
    setDocuments((previous) => previous.map((document) =>
      document.id === id ? { ...document, title } : document,
    ))
  }

  const saveDocumentContent = async (id: string, content: string) => {
    if (sessionUser?.accountType === 'account') {
      const { document } = await documentsApi.update(id, { content })
      setDocuments((previous) => previous.map((item) =>
        item.id === id ? document : item,
      ))
      return
    }
    setDocuments((previous) => previous.map((document) =>
      document.id === id
        ? { ...document, content, updatedAt: new Date().toISOString() }
        : document,
    ))
  }

  const refreshDocument = useCallback(async (id: string) => {
    if (sessionUser?.accountType !== 'account') return
    const { document } = await documentsApi.get(id)
    setDocuments((previous) => {
      const exists = previous.some((item) => item.id === id)
      return exists
        ? previous.map((item) => item.id === id ? document : item)
        : [document, ...previous]
    })
  }, [sessionUser?.accountType])

  const changeDocumentPermission = async (id: string, permission: SharePermission) => {
    if (sessionUser?.accountType === 'account') {
      const { document } = await documentsApi.update(id, { permission })
      setDocuments((previous) => previous.map((item) => item.id === id ? document : item))
      return
    }
    setDocuments((previous) => previous.map((document) =>
      document.id === id
        ? {
            ...document,
            access: permission === 'private' ? 'private' : 'shared',
            sharePermission: permission,
            shareToken: permission === 'private'
              ? document.shareToken
              : document.shareToken ?? createShareToken(),
            updatedAt: new Date().toISOString(),
          }
        : document,
    ))
  }

  const inviteCollaborator = async (
    id: string,
    collaborator: Omit<DocumentCollaborator, 'id' | 'status'>,
  ) => {
    if (sessionUser?.accountType === 'account') {
      const { invitation } = await documentsApi.invite(
        id,
        collaborator.email,
        collaborator.permission,
      )
      setDocuments((previous) => previous.map((document) =>
        document.id === id
          ? {
              ...document,
              access: 'shared',
              collaborators: [
                ...(document.collaborators?.filter(
                  (candidate) => candidate.email !== invitation.email,
                ) ?? []),
                invitation,
              ],
            }
          : document,
      ))
      return
    }
    setDocuments((previous) => previous.map((document) => {
      if (document.id !== id) return document
      const existing = document.collaborators?.find(
        (candidate) => candidate.email.toLowerCase() === collaborator.email.toLowerCase(),
      )
      const collaborators = existing
        ? document.collaborators?.map((candidate) =>
            candidate.id === existing.id
              ? { ...candidate, permission: collaborator.permission }
              : candidate,
          )
        : [
            ...(document.collaborators ?? []),
            {
              ...collaborator,
              id: `invite-${Math.random().toString(36).slice(2, 10)}`,
              status: 'pending' as const,
            },
          ]
      return {
        ...document,
        access: 'shared',
        sharePermission: document.sharePermission === 'private' ? 'view' : document.sharePermission,
        shareToken: document.shareToken ?? createShareToken(),
        collaborators,
        updatedAt: new Date().toISOString(),
      }
    }))
  }

  const updateCollaborator = async (
    documentId: string,
    collaboratorId: string,
    permission: DocumentCollaborator['permission'],
  ) => {
    if (sessionUser?.accountType === 'account') {
      await documentsApi.updateCollaborator(documentId, collaboratorId, permission)
    }
    setDocuments((previous) => previous.map((document) =>
      document.id === documentId
        ? {
            ...document,
            collaborators: document.collaborators?.map((collaborator) =>
              collaborator.id === collaboratorId ? { ...collaborator, permission } : collaborator,
            ),
            updatedAt: new Date().toISOString(),
          }
        : document,
    ))
  }

  const removeCollaborator = async (documentId: string, collaboratorId: string) => {
    if (sessionUser?.accountType === 'account') {
      await documentsApi.removeCollaborator(documentId, collaboratorId)
    }
    setDocuments((previous) => previous.map((document) =>
      document.id === documentId
        ? {
            ...document,
            collaborators: document.collaborators?.filter(
              (collaborator) => collaborator.id !== collaboratorId,
            ),
            updatedAt: new Date().toISOString(),
          }
        : document,
    ))
  }

  const authenticate = async (
    mode: 'login' | 'register',
    values: { name: string; email: string; password: string },
  ) => {
    const response = mode === 'register'
      ? await authApi.register(values.name, values.email, values.password)
      : await authApi.login(values.email, values.password)
    localStorage.removeItem(SESSION_KEY)
    setSessionUser({ ...response.user, accountType: 'account' })
  }

  const continueAsGuest = (user: User) => {
    authApi.logout().catch(() => undefined)
    localStorage.setItem(SESSION_KEY, JSON.stringify(user))
    setSessionUser(user)
  }

  const signOut = async () => {
    if (sessionUser?.accountType === 'account') {
      await authApi.logout().catch(() => undefined)
    }
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem('syncspace_simulated_user_id')
    setSessionUser(null)
    setDocuments([])
    setPendingInvitations([])
  }

  const acceptInvitation = async (invitationId: string) => {
    const { documentId } = await invitationsApi.accept(invitationId)
    const [{ documents: updatedDocuments }, { invitations }] = await Promise.all([
      documentsApi.list(),
      invitationsApi.list(),
    ])
    setDocuments(updatedDocuments)
    setPendingInvitations(invitations)
    window.history.pushState({}, '', `/document/${documentId}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const declineInvitation = async (invitationId: string) => {
    await invitationsApi.decline(invitationId)
    setPendingInvitations((previous) =>
      previous.filter((invitation) => invitation.id !== invitationId))
  }

  if (!authReady) {
    return (
      <div className="loading-screen">
        <div className="loading-mark" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={sessionUser
            ? <Navigate to="/" replace />
            : (
              <LoginPage
                onContinueAsGuest={continueAsGuest}
                onAuthenticate={authenticate}
              />
            )}
        />
        <Route
          path="/document/:docId"
          element={sessionUser
            ? (
              <WorkspaceShell
                sessionUser={sessionUser}
                documents={documents}
                onCreateDocument={createDocument}
                onDeleteDocument={deleteDocument}
                onChangeDocumentTitle={changeDocumentTitle}
                onRenameDocument={renameDocument}
                onSaveDocumentContent={saveDocumentContent}
                onRefreshDocument={refreshDocument}
                onChangePermission={changeDocumentPermission}
                onInviteCollaborator={inviteCollaborator}
                onUpdateCollaborator={updateCollaborator}
                onRemoveCollaborator={removeCollaborator}
                onSignOut={signOut}
              />
            )
            : <Navigate to="/login" replace />}
        />
        <Route
          path="/"
          element={sessionUser
            ? (
              <Dashboard
                user={sessionUser}
                documents={documents}
                invitations={pendingInvitations}
                onCreateDocument={createDocument}
                onDeleteDocument={deleteDocument}
                onAcceptInvitation={acceptInvitation}
                onDeclineInvitation={declineInvitation}
                onSignOut={signOut}
              />
            )
            : <Navigate to="/login" replace />}
        />
        <Route path="*" element={<Navigate to={sessionUser ? '/' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

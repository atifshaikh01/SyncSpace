import { useEffect, useMemo, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import * as Y from 'yjs'
import { authApi } from '../lib/auth'
import { documentsApi } from '../lib/documents'
import {
  Bold,
  ChevronDown,
  Code,
  Eye,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Terminal,
  Undo2,
} from 'lucide-react'
import type { OnlineUser, User } from '../types'

interface CollaborativeEditorProps {
  docId: string
  currentUser: User
  title: string
  legacyContent: string
  readOnly?: boolean
  saveRequest: number
  onSaveStatusChange: (status: 'saved' | 'saving' | 'offline') => void
  onConnectionStatusChange: (status: 'connected' | 'connecting' | 'disconnected') => void
  onOnlineUsersChange: (users: OnlineUser[]) => void
  onPermissionUpdated?: () => void
  onLegacyContentMigrated?: () => void
}

export function CollaborativeEditor({
  docId,
  currentUser,
  title,
  legacyContent,
  readOnly = false,
  saveRequest,
  onSaveStatusChange,
  onConnectionStatusChange,
  onOnlineUsersChange,
  onPermissionUpdated,
  onLegacyContentMigrated,
}: CollaborativeEditorProps) {
  const resourceDestroyTimer = useRef<number | null>(null)
  const contentHydrated = useRef(false)
  const permissionUpdated = useRef(onPermissionUpdated)
  const legacyContentMigrated = useRef(onLegacyContentMigrated)

  useEffect(() => {
    permissionUpdated.current = onPermissionUpdated
  }, [onPermissionUpdated])

  useEffect(() => {
    legacyContentMigrated.current = onLegacyContentMigrated
  }, [onLegacyContentMigrated])

  const { ydoc, provider, websocket } = useMemo(() => {
    const document = new Y.Doc()
    const socket = new HocuspocusProviderWebsocket({
      url: 'ws://localhost:8080',
      autoConnect: false,
    })
    return {
      ydoc: document,
      provider: new HocuspocusProvider({
        name: docId,
        document,
        token: async () => {
          const response = currentUser.accountType === 'account'
            ? await documentsApi.collaborationToken(docId)
            : await authApi.guestCollaborationToken(currentUser.id, docId)
          return response.token
        },
        websocketProvider: socket,
      }),
      websocket: socket,
    }
  }, [docId, currentUser.accountType, currentUser.id])

  useEffect(() => {
    provider.awareness?.setLocalStateField('user', currentUser)
  }, [provider, currentUser])

  useEffect(() => {
    if (saveRequest === 0 || readOnly) return

    onSaveStatusChange('saving')
    provider.forceSync()
  }, [onSaveStatusChange, provider, readOnly, saveRequest])

  useEffect(() => {
    let currentStatus: 'connected' | 'connecting' | 'disconnected' = 'connecting'
    let providerStatusTimer: number | null = null

    const settleSaved = () => {
      if (providerStatusTimer) window.clearTimeout(providerStatusTimer)
      providerStatusTimer = window.setTimeout(() => {
        if (currentStatus === 'connected') onSaveStatusChange('saved')
      }, 900)
    }
    const handleStatus = ({ status }: { status: 'connected' | 'connecting' | 'disconnected' }) => {
      currentStatus = status
      onConnectionStatusChange(status)
      if (status === 'disconnected') {
        onSaveStatusChange('offline')
      } else if (status === 'connecting') {
        onSaveStatusChange('saving')
      } else {
        settleSaved()
      }
    }
    const handleSynced = ({ state }: { state: boolean }) => {
      if (state && currentStatus === 'connected') onSaveStatusChange('saved')
    }
    const handleDocumentUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === provider) return
      onSaveStatusChange(currentStatus === 'disconnected' ? 'offline' : 'saving')
      settleSaved()
    }
    const handleAwareness = () => {
      const users: OnlineUser[] = []
      provider.awareness?.getStates().forEach((state) => {
        if (state.user) users.push(state.user as OnlineUser)
      })
      onOnlineUsersChange(users.filter((user, index, all) =>
        all.findIndex((candidate) => candidate.id === user.id) === index,
      ))
    }
    const handleStateless = ({ payload }: { payload: string }) => {
      try {
        const data = JSON.parse(payload)
        if (data?.type === 'permission-updated') {
          permissionUpdated.current?.()
        }
      } catch {
        if (payload === 'permission-updated') {
          permissionUpdated.current?.()
        }
      }
    }
    provider.on('status', handleStatus)
    provider.on('synced', handleSynced)
    provider.on('stateless', handleStateless)
    ydoc.on('update', handleDocumentUpdate)
    provider.awareness?.on('change', handleAwareness)
    onSaveStatusChange('saving')
    handleAwareness()
    return () => {
      if (providerStatusTimer) window.clearTimeout(providerStatusTimer)
      provider.off('status', handleStatus)
      provider.off('synced', handleSynced)
      provider.off('stateless', handleStateless)
      ydoc.off('update', handleDocumentUpdate)
      provider.awareness?.off('change', handleAwareness)
    }
  }, [
    onConnectionStatusChange,
    onOnlineUsersChange,
    onSaveStatusChange,
    provider,
    ydoc,
  ])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      Collaboration.configure({ document: ydoc }),
      CollaborationCaret.configure({
        provider,
        user: { name: currentUser.name, color: currentUser.color },
      }),
    ],
    editorProps: {
      attributes: {
        class: `document-body ${readOnly ? 'is-readonly' : ''}`,
        'data-placeholder': readOnly ? '' : 'Start writing, or press "/" for commands...',
      },
    },
    onUpdate: () => {
      if (readOnly || !contentHydrated.current) return
      onSaveStatusChange('saving')
    },
    editable: !readOnly,
    immediatelyRender: false,
  }, [ydoc, provider])

  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  useEffect(() => {
    if (!editor) return

    const hydrateEmptyDocument = () => {
      const normalizedContent = legacyContent.trim()
      const hasServerContent = normalizedContent !== ''
        && normalizedContent !== '<p></p>'

      if (editor.isEmpty && hasServerContent) {
        editor.commands.setContent(legacyContent, { emitUpdate: true })
        legacyContentMigrated.current?.()
      }
    }

    if (contentHydrated.current) return

    const hydrate = () => {
      if (contentHydrated.current) return
      contentHydrated.current = true
      hydrateEmptyDocument()
    }
    provider.on('synced', hydrate)
    if (provider.synced) hydrate()
    return () => {
      provider.off('synced', hydrate)
    }
  }, [editor, legacyContent, provider])

  useEffect(() => {
    if (resourceDestroyTimer.current) {
      window.clearTimeout(resourceDestroyTimer.current)
      resourceDestroyTimer.current = null
    }
    provider.attach()
    void websocket.connect()

    return () => {
      resourceDestroyTimer.current = window.setTimeout(() => {
        provider.destroy()
        websocket.destroy()
        ydoc.destroy()
        resourceDestroyTimer.current = null
      }, 0)
    }
  }, [provider, websocket, ydoc])

  if (!editor) return null

  const toolClass = (active = false) => `toolbar-button ${active ? 'is-active' : ''}`

  return (
    <div className="editor-shell">
      <div className={`format-toolbar ${readOnly ? 'is-readonly' : ''}`}>
        {readOnly && <span className="readonly-toolbar-message"><Eye size={14} /> View only</span>}
        <div className="toolbar-group">
          <button className="toolbar-button" disabled title="Undo"><Undo2 size={16} /></button>
          <button className="toolbar-button" disabled title="Redo"><Redo2 size={16} /></button>
        </div>
        <div className="toolbar-divider" />
        <button className="style-select" disabled={readOnly} onClick={() => editor.chain().focus().setParagraph().run()}>
          Normal text <ChevronDown size={14} />
        </button>
        <div className="toolbar-divider" />
        <div className="toolbar-group">
          <button disabled={readOnly} className={toolClass(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold"><Bold size={16} /></button>
          <button disabled={readOnly} className={toolClass(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic"><Italic size={16} /></button>
          <button disabled={readOnly} className={toolClass(editor.isActive('strike'))} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough"><Strikethrough size={16} /></button>
          <button disabled={readOnly} className={toolClass(editor.isActive('code'))} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code"><Code size={16} /></button>
        </div>
        <div className="toolbar-divider" />
        <div className="toolbar-group">
          <button disabled={readOnly} className={toolClass(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list"><List size={17} /></button>
          <button disabled={readOnly} className={toolClass(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list"><ListOrdered size={17} /></button>
          <button disabled={readOnly} className={toolClass(editor.isActive('blockquote'))} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote"><Quote size={16} /></button>
        </div>
      </div>

      {!readOnly && (
        <BubbleMenu editor={editor} className="bubble-menu">
          <button className={toolClass(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={15} /></button>
          <button className={toolClass(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={15} /></button>
          <button className={toolClass(editor.isActive('heading', { level: 1 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={15} /></button>
          <button className={toolClass(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></button>
          <button className={toolClass(editor.isActive('codeBlock'))} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Terminal size={15} /></button>
        </BubbleMenu>
      )}

      <div className="page-canvas">
        <div className="page-content">
          <div className="page-kicker">SYNCSPACE / DOCUMENT</div>
          <h1 className="page-title">{title}</h1>
          <div className="page-byline">
            <span className="avatar" style={{ background: currentUser.color }}>{currentUser.name[0]}</span>
            <span>Edited by {currentUser.name}</span>
            <Minus size={12} />
            <span>Just now</span>
          </div>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}

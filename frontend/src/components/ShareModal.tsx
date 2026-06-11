import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  Copy,
  Eye,
  Link2,
  Lock,
  Mail,
  Pencil,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import type { DocumentCollaborator, DocumentMetadata, SharePermission } from '../types'

interface ShareModalProps {
  document: DocumentMetadata
  onChangePermission: (permission: SharePermission) => Promise<void>
  onInvite: (collaborator: Omit<DocumentCollaborator, 'id' | 'status'>) => Promise<void>
  onUpdateCollaborator: (
    collaboratorId: string,
    permission: DocumentCollaborator['permission'],
  ) => Promise<void>
  onRemoveCollaborator: (collaboratorId: string) => Promise<void>
  onClose: () => void
}

const options: Array<{
  value: SharePermission
  title: string
  description: string
  icon: typeof Lock
}> = [
  { value: 'private', title: 'Private', description: 'Only you can open this document.', icon: Lock },
  {
    value: 'view',
    title: 'Anyone with the link can view',
    description: 'People can read, but cannot make changes.',
    icon: Eye,
  },
  {
    value: 'edit',
    title: 'Anyone with the link can edit',
    description: 'People can read and make changes.',
    icon: Pencil,
  },
]

const avatarColors = ['#5b67d8', '#26a37b', '#ef6f5e', '#9b66c7', '#d18a3e']

const nameFromEmail = (email: string) => email
  .split('@')[0]
  .split(/[._-]+/)
  .filter(Boolean)
  .map((part) => part[0].toUpperCase() + part.slice(1))
  .join(' ')

const colorFromEmail = (email: string) => {
  const hash = [...email].reduce((total, character) => total + character.charCodeAt(0), 0)
  return avatarColors[hash % avatarColors.length]
}

export function ShareModal({
  document: sharedDocument,
  onChangePermission,
  onInvite,
  onUpdateCollaborator,
  onRemoveCollaborator,
  onClose,
}: ShareModalProps) {
  const [copied, setCopied] = useState(false)
  const [email, setEmail] = useState('')
  const [invitePermission, setInvitePermission] =
    useState<DocumentCollaborator['permission']>('view')
  const [emailError, setEmailError] = useState('')
  const [inviting, setInviting] = useState(false)
  const [permissionSaving, setPermissionSaving] = useState<SharePermission | null>(null)
  const [collaboratorSaving, setCollaboratorSaving] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const permission = sharedDocument.sharePermission
    ?? (sharedDocument.access === 'shared' ? 'view' : 'private')
  const collaborators = sharedDocument.collaborators ?? []
  const shareLink = useMemo(() => {
    if (permission === 'private' || !sharedDocument.shareToken) return ''
    const url = new URL(`/document/${sharedDocument.id}`, window.location.origin)
    url.searchParams.set('share', sharedDocument.shareToken)
    url.searchParams.set('access', permission)
    return url.toString()
  }, [permission, sharedDocument.id, sharedDocument.shareToken])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const copyLink = async () => {
    if (!shareLink) return
    try {
      await navigator.clipboard.writeText(shareLink)
    } catch {
      const input = document.createElement('textarea')
      input.value = shareLink
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
    setCopied(true)
  }

  const invite = async () => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailError('Enter a valid email address.')
      return
    }
    setInviting(true)
    try {
      await onInvite({
        email: normalizedEmail,
        name: nameFromEmail(normalizedEmail) || 'Collaborator',
        color: colorFromEmail(normalizedEmail),
        permission: invitePermission,
      })
      setEmail('')
      setEmailError('')
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : 'Unable to send invitation.')
    } finally {
      setInviting(false)
    }
  }

  const changePermission = async (nextPermission: SharePermission) => {
    setCopied(false)
    setActionError('')
    setPermissionSaving(nextPermission)
    try {
      await onChangePermission(nextPermission)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to update sharing.')
    } finally {
      setPermissionSaving(null)
    }
  }

  const updateCollaborator = async (
    collaboratorId: string,
    nextPermission: DocumentCollaborator['permission'],
  ) => {
    setActionError('')
    setCollaboratorSaving(collaboratorId)
    try {
      await onUpdateCollaborator(collaboratorId, nextPermission)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to update access.')
    } finally {
      setCollaboratorSaving(null)
    }
  }

  const removeCollaborator = async (collaboratorId: string) => {
    setActionError('')
    setCollaboratorSaving(collaboratorId)
    try {
      await onRemoveCollaborator(collaboratorId)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to remove access.')
    } finally {
      setCollaboratorSaving(null)
    }
  }

  return (
    <div className="share-modal-backdrop" onMouseDown={onClose}>
      <section
        className="share-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="share-modal-header">
          <div>
            <span className="share-modal-icon"><Users size={17} /></span>
            <div>
              <h2 id="share-modal-title">Share "{sharedDocument.title}"</h2>
              <p>Invite people or create a shareable link.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close share dialog"><X size={17} /></button>
        </header>

        <div className="invite-section">
          <div className="invite-heading">
            <span><UserPlus size={13} /> Invite people</span>
            <small>Invites appear in the recipient's account</small>
          </div>
          <div className={`invite-control ${emailError ? 'has-error' : ''}`}>
            <span><Mail size={15} /></span>
            <input
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                if (emailError) setEmailError('')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void invite()
              }}
              placeholder="name@company.com"
              aria-label="Collaborator email"
            />
            <label className="invite-role">
              <select
                value={invitePermission}
                onChange={(event) =>
                  setInvitePermission(event.target.value as DocumentCollaborator['permission'])}
                aria-label="Invite permission"
              >
                <option value="view">Can view</option>
                <option value="edit">Can edit</option>
              </select>
              <ChevronDown size={12} />
            </label>
            <button onClick={() => void invite()} disabled={!email.trim() || inviting}>
              {inviting ? 'Sending' : 'Invite'}
            </button>
          </div>
          {emailError && <p className="invite-error">{emailError}</p>}
        </div>

        {collaborators.length > 0 && (
          <div className="people-section">
            <div className="people-heading">
              <span>People with access</span>
              <small>{collaborators.length} invited</small>
            </div>
            <div className="people-list">
              {collaborators.map((collaborator) => (
                <div className="person-row" key={collaborator.id}>
                  <span className="avatar" style={{ background: collaborator.color }}>
                    {collaborator.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}
                  </span>
                  <div>
                    <strong>{collaborator.name}</strong>
                    <small>{collaborator.email} · {collaborator.status}</small>
                  </div>
                  <label className="person-role">
                    <select
                      value={collaborator.permission}
                      disabled={collaboratorSaving === collaborator.id}
                      onChange={(event) => void updateCollaborator(
                        collaborator.id,
                        event.target.value as DocumentCollaborator['permission'],
                      )}
                      aria-label={`Permission for ${collaborator.email}`}
                    >
                      <option value="view">Can view</option>
                      <option value="edit">Can edit</option>
                    </select>
                    <ChevronDown size={11} />
                  </label>
                  <button
                    className="remove-person"
                    disabled={collaboratorSaving === collaborator.id}
                    onClick={() => void removeCollaborator(collaborator.id)}
                    aria-label={`Remove ${collaborator.email}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="share-access-heading">
          <span>General access</span>
          <small><ShieldCheck size={12} /> Changes save automatically</small>
        </div>
        {actionError && <p className="share-action-error">{actionError}</p>}

        <div className="share-options" role="radiogroup" aria-label="Document access">
          {options.map((option) => {
            const Icon = option.icon
            const selected = permission === option.value
            return (
              <button
                key={option.value}
                className={selected ? 'is-selected' : ''}
                role="radio"
                aria-checked={selected}
                disabled={permissionSaving !== null}
                onClick={() => void changePermission(option.value)}
              >
                <span className="share-option-icon"><Icon size={17} /></span>
                <span><strong>{option.title}</strong><small>{option.description}</small></span>
                <span className="share-option-check">
                  {permissionSaving === option.value ? '...' : selected && <Check size={14} />}
                </span>
              </button>
            )
          })}
        </div>

        <div className={`share-link-section ${permission === 'private' ? 'is-disabled' : ''}`}>
          <div className="share-link-heading">
            <span><Link2 size={13} /> Share link</span>
            <small>
              {permission === 'private'
                ? 'Choose view or edit access to enable a link'
                : shareLink ? 'Anyone with this link gets the selected access' : 'Link unavailable'}
            </small>
          </div>
          <div className="share-link-control">
            <input
              value={shareLink}
              placeholder="Link sharing is disabled"
              readOnly
              aria-label="Share link"
              onFocus={(event) => event.currentTarget.select()}
            />
            <button onClick={copyLink} disabled={!shareLink}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </div>

        <footer className="share-modal-footer">
          <div>
            {permission === 'private' ? <Lock size={13} /> : <Users size={13} />}
            <span>
              {permission === 'private'
                ? 'This document is private'
                : `Link access is set to ${permission}`}
            </span>
          </div>
          <button onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>
  )
}

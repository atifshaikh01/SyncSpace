export interface User {
  id: string
  name: string
  color: string
  avatar?: string
  email?: string
  accountType?: 'account' | 'guest'
}

export interface OnlineUser {
  id: string
  name: string
  color: string
}

export type SharePermission = 'private' | 'view' | 'edit'

export interface DocumentCollaborator {
  id: string
  email: string
  name: string
  color: string
  permission: Exclude<SharePermission, 'private'>
  status: 'pending' | 'active'
}

export interface PendingInvitation {
  id: string
  documentId: string
  documentTitle: string
  permission: Exclude<SharePermission, 'private'>
  invitedBy: string
  createdAt: string
}

export interface DocumentMetadata {
  id: string
  title: string
  updatedAt: string
  createdAt: string
  access?: 'private' | 'shared'
  sharePermission?: SharePermission
  shareToken?: string
  sharedBy?: string
  collaborators?: DocumentCollaborator[]
  ownedByCurrentUser?: boolean
  legacyContent?: string
}

export interface CommentAuthor {
  id: string
  name: string
  color: string
}

export interface CommentReply {
  id: string
  author: CommentAuthor
  content: string
  createdAt: string
  updatedAt: string
}

export interface DocumentComment {
  id: string
  documentId: string
  author: CommentAuthor
  content: string
  createdAt: string
  updatedAt: string
  resolved: boolean
  resolvedBy: CommentAuthor | null
  resolvedAt: string | null
  replies: CommentReply[]
}

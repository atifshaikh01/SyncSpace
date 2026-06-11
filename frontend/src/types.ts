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
  content?: string
}

export interface Comment {
  id: string
  documentId: string
  authorName: string
  authorColor: string
  content: string
  createdAt: string
  resolved: boolean
}

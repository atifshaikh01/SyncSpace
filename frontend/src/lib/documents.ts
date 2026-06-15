import type {
  DocumentCollaborator,
  DocumentComment,
  DocumentMetadata,
  PendingInvitation,
  SharePermission,
} from '../types'

export type DocumentListView = 'all' | 'recent' | 'shared' | 'private' | 'owned'

type DocumentListOptions = {
  view?: DocumentListView
  search?: string
  limit?: number
}

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(body?.message || 'Unable to update the workspace.')
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const documentsApi = {
  list: (options: DocumentListOptions = {}) => {
    const query = new URLSearchParams()
    if (options.view && options.view !== 'all') query.set('view', options.view)
    if (options.search?.trim()) query.set('search', options.search.trim())
    if (options.limit) query.set('limit', String(options.limit))
    const suffix = query.size ? `?${query.toString()}` : ''
    return request<{ documents: DocumentMetadata[]; view: DocumentListView }>(
      `/api/documents${suffix}`,
    )
  },
  get: (id: string) =>
    request<{ document: DocumentMetadata }>(`/api/documents/${id}`),
  create: (title = 'Untitled document') =>
    request<{ document: DocumentMetadata }>('/api/documents', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  collaborationToken: (id: string) =>
    request<{ token: string }>(`/api/documents/${id}/collaboration-token`, {
      method: 'POST',
    }),
  update: (
    id: string,
    values: { title?: string; permission?: SharePermission },
  ) =>
    request<{ document: DocumentMetadata }>(`/api/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(values),
    }),
  remove: (id: string) => request<void>(`/api/documents/${id}`, { method: 'DELETE' }),
  invite: (id: string, email: string, permission: DocumentCollaborator['permission']) =>
    request<{ invitation: DocumentCollaborator }>(`/api/documents/${id}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ email, permission }),
    }),
  updateCollaborator: (
    documentId: string,
    collaboratorId: string,
    permission: DocumentCollaborator['permission'],
  ) => request<void>(`/api/documents/${documentId}/collaborators/${collaboratorId}`, {
    method: 'PATCH',
    body: JSON.stringify({ permission }),
  }),
  removeCollaborator: (documentId: string, collaboratorId: string) =>
    request<void>(`/api/documents/${documentId}/collaborators/${collaboratorId}`, {
      method: 'DELETE',
    }),
}

export const invitationsApi = {
  list: () => request<{ invitations: PendingInvitation[] }>('/api/invitations'),
  accept: (id: string) =>
    request<{ documentId: string }>(`/api/invitations/${id}/accept`, { method: 'POST' }),
  decline: (id: string) =>
    request<void>(`/api/invitations/${id}/decline`, { method: 'POST' }),
}

export const commentsApi = {
  list: (documentId: string, status: 'all' | 'open' | 'resolved' = 'all') =>
    request<{ comments: DocumentComment[] }>(
      `/api/documents/${documentId}/comments?status=${status}`,
    ),
  create: (documentId: string, content: string) =>
    request<{ comment: DocumentComment }>(`/api/documents/${documentId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  reply: (documentId: string, commentId: string, content: string) =>
    request<{ comment: DocumentComment }>(
      `/api/documents/${documentId}/comments/${commentId}/replies`,
      {
        method: 'POST',
        body: JSON.stringify({ content }),
      },
    ),
  setResolved: (documentId: string, commentId: string, resolved: boolean) =>
    request<{ comment: DocumentComment }>(
      `/api/documents/${documentId}/comments/${commentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ resolved }),
      },
    ),
  remove: (documentId: string, commentId: string) =>
    request<void>(`/api/documents/${documentId}/comments/${commentId}`, {
      method: 'DELETE',
    }),
  removeReply: (documentId: string, commentId: string, replyId: string) =>
    request<void>(
      `/api/documents/${documentId}/comments/${commentId}/replies/${replyId}`,
      { method: 'DELETE' },
    ),
}

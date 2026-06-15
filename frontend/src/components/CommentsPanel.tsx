import { useEffect, useState } from 'react'
import {
  Check,
  MessageSquare,
  Reply,
  RotateCcw,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { commentsApi } from '../lib/documents'
import type { DocumentComment, User } from '../types'

interface CommentsPanelProps {
  documentId: string
  currentUser: User
  canModerate: boolean
  onClose: () => void
  onOpenCountChange: (count: number) => void
}

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}).format(new Date(value))

export function CommentsPanel({
  documentId,
  currentUser,
  canModerate,
  onClose,
  onOpenCountChange,
}: CommentsPanelProps) {
  const [comments, setComments] = useState<DocumentComment[]>([])
  const [filter, setFilter] = useState<'open' | 'resolved'>('open')
  const [draft, setDraft] = useState('')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    commentsApi.list(documentId)
      .then(({ comments: loaded }) => {
        if (!active) return
        setComments(loaded)
        onOpenCountChange(loaded.filter((comment) => !comment.resolved).length)
      })
      .catch((loadError) => {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : 'Unable to load comments.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [documentId, onOpenCountChange])

  const replaceComment = (updated: DocumentComment) => {
    setComments((current) => {
      const next = current.map((comment) => comment.id === updated.id ? updated : comment)
      onOpenCountChange(next.filter((comment) => !comment.resolved).length)
      return next
    })
  }

  const createComment = async () => {
    const content = draft.trim()
    if (!content) return
    setBusyId('new')
    setError('')
    try {
      const { comment } = await commentsApi.create(documentId, content)
      setComments((current) => {
        const next = [comment, ...current]
        onOpenCountChange(next.filter((item) => !item.resolved).length)
        return next
      })
      setDraft('')
      setFilter('open')
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to add comment.')
    } finally {
      setBusyId(null)
    }
  }

  const addReply = async (commentId: string) => {
    const content = replyDrafts[commentId]?.trim()
    if (!content) return
    setBusyId(commentId)
    setError('')
    try {
      const { comment } = await commentsApi.reply(documentId, commentId, content)
      replaceComment(comment)
      setReplyDrafts((current) => ({ ...current, [commentId]: '' }))
      setReplyingTo(null)
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : 'Unable to add reply.')
    } finally {
      setBusyId(null)
    }
  }

  const setResolved = async (comment: DocumentComment, resolved: boolean) => {
    setBusyId(comment.id)
    setError('')
    try {
      const { comment: updated } = await commentsApi.setResolved(
        documentId,
        comment.id,
        resolved,
      )
      replaceComment(updated)
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : 'Unable to update comment.')
    } finally {
      setBusyId(null)
    }
  }

  const removeComment = async (comment: DocumentComment) => {
    if (!window.confirm('Delete this comment thread?')) return
    setBusyId(comment.id)
    setError('')
    try {
      await commentsApi.remove(documentId, comment.id)
      setComments((current) => {
        const next = current.filter((item) => item.id !== comment.id)
        onOpenCountChange(next.filter((item) => !item.resolved).length)
        return next
      })
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Unable to delete comment.')
    } finally {
      setBusyId(null)
    }
  }

  const removeReply = async (commentId: string, replyId: string) => {
    setBusyId(replyId)
    setError('')
    try {
      await commentsApi.removeReply(documentId, commentId, replyId)
      setComments((current) => current.map((comment) =>
        comment.id === commentId
          ? { ...comment, replies: comment.replies.filter((reply) => reply.id !== replyId) }
          : comment,
      ))
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Unable to delete reply.')
    } finally {
      setBusyId(null)
    }
  }

  const visibleComments = comments.filter((comment) =>
    filter === 'open' ? !comment.resolved : comment.resolved)

  return (
    <aside className="comments-panel" aria-label="Document comments">
      <header className="comments-panel-header">
        <div>
          <MessageSquare size={16} />
          <strong>Comments</strong>
          <span>{comments.filter((comment) => !comment.resolved).length}</span>
        </div>
        <button onClick={onClose} aria-label="Close comments"><X size={17} /></button>
      </header>

      <div className="comments-filter">
        <button
          className={filter === 'open' ? 'is-active' : ''}
          onClick={() => setFilter('open')}
        >
          Open
        </button>
        <button
          className={filter === 'resolved' ? 'is-active' : ''}
          onClick={() => setFilter('resolved')}
        >
          Resolved
        </button>
      </div>

      <div className="new-comment">
        <span className="avatar" style={{ background: currentUser.color }}>
          {currentUser.name[0]}
        </span>
        <div>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a comment..."
            rows={3}
          />
          <button
            onClick={() => void createComment()}
            disabled={!draft.trim() || busyId === 'new'}
          >
            <Send size={13} /> Comment
          </button>
        </div>
      </div>

      {error && <p className="comments-error">{error}</p>}

      <div className="comments-list">
        {loading ? (
          <p className="comments-empty">Loading comments...</p>
        ) : visibleComments.length === 0 ? (
          <div className="comments-empty">
            <MessageSquare size={20} />
            <strong>{filter === 'open' ? 'No open comments' : 'No resolved comments'}</strong>
            <span>
              {filter === 'open'
                ? 'Start a conversation about this document.'
                : 'Resolved threads will appear here.'}
            </span>
          </div>
        ) : visibleComments.map((comment) => {
          const canResolve = canModerate || comment.author.id === currentUser.id
          const canDelete = currentUser.id === comment.author.id || canModerate
          return (
            <article className={`comment-thread ${comment.resolved ? 'is-resolved' : ''}`} key={comment.id}>
              <div className="comment-author">
                <span className="avatar" style={{ background: comment.author.color }}>
                  {comment.author.name[0]}
                </span>
                <div>
                  <strong>{comment.author.name}</strong>
                  <small>{formatDate(comment.createdAt)}</small>
                </div>
                <div className="comment-actions">
                  {canResolve && (
                    <button
                      onClick={() => void setResolved(comment, !comment.resolved)}
                      disabled={busyId === comment.id}
                      title={comment.resolved ? 'Reopen comment' : 'Resolve comment'}
                    >
                      {comment.resolved ? <RotateCcw size={13} /> : <Check size={13} />}
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => void removeComment(comment)}
                      disabled={busyId === comment.id}
                      title="Delete comment"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
              <p>{comment.content}</p>

              {comment.replies.length > 0 && (
                <div className="comment-replies">
                  {comment.replies.map((reply) => (
                    <div className="comment-reply" key={reply.id}>
                      <span className="avatar" style={{ background: reply.author.color }}>
                        {reply.author.name[0]}
                      </span>
                      <div>
                        <strong>{reply.author.name}</strong>
                        <small>{formatDate(reply.createdAt)}</small>
                        <p>{reply.content}</p>
                      </div>
                      {(canModerate || reply.author.id === currentUser.id) && (
                        <button
                          onClick={() => void removeReply(comment.id, reply.id)}
                          disabled={busyId === reply.id}
                          aria-label="Delete reply"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!comment.resolved && (
                replyingTo === comment.id ? (
                  <div className="reply-composer">
                    <textarea
                      value={replyDrafts[comment.id] || ''}
                      onChange={(event) => setReplyDrafts((current) => ({
                        ...current,
                        [comment.id]: event.target.value,
                      }))}
                      placeholder="Write a reply..."
                      rows={2}
                      autoFocus
                    />
                    <div>
                      <button onClick={() => setReplyingTo(null)}>Cancel</button>
                      <button
                        onClick={() => void addReply(comment.id)}
                        disabled={!replyDrafts[comment.id]?.trim() || busyId === comment.id}
                      >
                        Reply
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="reply-button" onClick={() => setReplyingTo(comment.id)}>
                    <Reply size={12} /> Reply
                  </button>
                )
              )}
            </article>
          )
        })}
      </div>
    </aside>
  )
}

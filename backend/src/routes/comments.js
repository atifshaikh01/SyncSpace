import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/requireAuth.js';
import { Comment } from '../models/Comment.js';
import { Document } from '../models/Document.js';
import { DocumentMember } from '../models/DocumentMember.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const validId = (value) => mongoose.isValidObjectId(value);

const getAccess = async (documentId, userId) => {
    if (!validId(documentId)) return null;
    const [document, membership] = await Promise.all([
        Document.findOne({ _id: documentId, archivedAt: null }),
        DocumentMember.findOne({ documentId, userId }),
    ]);
    if (!document || !membership) return null;
    return { document, membership };
};

const authorView = (user) => ({
    id: user._id.toString(),
    name: user.name,
    color: user.color,
});

const serializeComment = (comment) => ({
    id: comment._id.toString(),
    documentId: comment.documentId.toString(),
    author: authorView(comment.authorId),
    content: comment.content,
    resolved: comment.resolved,
    resolvedBy: comment.resolvedBy ? authorView(comment.resolvedBy) : null,
    resolvedAt: comment.resolvedAt?.toISOString() || null,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    replies: comment.replies.map((reply) => ({
        id: reply._id.toString(),
        author: authorView(reply.authorId),
        content: reply.content,
        createdAt: reply.createdAt.toISOString(),
        updatedAt: reply.updatedAt.toISOString(),
    })),
});

const populateComment = (query) => query
    .populate('authorId')
    .populate('resolvedBy')
    .populate('replies.authorId');

const normalizedContent = (value) => String(value || '').trim().slice(0, 5000);

router.get('/', async (request, response) => {
    const access = await getAccess(request.params.documentId, request.user._id);
    if (!access) return response.status(404).json({ message: 'Document not found.' });

    const status = String(request.query.status || 'all');
    if (!['all', 'open', 'resolved'].includes(status)) {
        return response.status(400).json({ message: 'Invalid comment status.' });
    }
    const filter = { documentId: access.document._id };
    if (status === 'open') filter.resolved = false;
    if (status === 'resolved') filter.resolved = true;

    const comments = await populateComment(Comment.find(filter).sort({ createdAt: -1 }));
    return response.json({ comments: comments.map(serializeComment) });
});

router.post('/', async (request, response) => {
    const access = await getAccess(request.params.documentId, request.user._id);
    if (!access) return response.status(404).json({ message: 'Document not found.' });

    const content = normalizedContent(request.body?.content);
    if (!content) return response.status(400).json({ message: 'Comment cannot be empty.' });

    const created = await Comment.create({
        documentId: access.document._id,
        authorId: request.user._id,
        content,
    });
    const comment = await populateComment(Comment.findById(created._id));
    return response.status(201).json({ comment: serializeComment(comment) });
});

router.post('/:commentId/replies', async (request, response) => {
    const access = await getAccess(request.params.documentId, request.user._id);
    if (!access) return response.status(404).json({ message: 'Document not found.' });
    if (!validId(request.params.commentId)) {
        return response.status(400).json({ message: 'Invalid comment ID.' });
    }

    const content = normalizedContent(request.body?.content);
    if (!content) return response.status(400).json({ message: 'Reply cannot be empty.' });

    const comment = await Comment.findOne({
        _id: request.params.commentId,
        documentId: access.document._id,
    });
    if (!comment) return response.status(404).json({ message: 'Comment not found.' });

    comment.replies.push({ authorId: request.user._id, content });
    await comment.save();
    const populated = await populateComment(Comment.findById(comment._id));
    return response.status(201).json({ comment: serializeComment(populated) });
});

router.patch('/:commentId', async (request, response) => {
    const access = await getAccess(request.params.documentId, request.user._id);
    if (!access) return response.status(404).json({ message: 'Document not found.' });
    if (!validId(request.params.commentId)) {
        return response.status(400).json({ message: 'Invalid comment ID.' });
    }

    const comment = await Comment.findOne({
        _id: request.params.commentId,
        documentId: access.document._id,
    });
    if (!comment) return response.status(404).json({ message: 'Comment not found.' });

    const canResolve = access.membership.role !== 'viewer'
        || comment.authorId.toString() === request.user._id.toString();
    if (typeof request.body?.resolved !== 'boolean') {
        return response.status(400).json({ message: 'Resolved status is required.' });
    }
    if (!canResolve) {
        return response.status(403).json({ message: 'You cannot resolve this comment.' });
    }

    comment.resolved = request.body.resolved;
    comment.resolvedBy = request.body.resolved ? request.user._id : null;
    comment.resolvedAt = request.body.resolved ? new Date() : null;
    await comment.save();
    const populated = await populateComment(Comment.findById(comment._id));
    return response.json({ comment: serializeComment(populated) });
});

router.delete('/:commentId', async (request, response) => {
    const access = await getAccess(request.params.documentId, request.user._id);
    if (!access) return response.status(404).json({ message: 'Document not found.' });
    if (!validId(request.params.commentId)) {
        return response.status(400).json({ message: 'Invalid comment ID.' });
    }

    const comment = await Comment.findOne({
        _id: request.params.commentId,
        documentId: access.document._id,
    });
    if (!comment) return response.status(404).json({ message: 'Comment not found.' });
    const canDelete = access.membership.role === 'owner'
        || comment.authorId.toString() === request.user._id.toString();
    if (!canDelete) {
        return response.status(403).json({ message: 'You cannot delete this comment.' });
    }

    await comment.deleteOne();
    return response.status(204).send();
});

router.delete('/:commentId/replies/:replyId', async (request, response) => {
    const access = await getAccess(request.params.documentId, request.user._id);
    if (!access) return response.status(404).json({ message: 'Document not found.' });
    if (!validId(request.params.commentId) || !validId(request.params.replyId)) {
        return response.status(400).json({ message: 'Invalid comment ID.' });
    }

    const comment = await Comment.findOne({
        _id: request.params.commentId,
        documentId: access.document._id,
    });
    if (!comment) return response.status(404).json({ message: 'Comment not found.' });
    const reply = comment.replies.id(request.params.replyId);
    if (!reply) return response.status(404).json({ message: 'Reply not found.' });
    const canDelete = access.membership.role === 'owner'
        || reply.authorId.toString() === request.user._id.toString();
    if (!canDelete) {
        return response.status(403).json({ message: 'You cannot delete this reply.' });
    }

    reply.deleteOne();
    await comment.save();
    return response.status(204).send();
});

export default router;

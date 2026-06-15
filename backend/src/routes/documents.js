import { Router } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { createCollaborationToken } from '../auth.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { Document } from '../models/Document.js';
import { DocumentMember } from '../models/DocumentMember.js';
import { DocumentState } from '../models/DocumentState.js';
import { Invitation } from '../models/Invitation.js';
import { User } from '../models/User.js';
import { Comment } from '../models/Comment.js';

const router = Router();
router.use(requireAuth);

const documentViews = new Set(['all', 'recent', 'shared', 'private', 'owned']);

const getActiveDocument = (request, documentId) => {
    const server = request.app.get('hocuspocus');
    const documents = server?.hocuspocus?.documents ?? server?.documents;
    return documents?.get(documentId.toString()) ?? null;
};

const updateActiveMemberAccess = (request, documentId, userId, role) => {
    const activeDocument = getActiveDocument(request, documentId);
    if (!activeDocument) return;

    activeDocument.getConnections()
        .filter((connection) =>
            connection.context.collaboration?.userId === userId.toString())
        .forEach((connection) => {
            connection.context.collaboration.role = role;
            connection.readOnly = role === 'viewer';
            connection.sendStateless(JSON.stringify({
                type: 'permission-updated',
                role,
            }));
        });
};

const closeActiveMemberConnections = (request, documentId, userId) => {
    const activeDocument = getActiveDocument(request, documentId);
    if (!activeDocument) return;

    activeDocument.getConnections()
        .filter((connection) =>
            connection.context.collaboration?.userId === userId.toString())
        .forEach((connection) => connection.close());
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseLimit = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return 50;
    return Math.min(Math.max(parsed, 1), 100);
};

const validateDocumentId = (request, response) => {
    if (mongoose.isValidObjectId(request.params.documentId)) return true;
    response.status(400).json({ message: 'Invalid document ID.' });
    return false;
};

const getDocumentAccess = async (documentId, userId) => {
    const membership = await DocumentMember.findOne({ documentId, userId });
    if (!membership) return null;

    const document = await Document.findOne({ _id: documentId, archivedAt: null });
    if (!document) return null;
    return { document, membership };
};

const collaboratorView = (record, status) => ({
    id: record._id.toString(),
    email: record.email,
    name: record.name,
    color: record.color,
    permission: record.role === 'editor' ? 'edit' : 'view',
    status,
});

const serializeDocuments = async (documents, currentUserId) => {
    const documentIds = documents.map((document) => document._id);
    const [members, invitations] = await Promise.all([
        DocumentMember.find({ documentId: { $in: documentIds } }).populate('userId'),
        Invitation.find({
            documentId: { $in: documentIds },
            status: 'pending',
        }),
    ]);

    return documents.map((document) => {
        const owner = document.ownerId.toString() === currentUserId;
        const membership = members.find(
            (member) =>
                member.documentId.toString() === document._id.toString()
                && member.userId?._id.toString() === currentUserId,
        );
        const activeCollaborators = members
            .filter(
                (member) =>
                    member.documentId.toString() === document._id.toString()
                    && member.role !== 'owner'
                    && member.userId,
            )
            .map((member) => collaboratorView({
                _id: member._id,
                email: member.userId.email,
                name: member.userId.name,
                color: member.userId.color,
                role: member.role,
            }, 'active'));
        const pendingCollaborators = invitations
            .filter((invitation) => invitation.documentId.toString() === document._id.toString())
            .map((invitation) => collaboratorView({
                _id: invitation._id,
                email: invitation.email,
                name: invitation.email.split('@')[0],
                color: '#7b83d7',
                role: invitation.role,
            }, 'pending'));

        return {
            id: document._id.toString(),
            title: document.title,
            legacyContent: document.content || undefined,
            createdAt: document.createdAt.toISOString(),
            updatedAt: document.updatedAt.toISOString(),
            access: owner ? document.visibility : 'shared',
            sharePermission: owner
                ? document.linkPermission
                : membership?.role === 'editor' ? 'edit' : 'view',
            sharedBy: owner ? undefined : 'Workspace member',
            collaborators: owner ? [...activeCollaborators, ...pendingCollaborators] : [],
            ownedByCurrentUser: owner,
        };
    });
};

router.get('/', async (request, response) => {
    const view = String(request.query.view || 'all').toLowerCase();
    if (!documentViews.has(view)) {
        return response.status(400).json({
            message: 'View must be one of: all, recent, shared, private, or owned.',
        });
    }

    const membershipFilter = { userId: request.user._id };
    if (view === 'shared') membershipFilter.role = { $ne: 'owner' };
    if (view === 'private' || view === 'owned') membershipFilter.role = 'owner';

    const memberships = await DocumentMember.find(membershipFilter);
    const memberDocumentIds = memberships.map((member) => member.documentId);
    const documentFilter = {
        _id: { $in: memberDocumentIds },
        archivedAt: null,
    };
    if (view === 'private') documentFilter.visibility = 'private';

    const search = String(request.query.search || '').trim().slice(0, 100);
    if (search) documentFilter.title = { $regex: escapeRegex(search), $options: 'i' };

    const sort = view === 'recent'
        ? { lastOpenedAt: -1, updatedAt: -1 }
        : { updatedAt: -1 };
    const documents = await Document.find(documentFilter)
        .sort(sort)
        .limit(parseLimit(request.query.limit));

    return response.json({
        documents: await serializeDocuments(documents, request.user._id.toString()),
        view,
    });
});

router.post('/', async (request, response) => {
    const title = String(request.body?.title || 'Untitled document').trim().slice(0, 200)
        || 'Untitled document';
    const document = await Document.create({
        title,
        ownerId: request.user._id,
    });
    try {
        await DocumentMember.create({
            documentId: document._id,
            userId: request.user._id,
            role: 'owner',
            addedBy: request.user._id,
        });
    } catch (error) {
        await Document.deleteOne({ _id: document._id });
        throw error;
    }

    const [serialized] = await serializeDocuments([document], request.user._id.toString());
    return response.status(201).json({ document: serialized });
});

router.post('/:documentId/collaboration-token', async (request, response) => {
    if (!validateDocumentId(request, response)) return;

    const access = await getDocumentAccess(request.params.documentId, request.user._id);
    if (!access) return response.status(404).json({ message: 'Document not found.' });

    return response.json({
        token: createCollaborationToken({
            userId: request.user._id.toString(),
            documentId: access.document._id.toString(),
            role: access.membership.role,
        }),
    });
});

router.get('/:documentId', async (request, response) => {
    if (!validateDocumentId(request, response)) return;

    const access = await getDocumentAccess(request.params.documentId, request.user._id);
    if (!access) return response.status(404).json({ message: 'Document not found.' });

    access.document.lastOpenedAt = new Date();
    await access.document.save({ timestamps: false });

    const [serialized] = await serializeDocuments(
        [access.document],
        request.user._id.toString(),
    );
    return response.json({ document: serialized });
});

router.patch('/:documentId', async (request, response) => {
    if (!validateDocumentId(request, response)) return;

    const access = await getDocumentAccess(request.params.documentId, request.user._id);
    if (!access) return response.status(404).json({ message: 'Document not found.' });

    const { document, membership } = access;
    const isOwner = membership.role === 'owner';
    const canEdit = isOwner || membership.role === 'editor';

    if (typeof request.body?.title === 'string') {
        if (!canEdit) {
            return response.status(403).json({ message: 'You cannot rename this document.' });
        }
        const title = request.body.title.trim();
        if (!title) return response.status(400).json({ message: 'Title cannot be empty.' });
        document.title = title.slice(0, 200);
    }
    if (request.body?.content !== undefined) {
        if (!canEdit) {
            return response.status(403).json({ message: 'You cannot edit this document.' });
        }
        return response.status(400).json({
            message: 'Document content is persisted through collaboration sync.',
        });
    }
    if (request.body?.permission !== undefined) {
        if (!isOwner) {
            return response.status(403).json({ message: 'Only the owner can change sharing.' });
        }
        if (!['private', 'view', 'edit'].includes(request.body.permission)) {
            return response.status(400).json({ message: 'Invalid sharing permission.' });
        }
        document.linkPermission = request.body.permission;
        document.visibility = request.body.permission === 'private' ? 'private' : 'shared';
    }
    await document.save();

    if (request.body?.permission !== undefined) {
        const hocuspocusServer = request.app.get('hocuspocus');
        if (hocuspocusServer) {
            const activeDoc = hocuspocusServer.hocuspocus.documents.get(document._id.toString());
            if (activeDoc) {
                activeDoc.broadcastStateless(JSON.stringify({
                    type: 'permission-updated',
                }));
            }
        }
    }

    const [serialized] = await serializeDocuments([document], request.user._id.toString());
    return response.json({ document: serialized });
});

router.delete('/:documentId', async (request, response) => {
    if (!validateDocumentId(request, response)) return;

    const access = await getDocumentAccess(request.params.documentId, request.user._id);
    if (!access) return response.status(404).json({ message: 'Document not found.' });
    if (access.membership.role !== 'owner') {
        return response.status(403).json({ message: 'Only the owner can delete this document.' });
    }

    const document = await Document.findOneAndDelete({
        _id: request.params.documentId,
        ownerId: request.user._id,
    });

    const activeDocument = getActiveDocument(request, document._id);
    activeDocument?.getConnections().forEach((connection) => connection.close());

    await Promise.all([
        DocumentMember.deleteMany({ documentId: document._id }),
        Invitation.deleteMany({ documentId: document._id }),
        DocumentState.deleteMany({
            $or: [{ documentId: document._id }, { documentName: document._id.toString() }],
        }),
        Comment.deleteMany({ documentId: document._id }),
    ]);
    return response.status(204).send();
});

router.post('/:documentId/invitations', async (request, response) => {
    if (!validateDocumentId(request, response)) return;

    const document = await Document.findOne({
        _id: request.params.documentId,
        ownerId: request.user._id,
        archivedAt: null,
    });
    if (!document) return response.status(404).json({ message: 'Document not found.' });

    const email = String(request.body?.email || '').trim().toLowerCase();
    const permission = request.body?.permission === 'edit' ? 'edit' : 'view';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return response.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (email === request.user.email) {
        return response.status(400).json({ message: 'You already own this document.' });
    }

    const invitedUser = await User.findOne({ email });
    const role = permission === 'edit' ? 'editor' : 'viewer';
    if (invitedUser) {
        const existingMember = await DocumentMember.findOne({
            documentId: document._id,
            userId: invitedUser._id,
        });
        if (existingMember) {
            existingMember.role = role;
            await existingMember.save();
            updateActiveMemberAccess(request, document._id, existingMember.userId, role);
        }
    }

    await Invitation.updateMany(
        { documentId: document._id, email, status: 'pending' },
        { status: 'revoked' },
    );
    const rawToken = crypto.randomBytes(32).toString('hex');
    const invitation = await Invitation.create({
        documentId: document._id,
        invitedBy: request.user._id,
        email,
        role,
        tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    document.visibility = 'shared';
    await document.save();

    return response.status(201).json({
        invitation: {
            id: invitation._id.toString(),
            email,
            name: invitedUser?.name || email.split('@')[0],
            color: invitedUser?.color || '#7b83d7',
            permission,
            status: 'pending',
        },
    });
});

router.patch('/:documentId/collaborators/:collaboratorId', async (request, response) => {
    if (!validateDocumentId(request, response)) return;

    const document = await Document.findOne({
        _id: request.params.documentId,
        ownerId: request.user._id,
    });
    if (!document) return response.status(404).json({ message: 'Document not found.' });
    const role = request.body?.permission === 'edit' ? 'editor' : 'viewer';

    const invitation = await Invitation.findOne({
        _id: request.params.collaboratorId,
        documentId: document._id,
        status: 'pending',
    });
    if (invitation) {
        invitation.role = role;
        await invitation.save();

        const hocuspocusServer = request.app.get('hocuspocus');
        if (hocuspocusServer) {
            const activeDoc = hocuspocusServer.hocuspocus.documents.get(document._id.toString());
            if (activeDoc) {
                activeDoc.broadcastStateless(JSON.stringify({
                    type: 'permission-updated',
                    collaboratorId: request.params.collaboratorId,
                    role,
                }));
            }
        }
        return response.json({ ok: true });
    }

    const member = await DocumentMember.findOne({
        _id: request.params.collaboratorId,
        documentId: document._id,
        role: { $ne: 'owner' },
    });
    if (!member) return response.status(404).json({ message: 'Collaborator not found.' });
    member.role = role;
    await member.save();
    updateActiveMemberAccess(request, document._id, member.userId, role);

    const hocuspocusServer = request.app.get('hocuspocus');
    if (hocuspocusServer) {
        const activeDoc = hocuspocusServer.hocuspocus.documents.get(document._id.toString());
        if (activeDoc) {
            activeDoc.broadcastStateless(JSON.stringify({
                type: 'permission-updated',
                collaboratorId: request.params.collaboratorId,
                role,
            }));
        }
    }
    return response.json({ ok: true });
});

router.delete('/:documentId/collaborators/:collaboratorId', async (request, response) => {
    if (!validateDocumentId(request, response)) return;

    const document = await Document.findOne({
        _id: request.params.documentId,
        ownerId: request.user._id,
    });
    if (!document) return response.status(404).json({ message: 'Document not found.' });

    const invitation = await Invitation.findOneAndUpdate({
        _id: request.params.collaboratorId,
        documentId: document._id,
        status: 'pending',
    }, { status: 'revoked' });
    let removedMember = null;
    if (!invitation) {
        removedMember = await DocumentMember.findOneAndDelete({
            _id: request.params.collaboratorId,
            documentId: document._id,
            role: { $ne: 'owner' },
        });
    }
    if (removedMember) {
        closeActiveMemberConnections(request, document._id, removedMember.userId);
    }

    const hocuspocusServer = request.app.get('hocuspocus');
    if (hocuspocusServer) {
        const activeDoc = hocuspocusServer.hocuspocus.documents.get(document._id.toString());
        if (activeDoc) {
            activeDoc.broadcastStateless(JSON.stringify({
                type: 'permission-updated',
                collaboratorId: request.params.collaboratorId,
                action: 'removed',
            }));
        }
    }
    return response.status(204).send();
});

export default router;

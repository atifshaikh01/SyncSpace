import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { DocumentMember } from '../models/DocumentMember.js';
import { Invitation } from '../models/Invitation.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (request, response) => {
    const invitations = await Invitation.find({
        email: request.user.email,
        status: 'pending',
        expiresAt: { $gt: new Date() },
    }).populate('documentId').populate('invitedBy');

    return response.json({
        invitations: invitations
            .filter((invitation) => invitation.documentId)
            .map((invitation) => ({
                id: invitation._id.toString(),
                documentId: invitation.documentId._id.toString(),
                documentTitle: invitation.documentId.title,
                permission: invitation.role === 'editor' ? 'edit' : 'view',
                invitedBy: invitation.invitedBy?.name || 'A SyncSpace user',
                createdAt: invitation.createdAt.toISOString(),
            })),
    });
});

router.post('/:invitationId/accept', async (request, response) => {
    const invitation = await Invitation.findOne({
        _id: request.params.invitationId,
        email: request.user.email,
        status: 'pending',
        expiresAt: { $gt: new Date() },
    });
    if (!invitation) return response.status(404).json({ message: 'Invitation not found.' });

    await DocumentMember.findOneAndUpdate(
        { documentId: invitation.documentId, userId: request.user._id },
        {
            role: invitation.role,
            addedBy: invitation.invitedBy,
        },
        { upsert: true, new: true },
    );
    invitation.status = 'accepted';
    invitation.acceptedBy = request.user._id;
    invitation.acceptedAt = new Date();
    await invitation.save();
    return response.json({ documentId: invitation.documentId.toString() });
});

router.post('/:invitationId/decline', async (request, response) => {
    const invitation = await Invitation.findOneAndUpdate({
        _id: request.params.invitationId,
        email: request.user.email,
        status: 'pending',
    }, { status: 'revoked' });
    if (!invitation) return response.status(404).json({ message: 'Invitation not found.' });
    return response.status(204).send();
});

export default router;

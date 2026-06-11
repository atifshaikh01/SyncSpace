import mongoose, { Schema } from 'mongoose';

const InvitationSchema = new Schema({
    documentId: {
        type: Schema.Types.ObjectId,
        ref: 'Document',
        required: true,
        index: true,
    },
    invitedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    acceptedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    role: {
        type: String,
        enum: ['editor', 'viewer'],
        required: true,
    },
    tokenHash: {
        type: String,
        required: true,
        unique: true,
        select: false,
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'revoked', 'expired'],
        default: 'pending',
        required: true,
        index: true,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 },
    },
    acceptedAt: {
        type: Date,
        default: null,
    },
}, { timestamps: true });

InvitationSchema.index({ documentId: 1, email: 1, status: 1 });

export const Invitation = mongoose.model('Invitation', InvitationSchema);
export default Invitation;

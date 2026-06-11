import mongoose, { Schema } from 'mongoose';

const ShareLinkSchema = new Schema({
    documentId: {
        type: Schema.Types.ObjectId,
        ref: 'Document',
        required: true,
        index: true,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    tokenHash: {
        type: String,
        required: true,
        unique: true,
        select: false,
    },
    permission: {
        type: String,
        enum: ['view', 'edit'],
        required: true,
    },
    active: {
        type: Boolean,
        default: true,
        required: true,
        index: true,
    },
    expiresAt: {
        type: Date,
        default: null,
        index: true,
    },
    revokedAt: {
        type: Date,
        default: null,
    },
}, { timestamps: true });

ShareLinkSchema.index({ documentId: 1, active: 1 });

export const ShareLink = mongoose.model('ShareLink', ShareLinkSchema);
export default ShareLink;

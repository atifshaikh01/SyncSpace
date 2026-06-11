import mongoose, { Schema } from 'mongoose';

const DocumentSchema = new Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200,
        default: 'Untitled document',
    },
    content: {
        type: String,
        default: '',
        maxlength: 1_000_000,
    },
    ownerId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    visibility: {
        type: String,
        enum: ['private', 'shared'],
        default: 'private',
        required: true,
        index: true,
    },
    linkPermission: {
        type: String,
        enum: ['private', 'view', 'edit'],
        default: 'private',
        required: true,
    },
    archivedAt: {
        type: Date,
        default: null,
        index: true,
    },
    lastOpenedAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
}, { timestamps: true });

DocumentSchema.index({ ownerId: 1, archivedAt: 1, updatedAt: -1 });
DocumentSchema.index({ title: 'text' });

export const Document = mongoose.model('Document', DocumentSchema);
export default Document;

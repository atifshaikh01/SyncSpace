import mongoose, { Schema } from 'mongoose';

const DocumentMemberSchema = new Schema({
    documentId: {
        type: Schema.Types.ObjectId,
        ref: 'Document',
        required: true,
        index: true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    role: {
        type: String,
        enum: ['owner', 'editor', 'viewer'],
        required: true,
    },
    addedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, { timestamps: true });

DocumentMemberSchema.index({ documentId: 1, userId: 1 }, { unique: true });
DocumentMemberSchema.index({ userId: 1, role: 1, updatedAt: -1 });

export const DocumentMember = mongoose.model('DocumentMember', DocumentMemberSchema);
export default DocumentMember;

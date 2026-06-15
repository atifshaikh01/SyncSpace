import mongoose, { Schema } from 'mongoose';

const CommentReplySchema = new Schema({
    authorId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 5000,
    },
}, { timestamps: true });

const CommentSchema = new Schema({
    documentId: {
        type: Schema.Types.ObjectId,
        ref: 'Document',
        required: true,
        index: true,
    },
    authorId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 5000,
    },
    resolved: {
        type: Boolean,
        default: false,
        required: true,
        index: true,
    },
    resolvedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    resolvedAt: {
        type: Date,
        default: null,
    },
    replies: {
        type: [CommentReplySchema],
        default: [],
    },
}, { timestamps: true });

CommentSchema.index({ documentId: 1, resolved: 1, createdAt: -1 });

export const Comment = mongoose.model('Comment', CommentSchema);
export default Comment;

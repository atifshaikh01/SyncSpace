import mongoose, { Schema } from 'mongoose';
const DocumentStateSchema = new Schema({
    documentId: {
        type: Schema.Types.ObjectId,
        ref: 'Document',
        default: null,
        index: true,
    },
    documentName: { type: String, required: true, unique: true, index: true },
    state: { type: Buffer, required: true },
}, { timestamps: true });
export const DocumentState = mongoose.model('DocumentState', DocumentStateSchema);
export default DocumentState;
//# sourceMappingURL=DocumentState.js.map

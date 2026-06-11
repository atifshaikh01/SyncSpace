import mongoose from 'mongoose';
import type { Document } from 'mongoose';
export interface IDocumentState extends Document {
    documentName: string;
    state: Buffer;
    createdAt: Date;
    updatedAt: Date;
}
export declare const DocumentState: mongoose.Model<IDocumentState, {}, {}, {}, mongoose.Document<unknown, {}, IDocumentState, {}, mongoose.DefaultSchemaOptions> & IDocumentState & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IDocumentState>;
export default DocumentState;
//# sourceMappingURL=DocumentState.d.ts.map
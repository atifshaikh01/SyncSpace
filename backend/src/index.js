import { Server } from '@hocuspocus/server';
import * as Y from 'yjs';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import { verifyCollaborationToken } from './auth.js';
import { connectDB } from './config/db.js';
import { Document } from './models/Document.js';
import { DocumentMember } from './models/DocumentMember.js';
import { DocumentState } from './models/DocumentState.js';
import { User } from './models/User.js';
import './models/index.js';
import authRouter from './routes/auth.js';
import documentsRouter from './routes/documents.js';
import invitationsRouter from './routes/invitations.js';

dotenv.config();
await connectDB();

const app = express();
const authPort = parseInt(process.env.AUTH_PORT || '3001', 10);
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((origin) => origin.trim());

const denyCollaboration = (reason) => {
    const error = new Error(reason);
    error.reason = reason;
    return error;
};

const getAccountCollaborationAccess = async (documentId, userId) => {
    const [document, membership, user] = await Promise.all([
        Document.findOne({ _id: documentId, archivedAt: null }),
        DocumentMember.findOne({ documentId, userId }),
        User.findById(userId),
    ]);
    if (!document || !membership || !user) return null;
    return { document, membership, user };
};

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origin is not allowed by CORS'));
    },
    credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
app.use('/api/auth', authRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/invitations', invitationsRouter);
app.use((error, _request, response, _next) => {
    console.error('HTTP API error:', error);
    response.status(500).json({ message: 'Unexpected server error.' });
});

app.listen(authPort, () => {
    console.log(`Authentication API is running on port ${authPort}`);
});

const hocuspocusServer = new Server({
    port: parseInt(process.env.HOCUSPOCUS_PORT || process.env.PORT || '8080', 10),
    async onAuthenticate(data) {
        let payload;
        try {
            payload = verifyCollaborationToken(data.token);
        } catch {
            throw denyCollaboration('authentication-required');
        }

        if (payload.documentId !== data.documentName) {
            throw denyCollaboration('document-token-mismatch');
        }

        if (payload.guest) {
            if (!String(payload.sub).startsWith('guest-')
                || !data.documentName.startsWith('doc-')) {
                throw denyCollaboration('invalid-guest-session');
            }
            return {
                collaboration: {
                    guest: true,
                    userId: payload.sub,
                    documentId: data.documentName,
                    role: 'editor',
                },
            };
        }

        const access = await getAccountCollaborationAccess(data.documentName, payload.sub);
        if (!access) {
            throw denyCollaboration('document-access-denied');
        }

        data.connectionConfig.readOnly = access.membership.role === 'viewer';
        return {
            collaboration: {
                guest: false,
                userId: access.user._id.toString(),
                documentId: access.document._id.toString(),
                role: access.membership.role,
            },
        };
    },
    async onLoadDocument(data) {
        try {
            console.log(`Loading document state: "${data.documentName}"`);
            const docState = await DocumentState.findOne({ documentName: data.documentName });
            if (!docState) {
                console.log('No saved state found. Starting a new document.');
                return null;
            }

            const document = new Y.Doc();
            Y.applyUpdate(document, new Uint8Array(docState.state));
            console.log(`Loaded saved state (${docState.state.length} bytes).`);
            return document;
        } catch (error) {
            console.error(`Error loading document "${data.documentName}":`, error);
            throw error;
        }
    },
    async onStoreDocument(data) {
        try {
            const bufferState = Buffer.from(Y.encodeStateAsUpdate(data.document));
            await DocumentState.findOneAndUpdate(
                { documentName: data.documentName },
                {
                    documentId: mongoose.isValidObjectId(data.documentName)
                        ? data.documentName
                        : null,
                    state: bufferState,
                    updatedAt: new Date(),
                },
                { upsert: true, new: true },
            );
            if (mongoose.isValidObjectId(data.documentName)) {
                await Document.updateOne(
                    { _id: data.documentName },
                    { $unset: { content: 1 } },
                );
            }
            console.log(`Stored document "${data.documentName}" (${bufferState.length} bytes).`);
        } catch (error) {
            console.error(`Error storing document "${data.documentName}":`, error);
            throw error;
        }
    },
});

app.set('hocuspocus', hocuspocusServer);

hocuspocusServer.listen().then(() => {
    console.log(
        `Hocuspocus WebSocket server is running on port ${hocuspocusServer.configuration.port}`,
    );
}).catch((error) => {
    console.error('Failed to start Hocuspocus WebSocket server:', error);
});

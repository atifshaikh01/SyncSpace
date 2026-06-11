import { Server } from '@hocuspocus/server';
import { connectDB } from './config/db.js';
import { DocumentState } from './models/DocumentState.js';
import './models/index.js';
import * as Y from 'yjs';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth.js';
import documentsRouter from './routes/documents.js';
import invitationsRouter from './routes/invitations.js';
// Load environment variables
dotenv.config();
// Connect to MongoDB
await connectDB();

const app = express();
const authPort = parseInt(process.env.AUTH_PORT || '3001', 10);
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((origin) => origin.trim());

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

// Configure and start Hocuspocus server
const hocuspocusServer = new Server({
    port: parseInt(process.env.HOCUSPOCUS_PORT || process.env.PORT || '8080', 10),
    // Authenticate user socket connections
    async onAuthenticate(data) {
        const { token } = data;
        // In production, decode JWT and verify authorization
        // For now, we accept mock tokens from our frontend simulator
        if (!token) {
            console.warn('⚠️ Connection rejected: Authentication token missing.');
            throw new Error('Authentication required');
        }
        // In a real database, we would query the user's name & metadata.
        // The provider awareness will also sync their cursor details.
        return {
            token,
            user: {
                id: 'user-' + Math.random().toString(36).substring(2, 7),
                name: 'Guest Editor'
            }
        };
    },
    // Load document binary state from MongoDB
    async onLoadDocument(data) {
        try {
            console.log(`📂 Loading document state: "${data.documentName}"`);
            const docState = await DocumentState.findOne({ documentName: data.documentName });
            if (docState) {
                console.log(`  └─ Found saved state (${docState.state.length} bytes). Loading...`);
                return docState.state; // Return the Buffer
            }
            console.log(`  └─ No saved state found. Starting new document.`);
            return null;
        }
        catch (error) {
            console.error(`❌ Error loading document "${data.documentName}":`, error);
            throw error;
        }
    },
    // Persist binary state to MongoDB on changes
    async onStoreDocument(data) {
        try {
            console.log(`💾 Storing document state: "${data.documentName}"`);
            // Serialize the Yjs document state as a binary update vector
            const documentUpdate = Y.encodeStateAsUpdate(data.document);
            const bufferState = Buffer.from(documentUpdate);
            await DocumentState.findOneAndUpdate({ documentName: data.documentName }, {
                state: bufferState,
                updatedAt: new Date()
            }, { upsert: true, new: true });
            console.log(`  └─ Saved successfully (${bufferState.length} bytes).`);
        }
        catch (error) {
            console.error(`❌ Error storing document "${data.documentName}":`, error);
        }
    }
});
// Listen and log status
hocuspocusServer.listen().then(() => {
    console.log(`🚀 Hocuspocus WebSocket Server is running on port: ${hocuspocusServer.configuration.port}`);
}).catch((error) => {
    console.error('❌ Failed to start Hocuspocus Server:', error);
});
//# sourceMappingURL=index.js.map

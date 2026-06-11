import { spawn } from 'node:child_process';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { Document } from '../src/models/Document.js';
import { DocumentMember } from '../src/models/DocumentMember.js';
import { Invitation } from '../src/models/Invitation.js';
import { User } from '../src/models/User.js';

const baseUrl = 'http://127.0.0.1:3002';
const suffix = Date.now().toString(36);
const emailA = `invite-owner-${suffix}@example.com`;
const emailB = `invite-recipient-${suffix}@example.com`;
const password = 'TestPassword123!';

const server = spawn(process.execPath, ['src/index.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
        ...process.env,
        AUTH_PORT: '3002',
        HOCUSPOCUS_PORT: '8081',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
});

const waitForHealth = async () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
            const response = await fetch(`${baseUrl}/api/health`);
            if (response.ok) return;
        } catch {
            // Server is still starting.
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error('Backend did not become healthy.');
};

const request = async (path, cookie, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(cookie ? { Cookie: cookie } : {}),
            ...options.headers,
        },
    });
    const body = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(`${path}: ${body?.message || response.status}`);
    return {
        body,
        cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie,
    };
};

try {
    await waitForHealth();
    const accountA = await request('/api/auth/register', '', {
        method: 'POST',
        body: JSON.stringify({ name: 'Invite Owner', email: emailA, password }),
    });
    const accountB = await request('/api/auth/register', '', {
        method: 'POST',
        body: JSON.stringify({ name: 'Invite Recipient', email: emailB, password }),
    });
    const created = await request('/api/documents', accountA.cookie, {
        method: 'POST',
        body: JSON.stringify({ title: 'Invitation integration test' }),
    });
    await request(`/api/documents/${created.body.document.id}/invitations`, accountA.cookie, {
        method: 'POST',
        body: JSON.stringify({ email: emailB, permission: 'edit' }),
    });
    const pending = await request('/api/invitations', accountB.cookie);
    if (pending.body.invitations.length !== 1) {
        throw new Error(`Expected 1 pending invitation, received ${pending.body.invitations.length}.`);
    }
    const accepted = await request(
        `/api/invitations/${pending.body.invitations[0].id}/accept`,
        accountB.cookie,
        { method: 'POST' },
    );
    const recipientDocuments = await request('/api/documents', accountB.cookie);
    const sharedDocument = recipientDocuments.body.documents.find(
        (document) => document.id === accepted.body.documentId,
    );
    if (!sharedDocument || sharedDocument.sharePermission !== 'edit') {
        throw new Error('Accepted document did not appear with edit permission.');
    }
    console.log('Invitation flow passed: pending invite appeared and accepted document was shared.');
} finally {
    await connectDB();
    const users = await User.find({ email: { $in: [emailA, emailB] } });
    const userIds = users.map((user) => user._id);
    const documents = await Document.find({ ownerId: { $in: userIds } });
    const documentIds = documents.map((document) => document._id);
    await Promise.all([
        Invitation.deleteMany({ documentId: { $in: documentIds } }),
        DocumentMember.deleteMany({
            $or: [{ documentId: { $in: documentIds } }, { userId: { $in: userIds } }],
        }),
        Document.deleteMany({ _id: { $in: documentIds } }),
        User.deleteMany({ _id: { $in: userIds } }),
    ]);
    await mongoose.disconnect();
    server.kill();
}

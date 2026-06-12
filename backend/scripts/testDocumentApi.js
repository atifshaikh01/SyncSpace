import { spawn } from 'node:child_process';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { Document } from '../src/models/Document.js';
import { DocumentMember } from '../src/models/DocumentMember.js';
import { DocumentState } from '../src/models/DocumentState.js';
import { Invitation } from '../src/models/Invitation.js';
import { User } from '../src/models/User.js';

const baseUrl = 'http://127.0.0.1:3003';
const suffix = Date.now().toString(36);
const password = 'TestPassword123!';
const accounts = {
    owner: `document-owner-${suffix}@example.com`,
    editor: `document-editor-${suffix}@example.com`,
    viewer: `document-viewer-${suffix}@example.com`,
    outsider: `document-outsider-${suffix}@example.com`,
};

const server = spawn(process.execPath, ['src/index.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
        ...process.env,
        AUTH_PORT: '3003',
        HOCUSPOCUS_PORT: '8082',
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

const request = async (path, cookie, options = {}, expectedStatus) => {
    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(cookie ? { Cookie: cookie } : {}),
            ...options.headers,
        },
    });
    const body = response.status === 204 ? null : await response.json();
    if (expectedStatus && response.status !== expectedStatus) {
        throw new Error(
            `${path}: expected ${expectedStatus}, received ${response.status} `
            + `(${body?.message || 'no message'})`,
        );
    }
    if (!expectedStatus && !response.ok) {
        throw new Error(`${path}: ${body?.message || response.status}`);
    }
    return {
        body,
        status: response.status,
        cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie,
    };
};

const register = async (name, email) => request('/api/auth/register', '', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
});

const acceptInvitation = async (cookie) => {
    const pending = await request('/api/invitations', cookie);
    if (pending.body.invitations.length !== 1) {
        throw new Error(`Expected one pending invitation, got ${pending.body.invitations.length}.`);
    }
    await request(
        `/api/invitations/${pending.body.invitations[0].id}/accept`,
        cookie,
        { method: 'POST' },
    );
};

try {
    await waitForHealth();
    const owner = await register('Document Owner', accounts.owner);
    const editor = await register('Document Editor', accounts.editor);
    const viewer = await register('Document Viewer', accounts.viewer);
    const outsider = await register('Document Outsider', accounts.outsider);

    const shared = await request('/api/documents', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ title: `Project Atlas ${suffix}` }),
    });
    const privateDocument = await request('/api/documents', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ title: `Private Notes ${suffix}` }),
    });
    const sharedId = shared.body.document.id;
    const privateId = privateDocument.body.document.id;

    await request(`/api/documents/${sharedId}/invitations`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ email: accounts.editor, permission: 'edit' }),
    });
    await acceptInvitation(editor.cookie);

    await request(`/api/documents/${sharedId}/invitations`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ email: accounts.viewer, permission: 'view' }),
    });
    await acceptInvitation(viewer.cookie);

    const editorShared = await request('/api/documents?view=shared', editor.cookie);
    if (editorShared.body.documents.length !== 1
        || editorShared.body.documents[0].id !== sharedId) {
        throw new Error('Shared view did not return the editor document.');
    }

    const ownerPrivate = await request('/api/documents?view=private', owner.cookie);
    if (ownerPrivate.body.documents.length !== 1
        || ownerPrivate.body.documents[0].id !== privateId) {
        throw new Error('Private view did not return only the private owner document.');
    }

    const searched = await request(
        `/api/documents?view=owned&search=${encodeURIComponent(`atlas ${suffix}`)}`,
        owner.cookie,
    );
    if (searched.body.documents.length !== 1 || searched.body.documents[0].id !== sharedId) {
        throw new Error('Owned document search did not match case-insensitively.');
    }

    const opened = await request(`/api/documents/${sharedId}`, editor.cookie);
    if (opened.body.document.sharePermission !== 'edit') {
        throw new Error('Single document response did not preserve editor permission.');
    }

    const renamed = await request(`/api/documents/${sharedId}`, editor.cookie, {
        method: 'PATCH',
        body: JSON.stringify({ title: `Atlas Renamed ${suffix}` }),
    });
    if (renamed.body.document.title !== `Atlas Renamed ${suffix}`) {
        throw new Error('Editor could not rename the shared document.');
    }

    await request(`/api/documents/${sharedId}`, editor.cookie, {
        method: 'PATCH',
        body: JSON.stringify({ content: '<p>REST content writes are disabled.</p>' }),
    }, 400);

    await request(`/api/documents/${sharedId}`, viewer.cookie, {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Viewer rename should fail' }),
    }, 403);
    await request(`/api/documents/${sharedId}`, viewer.cookie, {
        method: 'PATCH',
        body: JSON.stringify({ content: '<p>Viewer write should fail.</p>' }),
    }, 403);
    await request(`/api/documents/${sharedId}`, editor.cookie, {
        method: 'PATCH',
        body: JSON.stringify({ permission: 'private' }),
    }, 403);
    await request(`/api/documents/${sharedId}`, outsider.cookie, {}, 404);
    await request('/api/documents/not-an-object-id', owner.cookie, {}, 400);
    await request(`/api/documents/${sharedId}`, editor.cookie, { method: 'DELETE' }, 403);
    await request(`/api/documents/${sharedId}`, owner.cookie, { method: 'DELETE' }, 204);
    await request(`/api/documents/${sharedId}`, owner.cookie, {}, 404);

    console.log('Document API passed: views, search, access, rename, and delete are enforced.');
} finally {
    await connectDB();
    const users = await User.find({ email: { $in: Object.values(accounts) } });
    const userIds = users.map((user) => user._id);
    const documents = await Document.find({ ownerId: { $in: userIds } });
    const documentIds = documents.map((document) => document._id);
    await Promise.all([
        Invitation.deleteMany({
            $or: [{ documentId: { $in: documentIds } }, { email: { $in: Object.values(accounts) } }],
        }),
        DocumentMember.deleteMany({
            $or: [{ documentId: { $in: documentIds } }, { userId: { $in: userIds } }],
        }),
        DocumentState.deleteMany({
            $or: [
                { documentId: { $in: documentIds } },
                { documentName: { $in: documentIds.map((id) => id.toString()) } },
            ],
        }),
        Document.deleteMany({ _id: { $in: documentIds } }),
        User.deleteMany({ _id: { $in: userIds } }),
    ]);
    await mongoose.disconnect();
    server.kill();
}

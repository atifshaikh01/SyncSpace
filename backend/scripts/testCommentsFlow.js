import { spawn } from 'node:child_process';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { Comment } from '../src/models/Comment.js';
import { Document } from '../src/models/Document.js';
import { DocumentMember } from '../src/models/DocumentMember.js';
import { Invitation } from '../src/models/Invitation.js';
import { User } from '../src/models/User.js';

const baseUrl = 'http://127.0.0.1:3006';
const suffix = Date.now().toString(36);
const password = 'TestPassword123!';
const accounts = {
    owner: `comment-owner-${suffix}@example.com`,
    editor: `comment-editor-${suffix}@example.com`,
    viewer: `comment-viewer-${suffix}@example.com`,
    outsider: `comment-outsider-${suffix}@example.com`,
};

const server = spawn(process.execPath, ['src/index.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, AUTH_PORT: '3006', HOCUSPOCUS_PORT: '8085' },
    stdio: ['ignore', 'pipe', 'pipe'],
});

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const waitForHealth = async () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
            const response = await fetch(`${baseUrl}/api/health`);
            if (response.ok) return;
        } catch {
            // Server is still starting.
        }
        await wait(300);
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
        throw new Error(`${path}: expected ${expectedStatus}, received ${response.status}`);
    }
    if (!expectedStatus && !response.ok) {
        throw new Error(`${path}: ${body?.message || response.status}`);
    }
    return {
        body,
        cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie,
    };
};

const register = (name, email) => request('/api/auth/register', '', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
});

const acceptInvitation = async (cookie) => {
    const pending = await request('/api/invitations', cookie);
    await request(`/api/invitations/${pending.body.invitations[0].id}/accept`, cookie, {
        method: 'POST',
    });
};

try {
    await waitForHealth();
    const owner = await register('Comment Owner', accounts.owner);
    const editor = await register('Comment Editor', accounts.editor);
    const viewer = await register('Comment Viewer', accounts.viewer);
    const outsider = await register('Comment Outsider', accounts.outsider);

    const created = await request('/api/documents', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ title: `Comment test ${suffix}` }),
    });
    const documentId = created.body.document.id;

    await request(`/api/documents/${documentId}/invitations`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ email: accounts.editor, permission: 'edit' }),
    });
    await acceptInvitation(editor.cookie);
    await request(`/api/documents/${documentId}/invitations`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ email: accounts.viewer, permission: 'view' }),
    });
    await acceptInvitation(viewer.cookie);

    const createdComment = await request(
        `/api/documents/${documentId}/comments`,
        viewer.cookie,
        {
            method: 'POST',
            body: JSON.stringify({ content: 'Viewer feedback' }),
        },
    );
    const commentId = createdComment.body.comment.id;
    if (createdComment.body.comment.author.name !== 'Comment Viewer') {
        throw new Error('Viewer comment author was not serialized.');
    }

    const replied = await request(
        `/api/documents/${documentId}/comments/${commentId}/replies`,
        editor.cookie,
        {
            method: 'POST',
            body: JSON.stringify({ content: 'Editor response' }),
        },
    );
    if (replied.body.comment.replies.length !== 1) {
        throw new Error('Editor reply was not added.');
    }

    await request(`/api/documents/${documentId}/comments`, outsider.cookie, {}, 404);
    await request(
        `/api/documents/${documentId}/comments/${commentId}`,
        editor.cookie,
        {
            method: 'PATCH',
            body: JSON.stringify({ resolved: true }),
        },
    );
    const resolved = await request(
        `/api/documents/${documentId}/comments?status=resolved`,
        viewer.cookie,
    );
    if (resolved.body.comments.length !== 1 || !resolved.body.comments[0].resolved) {
        throw new Error('Resolved comment was not returned.');
    }

    await request(
        `/api/documents/${documentId}/comments/${commentId}`,
        owner.cookie,
        { method: 'DELETE' },
        204,
    );
    const remaining = await request(`/api/documents/${documentId}/comments`, owner.cookie);
    if (remaining.body.comments.length !== 0) {
        throw new Error('Owner could not moderate the comment thread.');
    }

    console.log('Comments flow passed: create, reply, resolve, filter, and moderation work.');
} finally {
    await connectDB();
    const users = await User.find({ email: { $in: Object.values(accounts) } });
    const userIds = users.map((user) => user._id);
    const documents = await Document.find({ ownerId: { $in: userIds } });
    const documentIds = documents.map((document) => document._id);
    await Promise.all([
        Comment.deleteMany({ documentId: { $in: documentIds } }),
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

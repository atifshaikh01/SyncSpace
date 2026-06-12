import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { Document } from '../src/models/Document.js';
import { DocumentMember } from '../src/models/DocumentMember.js';
import { DocumentState } from '../src/models/DocumentState.js';
import { Invitation } from '../src/models/Invitation.js';
import { User } from '../src/models/User.js';

const frontendRequire = createRequire(new URL('../../frontend/package.json', import.meta.url));
const {
    HocuspocusProvider,
    HocuspocusProviderWebsocket,
} = frontendRequire('@hocuspocus/provider');
const Y = frontendRequire('yjs');

const baseUrl = 'http://127.0.0.1:3004';
const websocketUrl = 'ws://127.0.0.1:8083';
const suffix = Date.now().toString(36);
const password = 'TestPassword123!';
const accounts = {
    owner: `collab-owner-${suffix}@example.com`,
    editor: `collab-editor-${suffix}@example.com`,
    viewer: `collab-viewer-${suffix}@example.com`,
    outsider: `collab-outsider-${suffix}@example.com`,
};

const server = spawn(process.execPath, ['src/index.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
        ...process.env,
        AUTH_PORT: '3004',
        HOCUSPOCUS_PORT: '8083',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
});

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const waitUntil = async (predicate, message, attempts = 80) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (await predicate()) return;
        await wait(100);
    }
    throw new Error(message);
};

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
        status: response.status,
        cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie,
    };
};

const register = (name, email) => request('/api/auth/register', '', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
});

const acceptInvitation = async (cookie) => {
    const pending = await request('/api/invitations', cookie);
    await request(
        `/api/invitations/${pending.body.invitations[0].id}/accept`,
        cookie,
        { method: 'POST' },
    );
};

const connect = (documentName, token) => new Promise((resolve, reject) => {
    const document = new Y.Doc();
    const websocket = new HocuspocusProviderWebsocket({
        url: websocketUrl,
        autoConnect: false,
    });
    const provider = new HocuspocusProvider({
        name: documentName,
        document,
        token,
        websocketProvider: websocket,
    });
    const timeout = setTimeout(() => {
        provider.destroy();
        websocket.destroy();
        reject(new Error(`Timed out connecting to ${documentName}`));
    }, 8000);

    let scope;
    provider.on('authenticated', (event) => {
        scope = event.scope;
    });
    provider.on('synced', ({ state }) => {
        if (!state || !scope) return;
        clearTimeout(timeout);
        resolve({ document, provider, scope, websocket });
    });
    provider.on('authenticationFailed', ({ reason }) => {
        clearTimeout(timeout);
        provider.destroy();
        websocket.destroy();
        reject(new Error(reason));
    });
    provider.attach();
    websocket.connect().catch(reject);
});

const expectRejectedConnection = async (documentName, token, reason) => {
    try {
        await connect(documentName, token);
        throw new Error(`Expected connection rejection: ${reason}`);
    } catch (error) {
        if (error.message !== reason) throw error;
    }
};

let activeConnections = [];

try {
    await waitForHealth();
    await connectDB();
    const owner = await register('Collaboration Owner', accounts.owner);
    const editor = await register('Collaboration Editor', accounts.editor);
    const viewer = await register('Collaboration Viewer', accounts.viewer);
    const outsider = await register('Collaboration Outsider', accounts.outsider);

    const created = await request('/api/documents', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ title: `Secured collaboration ${suffix}` }),
    });
    const otherDocument = await request('/api/documents', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ title: `Other collaboration ${suffix}` }),
    });
    const persistenceDocument = await request('/api/documents', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ title: `Yjs persistence ${suffix}` }),
    });
    const documentId = created.body.document.id;
    const persistenceDocumentId = persistenceDocument.body.document.id;
    const legacyHtml = `<h2>Legacy migration ${suffix}</h2><p>Move me into Yjs.</p>`;
    await Document.updateOne({ _id: persistenceDocumentId }, { content: legacyHtml });

    await request(`/api/documents/${documentId}/invitations`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ email: accounts.editor, permission: 'edit' }),
    });
    await request(`/api/documents/${documentId}/invitations`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ email: accounts.viewer, permission: 'view' }),
    });
    await acceptInvitation(editor.cookie);
    await acceptInvitation(viewer.cookie);

    const ownerToken = await request(
        `/api/documents/${documentId}/collaboration-token`,
        owner.cookie,
        { method: 'POST' },
    );
    const editorToken = await request(
        `/api/documents/${documentId}/collaboration-token`,
        editor.cookie,
        { method: 'POST' },
    );
    const viewerToken = await request(
        `/api/documents/${documentId}/collaboration-token`,
        viewer.cookie,
        { method: 'POST' },
    );
    await request(
        `/api/documents/${documentId}/collaboration-token`,
        outsider.cookie,
        { method: 'POST' },
        404,
    );

    const ownerConnection = await connect(documentId, ownerToken.body.token);
    const editorConnection = await connect(documentId, editorToken.body.token);
    const viewerConnection = await connect(documentId, viewerToken.body.token);
    activeConnections = [ownerConnection, editorConnection, viewerConnection];

    if (ownerConnection.scope !== 'read-write' || editorConnection.scope !== 'read-write') {
        throw new Error('Owner and editor sockets must be read-write.');
    }
    if (viewerConnection.scope !== 'readonly') {
        throw new Error('Viewer socket must be readonly.');
    }

    const persistenceToken = await request(
        `/api/documents/${persistenceDocumentId}/collaboration-token`,
        owner.cookie,
        { method: 'POST' },
    );
    const legacyView = await request(
        `/api/documents/${persistenceDocumentId}`,
        owner.cookie,
    );
    if (legacyView.body.document.legacyContent !== legacyHtml) {
        throw new Error('Legacy HTML was not exposed for one-time migration.');
    }
    const persistenceConnection = await connect(
        persistenceDocumentId,
        persistenceToken.body.token,
    );
    const fragment = persistenceConnection.document.getXmlFragment('default');
    const heading = new Y.XmlElement('heading');
    heading.setAttribute('level', '2');
    heading.insert(0, [new Y.XmlText(`Legacy migration ${suffix}`)]);
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText('Move me into Yjs.')]);
    fragment.insert(0, [heading, paragraph]);

    await waitUntil(
        async () => Boolean(await DocumentState.findOne({
            documentName: persistenceDocumentId,
        })),
        'Yjs document state was not persisted.',
    );
    await waitUntil(
        async () => {
            const storedDocument = await Document.findById(persistenceDocumentId).lean();
            return storedDocument && storedDocument.content === undefined;
        },
        'Legacy HTML content was not removed after Yjs persistence.',
    );
    const migratedView = await request(
        `/api/documents/${persistenceDocumentId}`,
        owner.cookie,
    );
    if (migratedView.body.document.legacyContent !== undefined) {
        throw new Error('REST API still exposed legacy HTML after Yjs migration.');
    }
    persistenceConnection.provider.destroy();
    persistenceConnection.websocket.destroy();
    await wait(300);

    const reconnectToken = await request(
        `/api/documents/${persistenceDocumentId}/collaboration-token`,
        owner.cookie,
        { method: 'POST' },
    );
    const reconnectedOwner = await connect(
        persistenceDocumentId,
        reconnectToken.body.token,
    );
    activeConnections.push(reconnectedOwner);
    const restoredContent = reconnectedOwner.document.getXmlFragment('default').toString();
    if (!restoredContent.includes(`Legacy migration ${suffix}`)
        || !restoredContent.includes('Move me into Yjs.')) {
        throw new Error('Fresh Yjs connection did not restore persisted document content.');
    }

    await expectRejectedConnection(documentId, 'invalid-token', 'authentication-required');
    await expectRejectedConnection(
        otherDocument.body.document.id,
        ownerToken.body.token,
        'document-token-mismatch',
    );

    const guestId = `guest-${crypto.randomUUID()}`;
    const guestDocumentId = `doc-${crypto.randomUUID()}`;
    const guestToken = await request('/api/auth/guest-collaboration-token', '', {
        method: 'POST',
        body: JSON.stringify({ userId: guestId, documentId: guestDocumentId }),
    });
    const guestConnection = await connect(guestDocumentId, guestToken.body.token);
    activeConnections.push(guestConnection);
    if (guestConnection.scope !== 'read-write') {
        throw new Error('Guest collaboration socket must be read-write.');
    }
    await expectRejectedConnection(
        `doc-${crypto.randomUUID()}`,
        guestToken.body.token,
        'document-token-mismatch',
    );

    const ownerView = await request(`/api/documents/${documentId}`, owner.cookie);
    const editorCollaborator = ownerView.body.document.collaborators.find(
        (collaborator) => collaborator.email === accounts.editor,
    );
    if (!editorCollaborator) throw new Error('Editor collaborator was not found.');

    const permissionUpdate = new Promise((resolve, reject) => {
        const timeout = setTimeout(
            () => reject(new Error('Editor did not receive permission update.')),
            5000,
        );
        const handlePermissionUpdate = ({ payload }) => {
            clearTimeout(timeout);
            editorConnection.provider.off('stateless', handlePermissionUpdate);
            const message = JSON.parse(payload);
            if (message.role !== 'viewer') {
                reject(new Error('Editor received an unexpected permission update.'));
                return;
            }
            resolve();
        };
        editorConnection.provider.on('stateless', handlePermissionUpdate);
    });
    await request(
        `/api/documents/${documentId}/collaborators/${editorCollaborator.id}`,
        owner.cookie,
        {
            method: 'PATCH',
            body: JSON.stringify({ permission: 'view' }),
        },
    );
    await permissionUpdate;

    editorConnection.document.getMap('authorization-test').set('blocked', Date.now());
    await wait(500);
    if (!editorConnection.provider.hasUnsyncedChanges) {
        throw new Error('Downgraded editor update was unexpectedly accepted.');
    }

    await request(
        `/api/documents/${documentId}/collaborators/${editorCollaborator.id}`,
        owner.cookie,
        { method: 'DELETE' },
    );
    await expectRejectedConnection(
        documentId,
        editorToken.body.token,
        'document-access-denied',
    );

    console.log(
        'Collaboration authorization passed: scoped tokens, readonly viewers, '
        + 'rejections, live downgrades, and removals are enforced.',
    );
} finally {
    activeConnections.forEach(({ provider, websocket }) => {
        provider.destroy();
        websocket.destroy();
    });
    if (mongoose.connection.readyState === 0) await connectDB();
    const users = await User.find({ email: { $in: Object.values(accounts) } });
    const userIds = users.map((user) => user._id);
    const documents = await Document.find({ ownerId: { $in: userIds } });
    const documentIds = documents.map((document) => document._id);
    await Promise.all([
        DocumentState.deleteMany({
            $or: [
                { documentId: { $in: documentIds } },
                { documentName: { $in: documentIds.map(String) } },
            ],
        }),
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

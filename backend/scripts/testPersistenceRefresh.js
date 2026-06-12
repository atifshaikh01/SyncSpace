import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { Document } from '../src/models/Document.js';
import { DocumentMember } from '../src/models/DocumentMember.js';
import { DocumentState } from '../src/models/DocumentState.js';
import { User } from '../src/models/User.js';

const frontendRequire = createRequire(new URL('../../frontend/package.json', import.meta.url));
const {
    HocuspocusProvider,
    HocuspocusProviderWebsocket,
} = frontendRequire('@hocuspocus/provider');
const Y = frontendRequire('yjs');

const baseUrl = 'http://127.0.0.1:3005';
const websocketUrl = 'ws://127.0.0.1:8084';
const suffix = Date.now().toString(36);
const email = `persistence-${suffix}@example.com`;
const password = 'TestPassword123!';
const guestId = `guest-${crypto.randomUUID()}`;
const guestDocumentId = `doc-${crypto.randomUUID()}`;

const server = spawn(process.execPath, ['src/index.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
        ...process.env,
        AUTH_PORT: '3005',
        HOCUSPOCUS_PORT: '8084',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
});

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const waitUntil = async (predicate, message, attempts = 100) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (await predicate()) return;
        await wait(100);
    }
    throw new Error(message);
};

const waitForHealth = async () => {
    await waitUntil(async () => {
        try {
            const response = await fetch(`${baseUrl}/api/health`);
            return response.ok;
        } catch {
            return false;
        }
    }, 'Backend did not become healthy.');
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
    if (!response.ok) {
        throw new Error(`${path}: ${body?.message || response.status}`);
    }
    return {
        body,
        cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie,
    };
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

    let authenticated = false;
    provider.on('authenticated', () => {
        authenticated = true;
    });
    provider.on('synced', ({ state }) => {
        if (!state || !authenticated) return;
        clearTimeout(timeout);
        resolve({ document, provider, websocket });
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

const closeConnection = ({ provider, websocket }) => {
    provider.destroy();
    websocket.destroy();
};

const appendParagraph = (document, text) => {
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText(text)]);
    document.getXmlFragment('default').push([paragraph]);
};

const storedContent = async (documentName) => {
    const record = await DocumentState.findOne({ documentName });
    if (!record) return '';

    const document = new Y.Doc();
    Y.applyUpdate(document, new Uint8Array(record.state));
    return document.getXmlFragment('default').toString();
};

const waitForClientSync = (provider) => waitUntil(
    () => !provider.hasUnsyncedChanges,
    'Client changes were not acknowledged by the collaboration server.',
);

const waitForStoredText = (documentName, expectedText) => waitUntil(
    async () => (await storedContent(documentName)).includes(expectedText),
    `MongoDB did not persist "${expectedText}".`,
);

let accountDocumentId;

try {
    await waitForHealth();
    await connectDB();

    const account = await request('/api/auth/register', '', {
        method: 'POST',
        body: JSON.stringify({
            name: 'Persistence Tester',
            email,
            password,
        }),
    });
    const created = await request('/api/documents', account.cookie, {
        method: 'POST',
        body: JSON.stringify({ title: `Refresh persistence ${suffix}` }),
    });
    accountDocumentId = created.body.document.id;

    const firstToken = await request(
        `/api/documents/${accountDocumentId}/collaboration-token`,
        account.cookie,
        { method: 'POST' },
    );
    const firstSession = await connect(accountDocumentId, firstToken.body.token);
    appendParagraph(firstSession.document, `First refresh ${suffix}`);
    await waitForClientSync(firstSession.provider);
    closeConnection(firstSession);
    await waitForStoredText(accountDocumentId, `First refresh ${suffix}`);

    const secondToken = await request(
        `/api/documents/${accountDocumentId}/collaboration-token`,
        account.cookie,
        { method: 'POST' },
    );
    const secondSession = await connect(accountDocumentId, secondToken.body.token);
    const firstReload = secondSession.document.getXmlFragment('default').toString();
    if (!firstReload.includes(`First refresh ${suffix}`)) {
        throw new Error('First account refresh did not restore document content.');
    }

    appendParagraph(secondSession.document, `Second refresh ${suffix}`);
    await waitForClientSync(secondSession.provider);
    closeConnection(secondSession);
    await waitForStoredText(accountDocumentId, `Second refresh ${suffix}`);

    const thirdToken = await request(
        `/api/documents/${accountDocumentId}/collaboration-token`,
        account.cookie,
        { method: 'POST' },
    );
    const thirdSession = await connect(accountDocumentId, thirdToken.body.token);
    const secondReload = thirdSession.document.getXmlFragment('default').toString();
    if (!secondReload.includes(`First refresh ${suffix}`)
        || !secondReload.includes(`Second refresh ${suffix}`)) {
        throw new Error('Repeated account refresh lost previously persisted content.');
    }
    closeConnection(thirdSession);

    const guestToken = await request('/api/auth/guest-collaboration-token', '', {
        method: 'POST',
        body: JSON.stringify({
            userId: guestId,
            documentId: guestDocumentId,
        }),
    });
    const guestSession = await connect(guestDocumentId, guestToken.body.token);
    appendParagraph(guestSession.document, `Guest refresh ${suffix}`);
    await waitForClientSync(guestSession.provider);
    closeConnection(guestSession);
    await waitForStoredText(guestDocumentId, `Guest refresh ${suffix}`);

    const refreshedGuestToken = await request('/api/auth/guest-collaboration-token', '', {
        method: 'POST',
        body: JSON.stringify({
            userId: guestId,
            documentId: guestDocumentId,
        }),
    });
    const refreshedGuest = await connect(guestDocumentId, refreshedGuestToken.body.token);
    const guestReload = refreshedGuest.document.getXmlFragment('default').toString();
    if (!guestReload.includes(`Guest refresh ${suffix}`)) {
        throw new Error('Guest refresh did not restore document content.');
    }
    closeConnection(refreshedGuest);

    console.log(
        'Persistence refresh passed: account content survived two full reloads '
        + 'and guest content survived a full reload.',
    );
} finally {
    if (mongoose.connection.readyState === 0) await connectDB();
    const user = await User.findOne({ email });
    const documentIds = accountDocumentId ? [accountDocumentId] : [];
    await Promise.all([
        DocumentState.deleteMany({
            documentName: { $in: [...documentIds, guestDocumentId] },
        }),
        DocumentMember.deleteMany({
            $or: [
                { documentId: { $in: documentIds } },
                ...(user ? [{ userId: user._id }] : []),
            ],
        }),
        Document.deleteMany({ _id: { $in: documentIds } }),
        ...(user ? [User.deleteOne({ _id: user._id })] : []),
    ]);
    await mongoose.disconnect();
    server.kill();
}

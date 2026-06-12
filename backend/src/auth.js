import jwt from 'jsonwebtoken';

const COOKIE_NAME = 'syncspace_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;
const COLLABORATION_TOKEN_DURATION_SECONDS = 60 * 10;

const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET is required');
    }
    if (!secret) {
        console.warn('JWT_SECRET is not set. Using development-only session secret.');
    }
    return secret || 'syncspace-development-secret-change-me';
};

export const createSessionToken = (userId) => jwt.sign(
    { sub: userId },
    getJwtSecret(),
    { expiresIn: SESSION_DURATION_SECONDS },
);

export const verifySessionToken = (token) => jwt.verify(token, getJwtSecret());

export const createCollaborationToken = ({
    userId,
    documentId,
    role,
    guest = false,
}) => jwt.sign(
    {
        type: 'collaboration',
        documentId,
        role,
        guest,
    },
    getJwtSecret(),
    {
        subject: userId,
        expiresIn: COLLABORATION_TOKEN_DURATION_SECONDS,
    },
);

export const verifyCollaborationToken = (token) => {
    const payload = jwt.verify(token, getJwtSecret());
    if (payload.type !== 'collaboration' || !payload.sub || !payload.documentId) {
        throw new Error('Invalid collaboration token.');
    }
    return payload;
};

export const readCookie = (request, name) => {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return null;

    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
        const [key, ...valueParts] = cookie.trim().split('=');
        if (key === name) {
            return decodeURIComponent(valueParts.join('='));
        }
    }
    return null;
};

export const getSessionToken = (request) => readCookie(request, COOKIE_NAME);

export const setSessionCookie = (response, token) => {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    response.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DURATION_SECONDS}${secure}`,
    );
};

export const clearSessionCookie = (response) => {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    response.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`,
    );
};

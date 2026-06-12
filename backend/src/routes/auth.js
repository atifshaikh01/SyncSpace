import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import {
    clearSessionCookie,
    createCollaborationToken,
    createSessionToken,
    getSessionToken,
    setSessionCookie,
    verifySessionToken,
} from '../auth.js';

const router = Router();
const COLORS = ['#5b67d8', '#26a37b', '#ef6f5e', '#9b66c7', '#d18a3e'];

const publicUser = (user) => ({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    color: user.color,
});

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validGuestId = (value) => /^guest-[a-zA-Z0-9-]{8,100}$/.test(value);
const validGuestDocumentId = (value) => /^doc-[a-zA-Z0-9-]{8,100}$/.test(value);

router.post('/register', async (request, response) => {
    try {
        const name = String(request.body?.name || '').trim();
        const email = normalizeEmail(request.body?.email);
        const password = String(request.body?.password || '');

        if (name.length < 2 || name.length > 60) {
            return response.status(400).json({ message: 'Name must be between 2 and 60 characters.' });
        }
        if (!validEmail(email)) {
            return response.status(400).json({ message: 'Enter a valid email address.' });
        }
        if (password.length < 8) {
            return response.status(400).json({ message: 'Password must be at least 8 characters.' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return response.status(409).json({ message: 'An account with this email already exists.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const colorIndex = [...email].reduce(
            (total, character) => total + character.charCodeAt(0),
            0,
        ) % COLORS.length;
        const user = await User.create({
            name,
            email,
            passwordHash,
            color: COLORS[colorIndex],
        });

        setSessionCookie(response, createSessionToken(user._id.toString()));
        return response.status(201).json({ user: publicUser(user) });
    } catch (error) {
        if (error?.code === 11000) {
            return response.status(409).json({ message: 'An account with this email already exists.' });
        }
        console.error('Registration failed:', error);
        return response.status(500).json({ message: 'Unable to create account.' });
    }
});

router.post('/login', async (request, response) => {
    try {
        const email = normalizeEmail(request.body?.email);
        const password = String(request.body?.password || '');
        const user = await User.findOne({ email }).select('+passwordHash');

        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            return response.status(401).json({ message: 'Invalid email or password.' });
        }

        setSessionCookie(response, createSessionToken(user._id.toString()));
        return response.json({ user: publicUser(user) });
    } catch (error) {
        console.error('Login failed:', error);
        return response.status(500).json({ message: 'Unable to sign in.' });
    }
});

router.get('/me', async (request, response) => {
    try {
        const token = getSessionToken(request);
        if (!token) return response.status(401).json({ message: 'Not authenticated.' });

        const payload = verifySessionToken(token);
        const user = await User.findById(payload.sub);
        if (!user) {
            clearSessionCookie(response);
            return response.status(401).json({ message: 'Session is no longer valid.' });
        }
        return response.json({ user: publicUser(user) });
    } catch {
        clearSessionCookie(response);
        return response.status(401).json({ message: 'Session is no longer valid.' });
    }
});

router.post('/logout', (_request, response) => {
    clearSessionCookie(response);
    return response.status(204).send();
});

router.post('/guest-collaboration-token', (request, response) => {
    const userId = String(request.body?.userId || '');
    const documentId = String(request.body?.documentId || '');
    if (!validGuestId(userId) || !validGuestDocumentId(documentId)) {
        return response.status(400).json({ message: 'Invalid guest collaboration session.' });
    }
    return response.json({
        token: createCollaborationToken({
            userId,
            documentId,
            role: 'editor',
            guest: true,
        }),
    });
});

export default router;

import { getSessionToken, verifySessionToken } from '../auth.js';
import { User } from '../models/User.js';

export const requireAuth = async (request, response, next) => {
    try {
        const token = getSessionToken(request);
        if (!token) return response.status(401).json({ message: 'Not authenticated.' });

        const payload = verifySessionToken(token);
        const user = await User.findById(payload.sub);
        if (!user) return response.status(401).json({ message: 'Session is no longer valid.' });

        request.user = user;
        return next();
    } catch {
        return response.status(401).json({ message: 'Session is no longer valid.' });
    }
};

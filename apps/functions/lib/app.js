import cors from 'cors';
import express from 'express';
import { healthHandler } from './api/health.js';
export function createApp() {
    const app = express();
    app.use(cors());
    app.use(express.json());
    app.get('/api/health', healthHandler);
    app.use((req, res) => {
        const notFound = {
            ok: false,
            code: 'not_found',
            message: `No route for ${req.method} ${req.path}`,
        };
        res.status(404).json(notFound);
    });
    return app;
}
//# sourceMappingURL=app.js.map
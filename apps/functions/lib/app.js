import cors from 'cors';
import express from 'express';
import { createBootstrapHandler } from './api/bootstrap.js';
import { createHealthHandler } from './api/health.js';
import { createSchemaHealthHandler } from './api/schema-health.js';
import { getProductionGatewayOrNull } from './repositories/gateway-context.js';
export function createApp(options) {
    const getGateway = options?.getGateway ?? getProductionGatewayOrNull;
    const app = express();
    app.use(cors());
    app.use(express.json());
    app.get('/api/health', createHealthHandler(getGateway));
    app.get('/api/bootstrap', createBootstrapHandler(getGateway));
    app.get('/api/admin/schema-health', createSchemaHealthHandler(getGateway));
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
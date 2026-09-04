import cors from 'cors';
import express, { type Express } from 'express';
import type { ApiError } from '@veoullas-world/contracts';
import { healthHandler } from './api/health.js';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', healthHandler);

  app.use((req, res) => {
    const notFound: ApiError = {
      ok: false,
      code: 'not_found',
      message: `No route for ${req.method} ${req.path}`,
    };
    res.status(404).json(notFound);
  });

  return app;
}

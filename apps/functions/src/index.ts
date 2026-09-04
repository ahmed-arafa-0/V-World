import { onRequest } from 'firebase-functions/v2/https';
import { createApp } from './app.js';

const app = createApp();

/**
 * Single HTTPS function backing the Firebase Hosting `/api/**` rewrite.
 * Any additional API surface added in later milestones is mounted on the
 * same Express app rather than as separate Cloud Functions, to keep one
 * cold-start path and one place that owns the same-origin API contract.
 */
export const api = onRequest({ region: 'us-central1' }, app);

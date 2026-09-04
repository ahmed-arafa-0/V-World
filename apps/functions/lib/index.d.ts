/**
 * Single HTTPS function backing the Firebase Hosting `/api/**` rewrite.
 * Any additional API surface added in later milestones is mounted on the
 * same Express app rather than as separate Cloud Functions, to keep one
 * cold-start path and one place that owns the same-origin API contract.
 */
export declare const api: import("firebase-functions/v2/https").HttpsFunction;
//# sourceMappingURL=index.d.ts.map
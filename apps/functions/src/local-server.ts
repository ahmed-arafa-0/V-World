import { createApp } from './app.js';

const port = process.env.PORT ? Number(process.env.PORT) : 5001;
const app = createApp();

app.listen(port, () => {
  console.log(`[functions] local dev server listening on http://localhost:${port}`);
});

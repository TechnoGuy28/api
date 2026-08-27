import app from '../src/server.js';

const server = app.listen(0, async () => {
  const port = server.address().port;
  const base = `http://localhost:${port}`;
  try {
    const r = await fetch(`${base}/health`);
    console.log('HEALTH OK:', JSON.stringify(await r.json()));
    const r2 = await fetch(`${base}/nope`);
    console.log('404 STATUS:', r2.status);
    const r3 = await fetch(`${base}/dashboard/summary`);
    console.log('AUTH REQUIRED STATUS:', r3.status);
  } catch (e) {
    console.log('ERR', e.message);
  }
  server.close();
});

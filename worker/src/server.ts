import { createServer } from 'node:http';
import { processJob } from './jobs/process.ts';

const SECRET = process.env.WORKER_SHARED_SECRET!;
const PORT = Number(process.env.PORT ?? 8787);
const workerId = 'worker-' + process.pid;

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') { res.writeHead(200).end('ok'); return; }
  if (req.method === 'POST' && req.url === '/run') {
    if (req.headers['x-worker-secret'] !== SECRET) { res.writeHead(401).end('unauthorized'); return; }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let jobId: string | undefined;
      try { jobId = JSON.parse(body).jobId; } catch {}
      if (!jobId) { res.writeHead(400).end('missing jobId'); return; }
      // ack immediately; process in background
      res.writeHead(202).end('accepted');
      processJob(jobId, workerId).catch((e) => console.error('processJob error', e));
    });
    return;
  }
  res.writeHead(404).end('not found');
});
server.listen(PORT, () => console.log('worker listening on', PORT));

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { RailService, type HttpResult, type RailOptions } from './rail.ts';

const MAX_BODY_BYTES = 64 * 1024;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function send(response: ServerResponse, result: HttpResult): void {
  if (result.delayMs) {
    setTimeout(() => sendNow(response, result), result.delayMs);
  } else {
    sendNow(response, result);
  }
}

function sendNow(response: ServerResponse, result: HttpResult): void {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(result.status, JSON_HEADERS);
  response.end(JSON.stringify(result.body));
}

async function readJson(request: IncomingMessage): Promise<{ body?: unknown; error?: HttpResult }> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += data.length;
    if (size > MAX_BODY_BYTES) return { error: { status: 400, body: { code: 'INVALID_REQUEST', message: 'El cuerpo excede el tamaño permitido.' } } };
    chunks.push(data);
  }
  try {
    return { body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown };
  } catch {
    return { error: { status: 400, body: { code: 'INVALID_REQUEST', message: 'El cuerpo debe ser JSON válido.' } } };
  }
}

export type RailServer = {
  server: Server;
  service: RailService;
  close(): Promise<void>;
};

export function createRailServer(options: RailOptions): RailServer {
  const service = new RailService(options);
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://rail-mock.local');
    if (request.method === 'GET' && url.pathname === '/health/ready') {
      send(response, service.ready()
        ? { status: 200, body: { status: 'ready' } }
        : { status: 503, body: { status: 'not_ready' } });
      return;
    }
    if (request.method === 'GET' && url.pathname.startsWith('/rail/transfers/')) {
      const reference = url.pathname.slice('/rail/transfers/'.length);
      send(response, service.getTransfer(reference));
      return;
    }
    if (request.method === 'POST' && (url.pathname === '/rail/transfers' || url.pathname === '/rail/reversals')) {
      void readJson(request).then(async ({ body, error }) => {
        if (error) return send(response, error);
        const result = url.pathname === '/rail/transfers'
          ? await service.createTransfer(body)
          : await service.createReversal(body);
        send(response, result);
      }).catch(() => send(response, { status: 500, body: { code: 'INTERNAL_ERROR', message: 'Error interno del riel simulado.' } }));
      return;
    }
    send(response, { status: 404, body: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } });
  });
  return {
    server,
    service,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        if (!server.listening) return resolve();
        server.close((cause) => cause ? reject(cause) : resolve());
      });
      service.close();
    },
  };
}

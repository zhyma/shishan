import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { relative, resolve, sep } from 'node:path';
import fastifyStatic from '@fastify/static';
import {
  ProjectIndex
} from '@shishan/core';
import {
  assertProtocolPayload,
  type ProjectPatch
} from '@shishan/protocol';
import { watch, type FSWatcher } from 'chokidar';
import Fastify, { type FastifyInstance } from 'fastify';

export interface ServerOptions {
  root: string;
  host?: string;
  port?: number;
  webRoot?: string;
  watch?: boolean;
}

export interface ShiShanServer {
  app: FastifyInstance;
  index: ProjectIndex;
  update(paths: readonly string[]): Promise<ProjectPatch>;
  start(): Promise<string>;
  close(): Promise<void>;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === '127.0.0.1' ||
    normalized === 'localhost' ||
    normalized === '::1'
  );
}

function ignoredPath(
  root: string,
  path: string,
  isFile: boolean | undefined,
  acceptsSourcePath: (path: string) => boolean
): boolean {
  const local = relative(root, path).split(sep).join('/');
  if (!local || local.startsWith('../')) {
    return false;
  }
  const parts = local.split('/');
  if (
    parts.some((part) =>
      ['.git', 'node_modules', 'dist', 'build', '.shishan'].includes(part)
    )
  ) {
    return true;
  }
  return Boolean(isFile && !acceptsSourcePath(local));
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function eventPayload(event: string, value: unknown): string {
  return 'event: ' + event + '\ndata: ' + JSON.stringify(value) + '\n\n';
}

export async function createShiShanServer(
  options: ServerOptions
): Promise<ShiShanServer> {
  const root = resolve(options.root);
  const realRoot = await realpath(root);
  const index = await ProjectIndex.create(root);
  const snapshot = await index.initialize();
  assertProtocolPayload(snapshot);
  const listenHost = options.host ?? index.config.server.host;
  if (!isLoopbackHost(listenHost)) {
    throw new Error(
      'ShiShan only listens on loopback hosts: 127.0.0.1, localhost, or ::1.'
    );
  }

  const app = Fastify({
    logger: false
  });
  const clients = new Set<ServerResponse>();
  let watcher: FSWatcher | undefined;
  let batchTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let updateQueue: Promise<void> = Promise.resolve();
  const pending = new Set<string>();

  app.addHook('onRequest', async (request, reply) => {
    if (!isLoopbackHost(request.hostname)) {
      return reply.code(403).send({ error: 'Non-loopback Host is not allowed.' });
    }
    const origin = request.headers.origin;
    if (origin) {
      try {
        if (!isLoopbackHost(new URL(origin).hostname)) {
          return reply
            .code(403)
            .send({ error: 'Non-loopback Origin is not allowed.' });
        }
      } catch {
        return reply.code(403).send({ error: 'Invalid Origin header.' });
      }
    }
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header(
      'content-security-policy',
      "default-src 'self'; connect-src 'self'; img-src 'self' data:; " +
        "style-src 'self' 'unsafe-inline'; script-src 'self'"
    );
    return payload;
  });

  app.get('/api/health', async () => ({
    ok: true,
    generation: index.snapshot().generation
  }));

  app.get('/api/project', async () => index.snapshot());

  app.get('/api/source', async (request, reply) => {
    const query = request.query as { path?: string };
    if (!query.path) {
      return reply.code(400).send({ error: 'A path query parameter is required.' });
    }
    const sourcePath = index.sourcePath(query.path);
    if (!sourcePath) {
      return reply.code(403).send({ error: 'Path is outside the project or unsupported.' });
    }
    try {
      const metadata = await lstat(sourcePath);
      if (metadata.isSymbolicLink()) {
        return reply.code(403).send({ error: 'Symbolic-link sources are not allowed.' });
      }
      const canonical = await realpath(sourcePath);
      const local = relative(realRoot, canonical);
      if (local === '..' || local.startsWith('..' + sep)) {
        return reply.code(403).send({ error: 'Source resolves outside the project.' });
      }
      return reply
        .type('text/plain; charset=utf-8')
        .send(await readFile(canonical, 'utf8'));
    } catch {
      return reply.code(404).send({ error: 'Source file was not found.' });
    }
  });

  app.get('/api/events', async (request, reply) => {
    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no'
    });
    response.write(
      eventPayload('ready', { generation: index.snapshot().generation })
    );
    clients.add(response);
    request.raw.on('close', () => {
      clients.delete(response);
    });
  });

  const webRoot = options.webRoot ? resolve(options.webRoot) : undefined;
  if (webRoot && (await directoryExists(webRoot))) {
    await app.register(fastifyStatic, {
      root: webRoot,
      prefix: '/',
      wildcard: false,
      decorateReply: true
    });
    app.setNotFoundHandler(async (request, reply) => {
      if (
        request.method === 'GET' &&
        !request.url.startsWith('/api/') &&
        request.headers.accept?.includes('text/html')
      ) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found.' });
    });
  } else {
    app.get('/', async (_request, reply) =>
      reply
        .type('text/html; charset=utf-8')
        .send(
          '<!doctype html><title>ShiShan</title>' +
            '<main><h1>ShiShan API is running</h1>' +
            '<p>Build apps/web to enable the visual interface.</p></main>'
        )
    );
  }

  const broadcast = (patch: ProjectPatch): void => {
    if (patch.upsertFiles.length === 0 && patch.removedFiles.length === 0) {
      return;
    }
    assertProtocolPayload(patch);
    const payload = eventPayload('patch', patch);
    for (const client of clients) {
      client.write(payload);
    }
  };

  const update = async (paths: readonly string[]): Promise<ProjectPatch> => {
    const patch = await index.updatePaths(paths);
    broadcast(patch);
    return patch;
  };

  const flush = (): void => {
    batchTimer = undefined;
    const paths = [...pending];
    pending.clear();
    if (paths.length === 0) {
      return;
    }
    updateQueue = updateQueue
      .then(async () => {
        await update(paths);
      })
      .catch((error: unknown) => {
        app.log.error(error);
      });
  };

  const schedule = (path: string): void => {
    pending.add(path);
    if (batchTimer) {
      clearTimeout(batchTimer);
    }
    batchTimer = setTimeout(flush, 75);
  };

  if (options.watch !== false) {
    watcher = watch(root, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 80,
        pollInterval: 20
      },
      followSymlinks: false,
      ignored: (path, metadata) =>
        ignoredPath(
          root,
          path,
          metadata?.isFile(),
          (local) => index.acceptsSourcePath(local)
        )
    });
    watcher.on('add', schedule);
    watcher.on('change', schedule);
    watcher.on('unlink', schedule);
    heartbeat = setInterval(() => {
      const payload = eventPayload('heartbeat', {
        generation: index.snapshot().generation
      });
      for (const client of clients) {
        client.write(payload);
      }
    }, 20_000);
    heartbeat.unref();
  }

  return {
    app,
    index,
    update,
    async start(): Promise<string> {
      const port = options.port ?? index.config.server.port;
      return app.listen({ host: listenHost, port });
    },
    async close(): Promise<void> {
      if (batchTimer) {
        clearTimeout(batchTimer);
      }
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      await watcher?.close();
      await updateQueue;
      for (const client of clients) {
        client.end();
      }
      clients.clear();
      await app.close();
    }
  };
}

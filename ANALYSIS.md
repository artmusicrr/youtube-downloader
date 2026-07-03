# 📊 Análise do Projeto YouTube Downloader - Pontos de Atenção e Melhorias

## 📋 Sumário Executivo

Seu projeto é um **downloader de vídeos do YouTube em arquitetura de microsserviços**. É uma solução bem estruturada com Next.js, Express, RabbitMQ e PostgreSQL, mas possui algumas vulnerabilidades e pontos de melhoria identificados.

---

## ✅ Pontos Fortes

- ✔️ **Escalabilidade**: Arquitetura worker desacoplada permite processar múltiplos downloads
- ✔️ **Tempo real**: SSE (Server-Sent Events) para atualizações de progresso em tempo real
- ✔️ **Modular**: Workspaces npm bem organizados (apps, packages, workers)
- ✔️ **Containerizado**: Docker Compose pronto para ambiente completo
- ✔️ **TypeScript**: Type-safety em todo o projeto
- ✔️ **Persistência**: Histórico de downloads com rastreamento de status

---

## ⚠️ Pontos de Atenção

### 1. 🔐 SEGURANÇA

#### 1.1 Falta de Autenticação na API
**Problema**: 
- NextAuth.js está configurado no schema do Prisma, mas a API não valida tokens
- Qualquer cliente pode fazer requisições sem identificação

**Impacto**: Alto
- Acesso não autorizado a downloads de outros usuários
- Potencial abuso da fila de downloads

**Solução**:
```typescript
// Adicionar middleware de autenticação
import jwt from 'jsonwebtoken';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Aplicar em todas as rotas protegidas
app.post('/api/download', authMiddleware, downloadHandler);
app.get('/api/queue/:userId', authMiddleware, queueHandler);
```

#### 1.2 Execução de Comandos do Sistema Sem Validação
**Problema**:
```typescript
// apps/api/src/download.ts - openFolderHandler
exec(`open "${filePath}"`, ...); // macOS
// ou no Linux: xdg-open
```
- Path não validado
- Possível command injection
- Exposição de diretórios privados

**Impacto**: Crítico
- Execução arbitrária de código
- Exposição de informações do servidor

**Solução**:
```typescript
import { validate as validatePath } from 'path-validation-lib';

export const openFolderHandler = async (req: Request, res: Response) => {
  const { id } = req.params;
  
  // Validar acesso do usuário
  const download = await prisma.download.findUnique({ where: { id } });
  if (download?.userId !== req.user?.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // Validar se arquivo existe
  if (!download.filePath || !existsSync(download.filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // Sanitizar path
  const normalizedPath = path.normalize(download.filePath);
  const basePath = path.normalize(process.env.DOWNLOAD_PATH || '/tmp/downloads');
  
  if (!normalizedPath.startsWith(basePath)) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  
  const command = process.platform === 'darwin' 
    ? `open "${normalizedPath}"`
    : `xdg-open "${normalizedPath}"`;
  
  exec(command, (error) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to open folder' });
    }
    res.json({ success: true });
  });
};
```

#### 1.3 Falta de Validação de Input
**Problema**:
- Sem validação de tipos em payload de download
- Sem sanitização de strings
- Sem limite de tamanho

**Solução**:
```typescript
import { z } from 'zod';

const downloadSchema = z.object({
  userId: z.string().cuid(),
  videoId: z.string().min(1).max(100),
  title: z.string().max(500),
  channel: z.string().max(255).optional(),
  resolution: z.enum(['720p', '1080p', '2160p', '480p']),
  codec: z.enum(['h264', 'vp9', 'av1']),
  url: z.string().url(),
});

export const downloadHandler = async (req: Request, res: Response) => {
  try {
    const validated = downloadSchema.parse(req.body);
    // ... resto do código
  } catch (error) {
    res.status(400).json({ error: 'Invalid input', details: error });
  }
};
```

---

### 2. 🚀 PERFORMANCE

#### 2.1 RabbitMQ Progress Queue Sem Persistência
**Problema**:
```yaml
# docker-compose.yml
progress_queue: { durable: false }  # ❌ Mensagens perdidas em crash
```

**Impacto**: Médio
- Perda de atualizações de progresso se RabbitMQ cair
- Usuários ficam sem feedback

**Solução**:
```typescript
// workers/download-worker/src/index.ts
await channel.assertQueue('progress_queue', { 
  durable: true,        // ✅ Persistir se RabbitMQ reiniciar
  arguments: {
    'x-message-ttl': 60000  // Expire em 60s (progresso antigo não vale)
  }
});
```

#### 2.2 Prefetch Fixo e Sem Limites de Concorrência Dinâmica
**Problema**:
```typescript
channel.prefetch(MAX_CONCURRENT_DOWNLOADS);  // Fixo em 5
```

**Impacto**: Médio
- Não adapta a recursos disponíveis
- Pode sobrecarregar ou subutilizar

**Solução**:
```typescript
const os = require('os');

const MAX_CONCURRENT = Math.ceil(os.cpus().length / 2);  // Dinâmico baseado em CPU
const MEMORY_THRESHOLD = 0.8;  // 80% de RAM

channel.prefetch(MAX_CONCURRENT);

// Monitor de saúde do worker
setInterval(async () => {
  const usage = process.memoryUsage();
  const memPercent = usage.heapUsed / usage.heapTotal;
  
  if (memPercent > MEMORY_THRESHOLD) {
    console.warn(`Memory threshold exceeded: ${(memPercent * 100).toFixed(2)}%`);
    // Reduzir prefetch temporariamente
    await channel.prefetch(Math.max(1, MAX_CONCURRENT - 2));
  }
}, 30000);
```

#### 2.3 Sem Cache de Metadados
**Problema**:
- Cada busca executa `youtube-dl-exec` novamente
- Sem TTL de cache

**Solução**:
```typescript
import NodeCache from 'node-cache';

const metadataCache = new NodeCache({ stdTTL: 3600 });  // 1 hora

export const metadataHandler = async (req: Request, res: Response) => {
  const { videoId } = req.query as { videoId: string };
  
  // Verificar cache
  const cached = metadataCache.get<any>(videoId);
  if (cached) {
    return res.json(cached);
  }
  
  try {
    const metadata = await exec(`youtube-dl-exec --dump-json "${videoId}"`);
    metadataCache.set(videoId, metadata);
    res.json(metadata);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
};
```

#### 2.4 Sem Compressão de Resposta HTTP
**Problema**:
- Responses grande sem gzip/brotli

**Solução**:
```typescript
import compression from 'compression';

app.use(compression());  // Comprime automaticamente
```

---

### 3. 📡 OBSERVABILIDADE

#### 3.1 Sem Logging Estruturado
**Problema**:
```typescript
console.log('Worker waiting...');  // ❌ Sem contexto
console.error('Error:', error);    // ❌ Stack trace perdido
```

**Impacto**: Alto
- Difícil debugar em produção
- Sem rastreamento de erros
- Sem métricas

**Solução**:
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'download-worker' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Uso
logger.info('Processing job', { jobId: payload.jobId });
logger.error('Job failed', { jobId: payload.jobId, error: error.message });
```

#### 3.2 Sem Rastreamento de Erros (Error Tracking)
**Problema**:
- Erros não são capturados centralizadamente
- Sem notificação de alertas

**Solução**:
```typescript
import Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});

app.use(Sentry.Handlers.errorHandler());

try {
  // ... código
} catch (error) {
  Sentry.captureException(error);
}
```

#### 3.3 Sem Métricas de Performance
**Problema**:
- Desconhecimento de gargalos
- Sem histório de performance

**Solução**:
```typescript
import prometheus from 'prom-client';

const downloadDuration = new prometheus.Histogram({
  name: 'download_duration_seconds',
  help: 'Time taken to download videos',
  labelNames: ['resolution', 'codec'],
});

// Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    // Registrar métrica
  });
  next();
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', prometheus.register.contentType);
  res.end(await prometheus.register.metrics());
});
```

---

### 4. 🚢 DEPLOYMENT

#### 4.1 Variáveis de Ambiente Incompletas
**Problema**:
- `.env` não está versionado
- Sem `.env.example`
- Secrets hardcoded em alguns lugares

**Solução**:
```bash
# Criar .env.example
cat > .env.example << 'EOF'
# API
PORT=4000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://pguser:pgpassword@localhost:5434/youtube_dl

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# Downloads
DOWNLOAD_PATH=/tmp/downloads
COOKIES_PATH=

# YouTube
YT_PROXY=

# Segurança
JWT_SECRET=your-secret-key-here
JWT_EXPIRY=7d

# Observabilidade
LOG_LEVEL=info
SENTRY_DSN=

# NextAuth.js
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3000
EOF

git add .env.example
```

#### 4.2 Health Checks Insuficientes
**Problema**:
```typescript
app.get('/health', (req, res) => res.json({ status: 'ok' }));
```
- Não verifica dependências (DB, RabbitMQ)
- Docker Compose sem health checks

**Solução**:
```typescript
export const healthCheckHandler = async (req: Request, res: Response) => {
  const health = {
    status: 'ok',
    timestamp: new Date(),
    checks: {
      database: 'unknown',
      rabbitmq: 'unknown',
    },
  };

  // Verificar Database
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = 'healthy';
  } catch (error) {
    health.checks.database = 'unhealthy';
    health.status = 'degraded';
  }

  // Verificar RabbitMQ
  try {
    const ch = getChannel();
    await ch.checkQueue('download_queue');
    health.checks.rabbitmq = 'healthy';
  } catch (error) {
    health.checks.rabbitmq = 'unhealthy';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
};

app.get('/health', healthCheckHandler);
```

E no Docker Compose:
```yaml
services:
  api:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

#### 4.3 Sem Graceful Shutdown
**Problema**:
- Worker pode ser interrompido durante download
- Downloads incompletos

**Solução**:
```typescript
// workers/download-worker/src/index.ts
let isShuttingDown = false;
let activeJobs = 0;

const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, starting graceful shutdown...`);
  isShuttingDown = true;

  // Aguardar jobs ativos
  while (activeJobs > 0) {
    console.log(`Waiting for ${activeJobs} active jobs to complete...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  await connection.close();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

channel.consume('download_queue', async (msg) => {
  if (isShuttingDown && !msg) return;
  
  if (msg !== null) {
    activeJobs++;
    try {
      await processDownloadJob(msg.content.toString());
    } finally {
      activeJobs--;
      channel.ack(msg);
    }
  }
});
```

#### 4.4 Paths Hardcoded
**Problema**:
```typescript
exec(`open "${filePath}"`);  // Específico do macOS
```

**Solução**:
```typescript
const getOpenCommand = (filePath: string): string => {
  const platform = process.platform;
  const escapedPath = filePath.replace(/"/g, '\\"');
  
  switch (platform) {
    case 'darwin':
      return `open "${escapedPath}"`;
    case 'linux':
      return `xdg-open "${escapedPath}"`;
    case 'win32':
      return `start "" "${escapedPath}"`;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
};
```

---

## 🎯 Recomendações Prioritizadas

### 🔴 Críticas (Implementar Imediatamente)
1. **Autenticação JWT** - Proteger todas as rotas
2. **Validação de Paths** - Evitar command injection
3. **Validação de Input** - Usar Zod ou Joi

### 🟡 Altas (Implementar Este Sprint)
1. **Logging Estruturado** - Winston ou Pino
2. **Health Checks Completos** - Verificar dependências
3. **Graceful Shutdown** - Evitar perda de dados

### 🟢 Médias (Próximo Sprint)
1. **Caching de Metadados** - Melhorar performance
2. **Error Tracking** - Sentry ou similar
3. **Metrics** - Prometheus
4. **Testes Unitários** - Jest
5. **CI/CD** - GitHub Actions

---

## 📚 Exemplo de Implementação: Autenticação Completa

```typescript
// apps/api/src/middleware/auth.ts
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  user?: { id: string; email?: string };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// apps/api/src/index.ts
import { authMiddleware } from './middleware/auth';

// Aplicar autenticação
app.post('/api/download', authMiddleware, downloadHandler);
app.get('/api/queue/:userId', authMiddleware, queueHandler);
app.delete('/api/queue/:userId', authMiddleware, clearQueueHandler);
app.get('/api/progress/:userId', authMiddleware, sseHandler);
```

---

## 🔗 Recursos Úteis

- [OWASP - Command Injection](https://owasp.org/www-community/attacks/Command_Injection)
- [Winston Logger](https://github.com/winstonjs/winston)
- [Zod Validation](https://zod.dev/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [RabbitMQ Durability](https://www.rabbitmq.com/reliability.html)
- [Node.js Security Checklist](https://nodejs.org/en/docs/guides/security/)

---

**Última atualização**: 2026-06-11

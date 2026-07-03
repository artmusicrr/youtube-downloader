import { Request, Response } from 'express';

const clients: { [userId: string]: Response[] } = {};

export const sseHandler = (req: Request, res: Response) => {
  const userId = req.params.userId as string;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  if (!clients[userId]) {
    clients[userId] = [];
  }
  clients[userId].push(res);
  req.on('close', () => {
    clients[userId] = clients[userId].filter((client: Response) => client !== res);
  });
};

export const broadcastProgress = (userId: string, data: any) => {
  if (clients[userId]) {
    clients[userId].forEach(client => {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    });
  }
};

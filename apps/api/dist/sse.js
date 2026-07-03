"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastProgress = exports.sseHandler = void 0;
const clients = {};
const sseHandler = (req, res) => {
    const userId = req.params.userId;
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
        clients[userId] = clients[userId].filter((client) => client !== res);
    });
};
exports.sseHandler = sseHandler;
const broadcastProgress = (userId, data) => {
    if (clients[userId]) {
        clients[userId].forEach(client => {
            client.write(`data: ${JSON.stringify(data)}\n\n`);
        });
    }
};
exports.broadcastProgress = broadcastProgress;

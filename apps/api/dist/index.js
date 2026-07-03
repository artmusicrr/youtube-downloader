"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const queue_1 = require("./queue");
const sse_1 = require("./sse");
const search_1 = require("./search");
const download_1 = require("./download");
const settings_1 = require("./settings");
dotenv_1.default.config({ path: '../../.env' });
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const PORT = process.env.PORT || 4000;
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/progress/:userId', sse_1.sseHandler);
app.get('/api/search', search_1.searchHandler);
app.get('/api/metadata', search_1.metadataHandler);
app.get('/api/queue/:userId', download_1.queueHandler);
app.delete('/api/queue/:userId', download_1.clearQueueHandler);
app.get('/api/download/file/:id', download_1.fileServeHandler);
app.post('/api/download/open/:id', download_1.openFolderHandler);
app.post('/api/download', download_1.downloadHandler);
app.get('/api/settings/:userId', settings_1.getSettingsHandler);
app.post('/api/settings/:userId', settings_1.saveSettingsHandler);
app.listen(PORT, async () => {
    console.log(`API running on http://localhost:${PORT}`);
    await (0, queue_1.initQueue)();
    const channel = (0, queue_1.getChannel)();
    await channel.assertQueue('progress_queue', { durable: false });
    channel.consume('progress_queue', (msg) => {
        if (msg !== null) {
            const data = JSON.parse(msg.content.toString());
            (0, sse_1.broadcastProgress)(data.userId, data);
            channel.ack(msg);
        }
    });
});

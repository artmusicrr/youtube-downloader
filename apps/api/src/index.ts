import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initQueue, getChannel } from './queue';
import { sseHandler, broadcastProgress } from './sse';
import { searchHandler, metadataHandler } from './search';
import { downloadHandler, queueHandler, clearQueueHandler, fileServeHandler, openFolderHandler } from './download';
import { getSettingsHandler, saveSettingsHandler } from './settings';

dotenv.config({ path: '../../.env' });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/progress/:userId', sseHandler);
app.get('/api/search', searchHandler);
app.get('/api/metadata', metadataHandler);
app.get('/api/queue/:userId', queueHandler);
app.delete('/api/queue/:userId', clearQueueHandler);
app.get('/api/download/file/:id', fileServeHandler);
app.post('/api/download/open/:id', openFolderHandler);
app.post('/api/download', downloadHandler);
app.get('/api/settings/:userId', getSettingsHandler);
app.post('/api/settings/:userId', saveSettingsHandler);

app.listen(PORT, async () => {
  console.log(`API running on http://localhost:${PORT}`);
  await initQueue();
  
  const channel = getChannel();
  await channel.assertQueue('progress_queue', { durable: false });
  channel.consume('progress_queue', (msg) => {
    if (msg !== null) {
      const data = JSON.parse(msg.content.toString());
      broadcastProgress(data.userId, data);
      channel.ack(msg);
    }
  });
});

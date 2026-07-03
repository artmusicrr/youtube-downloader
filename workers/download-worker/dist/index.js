"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const amqplib_1 = __importDefault(require("amqplib"));
const dotenv_1 = __importDefault(require("dotenv"));
const downloader_1 = require("./downloader");
dotenv_1.default.config({ path: '../../.env' });
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const MAX_CONCURRENT_DOWNLOADS = 5;
const startWorker = async () => {
    try {
        const connection = await amqplib_1.default.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();
        await channel.assertQueue('download_queue', { durable: true });
        await channel.assertQueue('progress_queue', { durable: false });
        channel.prefetch(MAX_CONCURRENT_DOWNLOADS);
        console.log(`Worker waiting for messages. Max concurrency: ${MAX_CONCURRENT_DOWNLOADS}`);
        channel.consume('download_queue', async (msg) => {
            if (msg !== null) {
                const payload = JSON.parse(msg.content.toString());
                console.log(`Processing job ${payload.jobId}`);
                try {
                    await (0, downloader_1.processDownloadJob)(payload, channel);
                }
                catch (error) {
                    console.error(`Error processing job ${payload.jobId}:`, error);
                }
                // Always ack — error status is persisted in DB; nack with requeue causes infinite loops
                channel.ack(msg);
            }
        });
    }
    catch (error) {
        console.error('Worker initialization failed:', error);
        setTimeout(startWorker, 5000);
    }
};
startWorker();

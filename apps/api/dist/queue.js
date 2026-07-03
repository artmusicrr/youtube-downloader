"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChannel = exports.initQueue = void 0;
const amqplib_1 = __importDefault(require("amqplib"));
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
let channel;
const initQueue = async () => {
    try {
        const connection = await amqplib_1.default.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        await channel.assertQueue('download_queue', { durable: true });
        console.log('Connected to RabbitMQ');
    }
    catch (error) {
        console.error('RabbitMQ connection error:', error);
        setTimeout(exports.initQueue, 5000);
    }
};
exports.initQueue = initQueue;
const getChannel = () => channel;
exports.getChannel = getChannel;

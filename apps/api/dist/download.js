"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openFolderHandler = exports.fileServeHandler = exports.clearQueueHandler = exports.queueHandler = exports.downloadHandler = void 0;
const database_1 = require("database");
const queue_1 = require("./queue");
const fs_1 = require("fs");
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const downloadHandler = async (req, res) => {
    try {
        const { userId, videoId, title, channel, resolution, codec, url } = req.body;
        // Ensure the user exists (upsert for local/anonymous usage)
        await database_1.prisma.user.upsert({
            where: { id: userId },
            update: {},
            create: { id: userId, name: userId },
        });
        // Get user settings or create defaults
        const settings = await database_1.prisma.settings.upsert({
            where: { userId },
            update: {},
            create: {
                userId,
                downloadPath: process.env.DOWNLOAD_PATH || '/tmp/downloads',
                proxy: process.env.YT_PROXY || '',
                cookiesContent: '',
            },
        });
        const download = await database_1.prisma.download.create({
            data: {
                userId,
                videoId,
                title,
                channel,
                resolution,
                codec,
                status: 'waiting'
            }
        });
        const jobPayload = {
            jobId: download.id,
            userId,
            videoId,
            url,
            title,
            resolution,
            codec,
            outputPath: settings.downloadPath,
            cookiesPath: process.env.COOKIES_PATH || '',
            proxy: settings.proxy
        };
        const mqChannel = (0, queue_1.getChannel)();
        mqChannel.sendToQueue('download_queue', Buffer.from(JSON.stringify(jobPayload)), { persistent: true });
        res.json({ message: 'Job created', job: download });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create job' });
    }
};
exports.downloadHandler = downloadHandler;
const queueHandler = async (req, res) => {
    try {
        const { userId } = req.params;
        const downloads = await database_1.prisma.download.findMany({
            where: { userId },
            orderBy: { downloadDate: 'desc' },
            take: 50,
        });
        res.json(downloads);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch queue' });
    }
};
exports.queueHandler = queueHandler;
const clearQueueHandler = async (req, res) => {
    try {
        const { userId } = req.params;
        const { count } = await database_1.prisma.download.deleteMany({
            where: { userId, status: { in: ['error', 'completed'] } },
        });
        res.json({ deleted: count });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to clear queue' });
    }
};
exports.clearQueueHandler = clearQueueHandler;
const fileServeHandler = async (req, res) => {
    try {
        const { id } = req.params;
        const download = await database_1.prisma.download.findUnique({ where: { id } });
        if (!download || !download.filePath) {
            res.status(404).json({ error: 'File not found or not finished' });
            return;
        }
        if (!(0, fs_1.existsSync)(download.filePath)) {
            res.status(404).json({ error: 'File does not exist on disk' });
            return;
        }
        // Set headers to trigger file download in browser
        res.download(download.filePath);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to serve file' });
    }
};
exports.fileServeHandler = fileServeHandler;
const openFolderHandler = async (req, res) => {
    try {
        const { id } = req.params;
        const download = await database_1.prisma.download.findUnique({ where: { id } });
        if (!download || !download.filePath) {
            res.status(404).json({ error: 'Download not found or not finished' });
            return;
        }
        const dirPath = path_1.default.dirname(download.filePath);
        if (!(0, fs_1.existsSync)(dirPath)) {
            res.status(404).json({ error: 'Directory does not exist' });
            return;
        }
        let command = '';
        if (process.platform === 'darwin') {
            command = `open -R "${download.filePath}"`;
        }
        else if (process.platform === 'win32') {
            command = `explorer.exe /select,"${download.filePath.replace(/\//g, '\\')}"`;
        }
        else {
            command = `xdg-open "${dirPath}"`;
        }
        (0, child_process_1.exec)(command, (error) => {
            if (error) {
                console.error(`Failed to open folder: ${error.message}`);
            }
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to open folder' });
    }
};
exports.openFolderHandler = openFolderHandler;

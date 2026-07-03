"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processDownloadJob = void 0;
const child_process_1 = require("child_process");
const database_1 = require("database");
const fs_1 = require("fs");
const fs_2 = require("fs");
const LOCAL_YT_DLP = '/home/reg/projects/youtube-downloader/bin/yt-dlp';
const SYSTEM_YT_DLP = '/usr/bin/yt-dlp';
const BUNDLED_YT_DLP = `${__dirname}/../../../node_modules/yt-dlp-exec/bin/yt-dlp`;
const YT_DLP_BIN = (0, fs_1.existsSync)(LOCAL_YT_DLP) ? LOCAL_YT_DLP : ((0, fs_1.existsSync)(SYSTEM_YT_DLP) ? SYSTEM_YT_DLP : BUNDLED_YT_DLP);
// Sanitiza o título para ser um nome de arquivo válido
const sanitizeFileName = (title) => {
    return title
        .replace(/[<>:"/\\|?*]/g, '') // Remove caracteres inválidos
        .replace(/\s+/g, ' ') // Normaliza espaços
        .trim() // Remove espaços nas extremidades
        .slice(0, 200); // Limita a 200 caracteres
};
const sendProgress = (channel, userId, jobId, status, progress, message) => {
    const payload = { userId, jobId, status };
    if (progress !== undefined)
        payload.progress = progress;
    if (message)
        payload.message = message;
    channel.sendToQueue('progress_queue', Buffer.from(JSON.stringify(payload)));
};
const processDownloadJob = async (payload, channel) => {
    const { jobId, userId, videoId, url, title, resolution, codec, outputPath, cookiesPath, proxy } = payload;
    // Ensure output directory exists
    try {
        (0, fs_2.mkdirSync)(outputPath, { recursive: true });
    }
    catch { /* already exists */ }
    await database_1.prisma.download.update({
        where: { id: jobId },
        data: { status: 'downloading' }
    });
    sendProgress(channel, userId, jobId, 'downloading', 0);
    const resValue = parseInt(resolution) || 1080;
    // Sanitiza o título para usar como nome do arquivo
    const safeTitle = sanitizeFileName(title || videoId);
    const filePrefix = `${safeTitle}-${resValue}p`;
    // Format selection: try vp9, fallback to any codec at resolution, then best available
    const formatStr = `bestvideo[height<=${resValue}][vcodec^=${codec}]+bestaudio/bestvideo[height<=${resValue}]+bestaudio/best[height<=${resValue}]/best`;
    const args = [
        url,
        '--no-playlist',
        '-f', formatStr,
        '--merge-output-format', 'mp4',
        '-o', `${outputPath}/${filePrefix}.%(ext)s`,
        '--newline', // one progress line per update
        '--no-warnings',
    ];
    if (cookiesPath && (0, fs_1.existsSync)(cookiesPath))
        args.push('--cookies', cookiesPath);
    if (proxy)
        args.push('--proxy', proxy);
    const LOCAL_FFMPEG = '/home/reg/projects/youtube-downloader/bin/ffmpeg';
    if ((0, fs_1.existsSync)(LOCAL_FFMPEG)) {
        args.push('--ffmpeg-location', '/home/reg/projects/youtube-downloader/bin');
    }
    console.log(`[worker] Running: ${YT_DLP_BIN} ${args.join(' ')}`);
    const childEnv = { ...process.env };
    childEnv.PATH = `/home/reg/projects/youtube-downloader/bin:${childEnv.PATH || ''}`;
    const proc = (0, child_process_1.spawn)(YT_DLP_BIN, args, { env: childEnv });
    // yt-dlp sends progress to stderr in newer versions, stdout in some older versions
    const handleOutput = (data) => {
        const text = data.toString();
        // Match "[download]  45.3% of ..." or "[download]  45.3%"
        const match = text.match(/\[download\]\s+([\d.]+)%/);
        if (match) {
            const pct = parseFloat(match[1]);
            sendProgress(channel, userId, jobId, 'downloading', pct);
        }
        // Detect muxing phase
        if (text.includes('[Merger]') || text.includes('Merging formats')) {
            sendProgress(channel, userId, jobId, 'muxing', 99);
        }
        if (process.env.NODE_ENV !== 'production')
            process.stdout.write(`[yt-dlp] ${text}`);
    };
    proc.stdout.on('data', handleOutput);
    proc.stderr.on('data', handleOutput);
    return new Promise((resolve, reject) => {
        proc.on('close', async (code) => {
            if (code === 0) {
                const finalFilePath = `${outputPath}/${filePrefix}.mp4`;
                await database_1.prisma.download.update({
                    where: { id: jobId },
                    data: { status: 'completed', errorMessage: null, filePath: finalFilePath }
                });
                sendProgress(channel, userId, jobId, 'completed', 100);
                resolve();
            }
            else {
                const msg = `yt-dlp exited with code ${code}`;
                await database_1.prisma.download.update({
                    where: { id: jobId },
                    data: { status: 'error', errorMessage: msg }
                });
                sendProgress(channel, userId, jobId, 'error', undefined, msg);
                reject(new Error(msg));
            }
        });
        proc.on('error', async (err) => {
            await database_1.prisma.download.update({
                where: { id: jobId },
                data: { status: 'error', errorMessage: err.message }
            });
            sendProgress(channel, userId, jobId, 'error', undefined, err.message);
            reject(err);
        });
    });
};
exports.processDownloadJob = processDownloadJob;

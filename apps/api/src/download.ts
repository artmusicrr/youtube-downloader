import { Request, Response } from 'express';
import { prisma } from 'database';
import { getChannel } from './queue';
import { existsSync } from 'fs';
import { exec } from 'child_process';
import path from 'path';

export const downloadHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, videoId, title, channel, resolution, codec, url } = req.body;

    // Ensure the user exists (upsert for local/anonymous usage)
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, name: userId },
    });

    // Get user settings or create defaults
    const settings = await prisma.settings.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        downloadPath: process.env.DOWNLOAD_PATH || '/tmp/downloads',
        proxy: process.env.YT_PROXY || '',
        cookiesContent: '',
      },
    });

    const download = await prisma.download.create({
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
    const mqChannel = getChannel();
    mqChannel.sendToQueue('download_queue', Buffer.from(JSON.stringify(jobPayload)), { persistent: true });
    res.json({ message: 'Job created', job: download });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create job' });
  }
};

export const queueHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const downloads = await prisma.download.findMany({
      where: { userId },
      orderBy: { downloadDate: 'desc' },
      take: 50,
    });
    res.json(downloads);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
};

export const clearQueueHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { count } = await prisma.download.deleteMany({
      where: { userId, status: { in: ['error', 'completed'] } },
    });
    res.json({ deleted: count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to clear queue' });
  }
};

export const fileServeHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const download = await prisma.download.findUnique({ where: { id } });
    if (!download || !download.filePath) {
      res.status(404).json({ error: 'File not found or not finished' });
      return;
    }
    if (!existsSync(download.filePath)) {
      res.status(404).json({ error: 'File does not exist on disk' });
      return;
    }
    // Set headers to trigger file download in browser
    res.download(download.filePath);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
};

export const openFolderHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const download = await prisma.download.findUnique({ where: { id } });
    if (!download || !download.filePath) {
      res.status(404).json({ error: 'Download not found or not finished' });
      return;
    }

    const dirPath = path.dirname(download.filePath);
    if (!existsSync(dirPath)) {
      res.status(404).json({ error: 'Directory does not exist' });
      return;
    }

    let command = '';
    if (process.platform === 'darwin') {
      command = `open -R "${download.filePath}"`;
    } else if (process.platform === 'win32') {
      command = `explorer.exe /select,"${download.filePath.replace(/\//g, '\\')}"`;
    } else {
      command = `xdg-open "${dirPath}"`;
    }

    exec(command, (error) => {
      if (error) {
        console.error(`Failed to open folder: ${error.message}`);
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to open folder' });
  }
};

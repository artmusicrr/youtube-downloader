"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveSettingsHandler = exports.getSettingsHandler = void 0;
const database_1 = require("database");
const getSettingsHandler = async (req, res) => {
    try {
        const { userId } = req.params;
        // Ensure the user exists before fetching settings
        await database_1.prisma.user.upsert({
            where: { id: userId },
            update: {},
            create: { id: userId, name: userId },
        });
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
        res.json(settings);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
};
exports.getSettingsHandler = getSettingsHandler;
const saveSettingsHandler = async (req, res) => {
    try {
        const { userId } = req.params;
        const { downloadPath, proxy, cookiesContent } = req.body;
        // Validate downloadPath
        if (!downloadPath || typeof downloadPath !== 'string') {
            res.status(400).json({ error: 'Invalid downloadPath' });
            return;
        }
        // Ensure the user exists before creating settings
        await database_1.prisma.user.upsert({
            where: { id: userId },
            update: {},
            create: { id: userId, name: userId },
        });
        const settings = await database_1.prisma.settings.upsert({
            where: { userId },
            update: {
                downloadPath,
                proxy: proxy || '',
                cookiesContent: cookiesContent || '',
            },
            create: {
                userId,
                downloadPath,
                proxy: proxy || '',
                cookiesContent: cookiesContent || '',
            },
        });
        res.json({ message: 'Settings saved successfully', settings });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save settings' });
    }
};
exports.saveSettingsHandler = saveSettingsHandler;

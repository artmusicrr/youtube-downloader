"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadataHandler = exports.searchHandler = void 0;
const youtube_dl_exec_1 = __importDefault(require("youtube-dl-exec"));
const axios_1 = __importDefault(require("axios"));
const searchHandler = async (req, res) => {
    try {
        const q = req.query.q;
        if (!q) {
            res.status(400).json({ error: 'Missing query' });
            return;
        }
        const pageToken = req.query.pageToken;
        const maxResults = 15;
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (apiKey) {
            try {
                const response = await axios_1.default.get(`https://www.googleapis.com/youtube/v3/search`, {
                    params: {
                        part: 'snippet',
                        q: q,
                        maxResults: maxResults,
                        type: 'video',
                        key: apiKey,
                        ...(pageToken ? { pageToken } : {})
                    }
                });
                const items = response.data.items
                    .filter((item) => item.id?.videoId) // Filter out channels or playlists if any
                    .map((item) => ({
                    id: item.id.videoId,
                    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
                    title: item.snippet.title,
                    uploader: item.snippet.channelTitle,
                    channel: item.snippet.channelTitle,
                    thumbnails: [{ url: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url }]
                }));
                res.json({ entries: items, nextPageToken: response.data.nextPageToken });
                return;
            }
            catch (err) {
                console.warn('YouTube API search failed, falling back to yt-dlp:', err);
            }
        }
        // Fallback search using yt-dlp
        // If pageToken is present, it will be a page number (0-indexed)
        const parsedPage = pageToken ? parseInt(pageToken) : 0;
        const pageIndex = isNaN(parsedPage) ? 0 : parsedPage;
        const countToFetch = (pageIndex + 1) * maxResults;
        const output = await (0, youtube_dl_exec_1.default)(`ytsearch${countToFetch}:${q}`, {
            dumpJson: true,
            flatPlaylist: true,
        });
        const allEntries = output.entries || [];
        const startIndex = pageIndex * maxResults;
        const pageEntries = allEntries.slice(startIndex, startIndex + maxResults);
        const hasNextPage = allEntries.length >= countToFetch;
        const nextPageToken = hasNextPage ? (pageIndex + 1).toString() : undefined;
        res.json({ entries: pageEntries, nextPageToken });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Search failed' });
    }
};
exports.searchHandler = searchHandler;
const metadataHandler = async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) {
            res.status(400).json({ error: 'Missing url' });
            return;
        }
        const metadata = await (0, youtube_dl_exec_1.default)(url, { dumpJson: true });
        res.json(metadata);
    }
    catch (error) {
        res.status(500).json({ error: 'Metadata fetch failed' });
    }
};
exports.metadataHandler = metadataHandler;

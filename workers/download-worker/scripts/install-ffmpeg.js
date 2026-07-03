const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyBinary(srcPath, destPath) {
  if (!srcPath || !fs.existsSync(srcPath)) return false;
  fs.copyFileSync(srcPath, destPath);
  if (process.platform !== 'win32') {
    try { fs.chmodSync(destPath, 0o755); } catch (e) {}
  }
  return true;
}

function main() {
  const repoRoot = path.join(__dirname, '..', '..', '..');
  const platform = process.platform;

  const platformDir = platform === 'win32' ? 'windows' : (platform === 'darwin' ? 'macos' : 'linux');
  const destDir = path.join(repoRoot, 'bin', platformDir);
  ensureDir(destDir);

  let ffmpegSrc;
  let ffprobeSrc;
  try {
    ffmpegSrc = require('ffmpeg-static');
  } catch (e) {}
  try {
    ffprobeSrc = require('ffprobe-static').path;
  } catch (e) {}

  // Fallbacks: if require returned falsy, try resolving from node_modules path
  if (!ffmpegSrc) {
    try { ffmpegSrc = require.resolve('ffmpeg-static'); } catch (e) {}
  }

  if (!ffprobeSrc) {
    try { ffprobeSrc = require.resolve('ffprobe-static'); } catch (e) {}
  }

  // If resolve returned package root, try require to get actual binary path
  if (ffmpegSrc && ffmpegSrc.endsWith('index.js')) {
    try { ffmpegSrc = require('ffmpeg-static'); } catch (e) {}
  }

  if (ffprobeSrc && ffprobeSrc.endsWith('index.js')) {
    try { ffprobeSrc = require('ffprobe-static').path; } catch (e) {}
  }

  const ffmpegDest = path.join(destDir, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const ffprobeDest = path.join(destDir, platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');

  const copiedFfmpeg = copyBinary(ffmpegSrc, ffmpegDest);
  const copiedFfprobe = copyBinary(ffprobeSrc, ffprobeDest);

  console.log('install-ffmpeg: platform=', platform);
  console.log('ffmpeg src=', ffmpegSrc, '->', ffmpegDest, 'copied=', copiedFfmpeg);
  console.log('ffprobe src=', ffprobeSrc, '->', ffprobeDest, 'copied=', copiedFfprobe);
}

main();

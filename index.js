'use strict';

import fs from 'fs';
import readline from 'readline';

import { open } from './src/torrent-Parser.js';
import { startDownloading } from './src/downloads.js';

function isTorrentFile(path) {
  try {
    return fs.statSync(path).isFile();
  } catch (_) {
    return false;
  }
}

function stripQuotes(path) {
  return path.replace(/^"(.*)"$/, '$1');
}

// Ask on the terminal until the user names an existing file.
async function askForTorrentPath(rl) {
  const ask = (question) => new Promise(resolve => rl.question(question, resolve));

  let path = (await ask('Enter the name or location of the .torrent file: ')).trim();
  path = stripQuotes(path);

  while (!isTorrentFile(path)) {
    console.log(`Could not find "${path}". Please try again.`);
    path = stripQuotes((await ask('Enter the name or location of the .torrent file: ')).trim());
  }

  return path;
}

// Read every line from piped/closed stdin and pick the first valid torrent path.
async function readPipedTorrentPath() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const lines = [];

  for await (const line of rl) {
    const trimmed = stripQuotes(line.trim());
    if (trimmed) lines.push(trimmed);
  }

  for (const path of lines) {
    if (isTorrentFile(path)) return path;
    console.log(`Could not find "${path}".`);
  }

  return null;
}

async function main() {
  let torrentPath = process.argv[2];

  if (!isTorrentFile(torrentPath)) {
    if (torrentPath !== undefined) {
      console.log(`Could not find "${torrentPath}".`);
      torrentPath = undefined;
    }

    if (process.stdin.isTTY) {
      torrentPath = await askForTorrentPath(readline.createInterface({ input: process.stdin, output: process.stdout }));
    } else {
      torrentPath = await readPipedTorrentPath();
      if (!torrentPath) {
        console.error('No valid torrent file provided. Usage: node index.js <file.torrent>');
        process.exit(1);
      }
    }
  }

  let torrent;
  try {
    torrent = open(torrentPath);
  } catch (err) {
    console.error(`"${torrentPath}" is not a valid .torrent file (${err.message}).`);
    process.exit(1);
  }

  console.log(`Starting download of "${torrent.info.name}" ...`);
  startDownloading(torrent);
}

main();

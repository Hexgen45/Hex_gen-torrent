'use strict';
import net from 'net'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getPeers } from './tracker.js';
import { buildHandshake, msg_parse, buildRequest, buildInterested } from './message.js'
import { pieceLen, Size } from './torrent-Parser.js'
import Pieces from './pieces.js';
import Queue from './queue.js';
import ProgressBar from './progress.js';

const DOWNLOAD_DIR = 'downloads';

// Map every file in the torrent to its position in the global piece stream.
// Single-file torrents are saved as  downloads/<name>
// Multi-file torrents are saved as  downloads/<name>/<file path...>
function buildFileMap(torrent) {
  const folder = path.join(DOWNLOAD_DIR, torrent.info.name);

  if (torrent.info.files) {
    let offset = 0;
    const files = torrent.info.files.map(file => {
      const segments = file.path.map(seg => Buffer.from(seg).toString('utf8'));
      const f = { abs: path.join(folder, ...segments), length: file.length, offset };
      offset += file.length;
      return f;
    });
    return { folder, files };
  }

  return {
    folder,
    files: [{ abs: folder, length: Number(Size(torrent)), offset: 0 }]
  };
}

function openFiles(files) {
  for (const f of files) {
    fs.mkdirSync(path.dirname(f.abs), { recursive: true });
    f.fd = fs.openSync(f.abs, 'w');
  }
}

// Write a verified piece buffer at its place in the global stream,
// splitting it across the files it covers.
function writePiece(files, pieceIndex, pieceBuf, torrent) {
  const pieceLength = torrent.info['piece length'];
  const start = pieceIndex * pieceLength;
  const end = start + pieceBuf.length;

  for (const f of files) {
    const fileEnd = f.offset + f.length;
    if (fileEnd <= start || f.offset >= end) continue;

    const from = Math.max(start, f.offset) - start;         // slice inside piece buffer
    const to = Math.min(end, fileEnd) - start;
    const position = Math.max(start, f.offset) - f.offset;  // position inside the file

    fs.writeSync(f.fd, pieceBuf, from, to - from, position);
  }
}

export function startDownloading(torrent) {
  getPeers(torrent, peers => {
    if (!peers.length) {
      console.error('No peers returned by the tracker — nothing to download from.');
      return;
    }
    downloadFromPeers(torrent, peers);
  })
}

function downloadFromPeers(torrent, peers) {
  const { folder, files } = buildFileMap(torrent);
  openFiles(files);

  const ctx = {
    torrent,
    files,
    totalPieces: torrent.info.pieces.length / 20,
    donePieces: 0,
    doneBytes: 0,
    peers: peers.length,
    pieceBuffers: new Map(),
    pieces: new Pieces(torrent),
    bar: new ProgressBar({
      label: torrent.info.name,
      totalPieces: torrent.info.pieces.length / 20,
      totalBytes: Number(Size(torrent))
    }),
    sockets: new Set(),
    finished: false
  };

  console.log(`Saving to: ${path.resolve(folder)}`);
  ctx.bar.update(0, 0, ctx.peers);

  peers.forEach(peer => Download(peer, ctx));
}

function Download(peer, ctx) {
  const socket = new net.Socket();
  ctx.sockets.add(socket);
  socket.on('error', () => {});
  socket.connect(peer.port, peer.ip, () => {
    socket.write(buildHandshake(ctx.torrent));
  });

  const queue = new Queue(ctx.torrent);
  onWholeMsg(socket, msg => msgHandler(msg, socket, queue, ctx));
}

function onWholeMsg(socket, callback) {
  let savedBuf = Buffer.alloc(0);
  let handshake = true;

  socket.on('data', recvBuf => {
    // msgLen calculates the length of a whole message
    const msgLen = () => handshake ? savedBuf.readUInt8(0) + 49 : savedBuf.readInt32BE(0) + 4;
    savedBuf = Buffer.concat([savedBuf, recvBuf]);

    while (savedBuf.length >= 4 && savedBuf.length >= msgLen()) {
      callback(savedBuf.slice(0, msgLen()));
      savedBuf = savedBuf.slice(msgLen());
      handshake = false;
    }
  });
}

function msgHandler(msg, socket, queue, ctx) {
  if (isHandshake(msg)) {
    socket.write(buildInterested());
  }
  else {
    const m = msg_parse(msg);

    if (m.id === 0) chokeHandler(socket);
    if (m.id === 1) unchokeHandler(socket, ctx.pieces, queue);
    if (m.id === 4) haveHandler(socket, ctx.pieces, queue, m.payload);
    if (m.id === 5) bitfieldHandler(socket, ctx.pieces, queue, m.payload);
    if (m.id === 7) pieceHandler(socket, queue, ctx, m.payload);
  }
}


function isHandshake(msg) {
  return msg.length === msg.readUInt8(0) + 49 &&
    msg.toString('utf8', 1) === 'BitTorrent protocol';
}

function chokeHandler(socket) {
  socket.end();
}

function unchokeHandler(socket, pieces, queue) {
  queue.choked = false;

  requestPiece(socket, pieces, queue);
}

// Assemble, verify and save a completed piece. Returns true if the hash matched.
function savePiece(ctx, pieceIndex, queue) {
  const pieceBuf = ctx.pieceBuffers.get(pieceIndex);

  const expected = Buffer.from(ctx.torrent.info.pieces.slice(pieceIndex * 20, pieceIndex * 20 + 20));
  const actual = crypto.createHash('sha1').update(pieceBuf).digest();

  ctx.pieceBuffers.delete(pieceIndex);

  if (!actual.equals(expected)) {
    // Corrupt piece: forget it so the blocks get requested and re-sent
    ctx.pieces.resetPiece(pieceIndex);
    queue.queue(pieceIndex);
    return false;
  }

  writePiece(ctx.files, pieceIndex, pieceBuf, ctx.torrent);

  ctx.donePieces += 1;
  ctx.doneBytes += pieceBuf.length;
  ctx.bar.update(ctx.donePieces, ctx.doneBytes, ctx.peers);

  return true;
}

function finishDownload(ctx, socket) {
  if (ctx.finished) return;
  ctx.finished = true;

  for (const f of ctx.files) {
    try { fs.closeSync(f.fd); } catch (_) {}
  }

  ctx.bar.finish(
    `Done \u2713  ${ctx.donePieces} pieces verified and saved to ${path.resolve(DOWNLOAD_DIR, ctx.torrent.info.name)}`
  );

  for (const s of ctx.sockets) s.destroy();
}

function pieceHandler(socket, queue, ctx, pieceResp) {
  if (ctx.finished) return;

  const pieceIndex = pieceResp.index;
  const pieceLength = pieceLen(ctx.torrent, pieceIndex);

  let pieceBuf = ctx.pieceBuffers.get(pieceIndex);
  if (!pieceBuf) {
    pieceBuf = Buffer.alloc(pieceLength);
    ctx.pieceBuffers.set(pieceIndex, pieceBuf);
  }
  pieceResp.block.copy(pieceBuf, pieceResp.begin);
  ctx.pieces.addReceived(pieceResp);

  if (!ctx.pieces.isPieceComplete(pieceIndex)) {
    requestPiece(socket, ctx.pieces, queue);
    return;
  }

  savePiece(ctx, pieceIndex, queue);

  if (ctx.donePieces === ctx.totalPieces) {
    finishDownload(ctx, socket);
    return;
  }

  requestPiece(socket, ctx.pieces, queue);
}

function requestPiece(socket, pieces, queue) {
  if (queue.choked) return null;

  while (queue.length()) {
    const pieceBlock = queue.deque();
    if (pieces.needed(pieceBlock)) {

      socket.write(buildRequest(pieceBlock));
      pieces.addRequested(pieceBlock);
      break;
    }
  }

}

function haveHandler(socket, pieces, queue, payload) {
  const pieceIndex = payload.readUInt32BE(0);
  const queueEmpty = queue.length() === 0;
  queue.queue(pieceIndex);
  if (queueEmpty) requestPiece(socket, pieces, queue);
}

function bitfieldHandler(socket, pieces, queue, payload) {
  const queueEmpty = queue.length() === 0;
  payload.forEach((byte, i) => {
    for (let j = 0; j < 8; j++) {
      if (byte % 2) queue.queue(i * 8 + 7 - j);
      byte = Math.floor(byte / 2);
    }
  });
  if (queueEmpty) requestPiece(socket, pieces, queue);
}

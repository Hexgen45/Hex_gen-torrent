'use strict';
import net from 'net'
import fs from 'fs'
import { getPeers } from './src/tracker.js';
import { buildHandshake, msg_parse, buildRequest, buildInterested, msg_parse } from './message.js'
import Pieces from './pieces.js';
import Queue from './Queue.js';


export function startDownloading(torrent, path){
  getPeers(torrent, peers => {
    const pieces = new Pieces(torrent);
    const file = fs.openSync(path, 'w');
    peers.foreach(peer => Download(peer, torrent, pieces, file));
  })
}

function Download(peer, torrent, pieces, file) {
  const socket = net.Socket();
  socket.on('error', console.log);
  socket.connect(peer.port, peer.ip, () => {
    socket.write(buildHandshake(torrent));
  });

  const queue = new Queue(torrent);
  onWholeMsg(socket, msg => msgHandler(msg, socket, pieces, queue, file));

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

function msgHandler(msg, socket, pieces, queue, file) {
  if (isHandshake(msg)) {
    socket.write(buildInterested());
  }
  else {
    const m = msg_parse(msg);

    if (m.id === 0) chokeHandler(socket);
    if (m.id === 1) unchokeHandler(socket, pieces, queue);
    if (m.id === 4) haveHandler(socket, pieces, queue, m.payload);
    if (m.id === 5) bitfieldHandler(socket, pieces, queue, m.payload);
    if (m.id === 7) pieceHandler(socket, pieces, queue, torrent,m.payload, file);
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

function pieceHandler(socket, pieces, queue, torrent, pieceResp, file) {
  console.log(pieceResp);
  pieces.addRecivied(pieceResp);

  const offset = pieceResp.index * torrent.info['piece length'] + pieceResp.begin;
  fs.write(file, pieceResp.block, 0, pieceResp.block.length, offset, () => {});

  if (pieces.isDone()) {
    console.log("DONE!");
    socket.end();
    try { fs.closeSync(file); } catch(e) {}
  }
  else {
    requestPiece(socket, pieces, queue)
  }

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
  const queueEmpty = queue.length === 0;
  queue.queue(pieceIndex);
  if (queueEmpty) requestPiece(socket, pieces, queue);
}

function bitfieldHandler(socket, pieces, queue, payload) {
  const queueEmpty = queue.length === 0;
  payload.forEach((byte, i) => {
    for (let j = 0; j < 8; j++) {
      if (byte % 2) queue.queue(i * 8 + 7 - j);
      byte = Math.floor(byte / 2);
    }
  });
  if (queueEmpty) requestPiece(socket, pieces, queue);
}
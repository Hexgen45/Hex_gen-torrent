'use strict';

import fs from 'fs'
import bencode from 'bencode'
import crypto from 'crypto';

export function open (filePath) {
    return bencode.decode(fs.readFileSync(filePath), 'utf-8');
};

export function size (torrent) {
    const size = torrent.info.files ? 
    torrent.info.files.map(file => file.length).reduce((a, b) => a + b) :
    torrent.info.length;

    const big = BigInt(size)

    const buf = Buffer.alloc(8);

    buf.writeBigUInt64BE(big);

    return buf
}

export function infoHash(torrent){
    
    const info = bencode.encode(torrent.info);
    
    return crypto.createHash('sha1').update(info).digest();
}

export const BLOCK_LEN = 2 ** 14; // 16KB (16384)

// Convert torrent size buffer (from .info.length or .info.files) into a number
export function Size(torrent) {
  if (torrent.info.length) {
    // Single-file torrent
    return BigInt(torrent.info.length);
  } else {
    // Multi-file torrent
    return torrent.info.files
      .map(file => BigInt(file.length))
      .reduce((a, b) => a + b, 0n);
  }
}

export function pieceLen(torrent, pieceIndex) {
  const totalLength = Size(torrent);
  const pieceLength = BigInt(torrent.info['piece length']);

  const lastPieceLength = totalLength % pieceLength;
  const lastPieceIndex = totalLength / pieceLength;

  // If it's the last piece, return its remainder length, otherwise full piece length
  return pieceIndex === Number(lastPieceIndex)
    ? Number(lastPieceLength || pieceLength)
    : Number(pieceLength);
}

export function blocksPerPiece(torrent, pieceIndex) {
  const pieceLength = pieceLen(torrent, pieceIndex);
  return Math.ceil(pieceLength / BLOCK_LEN);
}

export function blockLen(torrent, pieceIndex, blockIndex) {
  const pieceLength = pieceLen(torrent, pieceIndex);

  const lastBlockLength = pieceLength % BLOCK_LEN;
  const lastBlockIndex = Math.floor(pieceLength / BLOCK_LEN);

  return blockIndex === lastBlockIndex && lastBlockLength !== 0
    ? lastBlockLength
    : BLOCK_LEN;
}

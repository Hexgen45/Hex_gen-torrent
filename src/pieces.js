'use strict';

import { blocksPerPiece, BLOCK_LEN } from './torrent-Parser.js';

export default class PieceTracker {
  constructor(torrent) {
    const buildPiecesArray = () => {
      const nPieces = torrent.info.pieces.length / 20; // each SHA1 hash = 20 bytes
      const arr = new Array(nPieces).fill(null);
      return arr.map((_, i) =>
        new Array(blocksPerPiece(torrent, i)).fill(false)
      );
    };

    this._requested = buildPiecesArray();
    this._received = buildPiecesArray();
  }

  addRequested(pieceBlock) {
    const blockIndex = pieceBlock.begin / BLOCK_LEN;
    this._requested[pieceBlock.index][blockIndex] = true;
  }

  addReceived(pieceBlock) {
    const blockIndex = pieceBlock.begin / BLOCK_LEN;
    this._received[pieceBlock.index][blockIndex] = true;
  }

  needed(pieceBlock) {
    // If ALL blocks have been requested at least once,
    // reset requested state = received state (start new cycle for missing ones)
    if (this._requested.every(blocks => blocks.every(i => i))) {
      this._requested = this._received.map(blocks => blocks.slice());
    }
    const blockIndex = pieceBlock.begin / BLOCK_LEN;
    return !this._requested[pieceBlock.index][blockIndex];
  }

  isDone() {
    return this._received.every(blocks => blocks.every(i => i));
  }
}

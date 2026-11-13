'use strict';

const BAR_WIDTH = 30;
const LINE_WIDTH = 110;

function fmtMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export default class ProgressBar {
  constructor({ label, totalPieces, totalBytes }) {
    this.label = label.length > 36 ? label.slice(0, 33) + '...' : label;
    this.totalPieces = totalPieces;
    this.totalBytes = totalBytes;
  }

  update(donePieces, doneBytes, peers) {
    const pct = this.totalPieces
      ? Math.floor((donePieces / this.totalPieces) * 100)
      : 100;
    const filled = this.totalPieces
      ? Math.round((donePieces / this.totalPieces) * BAR_WIDTH)
      : BAR_WIDTH;
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(BAR_WIDTH - filled);

    const line =
      `Downloading "${this.label}"  [${bar}] ` +
      `${String(pct).padStart(3)}%  ` +
      `(${donePieces}/${this.totalPieces} pieces, ` +
      `${fmtMB(doneBytes)}/${fmtMB(this.totalBytes)} MB, ${peers} peers)`;

    process.stdout.write('\r' + line.padEnd(LINE_WIDTH));
  }

  finish(message) {
    process.stdout.write('\r' + ' '.repeat(LINE_WIDTH) + '\r' + message + '\n');
  }
}

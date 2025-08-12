'use strict';

import fs from 'fs'
import bencode from 'bencode'
import { toBufferBE, toBigIntBE } from 'bigint-buffer'

export function open (filePath) {
    return bencode.decode(fs.readFileSync(filePath), 'utf-8');
};

export function size (torrent) {
    const size = torrent.info.files ? 
    torrent.info.files.map(file => file.length).reduce((a, b) => a + b) :
    torrent.info.length;

    return toBufferBE(BigInt(size), 8)
}

export function infoHash(torrent){
    const info = bencode.decode(torrent.info);
    return crypto.createHash('sha1').update(info).digest();
}
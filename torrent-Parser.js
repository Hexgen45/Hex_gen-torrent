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
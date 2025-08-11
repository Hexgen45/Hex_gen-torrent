'use strict';

import fs from 'fs'
import bencode from 'bencode'

import { getPeers } from './tracker.js';

const torrent = bencode.decode(fs.readFileSync('./puppy.torrent'),'utf-8');

getPeers(torrent, peers => {
    console.log('list of peers', peers)
})
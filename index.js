'use strict';

import fs from 'fs'
import bencode from 'bencode'

import { getPeers } from './tracker.js';
import {open} from './torrent-Parser.js'

// const torrent = open('./Title_Pending [FitGirl Repack].torrent');
const torrent = open('./electronics.torrent');
// console.log(torrent)

getPeers(torrent, peers => {
    console.log('list of peers', peers)
})
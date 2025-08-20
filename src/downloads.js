'use strict';
import { getPeers } from './src/tracker.js';

getPeers(torrent, peers => {
    console.log('list of peers', peers)
})
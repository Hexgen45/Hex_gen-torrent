'use strict';


import {open} from './src/torrent-Parser.js';
import {startDownloading} from './src/downloads.js';

const torrent = open(process.argv[2]);

startDownloading(torrent,torrent.info.name);
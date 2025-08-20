'use strict';

import fs from 'fs'
import bencode from 'bencode'

import {open} from './src/torrent-Parser.js';
import {Download} from './src/downloads.js';

const torrent = open(process.argv[2]);

Download(torrent);
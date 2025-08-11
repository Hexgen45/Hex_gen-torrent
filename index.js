'use strict';

import fs from 'fs'
import bencode from 'bencode'

import dgram from 'dgram'
import urlParser from 'url'

const torrent = bencode.decode(fs.readFileSync('./puppy.torrent'),'utf-8');

const url = urlParser.parse(torrent["announce"])

const socket = dgram.createSocket('udp4')

const msg1 = Buffer.from('Hello?', 'utf-8')

socket.send(msg1, 0, msg1.length, url.port, url.host, ()=>{})

socket.on('message', (msg)=>{
    console.log("message is", msg)
})
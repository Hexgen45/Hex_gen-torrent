'use strict';
import { getPeers } from './src/tracker.js';
import net from 'net'

getPeers(torrent, peers => {
    peers.foreach();
})

function Download(peer){
    const socket = net.Socket();
    socket.on('error', console.log);
    socket.connect(peer.port, peer.ip, ()=>{
        //socket.write(....)
    });
    
    socket.on('data', data =>{
        //handle response here
    });
}


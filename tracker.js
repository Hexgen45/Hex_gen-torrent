
import dgram from 'dgram'
import urlParse from 'url'

export function getPeers (torrent, callback) {
    const socket = dgram.createSocket('udp4')
    const url = urlParse.parse(torrent["announce"])

    

}



get
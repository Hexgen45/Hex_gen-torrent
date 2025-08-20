"use strict";

import crypto from 'crypto'

let id = null;

export function getId () {
    if (!id){
        id = crypto.randomBytes(20)
        Buffer.from('-HT0001-').copy(id, 0)
    }
    return id;
};

// export default getId;
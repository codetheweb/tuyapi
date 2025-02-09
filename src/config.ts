import { createHash } from 'node:crypto'

const UDP_KEY_STRING = 'yGAdlopoPVldABfn'

export const UDP_KEY = createHash('md5').update(UDP_KEY_STRING, 'utf8').digest()

// ESM 모듈 (import * as log from './log.js')
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export function addLog(message) {
    console.log(`[INFO ${ts()}] ${message}`);
}

export function addErrorLog(message) {
    console.error(`[ERROR ${ts()}] ${message}`);
}

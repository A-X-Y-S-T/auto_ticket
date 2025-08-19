import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as log from './log.js';

import { waitLoginAcrossPages } from './auth.js';
import { installSnipeSchedulerOverlay } from './snipeOverlay.js';
import { patchFncheck } from './fnpatch.js';   // 🔹 추가

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const USER_DATA_DIR = path.join(__dirname, 'chrome-profile-interpark');
const HOME_URL = 'https://ticket.interpark.com/';
const TARGET_URL = 'https://ticket.interpark.com/Contents/Sports/Bridge/baseball';

async function main() {
    log.section('INTERPARK ▶ LOGIN ▶ BASEBALL ▶ SNIPE SCHEDULER');

    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: false,
        channel: 'chrome',
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        args: ['--lang=ko-KR'],
    });

    log.attachPageConsole(context);

    try {
        await installSnipeSchedulerOverlay(context);
        await patchFncheck(context);   // 🔹 추가

        const page = await context.newPage();
        log.addLog('인터파크 메인을 엽니다. 브라우저에서 직접 로그인하세요.');
        await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

        log.addLog('로그인 완료를 감지 중… (최대 10분)');
        const loggedPage = await waitLoginAcrossPages(context, 10 * 60 * 1000);
        if (!loggedPage) {
            log.addErrorLog('로그인 감지 실패. 로그인 후 다시 실행하세요.');
            return;
        }
        log.addLog('로그인 감지됨!');

        await loggedPage.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        log.addLog(`이동 완료: ${TARGET_URL}`);
    } catch (e) {
        log.addErrorLog(`실패: ${e.message}`);
        try {
            const p = context.pages()[0];
            if (p) await p.screenshot({ path: path.join(__dirname, `error_${Date.now()}.png`), fullPage: true });
        } catch { }
    }
}

main().catch((e) => {
    log.addErrorLog(`Fatal: ${e.message}`);
    process.exit(1);
});

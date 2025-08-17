// Node >= 18
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as log from './log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const USER_DATA_DIR = path.join(__dirname, 'chrome-profile-interpark');
const HOME_URL = 'https://ticket.interpark.com/'; // 메인으로 보냄(수동 로그인)
const TARGET_URL = 'https://ticket.interpark.com/Contents/Sports/Bridge/baseball';

// 로그인 성공 신호
const LOGIN_OK_TEXT_REGEX = /(로그아웃|내\s*예약|마이페이지|회원정보)/i;
const LOGIN_OK_SELECTORS = [
    'a[href*="Logout"]',
    'a[href*="MyPage"]',
    'a[href*="MyTicket"]',
    '.link_mypage',
    '.link_logout',
];

// 일시적 차단/안내 문구(우회 X, 안내만)
const TEMP_BLOCK_REGEX = /(UNDER CONSTRUCTION|일시적으로|잠시 후|나중에 다시)/i;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function isLoggedIn(page) {
    // 셀렉터 우선
    const selHit = await page.evaluate((sels) => sels.some(s => document.querySelector(s)), LOGIN_OK_SELECTORS);
    if (selHit) return true;
    // 텍스트 보조
    const txtHit = await page.evaluate((reSrc) => new RegExp(reSrc, 'i').test(document.body?.innerText || ''), LOGIN_OK_TEXT_REGEX.source);
    return txtHit;
}

async function isTempBlocked(page) {
    return await page.evaluate((reSrc) => new RegExp(reSrc, 'i').test(document.body?.innerText || ''), TEMP_BLOCK_REGEX.source);
}

// 모든 탭 중 하나라도 로그인 상태가 되면 그 페이지를 반환
async function waitLoginAcrossPages(context, totalTimeoutMs = 10 * 60 * 1000) {
    const deadline = Date.now() + totalTimeoutMs;
    while (Date.now() < deadline) {
        for (const p of context.pages()) {
            if (await isTempBlocked(p)) log.addWarn('일시적 안내 화면 감지됨. 잠시 후 재확인합니다.');
            if (await isLoggedIn(p)) return p;
        }
        await Promise.race([
            context.waitForEvent('page', { timeout: 1000 }).catch(() => null),
            sleep(1000),
        ]);
    }
    return null;
}

async function main() {
    log.section('INTERPARK LOGIN ▶ BASEBALL');

    // 지속 프로필로 실행(세션/쿠키 재사용)
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: false,
        channel: 'chrome',   // 크롬 미설치면 이 줄 주석
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        args: ['--lang=ko-KR'],
    });

    // 브라우저 콘솔/요청 실패를 콘솔에만 출력
    log.attachPageConsole(context);

    try {
        const page = await context.newPage();
        log.addLog('인터파크 메인을 엽니다. 브라우저에서 직접 로그인하세요.');
        await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

        log.addLog('로그인 완료를 감지 중… (최대 10분)');
        const loggedPage = await waitLoginAcrossPages(context, 10 * 60 * 1000);
        if (!loggedPage) {
            log.addErrorLog('로그인 완료를 감지하지 못했습니다. 로그인 후 다시 실행해주세요.');
            return;
        }
        log.addLog('로그인 감지됨!');

        await loggedPage.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        log.addLog(`이동 완료: ${TARGET_URL}`);

        // await context.close(); // 유지하고 싶으면 주석 유지
    } catch (e) {
        log.addErrorLog(`실패: ${e.message}`);
        try {
            const p = context.pages()[0];
            if (p) await p.screenshot({ path: path.join(__dirname, `error_${Date.now()}.png`), fullPage: true });
        } catch { }
        // await context.close();
    }

}

main().catch(e => { log.addErrorLog(`Fatal: ${e.message}`); process.exit(1); });

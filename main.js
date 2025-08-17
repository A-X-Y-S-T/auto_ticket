// Node >= 18
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as log from './log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 브라우저 프로필 저장 위치(세션/쿠키 재사용)
const USER_DATA_DIR = path.join(__dirname, 'chrome-profile-interpark');

// 시작/목표 URL
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

// 일시적 차단/장애 문구(우회 X, 안내/대기만)
const TEMP_BLOCK_REGEX = /(UNDER CONSTRUCTION|일시적으로|잠시 후|나중에 다시)/i;

// ---------- helpers ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function isLoggedIn(page) {
    // 셀렉터 먼저
    const selHit = await page.evaluate((sels) => {
        return sels.some(s => document.querySelector(s));
    }, LOGIN_OK_SELECTORS);
    if (selHit) return true;

    // 텍스트 보조
    const txtHit = await page.evaluate((reSrc) => {
        const txt = document.body?.innerText || '';
        return new RegExp(reSrc, 'i').test(txt);
    }, LOGIN_OK_TEXT_REGEX.source);
    return txtHit;
}

async function isTempBlocked(page) {
    return await page.evaluate((reSrc) => {
        const txt = document.body?.innerText || '';
        return new RegExp(reSrc, 'i').test(txt);
    }, TEMP_BLOCK_REGEX.source);
}

// 모든 탭 중 하나라도 로그인 상태가 되면 그 페이지를 반환
async function waitLoginAcrossPages(context, totalTimeoutMs = 10 * 60 * 1000) {
    const deadline = Date.now() + totalTimeoutMs;

    while (Date.now() < deadline) {
        // 현재 열린 모든 페이지 점검
        for (const p of context.pages()) {
            if (await isTempBlocked(p)) {
                log.addLog('일시적 차단/안내 화면 감지됨. 잠시 후 자동 재확인합니다.');
            }
            if (await isLoggedIn(p)) return p;
        }
        // 새 탭이 생기거나 1초 타임아웃
        await Promise.race([
            context.waitForEvent('page', { timeout: 1000 }).catch(() => null),
            sleep(1000),
        ]);
    }
    return null;
}
// -----------------------------

async function main() {
    // 시스템 Chrome + 지속 프로필
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: false,
        channel: 'chrome',          // 크롬 미설치면 이 줄 주석 처리
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        args: ['--lang=ko-KR'],
    });

    // 콘솔 노이즈 줄이기(원하면 제거)
    context.on('page', (p) => {
        p.on('console', (msg) => {
            const t = msg.text();
            if (
                t.includes('Mixed Content') ||
                t.includes('React DevTools') ||
                t.includes('Attribution Reporting')
            ) return;
            log.addLog(`[브라우저] ${t}`);
        });
    });

    try {
        // 1) 인터파크 메인으로 보냄 → 네가 직접 로그인
        const page = await context.newPage();
        log.addLog('인터파크 메인을 엽니다. 브라우저에서 직접 로그인하세요.');
        await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

        // 2) 로그인 완료를 모든 탭에서 감지(최대 10분 대기)
        log.addLog('로그인 완료를 감지 중… (최대 10분)');
        const loggedPage = await waitLoginAcrossPages(context, 10 * 60 * 1000);
        if (!loggedPage) {
            log.addErrorLog('로그인 완료를 감지하지 못했습니다. 로그인 후 다시 실행해주세요.');
            return;
        }
        log.addLog('로그인 감지됨!');

        // 3) 야구 페이지로 이동
        await loggedPage.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        log.addLog(`이동 완료: ${TARGET_URL}`);

        // 프로필은 USER_DATA_DIR에 보존됨
        // await context.close();
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

/// 로그인 페이지 연결 부분
/// 사실상 페이지 이동만 관여

export const LOGIN_OK_TEXT_REGEX = /(로그아웃|내\s*예약|마이페이지|회원정보)/i;
export const LOGIN_OK_SELECTORS = [
    'a[href*="Logout"]',
    'a[href*="MyPage"]',
    'a[href*="MyTicket"]',
    '.link_mypage',
    '.link_logout',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function isLoggedIn(page) {
    const selHit = await page.evaluate(
        (sels) => sels.some((s) => document.querySelector(s)),
        LOGIN_OK_SELECTORS
    );
    if (selHit) return true;

    const txtHit = await page.evaluate(
        (reSrc) => new RegExp(reSrc, 'i').test(document.body?.innerText || ''),
        LOGIN_OK_TEXT_REGEX.source
    );
    return txtHit;
}

export async function waitLoginAcrossPages(context, totalTimeoutMs = 10 * 60 * 1000) {
    const deadline = Date.now() + totalTimeoutMs;
    while (Date.now() < deadline) {
        for (const p of context.pages()) {
            try {
                if (await isLoggedIn(p)) return p;
            } catch { }
        }
        await Promise.race([
            context.waitForEvent('page', { timeout: 1000 }).catch(() => null),
            sleep(1000),
        ]);
    }
    return null;
}

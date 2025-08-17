// log.js — ESM, console only

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export function section(title) {
    console.log(`---------- ${title} (${ts()}) ----------`);
}

export function addLog(message) {
    console.log(`[INFO  ${ts()}] ${message}`);
}

export function addWarn(message) {
    console.warn(`[WARN  ${ts()}] ${message}`);
}

export function addErrorLog(message) {
    console.error(`[ERROR ${ts()}] ${message}`);
}

/**
 * Playwright 콘솔/요청 실패 로깅을 연결하되, 잡음은 과감히 필터링
 * 사용법: attachPageConsole(context) 또는 attachPageConsole(page)
 */
export function attachPageConsole(target, opts = {}) {
    // 콘솔 메시지 무시 패턴
    const consoleIgnore = opts.consoleIgnore || [
        /Mixed Content/i,
        /React DevTools/i,
        /Attribution Reporting/i,
        /Unsatisfied version .* classnames/i,        // 모듈 페더레이션 경고
    ];

    // requestfailed 무시 조건
    const requestFailed = {
        // URL 기반 무시(애널리틱스/광고/이미지/CDN 청크 등)
        ignoreUrlRegexes: opts.ignoreUrlRegexes || [
            /(?:^|\.)google-analytics\.com/i,
            /analytics\.google\.com/i,
            /privacy-sandbox\/register-conversion/i,
            /bc\.ad\.daum\.net/i,
            /o\d+\.ingest\.[\w.]*sentry\.io/i,
            /ticketimage\.interpark\.com/i,              // 이미지 CDN
            /(?:^|\/)mf\/static\/chunks\//i,             // 청크 스크립트(탭 이동 시 자주 ABORT)
        ],
        // 에러 텍스트 기반 무시
        ignoreErrorRegexes: opts.ignoreErrorRegexes || [
            /^net::ERR_ABORTED/i,
            /blocked by client/i,
            /frame was detached/i,
            /target page, context or browser has been closed/i,
        ],
        // 리소스 타입 기반 무시
        ignoreResourceTypes: opts.ignoreResourceTypes || [
            'image', 'media', 'font', 'stylesheet', 'script' // 스크립트도 대부분 노이즈라 기본 필터
        ],
    };

    const hook = (p) => {
        // 콘솔 로그
        p.on('console', (msg) => {
            const t = msg.text();
            if (consoleIgnore.some(rx => rx.test(t))) return;
            addLog(`[브라우저:${msg.type()}] ${t}`);
        });

        // 요청 실패
        p.on('requestfailed', (req) => {
            const url = req.url();
            const err = req.failure()?.errorText || '';
            const type = req.resourceType();

            if (requestFailed.ignoreResourceTypes.includes(type)) return;
            if (requestFailed.ignoreUrlRegexes.some(rx => rx.test(url))) return;
            if (requestFailed.ignoreErrorRegexes.some(rx => rx.test(err))) return;

            addWarn(`[req failed] ${type.toUpperCase()} ${req.method()} ${url} :: ${err}`);
        });
    };

    // Page 또는 Context 모두 지원
    if (typeof target.pages === 'function') {
        // BrowserContext
        target.on('page', hook);
        for (const p of target.pages()) hook(p);
    } else {
        // Page
        hook(target);
    }
}

// 보안문자 뚫는 코드
// `fncheck()`를 `fnCheckOK()`로 바꿔 우회
// onclick="fnCheck()"이 있어도 원래 fnCheck 실행을 막고 fnCheckOK()만 실행


export async function patchFncheck(context) {
    context.on('page', async (page) => { await attach(page); });
    await Promise.all(context.pages().map(attach));

    async function attach(page) {
        await page.addInitScript(ensureScript);
        try { await page.evaluate(ensureRuntime); } catch { }
        page.on('domcontentloaded', async () => { try { await page.evaluate(ensureRuntime); } catch { } });
        page.on('frameattached', async (frame) => { try { await frame.evaluate(ensureRuntime); } catch { } });
        page.on('framenavigated', async (frame) => { try { await frame.evaluate(ensureRuntime); } catch { } });
    }
}

function ensureScript() { ensureRuntime(); }

function ensureRuntime() {
    if (window.__FNCHECK_INTERCEPT_INSTALLED__) return;
    window.__FNCHECK_INTERCEPT_INSTALLED__ = true;

    const W = window;

    // ─────────────────────────────────────────────
    // 0) 안전망: 전역 fnCheck를 fnCheckOK로 우회
    //    (사이트 코드가 직접 fnCheck() 호출하는 경우 대비)
    // ─────────────────────────────────────────────
    try {
        const desc = Object.getOwnPropertyDescriptor(W, 'fnCheck');
        if (!desc || ('value' in desc && desc.configurable !== false)) {
            let _val = W.fnCheck;
            Object.defineProperty(W, 'fnCheck', {
                configurable: true,
                enumerable: true,
                get() { return _val; },
                set(v) {
                    _val = (typeof v === 'function')
                        ? function (...args) {
                            if (typeof W.fnCheckOK === 'function') return W.fnCheckOK.apply(this, args);
                            // 대소문자 다른 경우도 혹시 모를 대비
                            if (typeof W.fncheckOK === 'function') return W.fncheckOK.apply(this, args);
                            return v.apply(this, args);
                        }
                        : v;
                }
            });
            // 이미 있으면 재적용
            if (typeof _val === 'function') {
                W.fnCheck = _val;
            }
        }
    } catch { }

    // ─────────────────────────────────────────────
    // 1) 전역 캡처(click) 리스너로 fnCheck 가로채기
    // ─────────────────────────────────────────────
    const RE_CALL = /\bfnCheck\s*\(/;

    function runOK(ctx, ev) {
        try {
            if (typeof W.fnCheckOK === 'function') return W.fnCheckOK.call(ctx, ev);
            if (typeof W.fncheckOK === 'function') return W.fncheckOK.call(ctx, ev);
            console.warn('[fnpatch] fnCheckOK 가 정의되지 않음');
        } catch (e) {
            console.error('[fnpatch] fnCheckOK 실행 실패:', e);
        }
        return undefined;
    }

    function interceptClick(ev) {
        // onclick 속성이 가장 가까운 조상에 있으면 사용
        const el = ev.target && (ev.target.closest ? ev.target.closest('[onclick]') : null);
        if (!el) return;

        // 실제 inline 속성 문자열 확인
        const code = (typeof el.getAttribute === 'function') ? (el.getAttribute('onclick') || '') : '';
        if (!RE_CALL.test(code)) return;

        // 원래 fnCheck 실행을 막고
        ev.stopImmediatePropagation();
        ev.preventDefault();

        // 대신 OK 실행
        runOK(el, ev);
    }

    // 캡처 단계에서 먼저 가로챈다
    document.addEventListener('click', interceptClick, true);

    // (선택) 키보드 엔터/스페이스로 "클릭"이 트리거되는 경우도 커버하고 싶으면 주석 해제
    // document.addEventListener('keydown', (ev) => {
    //   if (ev.key !== 'Enter' && ev.key !== ' ') return;
    //   const el = document.activeElement;
    //   if (!el) return;
    //   const code = (typeof el.getAttribute === 'function') ? (el.getAttribute('onclick') || '') : '';
    //   if (!RE_CALL.test(code)) return;
    //   ev.stopImmediatePropagation();
    //   ev.preventDefault();
    //   runOK(el, ev);
    // }, true);

    console.log('[fnpatch] click capture interceptor installed (fnCheck → fnCheckOK)');
}

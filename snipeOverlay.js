// snipeOverlay.js
// 오버레이 + 새로고침/클릭 루프 (좌표 고정 스나이프)
// - UI 컴팩트화, 모서리 라운딩, 입력 넘침 방지
// - 시간 입력 H/M/S/ms 분리
// - 파생 페이지(예매/좌석/결제 등)에서는 오버레이 표시 안 함
// - 우측 여백 제거(오른쪽 모서리에 딱 붙음), 드래그로 위치 이동 가능
// - 좌표만 찍고 그 좌표를 반복 클릭 + 리로드 후 스크롤 복원
// - 리로드해도 루프 끊기지 않도록 상태 저장/복원

export async function installSnipeSchedulerOverlay(context) {
    context.on('page', async (page) => { await attach(page); });
    await Promise.all(context.pages().map(attach));

    async function attach(page) {
        await page.addInitScript(ensureOverlayScript);
        try { await page.evaluate(ensureOverlayRuntime); } catch { }
        page.on('domcontentloaded', async () => { try { await page.evaluate(ensureOverlayRuntime); } catch { } });

        try {
            if (!page._snipeBindingsAdded) {
                page._snipeBindingsAdded = true;
                await page.exposeFunction('_playwright_reload', async () => {
                    try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 }); } catch { }
                });
                await page.exposeFunction('_playwright_clickAt', async (x, y) => {
                    try { await page.mouse.click(x, y, { delay: 0 }); } catch { }
                });
            }
        } catch { }
    }
}

/** addInitScript 훅 */
function ensureOverlayScript() { ensureOverlayRuntime(); }

/** 실제 런타임 주입 */
function ensureOverlayRuntime() {
    const HIDE_RE = /(Booking|Book|Seat|Reserve|Payment|Pay|Order|Cart|Check|My(Page|Ticket)|Gate|Queue|Popup)/i;
    if (HIDE_RE.test(location.href)) return;

    if (window.__SNIPE_OVERLAY_V3__) return;
    window.__SNIPE_OVERLAY_V3__ = true;

    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch { }

    // ───────── CSS ─────────
    const css = `
    #snipeOverlay{
      position:fixed; top:0; right:0; z-index:2147483647;
      background:rgba(20,22,28,.92); color:#fff;
      border-radius:0 0 0 10px; padding:8px; width:300px;
      box-shadow:none; font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
      backdrop-filter: blur(4px);
    }
    #snipeOverlay * { box-sizing: border-box; min-width:0; }
    #snipeOverlay h3{
      margin:0 0 6px 0; font-size:14px; cursor:move; user-select:none;
      display:flex; align-items:center; gap:6px; line-height:1.2;
    }
    #snipeOverlay .sub{
      font-size:11px; opacity:.8; margin-left:auto; padding:2px 6px; border-radius:999px; background:#30384a;
    }
    #snipeOverlay label{display:block;margin:4px 0 2px;font-size:11px;color:#cdd6e0}
    #snipeOverlay input{
      width:100%; padding:6px 8px; border-radius:8px; border:1px solid #394253;
      background:#10141c; color:#fff; font-size:12px; line-height:1.2;
    }
    #snipeOverlay .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:6px; }
    #snipeOverlay .grid3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; }
    #snipeOverlay .grid4{ display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:6px; }
    #snipeOverlay .row{ display:flex; gap:6px; }
    #snipeOverlay .row > * { flex: 1; }
    #snipeOverlay .btn{
      margin-top:6px; width:100%; padding:8px; border:none; border-radius:8px;
      background:#6ca0ff; color:#0a0f1a; font-weight:700; cursor:pointer; font-size:13px;
    }
    #snipeOverlay .btn.secondary{ background:#394253; color:#e8eefc; font-weight:600; }
    #snipeOverlay .btn.stop{ background:#ff6c6c; color:#2a0c0c; }
    #snipeOverlay .status{ margin-top:6px; font-size:11px; color:#bfe6bf; word-break:break-word; }
    #snipeOverlay .danger{ color:#ffbdbd }
    #snipeOverlay .hint{ font-size:10px; color:#9eb3d6; margin-top:6px; line-height:1.3 }
    #snipeMarker{
      position:fixed; width:9px; height:9px; border-radius:50%;
      background:#6ca0ff; border:2px solid #fff; pointer-events:none;
      z-index:2147483646; transform:translate(-50%,-50%); display:none
    }
    .__snipe_flash{ outline:2px solid #6ca0ff; outline-offset:2px; transition:outline .2s ease }
  `;
    const style = document.createElement('style');
    style.textContent = css; document.documentElement.appendChild(style);

    // ───────── UI ─────────
    const ui = document.createElement('div');
    ui.id = 'snipeOverlay';
    ui.innerHTML = `
    <h3 id="snHeader">⏱ 예매 스나이퍼 <span class="sub">compact</span></h3>

    <label>목표 시각 (로컬)</label>
    <div class="grid4">
      <input id="snH" placeholder="시" inputmode="numeric" maxlength="2">
      <input id="snM" placeholder="분" inputmode="numeric" maxlength="2">
      <input id="snS" placeholder="초" inputmode="numeric" maxlength="2">
      <input id="snMS" placeholder="ms" inputmode="numeric" maxlength="3">
    </div>

    <div class="grid3">
      <div><label>사전(초)</label><input id="snLead" type="number" step="0.1" value="2.5"></div>
      <div><label>리로드(ms)</label><input id="snReload" type="number" step="10" value="250"></div>
      <div><label>지터</label><input id="snJitter" type="number" step="0.05" value="0.25"></div>
    </div>

    <div class="grid3">
      <div><label>안전창(초)</label><input id="snWindow" type="number" step="0.1" value="5"></div>
      <div><label>클릭대기(ms)</label><input id="snPostPause" type="number" step="50" value="800"></div>
      <div class="chkrow" style="margin-top:22px"><input id="snStopOnClick" type="checkbox"><label for="snStopOnClick" style="margin:0;">클릭 후 중지</label></div>
    </div>

    <label>선택자(선택)</label>
    <input id="snSelector" placeholder="예: a.BtnColor_Y.btn1" disabled style="opacity:.5" title="좌표 전용 모드에서는 사용하지 않습니다.">

    <div class="grid2">
      <div><label>X</label><input id="snX" type="number" step="1"></div>
      <div><label>Y</label><input id="snY" type="number" step="1"></div>
    </div>

    <div class="grid3">
      <button id="snPick" class="btn secondary">좌표지정</button>
      <button id="snTestSel" class="btn secondary" disabled>테스트</button>
      <button id="snClear" class="btn secondary">지우기</button>
    </div>

    <button id="snStart" class="btn">시작</button>
    <button id="snStop" class="btn stop" style="display:none;">중지</button>

    <div id="snStatus" class="status"></div>
    <div class="hint">지금 모드는 좌표 전용입니다. 해당 좌표 위치를 반복 클릭하며, 변화 감지 시 종료합니다.</div>
  `;
    document.documentElement.appendChild(ui);

    const marker = document.createElement('div');
    marker.id = 'snipeMarker';
    document.documentElement.appendChild(marker);

    const $ = (s) => ui.querySelector(s);
    const status = $('#snStatus');

    // ── 스크롤 복원(리로드 후) ──
    (function restoreScrollIfPending() {
        try {
            const flag = localStorage.getItem('snRestoreScroll') === '1';
            const sx = parseInt(localStorage.getItem('snScrollX') || 'NaN', 10);
            const sy = parseInt(localStorage.getItem('snScrollY') || 'NaN', 10);
            if (flag && isFinite(sx) && isFinite(sy)) {
                let tries = 18; // ~900ms
                const apply = () => {
                    window.scrollTo(sx, sy);
                    if (--tries > 0) setTimeout(apply, 50);
                    else localStorage.removeItem('snRestoreScroll');
                };
                setTimeout(apply, 0);
            }
        } catch { }
    })();

    // ── 드래그 이동 + 위치 저장 ──
    (function enableDrag() {
        const header = $('#snHeader');
        let dragging = false, oX = 0, oY = 0, startLeft = 0, startTop = 0;

        const savedLeft = localStorage.getItem('snLeft');
        const savedTop = localStorage.getItem('snTop');
        if (savedLeft != null && savedTop != null) {
            ui.style.left = `${+savedLeft}px`;
            ui.style.top = `${+savedTop}px`;
            ui.style.right = '';
        }

        header.addEventListener('mousedown', (e) => {
            dragging = true;
            if (!ui.style.left) {
                const rect = ui.getBoundingClientRect();
                ui.style.left = `${rect.left}px`;
                ui.style.top = `${rect.top}px`;
                ui.style.right = '';
            }
            oX = e.clientX; oY = e.clientY;
            startLeft = parseFloat(ui.style.left || '0');
            startTop = parseFloat(ui.style.top || '0');
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const nl = startLeft + (e.clientX - oX);
            const nt = startTop + (e.clientY - oY);
            ui.style.left = `${Math.max(0, Math.min(window.innerWidth - ui.offsetWidth, nl))}px`;
            ui.style.top = `${Math.max(0, Math.min(window.innerHeight - ui.offsetHeight, nt))}px`;
        });

        window.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            localStorage.setItem('snLeft', parseFloat(ui.style.left || '0'));
            localStorage.setItem('snTop', parseFloat(ui.style.top || '0'));
        });
    })();

    // ── 로컬 저장/복원 ──
    const persistIds = ['snH', 'snM', 'snS', 'snMS', 'snLead', 'snReload', 'snJitter', 'snWindow', 'snX', 'snY', 'snPostPause'];
    persistIds.forEach(k => {
        const v = localStorage.getItem(k); if (v != null) $('#' + k).value = v;
        $('#' + k).addEventListener('change', () => localStorage.setItem(k, $('#' + k).value));
    });
    const stopOnClickSaved = localStorage.getItem('snStopOnClick');
    if (stopOnClickSaved != null) $('#snStopOnClick').checked = stopOnClickSaved === 'true';
    $('#snStopOnClick').addEventListener('change', () => localStorage.setItem('snStopOnClick', $('#snStopOnClick').checked));

    function setMarker(x, y, show = true) {
        if (!isFinite(+x) || !isFinite(+y)) { marker.style.display = 'none'; return; }
        marker.style.left = `${+x}px`;
        marker.style.top = `${+y}px`;
        marker.style.display = show ? 'block' : 'none';
    }
    if ($('#snX').value && $('#snY').value) setMarker($('#snX').value, $('#snY').value, true);

    // 좌표지정
    let pickMode = false;
    $('#snPick').addEventListener('click', () => {
        pickMode = true;
        status.textContent = '좌표지정: 버튼 위를 클릭하세요.';
    });
    document.addEventListener('click', (e) => {
        if (!pickMode) return;
        if (ui.contains(e.target)) return;
        pickMode = false;
        const x = Math.round(e.clientX), y = Math.round(e.clientY);
        $('#snX').value = String(x); $('#snY').value = String(y);
        localStorage.setItem('snX', String(x));
        localStorage.setItem('snY', String(y));
        setMarker(x, y, true);
        status.textContent = `좌표 저장됨: (${x}, ${y})`;
    }, true);

    // 지우기
    $('#snClear').addEventListener('click', () => {
        $('#snX').value = ''; $('#snY').value = '';
        localStorage.removeItem('snX'); localStorage.removeItem('snY');
        setMarker(0, 0, false);
        status.textContent = '좌표 제거됨.';
    });

    // 시간/지터
    function getTargetMillisToday(h, m, s, ms) {
        const now = new Date();
        const H = Math.min(23, Math.max(0, parseInt(h || '0', 10)));
        const M = Math.min(59, Math.max(0, parseInt(m || '0', 10)));
        const S = Math.min(59, Math.max(0, parseInt(s || '0', 10)));
        const MS = Math.min(999, Math.max(0, parseInt(ms || '0', 10)));
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), H, M, S, MS).getTime();
    }
    function jitter(ms, ratio) {
        ratio = Math.min(Math.max(+ratio || 0, 0), 0.6);
        const d = ms * ratio, r = Math.random() * 2 * d - d;
        return Math.max(0, Math.round(ms + r));
    }

    // 좌표 클릭 (플래이‌ر라이트 있으면 물리 클릭)
    function flash(el) { if (!el) return; el.classList.add('__snipe_flash'); setTimeout(() => el.classList.remove('__snipe_flash'), 400); }
    async function clickByCoords(x, y) {
        if (!isFinite(+x) || !isFinite(+y)) return false;
        try { await window._playwright_clickAt?.(+x, +y); return true; }
        catch {
            const el = document.elementFromPoint(+x, +y);
            if (!el) return false;
            flash(el);
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: +x, clientY: +y }));
            return true;
        }
    }

    // ── 루프 상태 저장/로드 ──
    const LOOP_KEY = 'snLoopStateV1';
    function saveLoopState(state) { try { localStorage.setItem(LOOP_KEY, JSON.stringify(state)); } catch { } }
    function loadLoopState() { try { return JSON.parse(localStorage.getItem(LOOP_KEY) || 'null'); } catch { return null; } }
    function clearLoopState() { try { localStorage.removeItem(LOOP_KEY); } catch { } }

    let running = false;
    let reloadTimer = null;

    // 리로드마다 1회 실행되는 이터레이션 (좌표 전용)
    async function iterateOnce(cfg) {
        if (!cfg) return;
        running = true;
        $('#snStart').style.display = 'none';
        $('#snStop').style.display = 'inline-block';

        const { x, y, reloadMs, jitterRt, endAt, confirmDelay, stopAfter } = cfg;

        if (Date.now() > endAt) {
            status.textContent = '안전창 종료. 루프 종료.';
            clearLoopState();
            stopLoop();
            return;
        }

        try {
            const prevUrl = location.href;
            const beforeNode = document.elementFromPoint(x, y);

            // 좌표 클릭 1회
            const fired = await clickByCoords(x, y);

            // 확인 대기 (짧게)
            await new Promise(r => setTimeout(r, confirmDelay));

            const urlChanged = location.href !== prevUrl;
            const afterNode = document.elementFromPoint(x, y);
            const nodeChanged = beforeNode !== afterNode && !!beforeNode; // 노드 변동 감지

            if (fired && (urlChanged || nodeChanged)) {
                status.textContent = '변화 감지(클릭 성공) → 루프 종료.';
                clearLoopState();
                if (stopAfter) stopLoop(); else stopLoop(); // 좌표 전용이라 항상 종료
                return;
            }

            status.textContent = fired ? '반응 없음 → 리로드 대기…' : '클릭 실패 → 리로드 대기…';
        } catch {
            status.textContent = '예외 발생 → 리로드 대기…';
        }

        // 다음 이터 예약 + 리로드
        const wait = jitter(cfg.reloadMs, cfg.jitterRt);
        const nextAt = Date.now() + wait;

        try {
            localStorage.setItem('snScrollX', String(window.scrollX || window.pageXOffset || 0));
            localStorage.setItem('snScrollY', String(window.scrollY || window.pageYOffset || 0));
            localStorage.setItem('snRestoreScroll', '1');
        } catch { }

        saveLoopState({ ...cfg, nextAt });

        try { await window._playwright_reload?.(); } catch { }
    }

    async function startLoop() {
        if (running) return;
        const H = $('#snH').value, M = $('#snM').value, S = $('#snS').value, MS = $('#snMS').value;
        const leadSec = parseFloat($('#snLead').value || '2.5');
        const reloadMs = parseInt($('#snReload').value || '250', 10);
        const jitterRt = parseFloat($('#snJitter').value || '0.25');
        const winSec = parseFloat($('#snWindow').value || '5');
        const confirmDelay = Math.max(80, Math.min(800, parseInt($('#snPostPause').value || '300', 10))); // 좌표 전용: 짧게
        const stopAfter = $('#snStopOnClick').checked; // 사실 좌표 전용에선 true/false 상관 없이 성공 시 종료

        const x = parseFloat($('#snX').value);
        const y = parseFloat($('#snY').value);

        // 좌표만 필요
        if (!(isFinite(x) && isFinite(y))) {
            status.innerHTML = '<span class="danger">좌표(X,Y)를 설정하세요.</span>';
            return;
        }

        const target = getTargetMillisToday(H, M, S, MS);
        if (!isFinite(target)) {
            status.innerHTML = '<span class="danger">시/분/초/ms 입력을 확인하세요.</span>';
            return;
        }

        const pre = target - Math.max(0, leadSec) * 1000;
        running = true;
        $('#snStart').style.display = 'none';
        $('#snStop').style.display = 'inline-block';

        // 카운트다운
        const cd = setInterval(() => {
            const d = pre - Date.now();
            status.textContent = (d > 0) ? `사전 가동 T−${(d / 1000).toFixed(2)}초` : '가동 중…';
            if (d <= 0) clearInterval(cd);
        }, 50);

        // (목표−사전) 대기
        while (Date.now() < pre) await new Promise(r => setTimeout(r, 5));
        status.textContent = '가동 시작: 새로고침/클릭 반복…';

        const endAt = target + Math.max(0, winSec) * 1000;

        // 루프 상태 최초 저장 & 첫 이터 실행
        const cfg = { x, y, reloadMs, jitterRt, endAt, confirmDelay, nextAt: Date.now(), stopAfter };
        saveLoopState(cfg);
        await iterateOnce(cfg);
    }

    function stopLoop() {
        running = false;
        if (reloadTimer) { clearTimeout(reloadTimer); reloadTimer = null; }
        clearLoopState();
        $('#snStart').style.display = 'inline-block';
        $('#snStop').style.display = 'none';
        status.textContent = '중지됨.';
    }

    $('#snStart').addEventListener('click', startLoop);
    $('#snStop').addEventListener('click', stopLoop);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') stopLoop(); });

    // 로드 시 자동 재개
    (function resumeIfScheduled() {
        const st = loadLoopState();
        if (!st) return;
        if (Date.now() > (st.endAt || 0)) { clearLoopState(); return; }

        running = true;
        $('#snStart').style.display = 'none';
        $('#snStop').style.display = 'inline-block';

        const delay = Math.max(0, (st.nextAt || Date.now()) - Date.now());
        setTimeout(() => { iterateOnce(loadLoopState()); }, delay);
    })();
}

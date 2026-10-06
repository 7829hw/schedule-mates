import { parseEverytimeHtml } from './parser.js';
import * as store from './store.js';

const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const HOUR_PX = 56;
const TAB_TITLES = { now: '지금', table: '시간표', free: '공강 찾기', settings: '설정' };

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
let tab = sessionStorage.getItem('tab') || 'now';

// ---------- 유틸 ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const fmt = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const shortPlace = (p) => (p || '').replace(/^\S+\s+캠퍼스\s+/, '').replace(/\([^)]*\)/g, '');
const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`);

function nowInfo() {
  const d = new Date();
  return { day: (d.getDay() + 6) % 7, min: d.getHours() * 60 + d.getMinutes(), date: d };
}

function hueOf(person) {
  let h = 0;
  for (const ch of person.id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function avatar(p, size = '') {
  return `<span class="avatar ${size}" style="--h:${hueOf(p)}">${esc([...p.name][0] || '?')}</span>`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2600);
}

// ---------- 바텀시트 ----------
const sheet = $('#sheet');
function openSheet(html) {
  $('#sheet-body').innerHTML = html;
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add('open'));
  return $('#sheet-body');
}
function closeSheet() {
  sheet.classList.remove('open');
  setTimeout(() => {
    if (!sheet.classList.contains('open')) sheet.hidden = true;
  }, 220);
}
sheet.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeSheet();
});

// ---------- 탭 ----------
function setTab(t) {
  tab = t;
  sessionStorage.setItem('tab', t);
  render();
  view.scrollTop = 0;
  window.scrollTo(0, 0);
}
$('#tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) setTab(b.dataset.tab);
});

function render() {
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#title').textContent = TAB_TITLES[tab];
  ({ now: renderNow, table: renderTable, free: renderFree, settings: renderSettings })[tab]();
}
store.subscribe(render);

function emptyState(msg) {
  return `
    <div class="empty">
      <div class="empty-icon">📅</div>
      <p>${msg}</p>
      <button class="btn primary" data-act="import-me">내 시간표 불러오기</button>
      <button class="btn" data-act="import-friend">친구 시간표 추가</button>
      <button class="link" data-act="help">파일은 어떻게 만드나요?</button>
    </div>`;
}

// ---------- 지금 탭 ----------
function statusOf(p, now) {
  const today = p.courses.filter((c) => c.day === now.day).sort((a, b) => a.start - b.start);
  const cur = today.find((c) => c.start <= now.min && now.min < c.end);
  if (cur) return { kind: 'busy', label: '수업 중', course: cur, sub: `${fmt(cur.end)}까지 · ${cur.end - now.min}분 남음` };
  const next = today.find((c) => c.start > now.min);
  if (next) return { kind: 'free', label: '공강', course: next, sub: `다음 수업 ${fmt(next.start)} · ${dur(next.start - now.min)} 후` };
  if (today.length) return { kind: 'done', label: '수업 끝', sub: `오늘 수업 ${today.length}개 모두 끝났어요` };
  return { kind: 'off', label: '수업 없음', sub: '오늘은 수업이 없어요' };
}

function renderNow() {
  const people = store.orderedPeople();
  if (!people.length) {
    view.innerHTML = emptyState('아직 시간표가 없어요.<br>에브리타임에서 저장한 시간표 파일(.htm)을 불러오세요.');
    return;
  }
  const now = nowInfo();
  const list = people.map((p) => ({ p, s: statusOf(p, now) }));
  const freeCount = list.filter((x) => !x.p.isMe && x.s.kind !== 'busy').length;
  const busyCount = list.filter((x) => !x.p.isMe && x.s.kind === 'busy').length;
  const d = now.date;

  view.innerHTML = `
    <section class="now-head">
      <div class="now-date">${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS[now.day]})</div>
      <div class="now-time">${fmt(now.min)}</div>
      ${store.friends().length ? `<div class="now-sum">친구 <b class="free">${freeCount}명 수업 없음</b> · <b class="busy">${busyCount}명 수업 중</b></div>` : ''}
    </section>
    <ul class="cards">
      ${list.map(({ p, s }) => `
        <li class="card status-${s.kind}" data-person="${p.id}">
          ${avatar(p)}
          <div class="card-main">
            <div class="card-top">
              <span class="card-name">${esc(p.name)}${p.isMe ? ' <em class="me-tag">나</em>' : ''}</span>
              <span class="pill ${s.kind}">${s.label}</span>
            </div>
            ${s.course ? `<div class="card-course">${s.kind === 'free' ? '다음: ' : ''}${esc(s.course.name)}</div>` : ''}
            <div class="card-sub">${esc(s.sub)}${s.course?.place ? ` · ${esc(shortPlace(s.course.place))}` : ''}</div>
          </div>
        </li>`).join('')}
    </ul>
    ${store.me() ? '' : '<button class="btn wide" data-act="import-me">내 시간표 불러오기</button>'}
  `;
}

// ---------- 시간표 그리드 ----------
function visibleDays(courseLists) {
  const days = [0, 1, 2, 3, 4];
  for (const d of [5, 6]) if (courseLists.some((cs) => cs.some((c) => c.day === d))) days.push(d);
  return days;
}

function hourRange(courseLists, min = 9, max = 18) {
  let lo = min, hi = max;
  for (const cs of courseLists) for (const c of cs) {
    lo = Math.min(lo, Math.floor(c.start / 60));
    hi = Math.max(hi, Math.ceil(c.end / 60));
  }
  return [lo, hi];
}

function gridShell(days, [h0, h1], columnHtml) {
  const now = nowInfo();
  const height = (h1 - h0) * HOUR_PX;
  const hours = [];
  for (let h = h0; h < h1; h++) hours.push(`<div class="hour" style="height:${HOUR_PX}px">${h}</div>`);
  const showNow = now.min >= h0 * 60 && now.min < h1 * 60;
  return `
    <div class="grid" style="--cols:${days.length}">
      <div class="grid-head">
        <div></div>
        ${days.map((d) => `<div class="${d === now.day ? 'today' : ''}">${DAYS[d]}</div>`).join('')}
      </div>
      <div class="grid-body" style="height:${height}px; --hour:${HOUR_PX}px">
        <div class="hours">${hours.join('')}</div>
        ${days.map((d) => `
          <div class="col ${d === now.day ? 'today' : ''}">
            ${columnHtml(d)}
            ${showNow && d === now.day ? `<div class="now-line" style="top:${((now.min - h0 * 60) / 60) * HOUR_PX}px"></div>` : ''}
          </div>`).join('')}
      </div>
    </div>`;
}

const posStyle = (start, end, h0) =>
  `top:${((start - h0 * 60) / 60) * HOUR_PX}px; height:${((end - start) / 60) * HOUR_PX}px`;

function personChips(selected, multi = false) {
  return `<div class="chips" role="${multi ? 'group' : 'tablist'}">
    ${store.orderedPeople().map((p) => `
      <button class="chip ${selected.includes(p.id) ? 'on' : ''}" data-chip="${p.id}">
        ${avatar(p, 'sm')}<span>${esc(p.name)}</span>
      </button>`).join('')}
  </div>`;
}

// ---------- 시간표 탭 ----------
function renderTable() {
  const people = store.orderedPeople();
  if (!people.length) {
    view.innerHTML = emptyState('표시할 시간표가 없어요.');
    return;
  }
  const s = store.getState();
  const p = store.person(s.selectedId) || people[0];
  const days = visibleDays([p.courses]);
  const range = hourRange([p.courses]);

  view.innerHTML = `
    ${personChips([p.id])}
    <div class="table-meta">
      <div><b>${esc(p.name)}</b>${p.isMe ? ' <em class="me-tag">나</em>' : ''}</div>
      <div class="muted">${esc(p.semester || '')}${p.semester ? ' · ' : ''}${p.courses.length}개 수업</div>
    </div>
    ${gridShell(days, range, (d) => p.courses.map((c, i) => c.day !== d ? '' : `
      <button class="block c${((c.color - 1) % 12) + 1}" style="${posStyle(c.start, c.end, range[0])}" data-course="${p.id}:${i}">
        <span class="b-name">${esc(c.name)}</span>
        <span class="b-place">${esc(shortPlace(c.place))}</span>
      </button>`).join(''))}
    ${p.extra?.length ? `<div class="extra"><div class="muted">시간 미정 수업</div>${p.extra.map((e) => `<div>${esc(e.name)} <span class="muted">${esc(e.prof)}</span></div>`).join('')}</div>` : ''}
  `;
}

function showCourse(pid, idx) {
  const p = store.person(pid);
  const c = p?.courses[idx];
  if (!c) return;
  const sameDays = p.courses.filter((x) => x.name === c.name && x.prof === c.prof);
  const mates = store.orderedPeople().filter((o) => o.id !== p.id && o.courses.some((x) => x.name === c.name && (!c.prof || x.prof === c.prof)));
  openSheet(`
    <div class="course-sheet">
      <div class="swatch c${((c.color - 1) % 12) + 1}"></div>
      <h2>${esc(c.name)}</h2>
      <dl>
        ${c.prof ? `<dt>교수</dt><dd>${esc(c.prof)}</dd>` : ''}
        <dt>시간</dt><dd>${sameDays.map((x) => `${DAYS[x.day]} ${fmt(x.start)}–${fmt(x.end)}`).join('<br>')}</dd>
        ${c.place ? `<dt>장소</dt><dd>${esc(c.place)}</dd>` : ''}
      </dl>
      ${mates.length ? `<h3>같이 듣는 사람</h3><div class="mates">${mates.map((m) => `<span class="mate">${avatar(m, 'sm')}${esc(m.name)}</span>`).join('')}</div>` : ''}
      <button class="btn wide" data-close>닫기</button>
    </div>`);
}

// ---------- 공강 찾기 탭 ----------
function busyAt(p, day, t) {
  return p.courses.find((c) => c.day === day && c.start <= t && t < c.end);
}

function segmentsOf(people, day, lo, hi) {
  const pts = new Set([lo, hi]);
  for (const p of people) for (const c of p.courses) {
    if (c.day !== day) continue;
    if (c.start > lo && c.start < hi) pts.add(c.start);
    if (c.end > lo && c.end < hi) pts.add(c.end);
  }
  const sorted = [...pts].sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const [a, b] = [sorted[i], sorted[i + 1]];
    const busy = people.filter((p) => busyAt(p, day, a)).length;
    const last = segs[segs.length - 1];
    if (last && last.busy === busy) last.end = b;
    else segs.push({ start: a, end: b, busy });
  }
  return segs;
}

function renderFree() {
  const people = store.orderedPeople();
  if (people.length < 1) {
    view.innerHTML = emptyState('시간표를 추가하면 함께 비는 시간을 찾아드려요.');
    return;
  }
  const s = store.getState();
  const ids = (s.freeIds || people.map((p) => p.id)).filter((id) => store.person(id));
  const sel = ids.map(store.person);
  const [lo, hi] = s.freeRange || [9, 18];
  const days = visibleDays(sel.map((p) => p.courses));
  const hourOpts = (v) => Array.from({ length: 25 }, (_, h) => `<option value="${h}" ${h === v ? 'selected' : ''}>${h}시</option>`).join('');

  const perDay = days.map((d) => ({ d, segs: segmentsOf(sel, d, lo * 60, hi * 60) }));
  const freeList = perDay
    .map(({ d, segs }) => ({ d, free: segs.filter((g) => g.busy === 0 && g.end - g.start >= 30) }))
    .filter((x) => x.free.length);

  view.innerHTML = `
    ${personChips(ids, true)}
    <div class="free-ctrl">
      <span class="muted">${sel.length}명 선택</span>
      <label><select data-range="0">${hourOpts(lo)}</select></label>
      <span>~</span>
      <label><select data-range="1">${hourOpts(hi)}</select></label>
    </div>
    ${sel.length === 0 ? '<p class="muted center">사람을 한 명 이상 선택하세요.</p>' : `
    <div class="legend"><span class="lg free"></span>모두 공강 <span class="lg busy"></span>수업 있음 (진할수록 많음)</div>
    ${gridShell(days, [lo, hi], (d) => perDay.find((x) => x.d === d).segs.map((g) => `
      <button class="seg ${g.busy ? 'busy' : 'free'}" style="${posStyle(g.start, g.end, lo)}; --a:${(g.busy / sel.length * 0.7 + 0.08).toFixed(2)}" data-seg="${d}:${g.start}:${g.end}">
        ${g.busy === 0 && g.end - g.start >= 50 ? `<span>${fmt(g.start)}<br>~${fmt(g.end)}</span>` : g.busy ? `<span class="cnt">${g.busy}</span>` : ''}
      </button>`).join(''))}
    <section class="free-list">
      <h3>모두 비는 시간 (30분 이상)</h3>
      ${freeList.length ? freeList.map(({ d, free }) => `
        <div class="free-row"><b>${DAYS[d]}</b><div>${free.map((g) => `<span class="tag">${fmt(g.start)}–${fmt(g.end)} <small>${dur(g.end - g.start)}</small></span>`).join('')}</div></div>`).join('')
        : '<p class="muted">겹치는 공강이 없어요.</p>'}
    </section>`}
  `;
}

function showSegment(day, start, end) {
  const s = store.getState();
  const people = store.orderedPeople();
  const sel = (s.freeIds || people.map((p) => p.id)).map(store.person).filter(Boolean);
  const rows = sel.map((p) => ({ p, c: busyAt(p, day, start) }));
  openSheet(`
    <div class="course-sheet">
      <h2>${DAYS[day]}요일 ${fmt(start)}–${fmt(end)}</h2>
      <ul class="who">
        ${rows.map(({ p, c }) => `
          <li>${avatar(p, 'sm')}<span class="who-name">${esc(p.name)}</span>
            ${c ? `<span class="pill busy">수업</span><span class="who-c">${esc(c.name)}</span>` : '<span class="pill free">공강</span>'}
          </li>`).join('')}
      </ul>
      <button class="btn wide" data-close>닫기</button>
    </div>`);
}

// ---------- 설정 탭 ----------
function personRow(p) {
  const d = new Date(p.updatedAt);
  return `
    <li class="row">
      ${avatar(p)}
      <div class="row-main">
        <div class="row-title">${esc(p.name)}</div>
        <div class="muted small">${p.courses.length}개 수업 · ${esc(p.semester || '')} · ${d.getMonth() + 1}/${d.getDate()} 업데이트</div>
      </div>
      <button class="icon-btn" data-act="person-menu" data-id="${p.id}" aria-label="관리">⋯</button>
    </li>`;
}

function renderSettings() {
  const m = store.me();
  const fs = store.friends().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  view.innerHTML = `
    <section class="group">
      <h3>내 시간표</h3>
      ${m ? `<ul class="list">${personRow(m)}</ul>` : '<button class="btn primary wide" data-act="import-me">내 시간표 불러오기 (.htm)</button>'}
    </section>
    <section class="group">
      <h3>친구 <span class="muted">${fs.length}명</span></h3>
      ${fs.length ? `<ul class="list">${fs.map(personRow).join('')}</ul>` : '<p class="muted small">아직 추가한 친구가 없어요.</p>'}
      <button class="btn primary wide" data-act="import-friend">+ 친구 시간표 추가 (.htm / .html)</button>
      <p class="muted small">여러 파일을 한 번에 선택할 수 있어요.</p>
    </section>
    <section class="group">
      <h3>백업</h3>
      <div class="btn-row">
        <button class="btn" data-act="export">백업 파일 저장</button>
        <button class="btn" data-act="import-json">백업 불러오기</button>
      </div>
      <p class="muted small">모든 데이터는 이 기기에만 저장돼요. 기기를 바꿀 땐 백업 파일을 사용하세요.</p>
    </section>
    <section class="group">
      <h3>도움말</h3>
      <button class="btn wide" data-act="help">시간표 파일 만드는 법</button>
      ${installPrompt ? '<button class="btn wide" data-act="install">홈 화면에 앱 설치</button>' : ''}
      ${isStandalone() ? '' : installHint()}
    </section>
    ${store.getState().people.length ? '<button class="link danger" data-act="reset">모든 데이터 삭제</button>' : ''}
  `;
}

function installHint() {
  if (isIOS) {
    return `<p class="muted small"><b>Safari</b> 하단의 <b>공유 버튼 → 홈 화면에 추가</b>로 설치하면 인터넷 없이도 앱처럼 쓸 수 있어요.
      카카오톡 등 앱 안의 브라우저에서는 설치가 안 되니 Safari로 열어 주세요.<br>
      <b>주의:</b> iPhone은 Safari와 홈 화면 앱의 저장 공간이 분리돼 있어서, 설치한 뒤 <b>앱 안에서</b> 시간표를 불러와야 해요.</p>`;
  }
  return '<p class="muted small"><b>Chrome 메뉴(⋮) → 홈 화면에 추가(앱 설치)</b>로 설치하면 인터넷 없이도 앱처럼 쓸 수 있어요.</p>';
}

function showPersonMenu(id) {
  const p = store.person(id);
  if (!p) return;
  openSheet(`
    <div class="course-sheet">
      <h2>${esc(p.name)}</h2>
      <div class="menu">
        <button class="btn wide" data-act="view-person" data-id="${p.id}">시간표 보기</button>
        <button class="btn wide" data-act="rename" data-id="${p.id}">이름 변경</button>
        <button class="btn wide" data-act="replace" data-id="${p.id}">새 파일로 업데이트</button>
        <button class="btn wide danger" data-act="delete" data-id="${p.id}">삭제</button>
        <button class="btn wide" data-close>취소</button>
      </div>
    </div>`);
}

function showHelp() {
  openSheet(`
    <div class="course-sheet help">
      <h2>시간표 파일 만드는 법</h2>
      <ol>
        <li><b>PC 브라우저</b>에서 <b>everytime.kr</b> 에 로그인해요.</li>
        <li>내 시간표는 <b>시간표</b> 메뉴, 친구 시간표는 <b>친구 → 친구 이름 → 시간표</b>를 열어요.</li>
        <li><b>Ctrl + S</b>(Mac은 ⌘ + S)로 페이지를 저장해요. 형식은 <b>웹페이지, HTML만</b>이나 <b>웹페이지, 전체</b> 모두 괜찮아요.</li>
        <li>저장된 <b>.htm / .html</b> 파일을 카톡·메일·클라우드 등으로 휴대폰에 옮겨요.</li>
        <li>이 앱의 <b>설정</b>에서 파일을 선택하면 자동으로 인식돼요.</li>
      </ol>
      <p class="muted small">친구에게 자기 시간표 파일을 저장해서 보내달라고 해도 돼요. 파일은 이 기기 밖으로 전송되지 않아요.</p>
      <button class="btn wide" data-close>확인</button>
    </div>`);
}

// ---------- 불러오기 ----------
let importTarget = null; // { isMe, replaceId }
const fileHtm = $('#file-htm');
const fileJson = $('#file-json');

function pickHtm(target) {
  importTarget = target;
  fileHtm.multiple = !target.isMe && !target.replaceId;
  fileHtm.value = '';
  fileHtm.click();
}

async function readHtml(file) {
  const buf = await file.arrayBuffer();
  let html = new TextDecoder('utf-8').decode(buf);
  const cs = /<meta[^>]+charset=["']?([\w-]+)/i.exec(html);
  if (cs && !/utf-?8/i.test(cs[1])) {
    try { html = new TextDecoder(cs[1]).decode(buf); } catch { /* 지원하지 않는 인코딩 */ }
  }
  return html;
}

function guessName(file, target) {
  if (target.replaceId) return store.person(target.replaceId)?.name || '';
  if (target.isMe) return store.me()?.name || '나';
  const base = file.name.replace(/\.(html?|mhtml?)$/i, '').replace(/[_\s]+/g, ' ').trim();
  return /에브리타임|everytime|^[\s_-]*$/i.test(base) ? '' : base;
}

fileHtm.addEventListener('change', async () => {
  const files = [...fileHtm.files];
  const target = importTarget;
  for (const file of files) {
    let parsed;
    try {
      parsed = parseEverytimeHtml(await readHtml(file));
    } catch (e) {
      toast(`${file.name}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    const ok = await confirmImport(file, parsed, target);
    if (!ok) break;
  }
});

function confirmImport(file, parsed, target) {
  return new Promise((resolve) => {
    const isMe = !!target.isMe || !!store.person(target.replaceId)?.isMe;
    const byDay = DAYS.map((_, d) => parsed.courses.filter((c) => c.day === d)).map((cs, d) => cs.length ? `<div class="pv-row"><b>${DAYS[d]}</b><span>${cs.map((c) => `${esc(c.name)} <small>${fmt(c.start)}–${fmt(c.end)}</small>`).join(', ')}</span></div>` : '').join('');
    const body = openSheet(`
      <form class="course-sheet import" id="import-form">
        <h2>시간표를 인식했어요 ✓</h2>
        <p class="muted small">${esc(file.name)}${parsed.semester ? ` · ${esc(parsed.semester)}` : ''} · ${parsed.courses.length}개 수업</p>
        <div class="preview">${byDay}</div>
        <label class="field">
          <span>${isMe ? '내 이름' : '친구 이름'}</span>
          <input name="name" required maxlength="20" autocomplete="off" value="${esc(guessName(file, target))}" placeholder="예) 김철수">
        </label>
        <div class="btn-row">
          <button type="button" class="btn" data-cancel>취소</button>
          <button type="submit" class="btn primary">${target.replaceId ? '업데이트' : '저장'}</button>
        </div>
      </form>`);
    const form = $('#import-form', body);
    const input = form.elements.name;
    if (!input.value) setTimeout(() => input.focus(), 250);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      store.upsertPerson({ id: target.replaceId, name, isMe, parsed });
      closeSheet();
      toast(`${name}님의 시간표를 저장했어요`);
      setTimeout(() => resolve(true), 250);
    });
    $('[data-cancel]', form).addEventListener('click', () => {
      closeSheet();
      setTimeout(() => resolve(false), 250);
    });
  });
}

fileJson.addEventListener('change', async () => {
  const f = fileJson.files[0];
  if (!f) return;
  try {
    if (store.getState().people.length && !confirm('현재 데이터를 백업 파일 내용으로 바꿀까요?')) return;
    store.importJson(await f.text());
    toast('백업을 불러왔어요');
  } catch (e) {
    toast(e.message || '백업 파일을 읽지 못했어요');
  }
});

async function exportBackup() {
  const d = new Date();
  const name = `schedule-mates-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
  const blob = new Blob([store.exportJson()], { type: 'application/json' });
  // 모바일(특히 iOS 홈 화면 앱)은 다운로드보다 공유 시트로 파일 앱·카톡 등에 저장하는 편이 확실하다
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '시간표 메이트 백업' });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- 이벤트 위임 ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act],[data-person],[data-chip],[data-course],[data-seg]');
  if (!el) return;
  const s = store.getState();

  if (el.dataset.person) {
    store.update((st) => (st.selectedId = el.dataset.person));
    setTab('table');
  } else if (el.dataset.chip) {
    const id = el.dataset.chip;
    if (tab === 'free') {
      const all = store.orderedPeople().map((p) => p.id);
      const cur = new Set(s.freeIds || all);
      cur.has(id) ? cur.delete(id) : cur.add(id);
      store.update((st) => (st.freeIds = all.filter((x) => cur.has(x))));
    } else {
      store.update((st) => (st.selectedId = id));
    }
  } else if (el.dataset.course) {
    const [pid, i] = el.dataset.course.split(':');
    showCourse(pid, Number(i));
  } else if (el.dataset.seg) {
    const [d, a, b] = el.dataset.seg.split(':').map(Number);
    showSegment(d, a, b);
  } else {
    const id = el.dataset.id;
    switch (el.dataset.act) {
      case 'import-me': pickHtm({ isMe: true, replaceId: store.me()?.id }); break;
      case 'import-friend': pickHtm({ isMe: false }); break;
      case 'person-menu': showPersonMenu(id); break;
      case 'view-person':
        closeSheet();
        store.update((st) => (st.selectedId = id));
        setTab('table');
        break;
      case 'rename': {
        const p = store.person(id);
        const name = prompt('새 이름', p?.name)?.trim();
        if (name) store.renamePerson(id, name);
        closeSheet();
        break;
      }
      case 'replace': closeSheet(); pickHtm({ replaceId: id }); break;
      case 'delete': {
        const p = store.person(id);
        if (p && confirm(`${p.name}님의 시간표를 삭제할까요?`)) {
          store.removePerson(id);
          toast('삭제했어요');
        }
        closeSheet();
        break;
      }
      case 'export': exportBackup(); break;
      case 'import-json': fileJson.value = ''; fileJson.click(); break;
      case 'help': showHelp(); break;
      case 'install':
        installPrompt?.prompt();
        installPrompt = null;
        break;
      case 'reset':
        if (confirm('모든 시간표를 삭제할까요? 되돌릴 수 없어요.')) {
          store.update((st) => Object.assign(st, { people: [], selectedId: null, freeIds: null }));
        }
        break;
    }
  }
});

document.addEventListener('change', (e) => {
  const sel = e.target.closest('select[data-range]');
  if (!sel) return;
  const r = [...(store.getState().freeRange || [9, 18])];
  r[Number(sel.dataset.range)] = Number(sel.value);
  if (r[0] >= r[1]) {
    toast('시작 시각은 끝 시각보다 빨라야 해요');
    render();
    return;
  }
  store.update((st) => (st.freeRange = r));
});

// ---------- PWA ----------
let installPrompt = null;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (tab === 'settings') render();
});

function updateOnline() {
  $('#offline').hidden = navigator.onLine;
}
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
updateOnline();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// 현재 시각 표시 갱신
setInterval(() => {
  if (!sheet.classList.contains('open') && (tab === 'now' || tab === 'table' || tab === 'free')) render();
}, 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !sheet.classList.contains('open')) render();
});

render();

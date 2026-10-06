// 에브리타임 시간표 페이지(웹페이지 저장 .htm/.html)를 파싱한다.
// 에브리타임은 과목 블록을 1분 = 1px(기본) 비율로 절대 배치하므로
// style의 top/height 값으로 시작·종료 시각을 역산한다.

const DEFAULT_DAYS = ['월', '화', '수', '목', '금', '토', '일'];

function px(style, prop) {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*(-?[\\d.]+)px`, 'i').exec(style || '');
  return m ? parseFloat(m[1]) : null;
}

const round5 = (min) => Math.round(min / 5) * 5;
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

// 화면 배율(px/분) 추정. _timetableGridInfo의 rows 값은 5분 단위 인덱스다.
function detectPxPerMinute(doc) {
  const firstHour = doc.querySelector('.tablebody .hours .hour');
  const top = firstHour ? px(firstHour.getAttribute('style'), 'top') : null;
  if (top != null) {
    for (const s of doc.querySelectorAll('script')) {
      const m = /_timetableGridInfo\s*=\s*(\[[\s\S]*?\]);/.exec(s.textContent);
      if (!m) continue;
      try {
        const info = JSON.parse(m[1]);
        const startMin = info[0].rows[0] * 5;
        if (startMin > 0 && top > 0) return top / startMin;
      } catch { /* 무시하고 기본값 사용 */ }
    }
  }
  // 교시 정보가 없으면 시간 눈금(.time) 높이 기반 기본값: 1시간 = 60px
  return 1;
}

export function parseEverytimeHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table.tablebody') || doc.querySelector('.tablebody table') || doc.querySelector('.tablebody');
  if (!table) throw new Error('에브리타임 시간표를 찾을 수 없어요. 에브리타임 시간표 페이지를 "웹페이지 저장"한 파일인지 확인해 주세요.');

  const headCells = [...doc.querySelectorAll('table.tablehead td')].map(text).filter(Boolean);
  const dayNames = headCells.length >= 5 ? headCells : DEFAULT_DAYS;

  const row = table.querySelector('tr');
  const dayCells = row ? [...row.children].filter((c) => c.tagName === 'TD') : [];
  const ppm = detectPxPerMinute(doc);

  const courses = [];
  dayCells.forEach((td, i) => {
    const dayIdx = DEFAULT_DAYS.indexOf(dayNames[i]);
    const day = dayIdx >= 0 ? dayIdx : i;
    td.querySelectorAll('.subject').forEach((el) => {
      const style = el.getAttribute('style');
      const top = px(style, 'top');
      const height = px(style, 'height');
      if (top == null || height == null) return;
      const color = /\bcolor(\d+)\b/.exec(el.className);
      courses.push({
        name: text(el.querySelector('h3')) || '(이름 없음)',
        prof: text(el.querySelector('p em')),
        place: text(el.querySelector('p span')),
        day,
        start: round5(top / ppm),
        // 에브리타임은 테두리 1px을 더해 그리므로 이를 빼준다
        end: round5((top + height - 1) / ppm),
        color: color ? Number(color[1]) : 1,
      });
    });
  });

  // 시간 미정(온라인 등) 과목
  const extra = [];
  const nontimes = doc.querySelectorAll('.nontimes .subject');
  (nontimes.length ? nontimes : doc.querySelectorAll('.nontimes > *')).forEach((el) => {
    const name = text(el.querySelector('h3') || el);
    if (name && !extra.some((e) => e.name === name)) {
      extra.push({ name, prof: text(el.querySelector('em')), place: '' });
    }
  });

  if (!courses.length && !extra.length) {
    throw new Error('시간표에서 과목을 찾지 못했어요. 시간표가 표시된 상태에서 저장했는지 확인해 주세요.');
  }

  courses.sort((a, b) => a.day - b.day || a.start - b.start);
  const semester = text(doc.querySelector('#semesters option[selected]'));
  const tableName = text(doc.querySelector('#tableName'));
  return { courses, extra, semester, tableName };
}

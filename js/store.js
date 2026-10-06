// 모든 데이터는 기기의 localStorage에만 저장된다 (서버 없음).
const KEY = 'schedule-mates:v1';

const empty = () => ({ people: [], selectedId: null, freeIds: null, freeRange: [9, 18] });

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...empty(), ...JSON.parse(raw) };
  } catch { /* 손상된 데이터는 무시 */ }
  return empty();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    alert('저장 공간이 부족해 저장하지 못했어요.');
  }
  listeners.forEach((fn) => fn(state));
}

export const getState = () => state;
export const subscribe = (fn) => listeners.add(fn);

export function update(mutator) {
  mutator(state);
  save();
}

export const me = () => state.people.find((p) => p.isMe) || null;
export const friends = () => state.people.filter((p) => !p.isMe);
export const person = (id) => state.people.find((p) => p.id === id) || null;

// 나 → 친구(가나다순) 순서
export function orderedPeople() {
  const m = me();
  const fs = friends().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return m ? [m, ...fs] : fs;
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function upsertPerson({ id, name, isMe, parsed }) {
  update((s) => {
    let p = id ? s.people.find((x) => x.id === id) : null;
    if (isMe) {
      const cur = s.people.find((x) => x.isMe);
      if (cur && cur !== p) p = cur;
    }
    const data = {
      name,
      isMe: !!isMe,
      courses: parsed.courses,
      extra: parsed.extra || [],
      semester: parsed.semester || '',
      updatedAt: Date.now(),
    };
    if (p) Object.assign(p, data);
    else s.people.push({ id: uid(), ...data });
  });
}

export function renamePerson(id, name) {
  update((s) => {
    const p = s.people.find((x) => x.id === id);
    if (p) p.name = name;
  });
}

export function removePerson(id) {
  update((s) => {
    s.people = s.people.filter((x) => x.id !== id);
    if (s.selectedId === id) s.selectedId = null;
    if (s.freeIds) s.freeIds = s.freeIds.filter((x) => x !== id);
  });
}

export function exportJson() {
  return JSON.stringify({ app: 'schedule-mates', version: 1, people: state.people }, null, 2);
}

export function importJson(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.people)) throw new Error('백업 파일 형식이 아니에요.');
  update((s) => {
    s.people = data.people.filter((p) => p && p.id && Array.isArray(p.courses));
    s.selectedId = null;
    s.freeIds = null;
  });
}

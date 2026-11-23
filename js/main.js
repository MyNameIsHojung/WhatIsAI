import { h, widgets } from './widgets.js';

const app = document.getElementById('app');
const dots = document.getElementById('dots');
const bar = document.getElementById('progress');
const wide = matchMedia('(min-width: 721px)');

// 이미지가 아직 없으면 이모지 카드로 대신 보여준다.
function figure(src, emoji) {
  const fig = h('figure', { class: 'fig' }, h('span', { class: 'fig-emoji' }, emoji));
  if (src) {
    const img = new Image();
    img.alt = '';
    img.onload = () => fig.replaceChildren(img);
    img.src = src;
  }
  return fig;
}

function hero(copy) {
  const m = copy.meta;
  return h('section', { class: 'sec hero', id: 'top' },
    h('div', { class: 'wrap' },
      figure(m.image, m.emoji),
      h('h1', {}, m.title),
      h('p', { class: 'lead' }, m.subtitle),
      h('ul', { class: 'parts' }, m.parts.map((p) => h('li', {}, p))),
      h('a', { class: 'btn big', href: '#toc' }, m.cta, ' ↓'),
      h('p', { class: 'keys' }, copy.ui.keys)));
}

// 마지막 인사 화면
function thanks(copy) {
  const m = copy.meta.thanks;
  return h('section', { class: 'sec hero', id: 'thanks' },
    h('div', { class: 'wrap' },
      figure(m.image, m.emoji),
      h('h1', {}, m.title),
      h('p', { class: 'lead' }, m.subtitle),
      h('a', { class: 'btn big', href: '#top' }, m.back, ' ↑')));
}

// 목차: 부별로 화면 제목을 모아 보여주고, 누르면 그 화면으로 간다.
function toc(copy) {
  return h('section', { class: 'sec toc', id: 'toc' },
    h('div', { class: 'wrap' },
      h('h2', {}, copy.ui.toc),
      h('div', { class: 'tocgrid' }, copy.meta.parts.map((name, i) =>
        // 긴 제목 대신 짧은 주제 이름(kicker)을 써서 줄바꿈 없이 한눈에 보이게 한다.
        h('div', { class: `toccard part${i + 1}` },
          h('strong', {}, ...name.split(' · ').map((line) => h('span', {}, line))),
          h('ol', {}, copy.sections.filter((s) => s.part === i + 1).map((s) =>
            h('li', {}, h('a', { href: `#${s.id}`, title: s.title }, s.kicker)))))))));
}

// 한 줄 요약과 실제 사용 예시는 같은 방식으로 열린다.
// 왼쪽 버튼을 누르면 체험 영역 위에 패널이 겹쳐서 열리고, 한 번에 하나만 열린다.
function overlays(defs, ui) {
  const items = defs.map(({ kind, label, body }) => {
    const close = h('button', { class: 'exclose', type: 'button', 'aria-label': ui.close }, '✕');
    const panel = h('aside', { class: `expanel ${kind}`, hidden: true }, close, h('strong', {}, label), body);
    const btn = h('button', { class: `exbtn ${kind}`, type: 'button', 'aria-expanded': 'false' }, label);
    return { btn, panel, close };
  });
  const show = (target) => {
    for (const it of items) {
      const open = it === target && it.panel.hidden;
      it.panel.hidden = !open;
      it.btn.setAttribute('aria-expanded', String(open));
    }
    items[0].panel.parentElement.classList.toggle('ex-open', items.some((it) => !it.panel.hidden));
  };
  for (const it of items) {
    it.btn.addEventListener('click', () => show(it));
    it.close.addEventListener('click', () => show(null));
  }
  return items;
}

function section(s, copy) {
  const mount = h('div', { class: `widget w-${s.widget}` });
  widgets[s.widget](mount, s.data, copy);
  const defs = [{
    kind: 'summary',
    label: copy.ui.takeaway,
    body: h('div', { class: 'sumbody' },
      h('p', {}, s.takeaway),
      s.discuss && h('p', { class: 'discuss' }, h('b', {}, copy.ui.discuss), ' ', s.discuss)),
  }];
  if (s.examples) {
    defs.push({
      kind: 'examples',
      label: copy.ui.examples,
      body: h('ul', {}, s.examples.map((e) => h('li', {},
        h('span', { class: 'exicons' }, e.emoji),
        h('b', {}, e.name),
        h('span', {}, e.when),
        // 로고 대신 공식 페이지로 가는 링크를 둔다.
        e.links && h('span', { class: 'exlinks' }, e.links.map((l) =>
          h('a', { href: l.url, target: '_blank', rel: 'noopener' }, l.label, ' ↗')))))),
    });
  }
  const panels = overlays(defs, copy.ui);
  return h('section', { class: `sec part${s.part}`, id: s.id },
    h('div', { class: 'wrap' },
      h('div', { class: 'side' },
        h('header', { class: 'head' },
          h('div', {},
            h('p', { class: 'kicker' }, s.kicker),
            h('h2', {}, s.title),
            h('p', { class: 'lead' }, s.lead)),
          figure(s.image, s.emoji)),
        h('div', { class: 'sidebtns' }, panels.map((it) => it.btn))),
      mount,
      panels.map((it) => it.panel)));
}

// 넓은 화면에서는 섹션 하나가 슬라이드 한 장이다.
// 내용을 고정 폭으로 그린 뒤 화면 크기에 맞춰 통째로 확대·축소해서, 어떤 비율에서도 잘리지 않게 한다.
function setupFit(secs) {
  const fit = (sec) => {
    const wrap = sec.firstElementChild;
    if (!wide.matches) { wrap.style.transform = ''; return; }
    const cs = getComputedStyle(sec);
    const w = sec.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ht = sec.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const scale = Math.min(1, w / wrap.offsetWidth, ht / wrap.offsetHeight);
    wrap.style.transform = `translate(-50%, -50%) scale(${scale})`;
  };
  // 위젯을 누르거나 요약을 펼쳐 내용 높이가 바뀌면 다시 맞춘다. (transform은 크기 변화로 잡히지 않아 반복되지 않는다)
  const ro = new ResizeObserver((entries) => entries.forEach((e) => fit(e.target.parentElement)));
  secs.forEach((sec) => ro.observe(sec.firstElementChild));
  const all = () => secs.forEach(fit);
  addEventListener('resize', all);
  wide.addEventListener('change', all);
  document.fonts?.ready.then(all);
  all();
}

// 전체화면 버튼. 지원하지 않는 기기(일부 휴대폰)에서는 버튼을 숨긴 채로 둔다. F 키로도 켜고 끈다.
function setupFullscreen(ui) {
  const btn = document.getElementById('fsbtn');
  const root = document.documentElement;
  if (!root.requestFullscreen) return;
  const draw = () => { btn.textContent = document.fullscreenElement ? ui.exitFullscreen : ui.fullscreen; };
  const flip = () => (document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen()).catch(() => {});
  btn.hidden = false;
  btn.addEventListener('click', flip);
  document.addEventListener('fullscreenchange', draw);
  addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'f' || e.target.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    flip();
  });
  draw();
}

function setupNav(secs) {
  secs.forEach((sec) => {
    const label = sec.querySelector('h1, h2').textContent;
    dots.append(h('a', { href: `#${sec.id}`, title: label, 'aria-label': label }));
  });
  const links = [...dots.children];
  let current = 0;

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      current = secs.indexOf(e.target);
      links.forEach((a, i) => a.classList.toggle('on', i === current));
      bar.style.width = `${(current / (secs.length - 1)) * 100}%`;
    }
  }, { rootMargin: '-45% 0px -45% 0px' });
  secs.forEach((sec) => io.observe(sec));

  // 발표자가 화살표 키로 섹션을 넘길 수 있게 한다.
  addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    const step = { ArrowRight: 1, PageDown: 1, ArrowLeft: -1, PageUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = Math.min(secs.length - 1, Math.max(0, current + step));
    secs[next].scrollIntoView({ behavior: 'smooth' });
  });
}

try {
  const copy = await (await fetch('content/copy.json')).json();
  document.title = copy.meta.title;
  app.replaceChildren(hero(copy), toc(copy), ...copy.sections.map((s) => section(s, copy)), thanks(copy));
  document.getElementById('tocbtn').textContent = `☰ ${copy.ui.toc}`;
  const secs = [...app.querySelectorAll('.sec')];
  setupNav(secs);
  setupFit(secs);
  setupFullscreen(copy.ui);
} catch (err) {
  app.replaceChildren(h('p', { class: 'loading' }, `내용을 불러오지 못했습니다: ${err.message}`));
}

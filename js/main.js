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

// 목차: 부별로 화면 제목을 모아 보여주고, 누르면 그 화면으로 간다.
function toc(copy) {
  return h('section', { class: 'sec toc', id: 'toc' },
    h('div', { class: 'wrap' },
      h('h2', {}, copy.ui.toc),
      h('div', { class: 'tocgrid' }, copy.meta.parts.map((name, i) =>
        h('div', { class: `toccard part${i + 1}` },
          h('strong', {}, name),
          h('ol', {}, copy.sections.filter((s) => s.part === i + 1).map((s) =>
            h('li', {}, h('a', { href: `#${s.id}` }, s.title)))))))));
}

function section(s, copy) {
  const mount = h('div', { class: `widget w-${s.widget}` });
  widgets[s.widget](mount, s.data, copy);
  return h('section', { class: `sec part${s.part}`, id: s.id },
    h('div', { class: 'wrap' },
      h('div', { class: 'side' },
        h('header', { class: 'head' },
          h('div', {},
            h('p', { class: 'kicker' }, s.kicker),
            h('h2', {}, s.title),
            h('p', { class: 'lead' }, s.lead)),
          figure(s.image, s.emoji)),
        h('details', { class: 'takeaway' },
          h('summary', {}, copy.ui.takeaway),
          h('p', {}, s.takeaway),
          s.discuss && h('p', { class: 'discuss' }, h('b', {}, copy.ui.discuss), ' ', s.discuss))),
      mount));
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
  app.replaceChildren(hero(copy), toc(copy), ...copy.sections.map((s) => section(s, copy)));
  document.getElementById('tocbtn').textContent = `☰ ${copy.ui.toc}`;
  const secs = [...app.querySelectorAll('.sec')];
  setupNav(secs);
  setupFit(secs);
} catch (err) {
  app.replaceChildren(h('p', { class: 'loading' }, `내용을 불러오지 못했습니다: ${err.message}`));
}

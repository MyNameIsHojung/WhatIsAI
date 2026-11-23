export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const fill = (str, vars) => str.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const toggle = (label, onclick, cls = 'tog') =>
  h('button', { class: cls, type: 'button', 'aria-pressed': 'false', onclick }, label);
const press = (btn, on) => btn.setAttribute('aria-pressed', String(on));

// 체험을 끝낸 뒤 다음 화면으로 넘어가는 버튼
const nextSlide = (root, label) => h('button', {
  class: 'btn', type: 'button',
  onclick: () => root.closest('.sec')?.nextElementSibling?.scrollIntoView({ behavior: 'smooth' }),
}, label);

// 01 다음 말 맞히기
function predict(root, d, copy) {
  let i = 0;
  const render = () => {
    const r = d.rounds[i];
    const top = r.options.reduce((a, b) => (b.p > a.p ? b : a));
    const msg = h('p', { class: 'msg' });
    const last = i === d.rounds.length - 1;
    // 마지막 문제를 풀면 '다음으로 넘어가기'를 앞세우고, 다시 하기는 보조 버튼으로 둔다.
    const again = h('button', { class: `btn${last ? ' ghost' : ''}`, type: 'button',
      onclick: () => { i = last ? 0 : i + 1; render(); } }, last ? d.ui.again : d.ui.next);
    const next = h('div', { class: 'actions', hidden: true }, last && nextSlide(root, copy.ui.nextSlide), again);

    const choices = h('div', { class: 'choices' });
    for (const o of shuffle(r.options)) {
      const btn = h('button', {
        class: 'choice', type: 'button',
        onclick: () => {
          for (const b of choices.children) { b.disabled = true; b.classList.add('shown'); }
          btn.classList.add('mine');
          msg.textContent = o === top ? d.ui.hit : fill(d.ui.miss, { top: top.w });
          next.hidden = false;
        },
      }, h('span', { class: 'fillbar', style: `--p:${o.p}%` }),
        h('span', { class: 'word' }, o.w),
        h('span', { class: 'pct' }, `${o.p}%`));
      if (o === top) btn.classList.add('top');
      choices.append(btn);
    }
    root.replaceChildren(
      h('p', { class: 'prompt' }, r.text, ' ', h('span', { class: 'blank' }, '?')),
      choices, msg, next,
      h('p', { class: 'count' }, `${i + 1} / ${d.rounds.length}`));
  };
  render();
}

// 02 온도: 실제 softmax 계산으로 확률을 다시 구한다.
function temperature(root, d) {
  const rows = d.options.map((o) => {
    const fillEl = h('span', { class: 'fillbar' });
    const pct = h('span', { class: 'pct' });
    return { o, fillEl, pct, el: h('div', { class: 'row' }, fillEl, h('span', { class: 'word' }, o.w), pct) };
  });
  let probs = [];
  const slider = h('input', { type: 'range', min: '0.1', max: '2', step: '0.1', value: '0.7', 'aria-label': d.ui.label });
  const value = h('strong', {});
  const picks = h('div', { class: 'picks' });

  const update = () => {
    const t = Number(slider.value);
    const exps = d.options.map((o) => Math.exp(o.logit / t));
    const sum = exps.reduce((a, b) => a + b, 0);
    probs = exps.map((e) => e / sum);
    rows.forEach((r, i) => {
      r.fillEl.style.setProperty('--p', `${probs[i] * 100}%`);
      r.pct.textContent = `${Math.round(probs[i] * 100)}%`;
    });
    value.textContent = t.toFixed(1);
  };
  const draw = (n) => {
    for (let k = 0; k < n; k++) {
      let x = Math.random();
      let idx = probs.findIndex((p) => (x -= p) < 0);
      if (idx < 0) idx = probs.length - 1;
      picks.append(h('span', { class: `pick rank${Math.min(idx, 3)}` }, d.options[idx].w));
    }
  };
  slider.addEventListener('input', update);
  update();

  root.append(
    h('p', { class: 'prompt' }, d.text, ' ', h('span', { class: 'blank' }, '?')),
    h('div', { class: 'slider' },
      h('span', {}, `🧊 ${d.ui.low}`), slider, h('span', {}, `${d.ui.high} 🔥`)),
    h('p', { class: 'count' }, `${d.ui.label} `, value),
    h('div', { class: 'rows' }, rows.map((r) => r.el)),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => draw(1) }, `🎲 ${d.ui.one}`),
      h('button', { class: 'btn', type: 'button', onclick: () => draw(10) }, `🎲×10 ${d.ui.ten}`),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => picks.replaceChildren() }, d.ui.clear)),
    picks);
}

// 03 토큰: 실제 토크나이저가 아니라 조각나는 느낌만 보여주는 단순 규칙.
function tokenize(text) {
  const out = [];
  const size = (run) => (/[A-Za-z]/.test(run[0]) ? 4 : /\d/.test(run[0]) ? 3 : /[가-힣]/.test(run[0]) ? 2 : 1);
  for (const run of text.match(/[A-Za-z]+|\d+|[가-힣]+|\s+|./gu) || []) {
    if (/^\s+$/.test(run)) continue;
    const n = size(run);
    for (let i = 0; i < run.length; i += n) out.push(run.slice(i, i + n));
  }
  return out;
}

function tokens(root, d) {
  const input = h('textarea', { rows: '2', 'aria-label': '문장 입력' });
  input.value = d.default;
  const chips = h('div', { class: 'chips' });
  const count = h('p', { class: 'count' });
  const update = () => {
    const toks = tokenize(input.value);
    chips.replaceChildren(...toks.map((t, i) => h('span', { class: `tok c${i % 5}` }, t)));
    count.textContent = fill(d.ui.count, { chars: [...input.value].length, tokens: toks.length });
  };
  input.addEventListener('input', update);
  update();
  root.append(input, chips, count, h('p', { class: 'note' }, d.ui.note));
}

// 04 한계 / 05 도구: 같은 질문을 도구 유무에 따라 다르게 답한다.
function ask(root, d, copy) {
  const on = new Set();
  let cur = null;
  const chat = h('div', { class: 'chat' });

  const draw = () => {
    if (!cur) return chat.replaceChildren(h('p', { class: 'hint' }, copy.ui.askHint));
    const tool = copy.tools.find((t) => t.id === cur.need);
    const kids = [h('div', { class: 'bubble me' }, cur.q)];
    if (d.tools && on.has(cur.need)) {
      kids.push(h('div', { class: 'call' }, `${tool.emoji} ${cur.call}`),
        h('div', { class: 'bubble ai ok' }, cur.withTool));
    } else {
      kids.push(h('div', { class: 'bubble ai bad' }, cur.alone),
        h('div', { class: 'tag' }, `⚠️ ${cur.limit}`));
      if (d.tools) kids.push(h('p', { class: 'hint' }, fill(copy.ui.needTool, { tool: tool.name })));
    }
    chat.replaceChildren(...kids);
  };

  if (d.tools) {
    root.append(h('div', { class: 'toggles' }, copy.tools.map((t) => {
      const btn = toggle(`${t.emoji} ${t.name}`, () => {
        on.has(t.id) ? on.delete(t.id) : on.add(t.id);
        press(btn, on.has(t.id));
        draw();
      });
      return btn;
    })));
  }
  const qs = h('div', { class: 'questions' });
  for (const q of copy.questions) {
    const btn = toggle(q.q, () => {
      cur = q;
      for (const b of qs.children) press(b, b === btn);
      draw();
    }, 'q');
    qs.append(btn);
  }
  root.append(h('div', { class: 'split' }, qs, chat));
  draw();
}

// 06 에이전트 루프
function loop(root, d) {
  let i = 0;
  const phases = ['think', 'act', 'observe'];
  const nodes = Object.fromEntries(phases.map((p) => [p, h('span', { class: `node ${p}` }, d.ui[p])]));
  const log = h('ol', { class: 'log' });
  const next = h('button', { class: 'btn', type: 'button' }, d.ui.next);
  const reset = h('button', { class: 'btn ghost', type: 'button' }, d.ui.reset);

  const light = (type) => phases.forEach((p) => nodes[p].classList.toggle('on', p === type));
  next.addEventListener('click', () => {
    const s = d.steps[i++];
    light(s.type);
    log.append(h('li', { class: s.type },
      h('b', {}, s.type === 'done' ? `✅ ${d.ui.done}` : d.ui[s.type]), ' ', s.text));
    log.lastChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    next.disabled = i >= d.steps.length;
  });
  reset.addEventListener('click', () => { i = 0; log.replaceChildren(); light(null); next.disabled = false; });

  root.append(
    h('div', { class: 'bubble me' }, d.task),
    h('div', { class: 'cycle' }, nodes.think, '→', nodes.act, '→', nodes.observe, h('span', { class: 'back' }, '↺')),
    log,
    h('div', { class: 'actions' }, next, reset));
}

// 07 MCP
function mcp(root, d) {
  const on = new Set();
  const caps = h('ul', { class: 'caps' });
  const missions = h('ul', { class: 'missions' });
  const name = (id) => d.servers.find((s) => s.id === id).name;

  const draw = () => {
    const list = d.servers.filter((s) => on.has(s.id)).flatMap((s) => s.caps.map((c) => h('li', {}, `${s.emoji} ${c}`)));
    caps.replaceChildren(...(list.length ? list : [h('li', { class: 'hint' }, d.ui.empty)]));
    missions.replaceChildren(...d.missions.map((m) => {
      const missing = m.need.filter((id) => !on.has(id));
      return h('li', { class: missing.length ? '' : 'ok' },
        h('span', {}, m.text),
        h('em', {}, missing.length ? `🔌 ${fill(d.ui.need, { list: missing.map(name).join(', ') })}` : `✅ ${d.ui.ok}`));
    }));
  };
  const plugs = d.servers.map((s) => {
    const btn = toggle(`${s.emoji} ${s.name}`, () => {
      on.has(s.id) ? on.delete(s.id) : on.add(s.id);
      press(btn, on.has(s.id));
      draw();
    }, 'tog plug');
    return btn;
  });
  root.append(
    h('h3', {}, d.ui.servers), h('div', { class: 'toggles' }, plugs),
    h('div', { class: 'split' },
      h('div', {}, h('h3', {}, d.ui.caps), caps),
      h('div', {}, h('h3', {}, d.ui.missions), missions)));
  draw();
}

// 08 스킬
function skills(root, d) {
  let open = null;
  const shelf = h('div', { class: 'shelf' });
  const meter = h('p', { class: 'count' });
  const all = d.skills.reduce((n, s) => n + 1 + s.steps.length, 0);

  const draw = () => {
    shelf.replaceChildren(...d.skills.map((s) => h('div', { class: `skill${s.id === open ? ' open' : ''}` },
      h('strong', {}, `${s.emoji} ${s.name}`),
      h('span', {}, s.desc),
      s.id === open && h('ol', {}, s.steps.map((t) => h('li', {}, t))))));
    const opened = d.skills.find((s) => s.id === open);
    meter.textContent = `${fill(d.ui.desk, { now: d.skills.length + (opened ? opened.steps.length : 0) })}  ·  ${fill(d.ui.all, { all })}`;
  };
  const tasks = h('div', { class: 'toggles' });
  for (const t of d.tasks) {
    const btn = toggle(t.text, () => {
      open = t.skill;
      for (const b of tasks.children) press(b, b === btn);
      draw();
    });
    tasks.append(btn);
  }
  root.append(h('h3', {}, d.ui.tasks), tasks, h('h3', {}, d.ui.shelf), shelf, meter);
  draw();
}

// 09 하네스
function harness(root, d) {
  const on = new Set();
  const stage = h('div', { class: 'stage' });
  const draw = () => {
    const lv = [...d.levels].reverse().find((l) => on.size >= l.min);
    stage.replaceChildren(
      h('span', { class: 'vehicle' }, lv.emoji),
      h('div', {},
        h('strong', {}, lv.name), h('p', {}, lv.desc),
        h('div', { class: 'meter' }, h('span', { style: `width:${(on.size / d.parts.length) * 100}%` }))));
  };
  const parts = d.parts.map((p) => {
    const btn = toggle('', () => {
      on.has(p.id) ? on.delete(p.id) : on.add(p.id);
      press(btn, on.has(p.id));
      draw();
    }, 'tog part');
    btn.append(h('strong', {}, `${p.emoji} ${p.name}`), h('span', {}, p.desc));
    return btn;
  });
  root.append(stage, h('h3', {}, d.ui.parts), h('div', { class: 'partgrid' }, parts));
  draw();
}

// 10 정리
function outro(root, d) {
  root.append(
    h('div', { class: 'cards' }, d.cards.map((c) => h('div', { class: 'card' },
      h('span', { class: 'card-emoji' }, c.emoji), h('strong', {}, c.name), h('span', {}, c.text)))));
}

// 컨텍스트 창: 책상이 꽉 차면 오래된 것부터 밀려난다.
function context(root, d) {
  let desk, gone;
  const bar = h('div', { class: 'desk' });
  const used = h('p', { class: 'count' });
  const forgot = h('ul', { class: 'forgot' });
  const msg = h('p', { class: 'msg' });

  const draw = () => {
    const total = desk.reduce((n, it) => n + it.size, 0);
    bar.replaceChildren(...desk.map((it) => h('span', {
      class: `block${it.pinned ? ' pinned' : ''}${it.summary ? ' summary' : ''}`,
      style: `width:${it.size}%`, title: it.label,
    }, it.label.split(' ')[0])));
    used.textContent = fill(d.ui.used, { used: total, cap: d.cap });
    forgot.replaceChildren(...(gone.length
      ? gone.map((it) => h('li', { class: it.pinned ? 'pinned' : '' }, it.label))
      : [h('li', { class: 'hint' }, d.ui.none)]));
    msg.textContent = gone.some((it) => it.pinned) ? d.ui.lost : '';
  };
  const add = (it) => {
    desk.push({ ...it });
    while (desk.reduce((n, x) => n + x.size, 0) > d.cap) gone.push(desk.shift());
    draw();
  };
  const reset = () => { desk = [{ ...d.pinned, pinned: true }]; gone = []; draw(); };
  const compact = () => {
    desk = [...desk.filter((it) => it.pinned), { label: d.ui.summary, size: d.summarySize, summary: true }];
    draw();
  };
  reset();
  root.append(
    h('h3', {}, d.ui.desk), bar, used,
    h('h3', {}, d.ui.add),
    h('div', { class: 'toggles' }, d.items.map((it) =>
      h('button', { class: 'tog', type: 'button', onclick: () => add(it) }, `${it.label} +${it.size}`))),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'button', onclick: compact }, d.ui.compact),
      h('button', { class: 'btn ghost', type: 'button', onclick: reset }, d.ui.reset)),
    msg,
    h('h3', {}, d.ui.forgot), forgot);
}

// 둘 중 하나 고르기 퀴즈 (환각 퀴즈, 권한 퀴즈가 함께 쓴다)
function quiz(root, d, copy) {
  let i = 0;
  let hit = 0;
  const render = () => {
    if (i >= d.items.length) {
      return root.replaceChildren(
        h('p', { class: 'prompt' }, fill(d.ui.score, { n: d.items.length, hit })),
        h('div', { class: 'actions' },
          nextSlide(root, copy.ui.nextSlide),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { i = 0; hit = 0; render(); } }, d.ui.again)));
    }
    const it = d.items[i];
    const msg = h('p', { class: 'msg' });
    const next = h('button', { class: 'btn', type: 'button', hidden: true, onclick: () => { i++; render(); } }, d.ui.next);
    const btns = ['a', 'b'].map((key) => h('button', {
      class: 'btn ghost answer', type: 'button',
      onclick: (e) => {
        const ok = key === it.answer;
        if (ok) hit++;
        btns.forEach((b) => { b.disabled = true; });
        e.currentTarget.classList.add(ok ? 'right' : 'wrong');
        msg.textContent = `${ok ? d.ui.right : d.ui.wrong} ${it.why}`;
        next.hidden = false;
      },
    }, d.labels[key]));
    root.replaceChildren(
      h('h3', {}, d.intro),
      h('div', { class: 'bubble ai say' }, it.text),
      h('div', { class: 'actions' }, btns),
      msg, next,
      h('p', { class: 'count' }, `${i + 1} / ${d.items.length}`));
  };
  render();
}

// RAG: 문서를 먼저 찾아 책상에 올린 뒤 답한다.
function rag(root, d) {
  let open = false;
  let cur = null;
  const docs = h('div', { class: 'docs' });
  const chat = h('div', { class: 'chat' });
  const sw = toggle(d.ui.open, () => { open = !open; press(sw, open); draw(); });

  const draw = () => {
    const found = open && cur ? cur.docs : [];
    docs.replaceChildren(...d.docs.map((doc) => h('div', { class: `doc${found.includes(doc.id) ? ' found' : ''}` },
      h('strong', {}, `📄 ${doc.title}`), h('span', {}, doc.text))));
    if (!cur) return chat.replaceChildren();
    const kids = [h('div', { class: 'bubble me' }, cur.q)];
    if (open) {
      const titles = d.docs.filter((x) => cur.docs.includes(x.id)).map((x) => x.title).join(', ');
      kids.push(h('div', { class: 'call' }, `🔎 ${fill(d.ui.found, { n: cur.docs.length })}`),
        h('div', { class: 'bubble ai ok' }, cur.open),
        h('div', { class: 'tag src' }, `${d.ui.source}: ${titles}`));
    } else {
      kids.push(h('div', { class: 'bubble ai bad' }, cur.closed));
    }
    chat.replaceChildren(...kids);
  };
  const qs = h('div', { class: 'questions' });
  for (const q of d.questions) {
    const btn = toggle(q.q, () => {
      cur = q;
      for (const b of qs.children) press(b, b === btn);
      draw();
    }, 'q');
    qs.append(btn);
  }
  root.append(
    h('div', { class: 'toggles' }, sw),
    h('div', { class: 'split' }, qs, chat),
    h('h3', {}, d.ui.docs), docs, h('p', { class: 'note' }, d.ui.note));
  draw();
}

// 서브에이전트: 혼자 차례로 vs 셋이 동시에
function team(root, d) {
  const JOB = 2000;
  const MERGE = 600;
  let run = 0;
  const bars = [...d.jobs, d.ui.merge].map((label) => {
    const fillEl = h('span', {});
    return { fillEl, el: h('div', { class: 'job' }, h('em', {}, label), h('div', { class: 'meter' }, fillEl)) };
  });
  const time = h('p', { class: 'msg' });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const go = async (b, ms) => {
    b.fillEl.style.transition = `width ${ms}ms linear`;
    b.fillEl.style.width = '100%';
    await wait(ms);
  };
  const start = async (parallel) => {
    const id = ++run;
    time.textContent = '';
    for (const b of bars) { b.fillEl.style.transition = 'none'; b.fillEl.style.width = '0'; }
    await wait(50);
    const t0 = performance.now();
    const jobs = bars.slice(0, -1);
    if (parallel) await Promise.all(jobs.map((b) => go(b, JOB)));
    else for (const b of jobs) { if (id !== run) return; await go(b, JOB); }
    if (id !== run) return;
    await go(bars.at(-1), MERGE);
    if (id !== run) return;
    time.textContent = fill(d.ui.time, { s: ((performance.now() - t0) / 1000).toFixed(1) });
  };
  root.append(
    h('div', { class: 'bubble me' }, d.task),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => start(false) }, d.ui.solo),
      h('button', { class: 'btn', type: 'button', onclick: () => start(true) }, d.ui.team)),
    h('div', { class: 'jobs' }, bars.map((b) => b.el)),
    time, h('p', { class: 'note' }, d.ui.note));
}

// 쓰임새 4단계
function usage(root, d) {
  const panel = h('div', { class: 'level' });
  const tabs = h('div', { class: 'toggles steps' });
  const show = (lv, btn) => {
    for (const b of tabs.children) press(b, b === btn);
    panel.replaceChildren(
      h('div', { class: 'ratio' },
        h('span', { class: 'human', style: `width:${lv.human}%` }, lv.human >= 25 ? `${d.ui.human} ${lv.human}%` : ''),
        h('span', { class: 'machine' }, lv.human <= 75 ? `${d.ui.machine} ${100 - lv.human}%` : '')),
      h('dl', {},
        h('dt', {}, d.ui.you), h('dd', {}, lv.you),
        h('dt', {}, d.ui.ai), h('dd', {}, lv.ai),
        h('dt', {}, d.ui.ex), h('dd', {}, lv.ex)));
  };
  d.levels.forEach((lv, i) => {
    const btn = toggle(`${i + 1}. ${lv.emoji} ${lv.name}`, () => show(lv, btn));
    tabs.append(btn);
  });
  root.append(tabs, panel);
  show(d.levels[0], tabs.firstChild);
}

// 프롬프트: 재료를 넣을수록 부탁과 답이 함께 달라진다.
function prompt(root, d) {
  const on = new Set();
  const mine = h('div', { class: 'bubble me' });
  const answer = h('div', { class: 'bubble ai' });
  const stars = h('p', { class: 'count' });
  const draw = () => {
    const picked = d.parts.filter((p) => on.has(p.id));
    mine.replaceChildren(...[d.base.prompt, ...picked.map((p) => p.prompt)].map((t) => h('p', {}, t)));
    const base = picked.find((p) => p.replaceBase)?.replaceBase ?? d.base.result;
    const lines = (last) => picked.filter((p) => p.result && !!p.last === last).map((p) => p.result);
    answer.replaceChildren(...[...lines(false), base, ...lines(true)].map((t) => h('p', {}, t)));
    answer.classList.toggle('ok', picked.length === d.parts.length);
    stars.textContent = `${d.ui.stars}: ${'★'.repeat(picked.length + 1)}${'☆'.repeat(d.parts.length - picked.length)}`;
  };
  const parts = d.parts.map((p) => {
    const btn = toggle(p.name, () => {
      on.has(p.id) ? on.delete(p.id) : on.add(p.id);
      press(btn, on.has(p.id));
      draw();
    });
    return btn;
  });
  root.append(
    h('h3', {}, d.ui.parts), h('div', { class: 'toggles' }, parts), stars,
    h('div', { class: 'split' },
      h('div', {}, h('h3', {}, d.ui.prompt), h('div', { class: 'chat' }, mine)),
      h('div', {}, h('h3', {}, d.ui.result), h('div', { class: 'chat' }, answer))));
  draw();
}

// 탭: 연표, 회사별 모델, 모델 크기 비교가 함께 쓴다.
function tabs(root, d) {
  const panel = h('div', { class: 'tabpanel' });
  const bar = h('div', { class: 'toggles steps' });
  const show = (tab, btn) => {
    for (const b of bar.children) press(b, b === btn);
    panel.replaceChildren(...[
      h('strong', { class: 'tabtitle' }, tab.title),
      tab.meters && h('div', { class: 'meters' }, tab.meters.map(([name, v]) =>
        h('div', { class: 'job' }, h('em', {}, name), h('div', { class: 'meter' }, h('span', { style: `width:${v}%` }))))),
      tab.list && h('ul', { class: 'bullets' }, tab.list.map((t) => h('li', {}, t))),
      tab.rows && h('dl', {}, tab.rows.flatMap(([k, v]) => [h('dt', {}, d.ui[k]), h('dd', {}, v)])),
    ].filter(Boolean));
  };
  d.tabs.forEach((tab) => {
    const btn = toggle(tab.label, () => show(tab, btn));
    bar.append(btn);
  });
  root.append(bar, panel, d.note ? h('p', { class: 'note' }, d.note) : '');
  show(d.tabs[d.start ?? 0], bar.children[d.start ?? 0]);
}

// 뒤집는 카드: 예전엔 / 지금은
function flip(root, d) {
  root.append(h('div', { class: 'flips' }, d.cards.map((c) => {
    const body = h('span', {});
    const tag = h('b', {});
    const btn = h('button', { class: 'flipcard', type: 'button', 'aria-pressed': 'false' },
      h('span', { class: 'card-emoji' }, c.emoji), h('strong', {}, c.name), tag, body);
    const draw = (now) => {
      press(btn, now);
      tag.textContent = now ? d.ui.now : d.ui.before;
      body.textContent = now ? c.now : c.before;
    };
    btn.addEventListener('click', () => draw(btn.getAttribute('aria-pressed') !== 'true'));
    draw(false);
    return btn;
  })));
}

// 생성 과정: 입력 조각 → 점과 선(신경망) → 다음 조각 후보 → 하나 골라 붙이기 → 반복
const SVG_NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, text) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}

function neural(root, d) {
  const H = 330;
  const GAP = 48;
  const STAGE = 330;
  const SLOTS = 4;
  const cols = [{ x: 118, n: SLOTS }, { x: 262, n: 5 }, { x: 372, n: 6 }, { x: 482, n: 5 }, { x: 600, n: SLOTS }];
  const y = (n, i) => H / 2 + 14 + (i - (n - 1) / 2) * GAP;
  const svg = s('svg', { viewBox: `0 0 760 ${H}`, class: 'net', role: 'img' });

  // 열 사이의 선
  const edges = cols.slice(0, -1).map((a, c) => {
    const b = cols[c + 1];
    const from = c === 0 ? a.x + 44 : a.x;
    const to = c === cols.length - 2 ? b.x - 10 : b.x;
    return Array.from({ length: a.n }, (_, i) => Array.from({ length: b.n }, (_, j) => {
      const line = s('line', { x1: from, y1: y(a.n, i), x2: to, y2: y(b.n, j), class: 'edge' });
      svg.append(line);
      return line;
    }));
  });
  const nodes = cols.slice(1, -1).map((col) => Array.from({ length: col.n }, (_, i) => {
    const c = s('circle', { cx: col.x, cy: y(col.n, i), r: 13, class: 'neuron' });
    svg.append(c);
    return c;
  }));
  const inputs = Array.from({ length: SLOTS }, (_, i) => {
    const g = s('g', { class: 'tokbox' });
    const text = s('text', { x: cols[0].x - 14, y: y(SLOTS, i) + 5, 'text-anchor': 'middle' });
    g.append(s('rect', { x: cols[0].x - 72, y: y(SLOTS, i) - 17, width: 116, height: 34, rx: 9 }), text);
    svg.append(g);
    return { g, text };
  });
  const outputs = Array.from({ length: SLOTS }, (_, i) => {
    const g = s('g', { class: 'outrow' });
    const text = s('text', { x: cols[4].x, y: y(SLOTS, i) - 4 });
    const barEl = s('rect', { x: cols[4].x, y: y(SLOTS, i) + 3, width: 0, height: 9, rx: 4, class: 'outbar' });
    const pct = s('text', { x: 752, y: y(SLOTS, i) - 4, 'text-anchor': 'end', class: 'outpct' });
    g.append(text, barEl, pct);
    svg.append(g);
    return { g, text, barEl, pct };
  });
  [[cols[0].x - 14, d.ui.in], [cols[2].x, d.ui.net], [cols[4].x + 70, d.ui.out]].forEach(([x, label]) =>
    svg.append(s('text', { x, y: 18, 'text-anchor': 'middle', class: 'collabel' }, label)));

  const sentence = h('p', { class: 'prompt sentence' });
  const msg = h('p', { class: 'msg' });
  const stepBtn = h('button', { class: 'btn', type: 'button' }, d.ui.step);
  const autoBtn = h('button', { class: 'btn', type: 'button' }, d.ui.auto);
  const resetBtn = h('button', { class: 'btn ghost', type: 'button' }, d.ui.reset);
  let tokens, i, busy, run = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const drawSentence = (fresh) => sentence.replaceChildren(...tokens.map((t, k) =>
    h('span', { class: `piece${fresh && k === tokens.length - 1 ? ' fresh' : ''}` }, t)));
  const clear = () => {
    svg.querySelectorAll('.on').forEach((el) => el.classList.remove('on'));
    nodes.flat().forEach((n) => { n.style.fill = ''; });
    outputs.forEach((o) => { o.g.classList.remove('show', 'picked'); o.barEl.setAttribute('width', 0); });
  };
  const drawInputs = () => {
    const last = tokens.slice(-SLOTS);
    inputs.forEach((slot, k) => {
      const t = last[k - (SLOTS - last.length)];
      slot.g.style.visibility = t ? 'visible' : 'hidden';
      slot.text.textContent = t ?? '';
    });
    return SLOTS - last.length; // 비어 있는 칸 수
  };
  const reset = () => {
    run++; busy = false; i = 0; tokens = [...d.start];
    clear(); drawInputs(); drawSentence(false);
    msg.textContent = ''; stepBtn.disabled = false; autoBtn.disabled = false;
  };

  const step = async () => {
    if (busy || i >= d.steps.length) return false;
    busy = true;
    const id = run;
    const st = d.steps[i];
    let seed = (i + 1) * 9973;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    clear();
    const empty = drawInputs();
    // 각 열의 활성도: 입력은 '눈여겨본 정도', 가운데는 계산 결과, 마지막은 확률
    let act = Array.from({ length: SLOTS }, (_, k) => (k < empty ? 0 : st.focus[k - empty]));
    for (let c = 0; c < edges.length; c++) {
      const next = c === edges.length - 1
        ? st.options.map((o) => o.p / 100)
        : Array.from({ length: cols[c + 1].n }, () => 0.25 + 0.75 * rnd());
      if (c === 0) inputs.forEach((slot, k) => slot.g.classList.toggle('on', act[k] > 0));
      edges[c].forEach((row, a) => row.forEach((line, b) => {
        const w = act[a] * next[b];
        if (w < 0.12) return;
        line.classList.add('on');
        line.style.strokeOpacity = 0.2 + 0.8 * w;
        line.style.strokeWidth = 1 + 3 * w;
      }));
      await wait(STAGE);
      if (id !== run) return false;
      if (c < nodes.length) {
        nodes[c].forEach((n, k) => { n.classList.add('on'); n.style.fill = `color-mix(in srgb, #19c39c ${Math.round(next[k] * 100)}%, #fff)`; });
      }
      act = next;
    }
    outputs.forEach((o, k) => {
      const opt = st.options[k];
      o.text.textContent = opt.w; o.pct.textContent = `${opt.p}%`;
      o.barEl.setAttribute('width', opt.p * 1.5);
      o.g.classList.add('show');
    });
    await wait(STAGE * 2);
    if (id !== run) return false;
    outputs[st.pick].g.classList.add('picked');
    await wait(STAGE);
    if (id !== run) return false;
    tokens.push(st.options[st.pick].w);
    drawSentence(true);
    i++;
    busy = false;
    if (i >= d.steps.length) { msg.textContent = d.ui.done; stepBtn.disabled = true; autoBtn.disabled = true; }
    return true;
  };
  stepBtn.addEventListener('click', step);
  autoBtn.addEventListener('click', async () => {
    const id = run;
    while (id === run && await step()) await wait(STAGE);
  });
  resetBtn.addEventListener('click', reset);

  root.append(sentence, svg, h('div', { class: 'actions' }, stepBtn, autoBtn, resetBtn), msg, h('p', { class: 'note' }, d.ui.note));
  reset();
}

export const widgets = {
  tabs, flip, neural,
  predict, temperature, tokens, context, ask, quiz, rag, loop, mcp, skills, harness, team, usage, prompt, outro,
};

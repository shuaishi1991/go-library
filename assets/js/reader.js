/* 阅读页逻辑：目录树 / 棋谱播放 / 试下模式 / 显示设置 */
(function () {
  const $ = (id) => document.getElementById(id);

  const settings = Object.assign(
    { showNumbers: true, showCoords: true, showMarks: true, crop: true },
    JSON.parse(localStorage.getItem("gqsf-settings") || "{}")
  );
  function saveSettings() {
    localStorage.setItem("gqsf-settings", JSON.stringify(settings));
  }

  const state = {
    bookId: null, book: null,
    chapterId: null, chapter: null,
    patternIdx: 0, figureIdx: 0,
    moveIdx: 0,
    practice: false, practiceMistakes: 0, practiceDone: false, wrong: null,
    playing: null,
  };

  const board = createBoard($("board-wrap"));

  function fitBoard() {
    const wrap = $("board-wrap");
    const stacked = window.matchMedia("(max-width: 900px)").matches &&
      !window.matchMedia("(max-height: 560px) and (orientation: landscape)").matches;
    if (stacked) {
      const { w, h } = board.getViewSize();
      if (w && h) wrap.style.aspectRatio = `${w} / ${h}`;
    } else {
      wrap.style.aspectRatio = "";
    }
  }
  window.addEventListener("resize", fitBoard);

  /* ---------- 数据加载 ---------- */
  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(url);
    return res.json();
  }

  async function loadChapter(chapterId) {
    if (state.chapterId === chapterId && state.chapter) return;
    state.chapterId = chapterId;
    state.chapter = await fetchJSON(`books/${state.bookId}/data/${chapterId}.json`);
  }

  /* ---------- 局面计算 ---------- */
  function currentFigure() {
    const pat = state.chapter.patterns[state.patternIdx];
    return pat.figures[state.figureIdx];
  }

  function figureStones(fig) {
    // inherit 图：沿用上一图终局
    if (fig.inherit && state.figureIdx > 0) {
      const prev = state.chapter.patterns[state.patternIdx].figures[state.figureIdx - 1];
      return stonesAt(prev, prev.moves.length).stones;
    }
    return null;
  }

  function stonesAt(fig, upto) {
    const stones = new Map();
    if (fig.inherit) {
      const inherited = figureStones(fig);
      if (inherited) for (const [k, v] of inherited) stones.set(k, v);
      return { stones, moves: [] };
    }
    fig.setupB.forEach(([c, r]) => stones.set(c + "," + r, { color: "B", num: 0 }));
    fig.setupW.forEach(([c, r]) => stones.set(c + "," + r, { color: "W", num: 0 }));
    fig.moves.slice(0, upto).forEach((m, i) =>
      stones.set(m.pt[0] + "," + m.pt[1], { color: m.c, num: i + 1 }));
    return { stones, moves: fig.moves };
  }

  function cropOf(fig) {
    const pts = [];
    if (fig.inherit) {
      const inherited = figureStones(fig);
      if (inherited) for (const key of inherited.keys()) pts.push(key.split(",").map(Number));
    } else {
      pts.push(...fig.setupB, ...fig.setupW, ...fig.moves.map((m) => m.pt));
    }
    pts.push(...fig.marks.map((m) => m.pt), ...fig.tris);
    if (!pts.length) return null;
    let c0 = 18, r0 = 18, c1 = 0, r1 = 0;
    for (const [c, r] of pts) {
      c0 = Math.min(c0, c); r0 = Math.min(r0, r);
      c1 = Math.max(c1, c); r1 = Math.max(r1, r);
    }
    const MIN = 9;
    const grow = (lo, hi) => {
      let a = Math.max(0, lo - 1), b = Math.min(18, hi + 1);
      while (b - a + 1 < MIN) {
        if (a > 0) a--; else if (b < 18) b++; else break;
      }
      return [a, b];
    };
    [c0, c1] = grow(c0, c1);
    [r0, r1] = grow(r0, r1);
    return [c0, r0, c1, r1];
  }

  /* ---------- 渲染 ---------- */
  function render() {
    const fig = currentFigure();
    const upto = state.practice ? state.moveIdx : state.moveIdx;
    const { stones } = stonesAt(fig, upto);
    const moves = fig.inherit ? [] : fig.moves;
    const last = upto > 0 && moves[upto - 1] ? moves[upto - 1].pt : null;

    board.setView({
      crop: settings.crop ? cropOf(fig) : null,
      showCoords: settings.showCoords,
      showNumbers: settings.showNumbers,
      showMarks: settings.showMarks,
    });
    board.setState({
      stones,
      marks: fig.marks,
      tris: fig.tris,
      lastMove: state.practice ? null : last,
      wrong: state.wrong,
    });
    fitBoard();

    $("move-counter").textContent = fig.inherit
      ? "终局"
      : `${state.moveIdx} / ${moves.length}`;

    const title = fig.title ? `${fig.label}（${fig.title}）` : fig.label;
    $("comment-title").textContent = title;
    $("comment-text").textContent = fig.comment || "本图暂无文字说明。";

    document.querySelectorAll(".figure-tabs button").forEach((b, i) =>
      b.classList.toggle("active", i === state.figureIdx));
    const activeTab = document.querySelector(".figure-tabs button.active");
    if (activeTab) activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });

    document.querySelectorAll(".nav-pattern").forEach((n) =>
      n.classList.toggle("active",
        n.dataset.chapter === state.chapterId &&
        +n.dataset.pattern === state.patternIdx));

    $("ctl-answer").classList.toggle("hidden",
      !(state.practice && state.practiceMistakes >= 2 && !state.practiceDone));

    const banner = $("practice-banner");
    if (state.practice) {
      banner.classList.remove("hidden");
      if (state.practiceDone) {
        banner.textContent = "🎉 本图完成！";
        banner.className = "practice-banner done";
      } else {
        const turn = moves[state.moveIdx];
        banner.textContent = turn ? `试下中 · 轮到${turn.c === "B" ? "黑" : "白"}棋` : "";
        banner.className = "practice-banner";
      }
    } else {
      banner.classList.add("hidden");
    }

    syncHash();
  }

  function renderFigureTabs() {
    const pat = state.chapter.patterns[state.patternIdx];
    const tabs = $("figure-tabs");
    tabs.textContent = "";
    pat.figures.forEach((f, i) => {
      const b = document.createElement("button");
      b.textContent = f.label;
      b.title = f.title || f.label;
      b.addEventListener("click", () => goto(state.chapterId, state.patternIdx, i));
      tabs.appendChild(b);
    });
  }

  /* ---------- 目录树 ---------- */
  function renderNav() {
    const tree = $("nav-tree");
    tree.textContent = "";
    const volumes = {};
    state.book.chapters.forEach((ch) => {
      (volumes[ch.volume] = volumes[ch.volume] || []).push(ch);
    });
    for (const vol of Object.keys(volumes)) {
      const volEl = document.createElement("details");
      volEl.open = true;
      volEl.className = "nav-volume";
      const vs = document.createElement("summary");
      vs.textContent = vol;
      volEl.appendChild(vs);
      for (const ch of volumes[vol]) {
        const chEl = document.createElement("details");
        chEl.className = "nav-chapter";
        const cs = document.createElement("summary");
        cs.textContent = ch.title;
        chEl.appendChild(cs);
        chEl.addEventListener("toggle", async function lazy() {
          if (!chEl.open || chEl.dataset.loaded) return;
          chEl.dataset.loaded = "1";
          await loadChapter(ch.id);
          const patList = state.chapterId === ch.id ? state.chapter.patterns
            : (await fetchJSON(`books/${state.bookId}/data/${ch.id}.json`)).patterns;
          patList.forEach((p, pi) => {
            const a = document.createElement("a");
            a.className = "nav-pattern";
            a.textContent = p.title;
            a.dataset.chapter = ch.id;
            a.dataset.pattern = pi;
            a.addEventListener("click", () => {
              goto(ch.id, pi, 0);
              closeSidebarMobile();
            });
            chEl.appendChild(a);
          });
          render();
        });
        volEl.appendChild(chEl);
        if (ch.id === state.chapterId) chEl.open = true;
      }
      tree.appendChild(volEl);
    }
  }

  /* ---------- 导航 / 路由 ---------- */
  function syncHash() {
    const h = `#${state.bookId}/${state.chapterId}/${state.patternIdx}/${state.figureIdx}`;
    if (location.hash !== h) history.replaceState(null, "", h);
  }

  async function goto(chapterId, patternIdx, figureIdx) {
    stopPlay();
    await loadChapter(chapterId);
    state.patternIdx = patternIdx;
    state.figureIdx = figureIdx;
    state.moveIdx = 0;
    exitPractice();
    renderFigureTabs();
    renderNav();
    render();
  }

  function stepFigure(delta) {
    const pat = state.chapter.patterns[state.patternIdx];
    const next = state.figureIdx + delta;
    if (next >= 0 && next < pat.figures.length) {
      goto(state.chapterId, state.patternIdx, next);
    }
  }

  /* ---------- 播放 ---------- */
  function stepMove(delta) {
    const fig = currentFigure();
    if (fig.inherit) return;
    const n = fig.moves.length;
    state.moveIdx = Math.max(0, Math.min(n, state.moveIdx + delta));
    if (state.practice && delta > 0) state.moveIdx = Math.min(state.moveIdx, n);
    state.wrong = null;
    render();
  }

  function stopPlay() {
    if (state.playing) {
      clearInterval(state.playing);
      state.playing = null;
      $("ctl-play").classList.remove("on");
    }
  }

  /* ---------- 试下模式 ---------- */
  function enterPractice() {
    const fig = currentFigure();
    if (fig.inherit || !fig.moves.length) return;
    stopPlay();
    state.practice = true;
    state.moveIdx = 0;
    state.practiceMistakes = 0;
    state.practiceDone = false;
    state.wrong = null;
    $("ctl-practice").classList.add("on");
    render();
  }

  function exitPractice() {
    state.practice = false;
    state.practiceDone = false;
    state.wrong = null;
    $("ctl-practice").classList.remove("on");
  }

  board.onPointClick((c, r) => {
    if (!state.practice || state.practiceDone) return;
    const fig = currentFigure();
    const next = fig.moves[state.moveIdx];
    if (!next) return;
    if (next.pt[0] === c && next.pt[1] === r) {
      state.moveIdx++;
      state.wrong = null;
      if (state.moveIdx >= fig.moves.length) state.practiceDone = true;
    } else {
      state.practiceMistakes++;
      state.wrong = [c, r];
    }
    render();
  });

  /* ---------- 控件绑定 ---------- */
  $("ctl-first").addEventListener("click", () => { state.moveIdx = 0; state.wrong = null; render(); });
  $("ctl-prev").addEventListener("click", () => stepMove(-1));
  $("ctl-next").addEventListener("click", () => {
    if (state.practice) return;
    stepMove(1);
  });
  $("ctl-last").addEventListener("click", () => {
    const fig = currentFigure();
    state.moveIdx = fig.moves.length;
    state.wrong = null;
    render();
  });
  $("ctl-play").addEventListener("click", () => {
    if (state.playing) { stopPlay(); return; }
    if (state.practice) return;
    const fig = currentFigure();
    if (state.moveIdx >= fig.moves.length) state.moveIdx = 0;
    $("ctl-play").classList.add("on");
    state.playing = setInterval(() => {
      const f = currentFigure();
      if (state.moveIdx >= f.moves.length) { stopPlay(); return; }
      stepMove(1);
    }, 1000);
  });
  $("ctl-practice").addEventListener("click", () => {
    if (state.practice) { exitPractice(); render(); } else enterPractice();
  });
  $("ctl-answer").addEventListener("click", () => {
    const fig = currentFigure();
    const next = fig.moves[state.moveIdx];
    if (!next) return;
    state.moveIdx++;
    state.wrong = null;
    if (state.moveIdx >= fig.moves.length) state.practiceDone = true;
    render();
  });

  function bindToggle(id, key, labelOn, labelOff) {
    const btn = $(id);
    const apply = () => {
      btn.classList.toggle("on", settings[key]);
      if (labelOn) btn.textContent = settings[key] ? labelOn : labelOff;
    };
    btn.addEventListener("click", () => {
      settings[key] = !settings[key];
      saveSettings();
      apply();
      render();
    });
    apply();
  }
  bindToggle("opt-numbers", "showNumbers");
  bindToggle("opt-coords", "showCoords");
  bindToggle("opt-marks", "showMarks");
  bindToggle("opt-crop", "crop", "✂ 局部", "▦ 全盘");

  $("fig-prev").addEventListener("click", () => stepFigure(-1));
  $("fig-next").addEventListener("click", () => stepFigure(1));

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowLeft") stepMove(-1);
    else if (ev.key === "ArrowRight" && !state.practice) stepMove(1);
    else if (ev.key === "ArrowUp") stepFigure(-1);
    else if (ev.key === "ArrowDown") stepFigure(1);
  });

  /* ---------- 移动端侧栏 ---------- */
  function closeSidebarMobile() {
    document.body.classList.remove("sidebar-open");
  }
  $("nav-toggle").addEventListener("click", () =>
    document.body.classList.toggle("sidebar-open"));
  $("sidebar-mask").addEventListener("click", closeSidebarMobile);

  /* ---------- 启动 ---------- */
  async function init() {
    const parts = (location.hash || "#").slice(1).split("/");
    let bookId = parts[0];
    if (!bookId) {
      const idx = await fetchJSON("books/index.json");
      bookId = idx[0].id;
    }
    state.bookId = bookId;
    state.book = await fetchJSON(`books/${bookId}/book.json`);
    $("reader-book-title").textContent = state.book.title;
    document.title = `${state.book.title} · 围棋书房`;

    const chapterId = parts[1] || state.book.chapters[0].id;
    const patternIdx = +(parts[2] || 0);
    const figureIdx = +(parts[3] || 0);
    renderNav();
    await goto(chapterId, patternIdx, figureIdx);
    const ch = state.book.chapters.find((c) => c.id === chapterId);
    $("reader-crumb").textContent = ch ? `${ch.volume} · ${ch.title}` : "";
  }

  init().catch((e) => {
    $("nav-tree").innerHTML = `<p class="loading">加载失败：${e.message}</p>`;
  });
})();

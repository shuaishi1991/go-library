/* SVG 围棋棋盘渲染器
 * createBoard(container) -> {
 *   setState(state), setView(view), onPointClick(fn), pointFromEvent
 * }
 * state: { stones: Map<"c,r",{color,num}>, marks:[{pt,label}], tris:[[c,r]],
 *          lastMove:[c,r]|null, wrong:[c,r]|null, turn:"B"|"W"|null }
 * view:  { crop:[c0,r0,c1,r1]|null, showCoords, showNumbers, showMarks }
 */
(function () {
  const SVGNS = "http://www.w3.org/2000/svg";
  const CELL = 44;
  const EDGE = 30;          // board padding beyond outer lines
  const COORD_EXTRA = 22;   // extra padding when coords shown
  const COLS = "ABCDEFGHJKLMNOPQRST";
  const HOSHI = [3, 9, 15];

  function el(name, attrs) {
    const n = document.createElementNS(SVGNS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function createBoard(container) {
    let state = { stones: new Map(), marks: [], tris: [], lastMove: null, wrong: null, turn: null };
    let view = { crop: null, showCoords: true, showNumbers: true, showMarks: true };
    let clickFn = null;
    let geom = null;
    let viewSize = { w: 0, h: 0 };

    const svg = el("svg", { class: "goban" });
    container.appendChild(svg);

    function gridRange() {
      const c = view.crop || [0, 0, 18, 18];
      return { c0: c[0], r0: c[1], c1: c[2], r1: c[3] };
    }

    const defs = el("defs", {});
    defs.innerHTML =
      '<radialGradient id="gradB" cx="35%" cy="30%">' +
      '<stop offset="0%" stop-color="#777"/><stop offset="100%" stop-color="#000"/></radialGradient>' +
      '<radialGradient id="gradW" cx="35%" cy="30%">' +
      '<stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#d9d9d9"/></radialGradient>';

    function render() {
      const { c0, r0, c1, r1 } = gridRange();
      const cols = c1 - c0 + 1, rows = r1 - r0 + 1;
      const pad = EDGE + (view.showCoords ? COORD_EXTRA : 0);
      const w = pad * 2 + (cols - 1) * CELL;
      const h = pad * 2 + (rows - 1) * CELL;
      viewSize = { w, h };
      const xy = (c, r) => [pad + (c - c0) * CELL, pad + (r - r0) * CELL];
      geom = { c0, r0, c1, r1, pad };

      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svg.textContent = "";
      svg.appendChild(defs);

      svg.appendChild(el("rect", { x: 0, y: 0, width: w, height: h, fill: "#e8bc72", rx: 10 }));

      for (let c = c0; c <= c1; c++) {
        const [x1, y1] = xy(c, r0), [, y2] = xy(c, r1);
        svg.appendChild(el("line", {
          x1, y1: c === c0 ? y1 : y1, x2: x1, y2,
          stroke: "#5b3d1e", "stroke-width": (c === c0 || c === c1) ? 2 : 1,
        }));
      }
      for (let r = r0; r <= r1; r++) {
        const [x1, y1] = xy(c0, r), [x2] = xy(c1, r);
        svg.appendChild(el("line", {
          x1, y1, x2, y2: y1,
          stroke: "#5b3d1e", "stroke-width": (r === r0 || r === r1) ? 2 : 1,
        }));
      }

      if (c0 === 0 && r0 === 0 && c1 === 18 && r1 === 18) {
        for (const hc of HOSHI) for (const hr of HOSHI) {
          const [x, y] = xy(hc, hr);
          svg.appendChild(el("circle", { cx: x, cy: y, r: 4.5, fill: "#5b3d1e" }));
        }
      }

      if (view.showCoords) {
        for (let c = c0; c <= c1; c++) {
          const [x] = xy(c, r0);
          for (const yy of [EDGE + COORD_EXTRA / 2, h - EDGE - COORD_EXTRA / 2]) {
            const t = el("text", { x, y: yy, "text-anchor": "middle", "dominant-baseline": "central", class: "coord" });
            t.textContent = COLS[c];
            svg.appendChild(t);
          }
        }
        for (let r = r0; r <= r1; r++) {
          const [, y] = xy(c0, r);
          for (const xx of [EDGE + COORD_EXTRA / 2, w - EDGE - COORD_EXTRA / 2]) {
            const t = el("text", { x: xx, y, "text-anchor": "middle", "dominant-baseline": "central", class: "coord" });
            t.textContent = 19 - r;
            svg.appendChild(t);
          }
        }
      }

      const occupied = new Set(state.stones.keys());

      if (view.showMarks) {
        for (const [c, r] of state.tris) {
          if (occupied.has(c + "," + r)) continue;
          const [x, y] = xy(c, r);
          svg.appendChild(el("path", {
            d: `M ${x} ${y - 10} L ${x + 9} ${y + 7} L ${x - 9} ${y + 7} Z`,
            fill: "none", stroke: "#5b3d1e", "stroke-width": 2,
          }));
        }
        for (const m of state.marks) {
          const key = m.pt[0] + "," + m.pt[1];
          if (occupied.has(key)) continue;
          const [x, y] = xy(m.pt[0], m.pt[1]);
          const t = el("text", { x, y, "text-anchor": "middle", "dominant-baseline": "central", class: "mark-letter" });
          t.textContent = m.label;
          svg.appendChild(t);
        }
      }

      for (const [key, s] of state.stones) {
        const [c, r] = key.split(",").map(Number);
        if (c < c0 || c > c1 || r < r0 || r > r1) continue;
        const [x, y] = xy(c, r);
        const stone = el("circle", {
          cx: x, cy: y, r: CELL / 2 - 1.5,
          fill: s.color === "B" ? "url(#gradB)" : "url(#gradW)",
          stroke: s.color === "B" ? "#000" : "#999", "stroke-width": 0.8,
        });
        svg.appendChild(stone);
        if (view.showNumbers && s.num) {
          const t = el("text", {
            x, y, "text-anchor": "middle", "dominant-baseline": "central",
            class: "stone-num", fill: s.color === "B" ? "#fff" : "#000",
          });
          t.textContent = s.num;
          svg.appendChild(t);
        }
      }

      if (view.showMarks) {
        for (const m of state.marks) {
          const key = m.pt[0] + "," + m.pt[1];
          const s = state.stones.get(key);
          if (!s) continue;
          const [x, y] = xy(m.pt[0], m.pt[1]);
          const t = el("text", {
            x, y, "text-anchor": "middle", "dominant-baseline": "central",
            class: "mark-letter", fill: s.color === "B" ? "#fff" : "#000",
          });
          t.textContent = m.label;
          svg.appendChild(t);
        }
      }

      if (state.lastMove) {
        const [x, y] = xy(state.lastMove[0], state.lastMove[1]);
        svg.appendChild(el("circle", { cx: x, cy: y, r: 6, fill: "none", stroke: "#e33", "stroke-width": 2.5 }));
      }
      if (state.wrong) {
        const [x, y] = xy(state.wrong[0], state.wrong[1]);
        const g = el("g", { stroke: "#d33", "stroke-width": 4, "stroke-linecap": "round" });
        g.appendChild(el("line", { x1: x - 10, y1: y - 10, x2: x + 10, y2: y + 10 }));
        g.appendChild(el("line", { x1: x - 10, y1: y + 10, x2: x + 10, y2: y - 10 }));
        svg.appendChild(g);
      }
    }

    svg.addEventListener("click", (ev) => {
      if (!clickFn || !geom) return;
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const px = (ev.clientX - rect.left) * (vb.width / rect.width);
      const py = (ev.clientY - rect.top) * (vb.height / rect.height);
      const c = Math.round((px - geom.pad) / CELL) + geom.c0;
      const r = Math.round((py - geom.pad) / CELL) + geom.r0;
      if (c >= geom.c0 && c <= geom.c1 && r >= geom.r0 && r <= geom.r1) clickFn(c, r);
    });

    render();

    return {
      setState(s) { state = Object.assign(state, s); render(); },
      setView(v) { Object.assign(view, v); render(); },
      onPointClick(fn) { clickFn = fn; },
      getViewSize() { return viewSize; },
    };
  }

  window.createBoard = createBoard;
})();

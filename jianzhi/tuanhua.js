// =============================================================
//  团花纹样生成器 —— 只设计 1/24（半个扇形），其余靠"折纸"镜像 + 旋转出来
//  输出一张 SVG：白 = 纸，黑 = 剪掉。正式作品里会把它画成贴图给 WebGL 用。
//  规矩：纸必须连成一整张（每一块纸都连着圈带），这才是真剪纸。
// =============================================================
(function (root) {
  const R = 500;

  function make(opt = {}) {
    const N = opt.folds || 12;               // 12 瓣
    const w = Math.PI / N;                   // 半个扇形的角度
    const P = (r, t) => [r * Math.sin(t), -r * Math.cos(t)];
    const f = v => v.toFixed(2);
    const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
    const holes = [];                        // 半扇形里的洞
    const once = [];                         // 不需要复制的洞（花心）
    const lin = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);

    // 一条"在两条角度曲线之间"的带状洞：r 从 r0 到 r1，角度从 lo(r) 到 hi(r)
    function band(r0, r1, lo, hi, n = 40) {
      const rs = lin(r0, r1, n).filter(r => hi(r) - lo(r) > 0.0005);
      if (rs.length < 2) return;
      holes.push(poly([...rs.map(r => P(r, lo(r))), ...rs.slice().reverse().map(r => P(r, hi(r)))]));
    }
    // 月牙：大圆减去往外偏的小圆（两段圆弧）
    function crescent(r, t, a, depth) {
      const [cx, cy] = P(r, t), ux = Math.sin(t), uy = -Math.cos(t);   // 朝外的方向
      const vx = -uy, vy = ux;                                           // 切向
      const s = a * 0.92;
      const A = [cx + vx * s - ux * a * 0.25, cy + vy * s - uy * a * 0.25];
      const B = [cx - vx * s - ux * a * 0.25, cy - vy * s - uy * a * 0.25];
      const r2 = a * depth;
      holes.push(`M${f(A[0])} ${f(A[1])}A${f(a)} ${f(a)} 0 1 1 ${f(B[0])} ${f(B[1])}A${f(r2)} ${f(r2)} 0 0 0 ${f(A[0])} ${f(A[1])}Z`);
    }
    function circle(r, t, a, list = holes) {
      const [x, y] = P(r, t);
      list.push(`M${f(x - a)} ${f(y)}a${f(a)} ${f(a)} 0 1 0 ${f(2 * a)} 0a${f(a)} ${f(a)} 0 1 0 ${f(-2 * a)} 0Z`);
    }
    // 斜着的细缝（叶脉 / 锯齿边），从 (r0,t0) 到 (r1,t1)，宽 wd
    function slit(r0, t0, r1, t1, wd) {
      const a = P(r0, t0), b = P(r1, t1);
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = -dy / L * wd / 2, ny = dx / L * wd / 2;
      // 两头尖：像刀刻出来的柳叶缝
      const m1 = [a[0] + dx * 0.5 + nx, a[1] + dy * 0.5 + ny], m2 = [a[0] + dx * 0.5 - nx, a[1] + dy * 0.5 - ny];
      holes.push(`M${f(a[0])} ${f(a[1])}Q${f(m1[0] + nx)} ${f(m1[1] + ny)} ${f(b[0])} ${f(b[1])}Q${f(m2[0] - nx)} ${f(m2[1] - ny)} ${f(a[0])} ${f(a[1])}Z`);
    }

    // ---------- ① 花心 ----------
    circle(0, 0, 11, once);
    // 花心四周一圈水滴形镂空
    {
      const rs = lin(24, 54, 20);
      const hw = r => w * 0.62 * Math.pow(Math.sin(Math.PI * (r - 24) / 30), 0.8) * (0.55 + 0.45 * (r - 24) / 30);
      band(24, 54, r => w - hw(r), r => w + hw(r));
    }
    for (const t of [0]) circle(40, t, 3.2);

    // ---------- ② 内层花瓣（叶脉纹） 64–190 ----------
    const r0 = 66, r1 = 186;
    const pe = r => w * (0.18 + 0.6 * Math.pow(Math.sin(Math.PI * (r - r0) / (r1 - r0)), 0.75));   // 花瓣边缘角度
    band(r0 + 4, r1 - 4, r => pe(r) + 0.012, r => 2 * w - pe(r) - 0.012);                      // 花瓣之间镂空
    for (let k = 0; k < 6; k++) {                                                              // 叶脉：斜缝
      const rr = 84 + k * 16;
      slit(rr, 0.035, rr + 12, pe(rr + 12) * 0.82, 4.2);
    }

    // ---------- ③ 圆点圈 186–202 ----------
    for (const t of [0, w / 2, w]) circle(194, t, 3.6);

    // ---------- ④ 锯齿纹 202–238 ----------
    {
      const s = w / 4, g = 0.006;
      for (let i = 0; i < 4; i++) {
        const a = i * s + g, b = (i + 1) * s - g;
        holes.push(poly([P(236, a), P(236, b), P(206, (a + b) / 2)]));
      }
    }

    // ---------- ⑤ 外层大瓣（莲瓣 + 月牙） + 火苗 246–410 ----------
    const q0 = 248, q1 = 408;
    const pw = r => {                                    // 外瓣半宽（绕 θ=w）
      const s = Math.min(1, Math.max(0, (r - q0) / (q1 - q0)));
      return w * (0.3 * (1 - s) + 0.64 * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.8)), 0.9)) + 0.004;
    };
    const fw = r => {                                    // 火苗半宽（绕 θ=0）
      const s = (r - q0) / 130;
      return s > 1 ? 0 : w * 0.34 * (1 - s) * (0.7 + 0.6 * Math.sin(Math.PI * s * 0.9));
    };
    band(q0 + 6, q1 - 4, r => fw(r) + 0.014, r => w - pw(r) - 0.014, 60);
    // 外瓣里：一串月牙
    crescent(300, w, 22, 0.95);
    crescent(338, w, 16, 0.95);
    crescent(368, w, 10, 0.95);
    // 外瓣两边：锯齿缝
    for (let k = 0; k < 7; k++) {
      const rr = 262 + k * 18;
      slit(rr, w - 0.022, rr + 14, w - pw(rr + 14) * 0.8, 3.6);
    }
    circle(276, w, 5);
    // 火苗里一个小圆孔
    circle(296, 0, 6);
    circle(330, 0, 3.4);

    // ---------- ⑥ 外缘：花边 + 毛边锯齿 410–500 ----------
    circle(446, w, 6.5);
    // 每个如意头里挖一道弧形镂空，只留一圈纸边（像蕾丝）
    {
      const ob = t => { const u = Math.abs(t) / (2 * w); return 458 + 36 * Math.pow(Math.abs(Math.cos(Math.PI * u)), 0.6); };
      // 沿着如意头外轮廓的一道月牙形镂空：外边离轮廓 15px，两头收尖
      const h = 0.64 * w, pts = [], n = 40;
      for (let i = 0; i <= n; i++) { const t = -h + 2 * h * i / n, k = Math.sqrt(1 - Math.pow(t / h, 2)); pts.push([t, ob(t) - 15, ob(t) - 15 - 20 * k]); }
      holes.push(poly([...pts.map(q => P(q[1], q[0])), ...pts.slice().reverse().map(q => P(q[2], q[0]))]));
      circle(ob(0) - 52, 0, 4.5);
    }
    for (let k = 0; k < 4; k++) {
      const t = (k + 0.5) * w / 4;
      holes.push(poly([P(428, t - w / 11), P(428, t + w / 11), P(417, t)]));
    }

    // 外轮廓
    const outer = [];
    const M = 960;
    for (let i = 0; i <= M; i++) {
      const t = i / M * Math.PI * 2;
      const u = ((t % (2 * w)) + 2 * w) % (2 * w) / (2 * w);         // 0..1 一个瓣
      const bump = Math.pow(Math.abs(Math.cos(Math.PI * u)), 0.6);   // 如意头
      const teeth = Math.abs(((t / (2 * w)) * 22) % 1 - 0.5);       // 毛边小锯齿
      outer.push(P(458 + 36 * bump + 7 * teeth, t));
    }

    // 复制：镜像 + 旋转
    const half = holes.join('');
    let uses = '';
    for (let k = 0; k < N; k++) {
      const deg = k * 360 / N;
      uses += `<path d="${half}" transform="rotate(${deg})"/><path d="${half}" transform="rotate(${deg}) scale(-1,1)"/>`;
    }
    return {
      N, R,
      outline: poly(outer),
      holes: uses + `<path d="${once.join('')}"/>`
    };
  }

  // 生成完整 SVG
  // mode: 'paper'（红纸在宣纸上） / 'glow'（黑底金边，特效版） / 'mask'（纯黑白，给贴图用）
  function svg(opt = {}) {
    const g = make(opt), size = opt.size || 1100, mode = opt.mode || 'paper', id = 'm' + Math.random().toString(36).slice(2, 7);
    const vb = `-550 -550 1100 1100`;
    const mask = `<mask id="${id}"><path d="${g.outline}" fill="#fff"/><g fill="#000">${g.holes}</g></mask>`;
    if (mode === 'mask') return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${size}" height="${size}"><rect x="-550" y="-550" width="1100" height="1100" fill="#000"/><defs>${mask}</defs><rect x="-550" y="-550" width="1100" height="1100" fill="#fff" mask="url(#${id})"/></svg>`;
    if (mode === 'glow') return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${size}" height="${size}">
<defs>${mask}
<radialGradient id="${id}g" r="0.5"><stop offset="0" stop-color="#ff5a2a"/><stop offset="0.6" stop-color="#d81f1f"/><stop offset="1" stop-color="#9c0d14"/></radialGradient>
<filter id="${id}e" x="-20%" y="-20%" width="140%" height="140%">
  <feMorphology in="SourceAlpha" operator="dilate" radius="2.2" result="d"/><feComposite in="d" in2="SourceAlpha" operator="out" result="edge"/>
  <feFlood flood-color="#ffd27a"/><feComposite in2="edge" operator="in" result="gold"/>
  <feGaussianBlur in="gold" stdDeviation="7" result="b1"/><feGaussianBlur in="gold" stdDeviation="22" result="b2"/>
  <feMerge><feMergeNode in="b2"/><feMergeNode in="b1"/><feMergeNode in="SourceGraphic"/><feMergeNode in="gold"/></feMerge>
</filter></defs>
<rect x="-550" y="-550" width="1100" height="1100" fill="#07060a"/>
<g filter="url(#${id}e)"><rect x="-550" y="-550" width="1100" height="1100" fill="url(#${id}g)" mask="url(#${id})"/></g></svg>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${size}" height="${size}">
<defs>${mask}
<filter id="${id}p"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.10 0"/><feComposite in2="SourceGraphic" operator="in"/><feBlend in2="SourceGraphic" mode="multiply"/></filter>
<filter id="${id}s" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="6" dy="9" stdDeviation="7" flood-color="#5a2a10" flood-opacity="0.35"/></filter>
</defs>
<rect x="-550" y="-550" width="1100" height="1100" fill="#efe6d4"/>
<g filter="url(#${id}s)"><rect x="-550" y="-550" width="1100" height="1100" fill="#c8141c" mask="url(#${id})" filter="url(#${id}p)"/></g></svg>`;
  }

  root.Tuanhua = { make, svg };
})(typeof window !== 'undefined' ? window : globalThis);

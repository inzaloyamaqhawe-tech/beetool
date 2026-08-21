/* ==========================================================================
   Centenary Networks — B-BBEE Scorecard Tool
   charts.js — dependency-free inline SVG chart helpers
   ========================================================================== */

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
  return el;
}

/**
 * Grouped bar chart comparing "actual" vs "max" per category.
 * categories: [{label, actual, max}]
 */
function renderGroupedBarChart(container, categories, opts) {
  opts = opts || {};
  const w = opts.width || 640, h = opts.height || 240;
  const padL = 36, padB = 28, padT = 12, padR = 12;
  const chartW = w - padL - padR, chartH = h - padT - padB;
  const maxVal = Math.max(1, ...categories.map(function (c) { return Math.max(c.actual, c.max); })) * 1.08;

  const svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, class: 'chart-svg', role: 'img' });

  // gridlines + y labels
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const v = (maxVal / steps) * i;
    const y = padT + chartH - (v / maxVal) * chartH;
    svg.appendChild(svgEl('line', { x1: padL, x2: w - padR, y1: y, y2: y, class: 'chart-grid' }));
    const t = svgEl('text', { x: padL - 6, y: y + 4, class: 'chart-axis-label', 'text-anchor': 'end' });
    t.textContent = Math.round(v);
    svg.appendChild(t);
  }

  const groupW = chartW / categories.length;
  const barW = Math.min(28, groupW * 0.28);

  categories.forEach(function (c, i) {
    const gx = padL + i * groupW + groupW / 2;
    const aH = (c.actual / maxVal) * chartH;
    const mH = (c.max / maxVal) * chartH;

    svg.appendChild(svgEl('rect', {
      x: gx - barW - 3, y: padT + chartH - aH, width: barW, height: Math.max(0, aH),
      class: 'chart-bar-actual', rx: 2
    }));
    svg.appendChild(svgEl('rect', {
      x: gx + 3, y: padT + chartH - mH, width: barW, height: Math.max(0, mH),
      class: 'chart-bar-max', rx: 2
    }));

    const label = svgEl('text', { x: gx, y: h - 6, class: 'chart-axis-label', 'text-anchor': 'middle' });
    label.textContent = c.label;
    svg.appendChild(label);
  });

  svg.appendChild(svgEl('line', { x1: padL, x2: w - padR, y1: padT + chartH, y2: padT + chartH, class: 'chart-axis' }));

  container.innerHTML = '';
  container.appendChild(svg);
}

/**
 * Horizontal progress/level bar: filled portion vs remainder, with a label.
 */
function renderLevelBar(container, actual, target) {
  const pct = target > 0 ? Math.max(0, Math.min(100, (actual / target) * 100)) : 0;
  // Light violet reads as progress; red is reserved for genuinely low
  // completion (<50%) — see the .level-bar-fill/.is-low comment in
  // css/styles.css for why this bar no longer used the section's red accent
  // unconditionally.
  const fillClass = 'level-bar-fill' + (pct < 50 ? ' is-low' : '');
  container.innerHTML =
    '<div class="level-bar">' +
      '<div class="' + fillClass + '" style="width:' + pct.toFixed(2) + '%">' +
        '<span>' + actual.toFixed(2) + '</span>' +
      '</div>' +
      '<div class="level-bar-rest"><span>' + Math.max(0, target - actual).toFixed(2) + '</span></div>' +
    '</div>';
}

/**
 * Simple horizontal gap-margin strip used in score inspector rows.
 */
function renderGapMargin(actualPct, targetPct) {
  const clampPct = Math.max(0, Math.min(150, targetPct ? (actualPct / targetPct) * 100 : 0));
  const pos = Math.max(2, Math.min(98, clampPct));
  return '<div class="gap-margin"><div class="gap-margin-track"></div><div class="gap-margin-dot" style="left:' + pos + '%"></div></div>';
}

// chart.ts - DOM/CSS/SVG 图表渲染工具函数
import { setIcon } from "obsidian";

/** 渲染数字统计卡片 */
export function renderStatCard(
  container: HTMLElement,
  label: string,
  value: string,
  icon: string,
  color: string
): void {
  const card = container.createDiv({ cls: "todo-review-stat-card" });
  const iconEl = card.createDiv({ cls: "todo-review-stat-icon" });
  setIcon(iconEl, icon);
  iconEl.style.color = color;
  const valueEl = card.createDiv({ cls: "todo-review-stat-value", text: value });
  valueEl.style.color = color;
  card.createDiv({ cls: "todo-review-stat-label", text: label });
}

/** 渲染纯 CSS 纵向柱状图 */
export function renderBarChart(
  container: HTMLElement,
  data: { label: string; value: number; color: string }[]
): void {
  const chart = container.createDiv({ cls: "todo-review-bar-chart" });
  const maxVal = Math.max(...data.map(d => d.value), 1);
  for (const item of data) {
    const barItem = chart.createDiv({ cls: "todo-review-bar-item" });
    const barWrap = barItem.createDiv({ cls: "todo-review-bar-wrap" });
    const fill = barWrap.createDiv({ cls: "todo-review-bar-fill" });
    fill.style.height = (item.value / maxVal * 100) + "%";
    fill.style.backgroundColor = item.color;
    barItem.createDiv({ cls: "todo-review-bar-label", text: item.label });
    barItem.createDiv({ cls: "todo-review-bar-value-label", text: String(item.value) });
  }
}

/** 渲染 SVG 折线图 */
export function renderLineChart(
  container: HTMLElement,
  data: { label: string; value: number }[],
  options?: { height?: number; color?: string }
): void {
  const height = options?.height ?? 140;
  const color = options?.color ?? "#4A90D9";
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const width = Math.max(data.length * 48, 200);
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(...data.map(d => d.value), 1);

  const svg = container.createSvg("svg", { cls: "todo-review-line-chart" });
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", "0 0 " + width + " " + height);

  // 计算点坐标
  const points: { x: number; y: number }[] = data.map((d, i) => ({
    x: padding.left + (data.length > 1 ? (i / (data.length - 1)) * chartW : chartW / 2),
    y: padding.top + chartH - (d.value / maxVal) * chartH,
  }));

  // 网格线
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (i / 4) * chartH;
    const line = svg.createSvg("line");
    line.setAttribute("x1", String(padding.left));
    line.setAttribute("y1", String(y));
    line.setAttribute("x2", String(width - padding.right));
    line.setAttribute("y2", String(y));
    line.setAttribute("stroke", "var(--background-modifier-border)");
    line.setAttribute("stroke-width", "1");
    line.setAttribute("stroke-dasharray", "4,4");
  }

  // 折线
  if (points.length > 1) {
    const polyline = svg.createSvg("polyline");
    polyline.setAttribute("points", points.map(p => p.x + "," + p.y).join(" "));
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", color);
    polyline.setAttribute("stroke-width", "2");
    polyline.setAttribute("stroke-linejoin", "round");
  }

  // 数据点
  for (const p of points) {
    const circle = svg.createSvg("circle");
    circle.setAttribute("cx", String(p.x));
    circle.setAttribute("cy", String(p.y));
    circle.setAttribute("r", "4");
    circle.setAttribute("fill", color);
    circle.setAttribute("stroke", "var(--background-primary)");
    circle.setAttribute("stroke-width", "2");
  }

  // X 轴标签
  for (let i = 0; i < data.length; i++) {
    const text = svg.createSvg("text");
    text.setAttribute("x", String(points[i].x));
    text.setAttribute("y", String(height - 6));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("fill", "var(--text-muted)");
    text.setAttribute("font-size", "11");
    text.textContent = data[i].label;
  }

  // Y 轴标签
  for (let i = 0; i <= 4; i++) {
    const val = Math.round(maxVal * (4 - i) / 4);
    const y = padding.top + (i / 4) * chartH;
    const text = svg.createSvg("text");
    text.setAttribute("x", String(padding.left - 6));
    text.setAttribute("y", String(y + 4));
    text.setAttribute("text-anchor", "end");
    text.setAttribute("fill", "var(--text-muted)");
    text.setAttribute("font-size", "10");
    text.textContent = String(val);
  }
}

/** 渲染 SVG 环形饼图（donut） */
export function renderPieChart(
  container: HTMLElement,
  data: { label: string; value: number; color: string }[]
): void {
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 60;
  const strokeWidth = 24;
  const total = data.reduce((s, d) => s + d.value, 0);

  const wrap = container.createDiv({ cls: "todo-review-pie-wrap" });
  const svg = wrap.createSvg("svg", { cls: "todo-review-pie-chart" });
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 " + size + " " + size);

  if (total === 0) {
    const circle = svg.createSvg("circle");
    circle.setAttribute("cx", String(cx));
    circle.setAttribute("cy", String(cy));
    circle.setAttribute("r", String(radius));
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", "var(--background-modifier-border)");
    circle.setAttribute("stroke-width", String(strokeWidth));
    return;
  }

  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  for (const item of data) {
    const ratio = item.value / total;
    const dashLen = ratio * circumference;
    const circle = svg.createSvg("circle");
    circle.setAttribute("cx", String(cx));
    circle.setAttribute("cy", String(cy));
    circle.setAttribute("r", String(radius));
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", item.color);
    circle.setAttribute("stroke-width", String(strokeWidth));
    circle.setAttribute("stroke-dasharray", dashLen + " " + (circumference - dashLen));
    circle.setAttribute("stroke-dashoffset", String(-offset));
    circle.setAttribute("transform", "rotate(-90 " + cx + " " + cy + ")");
    offset += dashLen;
  }

  // 图例
  const legend = wrap.createDiv({ cls: "todo-review-pie-legend" });
  for (const item of data) {
    const row = legend.createDiv({ cls: "todo-review-pie-legend-item" });
    const dot = row.createSpan({ cls: "todo-review-pie-legend-dot" });
    dot.style.backgroundColor = item.color;
    const pct = total > 0 ? Math.round(item.value / total * 100) : 0;
    row.createSpan({ text: item.label + " " + item.value + " (" + pct + "%)" });
  }
}

/** 渲染 SVG 进度环 */
export function renderProgressRing(
  container: HTMLElement,
  rate: number,
  size?: number,
  color?: string
): void {
  const s = size ?? 80;
  const c = color ?? "#4A90D9";
  const cx = s / 2;
  const cy = s / 2;
  const r = (s - 12) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, rate));

  const svg = container.createSvg("svg", { cls: "todo-review-progress-ring" });
  svg.setAttribute("width", String(s));
  svg.setAttribute("height", String(s));
  svg.setAttribute("viewBox", "0 0 " + s + " " + s);

  // 背景环
  const bg = svg.createSvg("circle");
  bg.setAttribute("cx", String(cx));
  bg.setAttribute("cy", String(cy));
  bg.setAttribute("r", String(r));
  bg.setAttribute("fill", "none");
  bg.setAttribute("stroke", "var(--background-modifier-border)");
  bg.setAttribute("stroke-width", "6");

  // 进度环
  const fg = svg.createSvg("circle");
  fg.setAttribute("cx", String(cx));
  fg.setAttribute("cy", String(cy));
  fg.setAttribute("r", String(r));
  fg.setAttribute("fill", "none");
  fg.setAttribute("stroke", c);
  fg.setAttribute("stroke-width", "6");
  fg.setAttribute("stroke-linecap", "round");
  fg.setAttribute("stroke-dasharray", String(circumference));
  fg.setAttribute("stroke-dashoffset", String(circumference * (1 - clamped)));
  fg.setAttribute("transform", "rotate(-90 " + cx + " " + cy + ")");

  // 百分比文字
  const text = svg.createSvg("text");
  text.setAttribute("x", String(cx));
  text.setAttribute("y", String(cy + 4));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("fill", "var(--text-normal)");
  text.setAttribute("font-size", "14");
  text.setAttribute("font-weight", "600");
  text.textContent = Math.round(clamped * 100) + "%";
}

/** 渲染 CSS 网格热力图 */
export function renderHeatmap(
  container: HTMLElement,
  data: { date: string; count: number }[],
  rows: number,
  cols: number
): void {
  const grid = container.createDiv({ cls: "todo-review-heatmap" });
  grid.style.gridTemplateColumns = "repeat(" + cols + ", 1fr)";
  grid.style.gridTemplateRows = "repeat(" + rows + ", 1fr)";
  const maxCount = Math.max(...data.map(d => d.count), 1);

  for (let i = 0; i < rows * cols; i++) {
    const cell = grid.createDiv({ cls: "todo-review-heatmap-cell" });
    if (i < data.length) {
      const intensity = data[i].count / maxCount;
      if (intensity > 0) {
        cell.style.backgroundColor = "rgba(74, 144, 217, " + (0.15 + intensity * 0.85).toFixed(2) + ")";
      }
      cell.title = data[i].date + ": " + data[i].count;
    }
  }
}

/** 渲染横向柱状图 */
export function renderHorizontalBar(
  container: HTMLElement,
  data: { label: string; value: number; color: string }[]
): void {
  const chart = container.createDiv({ cls: "todo-review-hbar-chart" });
  const maxVal = Math.max(...data.map(d => d.value), 1);

  for (const item of data) {
    const row = chart.createDiv({ cls: "todo-review-hbar-row" });
    row.createDiv({ cls: "todo-review-hbar-label", text: item.label });
    const barWrap = row.createDiv({ cls: "todo-review-hbar-bar-wrap" });
    const fill = barWrap.createDiv({ cls: "todo-review-hbar-bar-fill" });
    fill.style.width = (item.value / maxVal * 100) + "%";
    fill.style.backgroundColor = item.color;
    row.createDiv({ cls: "todo-review-hbar-value", text: String(item.value) });
  }
}
/** 渲染分布完成度横向条形图（每行：标签+完成/未完成堆叠条+百分比） */
export function renderDistributionBar(
  container: HTMLElement,
  data: { label: string; total: number; completed: number; color: string }[]
): void {
  const chart = container.createDiv({ cls: "todo-review-dist-chart" });
  const maxTotal = Math.max(...data.map(d => d.total), 1);

  for (const item of data) {
    const row = chart.createDiv({ cls: "todo-review-dist-row" });
    row.createDiv({ cls: "todo-review-dist-label", text: item.label });
    const barWrap = row.createDiv({ cls: "todo-review-dist-bar-wrap" });
    if (item.completed > 0) {
      const doneFill = barWrap.createDiv({ cls: "todo-review-dist-bar-done" });
      doneFill.style.width = (item.completed / maxTotal * 100) + "%";
      doneFill.style.backgroundColor = item.color;
    }
    const remain = item.total - item.completed;
    if (remain > 0) {
      const todoFill = barWrap.createDiv({ cls: "todo-review-dist-bar-todo" });
      todoFill.style.width = (remain / maxTotal * 100) + "%";
    }
    const pct = item.total > 0 ? Math.round(item.completed / item.total * 100) : 0;
    row.createDiv({ cls: "todo-review-dist-count", text: item.completed + "/" + item.total });
    row.createDiv({ cls: "todo-review-dist-pct", text: pct + "%" });
  }
}
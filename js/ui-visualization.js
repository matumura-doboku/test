import {
  vizSelect,
  vizSecondarySelect,
  legendTitle,
  legendBar,
  vizFilterMode,
  filterPrimaryWrap,
  filterSecondaryWrap,
  filterPrimaryType,
  filterPrimaryMin,
  filterPrimaryMax,
  filterSecondaryType,
  filterSecondaryMin,
  filterSecondaryMax,
  vizFillOpacityInput,
  vizColorIntervalInput,
  vizFillEmptyBlack,
  vizCircleScaleInput,
  summaryShowConditions,
  vizConditionBox,
  vizConditionBody,
  vizCountPrimary,
  vizCountSecondary,
  vizYearRadios,
} from './dom.js';
import { state, vizThemes } from './state.js';

const needsTraffic = (value) => value === 'traffic' || value === 'score';

function getVisualProp(metric) {
  if (metric === 'none') return 'none';
  if (metric === 'population') return 'population_norm';
  if (metric === 'labor') return 'labor_norm';
  if (metric === 'floor') return 'floor_norm';
  if (metric === 'road_area_total') return 'road_area_total_norm';
  if (metric === 'road_area_nat') return 'road_area_nat_norm';
  if (metric === 'road_area_pref') return 'road_area_pref_norm';
  if (metric === 'road_area_muni') return 'road_area_muni_norm';
  if (metric === 'road_area_other') return 'road_area_other_norm';
  if (metric === 'ratio_0_14') return 'ratio_0_14';
  if (metric === 'ratio_15_64') return 'ratio_15_64';
  if (metric === 'ratio_65_over') return 'ratio_65_over';
  if (metric === 'score') return 'score_norm';
  return 'traffic_norm';
}

function getFilterProp(metric) {
  if (metric === 'none') return 'none';
  if (metric === 'population') return 'population_value';
  if (metric === 'labor') return 'labor_value';
  if (metric === 'floor') return 'floor_value';
  if (metric === 'road_area_total') return 'road_area_total';
  if (metric === 'road_area_nat') return 'road_area_nat';
  if (metric === 'road_area_pref') return 'road_area_pref';
  if (metric === 'road_area_muni') return 'road_area_muni';
  if (metric === 'road_area_other') return 'road_area_other';
  if (metric === 'ratio_0_14') return 'ratio_0_14';
  if (metric === 'ratio_15_64') return 'ratio_15_64';
  if (metric === 'ratio_65_over') return 'ratio_65_over';
  if (metric === 'score') return 'score_norm';
  return 'traffic_value';
}

function toNumber(value, fallback) {
  if (value == null || value == '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, value));
}

function normalizeRangeInputs(minInput, maxInput, isPercent) {
  if (!minInput || !maxInput) return;
  const min = toNumber(minInput.value, null);
  const max = toNumber(maxInput.value, null);
  if (min == null && max == null) return;
  let nextMin = min == null ? null : min;
  let nextMax = max == null ? null : max;
  if (isPercent) {
    if (nextMin != null) nextMin = clampPercent(nextMin);
    if (nextMax != null) nextMax = clampPercent(nextMax);
  }
  if (nextMin != null && nextMax != null && nextMin > nextMax) {
    const temp = nextMin;
    nextMin = nextMax;
    nextMax = temp;
  }
  if (nextMin != null) minInput.value = String(nextMin);
  if (nextMax != null) maxInput.value = String(nextMax);
}

function getMetricValues(prop) {
  if (!state.gridData || !state.gridData.features) return [];
  return state.gridData.features
    .map((feature) => Number(feature.properties?.[prop]))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function percentileValue(sortedValues, percentile) {
  if (!sortedValues.length) return null;
  const clamped = Math.min(100, Math.max(0, percentile));
  const index = Math.max(
    0,
    Math.min(sortedValues.length - 1, Math.floor((clamped / 100) * (sortedValues.length - 1)))
  );
  return sortedValues[index];
}

function getTopRangeThresholds(prop, range) {
  if (!range || (range.min == null && range.max == null)) return null;
  const values = getMetricValues(prop);
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const start = range.min ?? 0;
  const end = range.max ?? 100;
  const lowerPercentile = 100 - end;
  const upperPercentile = 100 - start;
  const minValue = percentileValue(sorted, lowerPercentile);
  const maxValue = percentileValue(sorted, upperPercentile);
  if (minValue == null || maxValue == null) return null;
  return { min: minValue, max: maxValue };
}

function buildPercentRangeExpr(prop, range) {
  const threshold = getTopRangeThresholds(prop, range);
  if (!threshold) return null;
  const valueExpr = ['coalesce', ['get', prop], 0];
  return ['all', ['>=', valueExpr, threshold.min], ['<=', valueExpr, threshold.max]];
}

function buildValueRangeExpr(prop, range) {
  if (!range || (range.min == null && range.max == null)) return null;
  const valueExpr = ['coalesce', ['get', prop], 0];
  if (range.min != null && range.max != null) {
    return ['all', ['>=', valueExpr, range.min], ['<=', valueExpr, range.max]];
  }
  if (range.min != null) return ['>=', valueExpr, range.min];
  return ['<=', valueExpr, range.max];
}

function readFilter(typeSelect, minInput, maxInput) {
  if (!typeSelect) return null;
  const type = typeSelect.value === 'value' ? 'value' : 'percent';
  const min = toNumber(minInput?.value, null);
  const max = toNumber(maxInput?.value, null);
  if (min == null && max == null) return null;
  return { type, min, max };
}

function resolveFilterSpecs(mode) {
  const primary = readFilter(filterPrimaryType, filterPrimaryMin, filterPrimaryMax);
  const secondary = readFilter(filterSecondaryType, filterSecondaryMin, filterSecondaryMax);
  if (mode === 'primary-only') {
    return { primary, secondary: primary };
  }
  if (mode === 'separate') {
    return { primary, secondary };
  }
  return { primary: null, secondary: null };
}

function buildFilterExpr(prop, filter) {
  if (!filter) return null;
  if (filter.type === 'value') {
    return buildValueRangeExpr(prop, filter);
  }
  return buildPercentRangeExpr(prop, filter);
}

function getFilterBounds(prop, filter) {
  if (!filter) return null;
  if (filter.type === 'value') {
    if (filter.min == null && filter.max == null) return null;
    return { min: filter.min, max: filter.max };
  }
  return getTopRangeThresholds(prop, filter);
}

function combineFilters(...filters) {
  const active = filters.filter(Boolean);
  if (!active.length) return null;
  if (active.length === 1) return active[0];
  return ['all', ...active];
}

function toggleFilterSection(section, show) {
  if (!section) return;
  section.classList.toggle('is-hidden', !show);
  section.querySelectorAll('select, input').forEach((el) => {
    el.disabled = !show;
  });
}

function updateFilterVisibility() {
  const mode = vizFilterMode?.value || 'none';
  toggleFilterSection(filterPrimaryWrap, mode !== 'none');
  toggleFilterSection(filterSecondaryWrap, mode === 'separate');
}

function formatRange(filter, label) {
  if (!filter || (filter.min == null && filter.max == null)) return null;
  const min = filter.min;
  const max = filter.max;
  if (filter.type === 'percent') {
    if (min != null && max != null) return `${label}上位${min}%-${max}%`;
    if (min != null) return `${label}上位${min}%以上`;
    return `${label}上位${max}%以下`;
  }
  if (min != null && max != null) return `${label}${min}〜${max}`;
  if (min != null) return `${label}${min}以上`;
  return `${label}${max}以下`;
}

function setConditionLines(lines) {
  if (!vizConditionBody) return;
  vizConditionBody.innerHTML = lines
    .map((line) => {
      const label = line.label ? `<span class="map-condition-label">${line.label}</span>` : '';
      return `<div class="map-condition-line">${label}<span>${line.text}</span></div>`;
    })
    .join('');
}

function countMatchingCells(prop, filterSpec, { requirePositive }) {
  if (!state.gridData || !state.gridData.features) return null;
  const features = state.gridData.features || [];
  if (!filterSpec) {
    return features.filter((feature) => {
      const value = Number(feature.properties?.[prop]);
      if (!Number.isFinite(value)) return false;
      if (requirePositive && value <= 0) return false;
      return value > 0 || !requirePositive;
    }).length;
  }

  if (filterSpec.type === 'percent') {
    const thresholds = getTopRangeThresholds(prop, filterSpec);
    if (!thresholds) return 0;
    return features.filter((feature) => {
      const value = Number(feature.properties?.[prop]);
      if (!Number.isFinite(value)) return false;
      if (requirePositive && value <= 0) return false;
      if (value < thresholds.min) return false;
      if (value > thresholds.max) return false;
      return true;
    }).length;
  }

  const min = filterSpec.min;
  const max = filterSpec.max;
  if (min == null && max == null) return 0;
  return features.filter((feature) => {
    const value = Number(feature.properties?.[prop]);
    if (!Number.isFinite(value)) return false;
    if (requirePositive && value <= 0) return false;
    if (min != null && value < min) return false;
    if (max != null && value > max) return false;
    return true;
  }).length;
}

function updateTargetCounts({
  mode,
  secondaryMode,
  primaryProp,
  secondaryProp,
  primaryFilterSpec,
  secondaryFilterSpec,
}) {
  if (!vizCountPrimary || !vizCountSecondary) return;
  const primaryCount = mode === 'none' ? 0 : countMatchingCells(primaryProp, primaryFilterSpec, { requirePositive: !primaryFilterSpec });
  const secondaryCount = secondaryMode === 'none' ? 0 : countMatchingCells(secondaryProp, secondaryFilterSpec, { requirePositive: true });
  vizCountPrimary.textContent = primaryCount == null ? '-' : primaryCount.toLocaleString();
  vizCountSecondary.textContent = secondaryCount == null ? '-' : secondaryCount.toLocaleString();
}

export function updateConditionSummary() {
  if (!vizConditionBox || !summaryShowConditions) return;
  const fixedRadio = document.getElementById('summary-mode-fixed');
  const show = summaryShowConditions.checked && Boolean(fixedRadio?.checked);
  vizConditionBox.classList.toggle('is-hidden', !show);
  if (!show) return;

  const primaryLabel = vizThemes[vizSelect.value]?.label || vizSelect.value;
  const secondaryLabel = vizThemes[vizSecondarySelect?.value]?.label || vizSecondarySelect?.value || primaryLabel;

  const filterMode = vizFilterMode?.value || 'none';
  const { primary: primaryFilterSpec, secondary: secondaryFilterSpec } = resolveFilterSpecs(filterMode);

  const selectedYear = Array.from(vizYearRadios).find(r => r.checked)?.value || '2020';
  const displayLine = {
    label: '',
    text: `年 ${selectedYear}　表示1 ${primaryLabel}　表示2 ${secondaryLabel}`,
  };

  if (filterMode === 'none' || (!primaryFilterSpec && !secondaryFilterSpec)) {
    setConditionLines([displayLine, { label: '条件', text: 'なし' }]);
    return;
  }

  if (filterMode === 'primary-only') {
    const rangeText = formatRange(primaryFilterSpec, primaryLabel);
    const text = rangeText
      ? `${rangeText}のセルの${primaryLabel}と、${secondaryLabel}を表示`
      : 'なし';
    setConditionLines([displayLine, { label: '条件', text }]);
    return;
  }

  const condition1 = formatRange(primaryFilterSpec, primaryLabel);
  const condition2 = formatRange(secondaryFilterSpec, secondaryLabel);
  setConditionLines([
    displayLine,
    { label: '条件1', text: condition1 ? `${condition1}のセルを表示` : 'なし' },
    { label: '条件2', text: condition2 ? `${condition2}のセルを表示` : 'なし' },
  ]);
}

export function applyGridVisualization() {
  if (!state.map || !state.mapReady || !state.map.getLayer('grid-fill')) return;
  const mode = vizSelect.value;
  const secondaryMode = vizSecondarySelect ? vizSecondarySelect.value : mode;
  const fillOpacity = toNumber(vizFillOpacityInput?.value, 0.45);
  const colorInterval = toNumber(vizColorIntervalInput?.value, 100);
  const fillEmptyBlack = Boolean(vizFillEmptyBlack?.checked);
  const circleScale = toNumber(vizCircleScaleInput?.value, 1);

  const primaryProp = getVisualProp(mode);
  const secondaryProp = getVisualProp(secondaryMode);
  const primaryFilterProp = getFilterProp(mode);
  const secondaryFilterProp = getFilterProp(secondaryMode);

  const filterMode = vizFilterMode?.value || 'none';
  const { primary: primaryFilterSpec, secondary: secondaryFilterSpec } = resolveFilterSpecs(filterMode);

  const metricsToCheck = new Set([mode, secondaryMode]);
  if (!state.gridTrafficLoaded && Array.from(metricsToCheck).some(needsTraffic)) {
    window.dispatchEvent(new Event('grid:traffic:ensure'));
  }

  const theme = vizThemes[mode] || vizThemes.traffic;
  const secondaryTheme = vizThemes[secondaryMode] || vizThemes.traffic;

  const sharedPrimaryFilterExpr = buildFilterExpr(primaryFilterProp, primaryFilterSpec);
  const primaryFilterExpr =
    filterMode === 'primary-only' ? sharedPrimaryFilterExpr : buildFilterExpr(primaryFilterProp, primaryFilterSpec);
  const secondaryFilterExpr =
    filterMode === 'primary-only' ? sharedPrimaryFilterExpr : buildFilterExpr(secondaryFilterProp, secondaryFilterSpec);

  const primaryValueExpr = ['coalesce', ['get', primaryProp], 0];
  const secondaryValueExpr = ['coalesce', ['get', secondaryProp], 0];

  const primaryFilter = mode === 'none' ? false : (combineFilters(primaryFilterExpr) || ['>', primaryValueExpr, 0]);

  const colorExpr = [
    'case',
    primaryFilter,
    [
      'interpolate',
      ['linear'],
      primaryValueExpr,
      0,
      theme.colors[0],
      colorInterval,
      theme.colors[1],
    ],
    fillEmptyBlack ? '#000' : 'transparent',
  ];

  state.map.setPaintProperty('grid-fill', 'fill-color', colorExpr);
  const opacityExpr = [
    'case',
    primaryFilter,
    fillOpacity,
    fillEmptyBlack ? 1 : 0,
  ];
  state.map.setPaintProperty('grid-fill', 'fill-opacity', opacityExpr);
  state.map.setPaintProperty('grid-line', 'line-color', '#000');

  if (state.map.getLayer('grid-circles')) {
    const secondaryFilter = secondaryMode === 'none' ? false : combineFilters(['>', secondaryValueExpr, 0], secondaryFilterExpr);
    const sizeExpr = [
      'case',
      secondaryFilter,
      [
        'interpolate',
        ['linear'],
        secondaryValueExpr,
        0,
        0,
        30,
        4 * circleScale,
        60,
        8 * circleScale,
        100,
        14 * circleScale,
      ],
      0,
    ];
    state.map.setPaintProperty('grid-circles', 'circle-radius', sizeExpr);
    state.map.setPaintProperty('grid-circles', 'circle-color', secondaryTheme.colors[1]);
    state.map.setPaintProperty('grid-circles', 'circle-opacity', ['case', secondaryFilter, 0.6, 0]);
  }

  updateTargetCounts({
    mode,
    secondaryMode,
    primaryProp: primaryFilterProp,
    secondaryProp: filterMode === 'primary-only' ? primaryFilterProp : secondaryFilterProp,
    primaryFilterSpec,
    secondaryFilterSpec,
  });
  updateConditionSummary();
}

export function getGridFilterPredicate() {
  const filterMode = vizFilterMode?.value || 'none';
  if (filterMode === 'none') {
    return { predicate: null, needsTraffic: false };
  }
  const mode = vizSelect.value;
  const filterProp = getFilterProp(mode);
  const { primary: primaryFilterSpec } = resolveFilterSpecs(filterMode);
  const bounds = getFilterBounds(filterProp, primaryFilterSpec);
  if (!bounds) {
    return { predicate: null, needsTraffic: false };
  }
  const predicate = (feature) => {
    const value = Number(feature.properties?.[filterProp]);
    if (!Number.isFinite(value)) return false;
    if (bounds.min != null && value < bounds.min) return false;
    if (bounds.max != null && value > bounds.max) return false;
    return true;
  };
  return { predicate, needsTraffic: needsTraffic(mode) };
}

function updateLegend() {
  const mode = vizSelect.value;
  const secondaryMode = vizSecondarySelect?.value || 'none';
  const theme = vizThemes[mode] || vizThemes.traffic;
  const secondaryTheme = vizThemes[secondaryMode] || theme;

  const primaryLabel = theme.label;
  const secondaryLabel = (secondaryMode !== 'none' && secondaryMode !== mode) ? ` / ${secondaryTheme.label}` : '';
  legendTitle.textContent = `色: ${primaryLabel}${secondaryLabel}`;
  legendBar.style.background = `linear-gradient(90deg, ${theme.colors[0]}, ${theme.colors[1]})`;
  applyGridVisualization();
}

function setupRangeInputs(typeSelect, minInput, maxInput) {
  if (!typeSelect || !minInput || !maxInput) return;
  const handler = () => {
    const isPercent = typeSelect.value !== 'value';
    normalizeRangeInputs(minInput, maxInput, isPercent);
    applyGridVisualization();
  };
  typeSelect.addEventListener('change', handler);
  minInput.addEventListener('change', handler);
  maxInput.addEventListener('change', handler);
}

export function initVisualization() {
  if (vizSecondarySelect) {
    vizSecondarySelect.value = vizSelect.value;
    vizSecondarySelect.addEventListener('change', updateLegend);
    vizSelect.addEventListener('change', () => {
      if (!vizSecondarySelect.value) {
        vizSecondarySelect.value = vizSelect.value;
      }
    });
  }

  setupRangeInputs(filterPrimaryType, filterPrimaryMin, filterPrimaryMax);
  setupRangeInputs(filterSecondaryType, filterSecondaryMin, filterSecondaryMax);

  if (vizFilterMode) {
    updateFilterVisibility();
    vizFilterMode.addEventListener('change', () => {
      updateFilterVisibility();
      applyGridVisualization();
    });
  }

  [vizFillOpacityInput, vizColorIntervalInput, vizCircleScaleInput].filter(Boolean).forEach((input) => {
    input.addEventListener('input', applyGridVisualization);
  });
  if (vizFillEmptyBlack) {
    vizFillEmptyBlack.addEventListener('change', applyGridVisualization);
  }
  if (summaryShowConditions) {
    summaryShowConditions.addEventListener('change', updateConditionSummary);
  }

  updateLegend();
  vizSelect.addEventListener('change', updateLegend);

  if (vizYearRadios) {
    vizYearRadios.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          const year = Number(e.target.value);
          window.dispatchEvent(new CustomEvent('viz:year:changed', { detail: { year } }));
        }
      });
    });
  }
}

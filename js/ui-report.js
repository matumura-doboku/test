import {
  reportExportBtn,
  reportTable,
  reportCount,
  reportAvg,
  reportSourceSelect,
  reportOrderSelect,
  reportMetricSelect,
  reportMetricSourceSelect,
  reportLimitInput,
  reportRunBtn,
  reportRangeStartBtn,
  reportRangeClearBtn,
  reportRangeVisibility,
  reportRangeStatus,
  vizSelect,
  vizSecondarySelect,
  reportModeSelect,
  reportModeSearch,
  reportModeAggregation,
  reportAggMetric,
  reportAggYearRadios,
  reportAggRunBtn,
  aggSum,
  aggAvgRange,
  aggAvgTotal,
  aggCount,
  aggMax,
  aggMin,
  cardAggMax,
  cardAggMin,
} from './dom.js';
import { state } from './state.js';
import {
  loadGrid,
  loadRoads,
  setTopGridIds,
  setTopRoadIds,
  focusGridById,
  startReportRangeSelection,
  clearReportRangeSelection,
  setReportRangeHighlightVisible,
} from './map.js';
import { computeGridMetrics, computeRoadMetrics, loadRoadsData } from './data.js';
import { getGridFilterPredicate } from './ui-visualization.js';

const metricLabels = {
  traffic: '交通量',
  population: '人口',
  labor: '労働者数',
  floor: '床面積',
  road_area_total: '合計道路面積',
  road_area_nat: '国道面積',
  road_area_pref: '県道面積',
  road_area_muni: '市道面積',
  road_area_other: 'その他面積',
  ratio_0_14: '年齢構成（0-15）',
  ratio_15_64: '年齢構成（15-65）',
  ratio_65_over: '年齢構成（65以上）',
  score: '必要度スコア',
};

function formatValue(metric, value) {
  if (metric.startsWith('ratio_')) {
    return `${Number(value || 0).toFixed(1)}%`;
  }
  if (metric === 'score') {
    return Number(value || 0).toFixed(1);
  }
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : '-';
}

function renderReport(rows, metric, { clickable = false } = {}) {
  const tbody = reportTable.querySelector('tbody');
  tbody.innerHTML = '';
  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.className = 'placeholder';
    tr.innerHTML = '<td colspan="4">データがありません。</td>';
    tbody.appendChild(tr);
    return;
  }

  let sumValue = 0;
  rows.forEach((row, index) => {
    sumValue += row.value || 0;
    const tr = document.createElement('tr');
    if (clickable) {
      tr.dataset.gridId = String(row.id || '');
      tr.classList.add('report-row');
      tr.title = 'クリックで該当セルへ移動';
    }
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${row.id}</td>
      <td>${formatValue(metric, row.value)}</td>
    `;
    tbody.appendChild(tr);
  });

  reportCount.textContent = rows.length;
  reportAvg.textContent = rows.length ? (sumValue / rows.length).toFixed(1) : '-';
}

function exportReportCSV() {
  if (state.lastReportMode === 'facility') {
    const results = state.facilityResultData;
    if (!results || !results.length) return;

    const codes = state.facilitySelectedCodes;
    const labels = state.facilitySelectedLabels;

    const header = ['順位', 'メッシュコード', ...codes.map(c => labels.get(c))];
    const csvRows = results.map((row, index) => {
      const vals = codes.map(c => row[c] || 0);
      return [index + 1, row.id, ...vals].join(',');
    });

    const csv = [header.join(','), ...csvRows].join('\n');
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `施設抽出結果_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }

  const dataset = state.reportResults || [];
  if (!dataset.length) return;

  // Get metadata for filename
  let year = 2020;
  const yearRadios = document.getElementsByName('stats-year');
  if (yearRadios.length > 0) {
    const selected = Array.from(yearRadios).find(r => r.checked);
    if (selected) year = selected.value;
  }

  const metricSource = reportMetricSourceSelect?.value || 'primary';
  const metricKeySelected = metricSource === 'secondary'
    ? (vizSecondarySelect?.value || vizSelect.value || 'traffic')
    : (vizSelect.value || 'traffic');
  const metricLabel = metricLabels[metricKeySelected] || metricKeySelected;

  const orderLabel = (reportOrderSelect?.value === 'asc') ? '下位' : '上位';
  const filename = `${year}_${metricLabel}_${orderLabel}.csv`;

  // Define column order: Rank, kye_code, then all defined metrics
  const allMetricKeys = Object.keys(metricLabels);

  // Header row
  const header = ['順位', 'kye_code', ...allMetricKeys.map(k => metricLabels[k])];

  const csvRows = dataset.map((row, index) => {
    const props = row.properties || {};

    // Map each metric key to its value from the properties object
    const metricValues = allMetricKeys.map(key => {
      const propKey = metricKey(key);
      const val = props[propKey];
      // Format value but remove commas for CSV safety
      // Use raw value if possible for CSV, but formatValue handles ratio nicely.
      // Let's stick to formatted but stripped of commas for standard format consistency
      return String(formatValue(key, val)).replace(/,/g, '');
    });

    return [index + 1, row.id, ...metricValues].join(',');
  });

  const csv = [header.join(','), ...csvRows].join('\n');
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function ensureGridData() {
  if (!state.gridData) {
    await loadGrid();
  }
  if (!state.gridMetricsLoaded && state.gridData) {
    let year = 2020;
    const radios = document.getElementsByName('stats-year');
    if (radios.length > 0) {
      const selected = Array.from(radios).find(r => r.checked);
      if (selected) year = Number(selected.value);
    }
    const { gridData, stats } = await computeGridMetrics(state.gridData, year);
    state.gridData = gridData;
    state.gridStats = stats;
    state.gridMetricsLoaded = true;
  }
}

async function ensureRoadMetrics() {
  if (state.roadsMetrics) return;
  let roadsData = state.roadsData;
  if (!roadsData) {
    roadsData = await loadRoadsData();
    state.roadsData = roadsData;
  }
  await ensureGridData();
  state.roadsMetrics = await computeRoadMetrics(roadsData, state.gridData);
}

function metricKey(metric) {
  if (metric === 'traffic') return 'traffic_value';
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

async function ensureGridTraffic() {
  if (state.gridTrafficLoaded) return;
  window.dispatchEvent(new Event('grid:traffic:ensure'));
  const start = Date.now();
  while (!state.gridTrafficLoaded && Date.now() - start < 8000) {
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
}

async function runReport() {
  const source = reportSourceSelect.value || 'grid';
  const metricSource = reportMetricSourceSelect?.value || 'primary';
  const metric = metricSource === 'secondary'
    ? (vizSecondarySelect?.value || vizSelect.value || 'traffic')
    : (vizSelect.value || 'traffic');
  const order = reportOrderSelect?.value === 'asc' ? 'asc' : 'desc';
  const limit = Math.max(1, Math.min(100, Number(reportLimitInput.value || 20)));
  reportLimitInput.value = String(limit);

  if (source === 'grid') {
    await ensureGridData();
    if (metric === 'traffic' || metric === 'score') {
      await ensureGridTraffic();
    }
    const { predicate, needsTraffic } = getGridFilterPredicate();
    if (needsTraffic) {
      await ensureGridTraffic();
    }
    const rangeIds = state.reportRange?.gridIds || [];
    const rangeSet = rangeIds.length ? new Set(rangeIds.map((id) => String(id))) : null;
    const key = metricKey(metric);

    const features = (state.gridData.features || []).filter((feature) => {
      const id = feature.properties?.KEY_CODE;
      // If range is selected, only cells within the range are considered.
      // We ignore the search predicate to ensure ALL cells in the range are included.
      if (rangeSet) {
        return id && rangeSet.has(String(id));
      }
      // If no range, apply the search predicate (if any).
      if (predicate && !predicate(feature)) return false;
      return true;
    });
    const allRows = features
      .map((feature) => {
        const props = feature.properties || {};
        return {
          id: props.KEY_CODE || '-',
          value: props[key] || 0,
          properties: props,
        };
      })
      .sort((a, b) => (order === 'asc' ? a.value - b.value : b.value - a.value));

    state.reportResults = allRows;
    const rows = allRows.slice(0, limit);

    renderReport(rows, metric, { clickable: true });
    setTopRoadIds([]);
    setTopGridIds(rows.map((row) => String(row.id)));
  } else {
    await loadRoads();
    await ensureRoadMetrics();
    const rangeIds = state.reportRange?.gridIds || [];
    const rangeSet = rangeIds.length ? new Set(rangeIds.map((id) => String(id))) : null;
    const key = metricKey(metric);

    const allRows = Array.from(state.roadsMetrics.values())
      .filter((entry) => {
        // If range is selected, only consider roads in that range (if applicable/already handled in gridIds)
        // Here we assume rangeSet check is preferred if active.
        if (rangeSet) {
          // Road entries often link to grid IDs or have their own IDs. 
          // Assuming we want everything from the loaded road set if it's been filtered by range during computeRoadMetrics
          return true;
        }
        return true;
      })
      .map((entry) => ({
        id: entry.id,
        value: entry[key] || 0,
        properties: entry,
      }))
      .sort((a, b) => (order === 'asc' ? a.value - b.value : b.value - a.value));

    state.reportResults = allRows;
    const rows = allRows.slice(0, limit);

    renderReport(rows, metric, { clickable: false });
    setTopGridIds([]);
    setTopRoadIds(rows.map((row) => String(row.id)));
  }
}

async function runAggregation() {
  const metric = reportAggMetric?.value || 'population';
  let year = 2020;
  if (reportAggYearRadios) {
    const selected = Array.from(reportAggYearRadios).find(r => r.checked);
    if (selected) year = Number(selected.value);
  }

  // Ensure data loaded
  await ensureGridData();
  const isTraffic = metric === 'traffic' || metric === 'score';
  if (isTraffic) {
    await ensureGridTraffic();
  }
  // For safety, re-compute if year changed
  const { gridData } = await computeGridMetrics(state.gridData, year);
  state.gridData = gridData; // Update state with fresh metrics for that year

  const rangeIds = state.reportRange?.gridIds || [];
  const rangeSet = rangeIds.length ? new Set(rangeIds.map((id) => String(id))) : null;

  // Key to read
  const key = metricKey(metric);
  const features = state.gridData.features || [];

  let rangeSum = 0;
  let rangeCountVal = 0;
  let totalSum = 0;
  let totalCountVal = 0;
  let rangeMaxVal = -Infinity;
  let rangeMinVal = Infinity;
  let rangeMaxId = null;
  let rangeMinId = null;

  features.forEach((feature) => {
    const val = Number(feature.properties?.[key] || 0);
    // Total stats
    if (Number.isFinite(val) && val !== 0) {
      totalSum += val;
      totalCountVal++;
    }

    // Range stats
    const id = feature.properties?.KEY_CODE;
    if (rangeSet && id && rangeSet.has(String(id))) {
      if (Number.isFinite(val) && val !== 0) {
        rangeSum += val;
        rangeCountVal++;
        if (val > rangeMaxVal) {
          rangeMaxVal = val;
          rangeMaxId = id;
        }
        if (val < rangeMinVal) {
          rangeMinVal = val;
          rangeMinId = id;
        }
      }
    }
  });

  const rangeAvg = rangeCountVal > 0 ? rangeSum / rangeCountVal : 0;
  const totalAvg = totalCountVal > 0 ? totalSum / totalCountVal : 0;

  if (aggSum) aggSum.textContent = formatValue(metric, rangeSum);
  if (aggAvgRange) aggAvgRange.textContent = formatValue(metric, rangeAvg);
  if (aggAvgTotal) aggAvgTotal.textContent = formatValue(metric, totalAvg);
  if (aggCount) aggCount.textContent = `${rangeCountVal} / ${totalCountVal}`;

  if (aggMax) {
    aggMax.textContent = rangeMaxId ? formatValue(metric, rangeMaxVal) : '-';
    if (cardAggMax) cardAggMax.dataset.targetId = rangeMaxId || '';
  }

  if (aggMin) {
    aggMin.textContent = rangeMinId ? formatValue(metric, rangeMinVal) : '-';
    if (cardAggMin) cardAggMin.dataset.targetId = rangeMinId || '';
  }

  // Store results for aggregation export as well
  state.aggResults = {
    metric,
    year,
    rangeSum,
    rangeAvg,
    totalAvg,
    rangeCountVal,
    totalCountVal,
    rangeMaxVal,
    rangeMaxId,
    rangeMinVal,
    rangeMinId
  };
}

function exportAggCSV() {
  if (!state.aggResults || !state.gridData) return;

  const year = state.aggResults.year;
  const filename = `${year}_範囲内集計結果_全指標.csv`;

  const rangeIds = state.reportRange?.gridIds || [];
  const rangeSet = rangeIds.length ? new Set(rangeIds.map((id) => String(id))) : new Set();

  // List of all metrics
  const metrics = Object.keys(metricLabels);

  // Initialize stats accumulator
  const stats = {};
  metrics.forEach(m => {
    stats[m] = {
      rangeSum: 0,
      rangeCount: 0,
      totalSum: 0,
      totalCount: 0,
      rangeMaxVal: -Infinity,
      rangeMaxId: null,
      rangeMinVal: Infinity,
      rangeMinId: null
    };
  });

  // Iterate over features to aggregate data
  const features = state.gridData.features || [];
  features.forEach((feature) => {
    const id = feature.properties?.KEY_CODE;
    const isInRange = id && rangeSet.has(String(id));

    metrics.forEach(m => {
      const key = metricKey(m);
      const val = Number(feature.properties?.[key] || 0);

      // Exclude 0 values from average/min/max calculation as per existing logic
      if (Number.isFinite(val) && val !== 0) {
        // Total Stats
        stats[m].totalSum += val;
        stats[m].totalCount += 1;

        // Range Stats
        if (isInRange) {
          stats[m].rangeSum += val;
          stats[m].rangeCount += 1;

          if (val > stats[m].rangeMaxVal) {
            stats[m].rangeMaxVal = val;
            stats[m].rangeMaxId = id;
          }
          if (val < stats[m].rangeMinVal) {
            stats[m].rangeMinVal = val;
            stats[m].rangeMinId = id;
          }
        }
      }
    });
  });

  const header = ['指標', '年度', '範囲合計', '範囲平均', '全体平均', '最大値', '最大値ID', '最小値', '最小値ID'];
  const csvRows = metrics.map(m => {
    const s = stats[m];
    const rangeAvg = s.rangeCount > 0 ? s.rangeSum / s.rangeCount : 0;
    const totalAvg = s.totalCount > 0 ? s.totalSum / s.totalCount : 0;

    const rangeMaxStr = s.rangeMaxId ? formatValue(m, s.rangeMaxVal).replace(/,/g, '') : '-';
    const rangeMinStr = s.rangeMinId ? formatValue(m, s.rangeMinVal).replace(/,/g, '') : '-';

    return [
      metricLabels[m],
      year,
      formatValue(m, s.rangeSum).replace(/,/g, ''),
      formatValue(m, rangeAvg).replace(/,/g, ''),
      formatValue(m, totalAvg).replace(/,/g, ''),
      rangeMaxStr,
      s.rangeMaxId || '-',
      rangeMinStr,
      s.rangeMinId || '-'
    ].join(',');
  });

  const csv = [header.join(','), ...csvRows].join('\n');
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function initReport() {
  if (vizSelect && reportMetricSelect) {
    reportMetricSelect.value = vizSelect.value;
    vizSelect.addEventListener('change', () => {
      reportMetricSelect.value = vizSelect.value;
    });
  }

  if (reportModeSelect) {
    reportModeSelect.addEventListener('change', () => {
      const mode = reportModeSelect.value;
      if (reportModeSearch) {
        reportModeSearch.classList.toggle('is-hidden', mode !== 'search');
      }
      if (reportModeAggregation) {
        reportModeAggregation.classList.toggle('is-hidden', mode !== 'aggregation');
      }
      if (reportModeFacility) {
        reportModeFacility.classList.toggle('is-hidden', mode !== 'facility');
      }
    });
  }

  if (reportRunBtn) {
    reportRunBtn.addEventListener('click', runReport);
  }

  if (reportAggRunBtn) {
    reportAggRunBtn.addEventListener('click', runAggregation);
  }

  const aggExportBtn = document.getElementById('report-agg-export');
  if (aggExportBtn) {
    aggExportBtn.addEventListener('click', exportAggCSV);
  }

  const setupNavCard = (card) => {
    if (!card) return;
    card.addEventListener('click', () => {
      const id = card.dataset.targetId;
      if (id) focusGridById(id);
    });
  };
  setupNavCard(cardAggMax);
  setupNavCard(cardAggMin);

  if (vizSelect && reportAggMetric) {
    reportAggMetric.value = vizSelect.value;
    vizSelect.addEventListener('change', () => {
      if (reportAggMetric) reportAggMetric.value = vizSelect.value;
    });
  }

  const setRangeStatus = (text) => {
    if (reportRangeStatus) reportRangeStatus.textContent = text;
  };

  if (reportRangeStartBtn) {
    reportRangeStartBtn.addEventListener('click', () => {
      setRangeStatus('範囲選択を開始しました（クリックで頂点、Enterで確定）');
      startReportRangeSelection();
    });
  }

  if (reportRangeClearBtn) {
    reportRangeClearBtn.addEventListener('click', () => {
      clearReportRangeSelection();
      setRangeStatus('範囲未選択');
    });
  }

  if (reportRangeVisibility) {
    reportRangeVisibility.checked = state.reportRangeVisible;
    reportRangeVisibility.addEventListener('change', () => {
      setReportRangeHighlightVisible(reportRangeVisibility.checked);
    });
  }

  if (reportExportBtn) {
    reportExportBtn.addEventListener('click', exportReportCSV);
  }

  window.addEventListener('report:range:updated', (event) => {
    const count = event?.detail?.count ?? 0;
    if (count > 0) {
      setRangeStatus(`選択セル: ${count}件`);
    } else if (state.reportRange?.active) {
      setRangeStatus('範囲選択を開始しました（クリックで頂点、Enterで確定）');
    } else {
      setRangeStatus('範囲未選択');
    }
  });

  if (reportTable) {
    reportTable.addEventListener('click', (event) => {
      const row = event.target.closest('tr');
      if (!row || row.classList.contains('placeholder')) return;
      const gridId = row.dataset.gridId;
      if (!gridId) return;
      focusGridById(gridId);
    });
  }

  // Facility Mode Init
  initFacilityMode();
}

import {
  reportModeFacility,
  reportFacilitySearch,
  reportFacilityList,
  reportFacilityCount,
  reportFacilityRunBtn
} from './dom.js';

let facilityMapping = []; // { code, label }
let facilityDataCache = null; // Raw CSV text or parsed structure

async function initFacilityMode() {
  if (!reportFacilityList) return;

  // Load Mapping
  try {
    const res = await fetch('data/statistical/tblT001164H34_mapping.csv');
    const text = await res.text();
    const uniqueLabels = new Map(); // Use Map to deduplicate by Label if necessary, or just store unique pairs
    // Parse Mapping: code,label,benrido
    // Skip header row 1 and 2 (line 1 is english header, line 2 is Japanese header usually, but check file)
    // Based on view_file: line 1: code,label... line 2: KEY_CODE, line 3+: Data
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    // Start from line 3 (index 2) based on observed file
    for (let i = 2; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 2) {
        const code = parts[0];
        let label = parts[1].trim();
        // Clean label (remove leading 　 or spaces)
        label = label.replace(/^[\s　]+/, '');
        if (code && label) {
          facilityMapping.push({ code, label });
        }
      }
    }
    renderFacilityList();
  } catch (e) {
    console.error('Failed to load facility mapping:', e);
    reportFacilityList.textContent = '施設定義データの読み込みに失敗しました。';
    alert('施設データの読み込みに失敗しました。ネットワーク接続を確認してください。');
  }

  // Search Listener
  if (reportFacilitySearch) {
    reportFacilitySearch.addEventListener('input', () => {
      renderFacilityList(reportFacilitySearch.value);
    });
  }

  // Run Listener
  if (reportFacilityRunBtn) {
    reportFacilityRunBtn.addEventListener('click', runFacilityExtraction);
  }
}

function renderFacilityList(filterText = '') {
  if (!reportFacilityList) return;

  // First time build?
  const isFirstBuild = reportFacilityList.children.length === 0 || reportFacilityList.children.length !== facilityMapping.length;

  if (isFirstBuild) {
    reportFacilityList.innerHTML = '';
    facilityMapping.forEach(item => {
      const div = document.createElement('div');
      div.className = 'facility-item';
      // By default hidden to prevent huge list scrolling
      div.style.display = 'none';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = item.code;
      checkbox.id = `fac-${item.code}`;

      const label = document.createElement('label');
      label.htmlFor = `fac-${item.code}`;
      label.textContent = item.label;
      label.style.cursor = 'pointer';
      label.style.flex = '1';

      div.appendChild(checkbox);
      div.appendChild(label);

      checkbox.addEventListener('change', () => {
        updateFacilityCount();
        // If we uncheck and there is no filter, hide it? 
        // Better UX: keep showing while user interacting, hide on next clear/render.
      });

      reportFacilityList.appendChild(div);
    });
  }

  const filter = filterText.toLowerCase();

  // Visibility Logic:
  // If filter is empty, show all items (limit 100 for perf)
  // If filter exists, show matches.

  let visibleCount = 0;
  const LIMIT = 100; // Performance limit for empty search

  Array.from(reportFacilityList.children).forEach(child => {
    if (!child.classList.contains('facility-item')) return;

    const checkbox = child.querySelector('input');
    const isChecked = checkbox.checked;
    const labelText = child.textContent || '';
    const code = checkbox.value;
    const matches = !filter || labelText.toLowerCase().includes(filter) || code.toLowerCase().includes(filter);

    let shouldShow = false;
    if (filter) {
      shouldShow = matches;
    } else {
      // Show if checked OR if within initial limit
      shouldShow = isChecked || (visibleCount < LIMIT);
    }

    child.style.display = shouldShow ? 'flex' : 'none';
    if (shouldShow) visibleCount++;
  });

  // Hints
  const hintId = 'facility-list-hint';
  let hint = document.getElementById(hintId);
  if (!hint) {
    hint = document.createElement('div');
    hint.id = hintId;
    hint.style.fontSize = '12px';
    hint.style.color = '#6b5f55';
    hint.style.padding = '4px 8px';
    reportFacilityList.prepend(hint);
  }

  if (visibleCount === 0) {
    hint.textContent = '該当する施設が見つかりません。';
    hint.style.display = 'block';
  } else if (!filter && visibleCount >= LIMIT) {
    hint.textContent = `全件表示中（先頭${LIMIT}件のみ表示。検索して絞り込んでください）`;
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }

  updateFacilityCount();
}

function updateFacilityCount() {
  if (!reportFacilityCount || !reportFacilityList) return;
  const checked = reportFacilityList.querySelectorAll('input[type="checkbox"]:checked').length;
  reportFacilityCount.textContent = checked;
}

async function runFacilityExtraction() {
  const rangeIds = state.reportRange?.gridIds || [];
  if (rangeIds.length === 0) {
    alert('範囲が選択されていません。地図上で範囲を選択してください。');
    return;
  }

  const selectedCheckboxes = Array.from(reportFacilityList.querySelectorAll('input[type="checkbox"]:checked'));
  if (selectedCheckboxes.length === 0) {
    alert('施設が選択されていません。リストから抽出したい施設を選んでください。');
    return;
  }

  const selectedCodes = selectedCheckboxes.map(cb => cb.value);
  const selectedLabels = new Map(); // code -> label
  facilityMapping.forEach(m => {
    if (selectedCodes.includes(m.code)) selectedLabels.set(m.code, m.label);
  });

  reportFacilityRunBtn.disabled = true;
  reportFacilityRunBtn.textContent = '抽出中...';

  try {
    // Load Data
    if (!facilityDataCache) {
      const res = await fetch('data/statistical/tblT001164H34.csv');
      facilityDataCache = await res.text();
    }

    // Parse Data
    // Format: KEY_CODE, Val1, Val2... (Columns match T001164001...)
    // We need to map column index to Code.
    // Line 1 contains codes.
    const lines = facilityDataCache.split('\n').map(l => l.trim()).filter(l => l);
    const headerCodes = lines[0].split(','); // [KEY_CODE, T001164001, ...]

    // Map Code to Column Index
    const codeToIndex = new Map();
    headerCodes.forEach((code, idx) => {
      codeToIndex.set(code, idx);
    });

    const rangeSet = new Set(rangeIds.map(id => String(id)));

    // Filter and Build Result
    const results = [];

    for (let i = 1; i < lines.length; i++) {
      const rowData = lines[i].split(',');
      const gridId = rowData[0];

      if (rangeSet.has(gridId)) {
        const rowObj = { id: gridId };
        selectedCodes.forEach(code => {
          const idx = codeToIndex.get(code);
          if (idx !== undefined) {
            rowObj[code] = rowData[idx] || 0;
          }
        });
        results.push(rowObj);
      }
    }

    if (results.length === 0) {
      alert('選択範囲内に該当データが見つかりませんでした。');
      renderReport([], 'facility');
    } else {
      // Render Table: MeshCode + Selected Cols
      const tbody = reportTable.querySelector('tbody');
      tbody.innerHTML = '';

      // Dynamically create header? The current table has fixed headers in HTML.
      // We need to update the table header for this mode.
      const thead = reportTable.querySelector('thead tr');

      // Save original header if needed? Or just rebuild.
      // Let's rebuild header for facility mode.
      thead.innerHTML = '<th>No.</th><th>メッシュ</th>';
      selectedCodes.forEach(code => {
        const th = document.createElement('th');
        th.textContent = selectedLabels.get(code) || code;
        thead.appendChild(th);
      });

      results.forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.dataset.gridId = row.id; // Enable click to jump
        tr.classList.add('report-row'); // clickable style

        let html = `<td>${index + 1}</td><td>${row.id}</td>`;
        selectedCodes.forEach(code => {
          const val = Number(row[code]);
          html += `<td>${val > 0 ? val : '-'}</td>`;
        });
        tr.innerHTML = html;
        tbody.appendChild(tr);
      });

      // Update stats
      if (reportCount) reportCount.textContent = results.length;
      if (reportAvg) reportAvg.textContent = '-'; // Not applicable to multi-col

      // Store for Export
      state.facilityResultData = results;
      state.facilitySelectedCodes = selectedCodes;
      state.facilitySelectedLabels = selectedLabels;
      state.lastReportMode = 'facility';
    }

  } catch (e) {
    console.error('Extraction failed:', e);
    alert('データの抽出に失敗しました。');
  } finally {
    reportFacilityRunBtn.disabled = false;
    reportFacilityRunBtn.innerHTML = '<span class="material-icons">filter_alt</span> 抽出実行';
  }
}

// Hook into Export
const originalExport = exportReportCSV;
// We override or modify existing logic. 
// Since strict mode might prevent reassigning const/import, we handle it inside exportReportCSV provided we can modify it.
// The previous tool usage replaces "exportReportCSV" implementation. 
// I will rewrite "exportReportCSV" to switch logical path.

/* REPLACING logic of exportReportCSV above */


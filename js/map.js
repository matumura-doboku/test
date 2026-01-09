import { state } from './state.js';
import { mapStatus, roadsStatus, vizYearRadios } from './dom.js';
import {
  loadGridData,
  loadRoadsData,
  computeGridMetrics,
  computeGridTraffic,
  applyTrafficToGrid,
} from './data.js';
import { applyGridVisualization } from './ui-visualization.js';
import { showPropertyPanel, hidePropertyPanel } from './ui-property.js';

export function initMap(initialView) {
  if (!window.maplibregl) {
    if (mapStatus) mapStatus.textContent = 'MapLibre 読み込み失敗';
    return;
  }

  const style = {
    version: 8,
    sources: {
      gsi: {
        type: 'raster',
        tiles: ['https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '国土地理院',
      },
    },
    layers: [{ id: 'gsi', type: 'raster', source: 'gsi' }],
  };

  const center = initialView && initialView.lng != null && initialView.lat != null
    ? [Number(initialView.lng), Number(initialView.lat)]
    : [132.4553, 34.3853];
  const zoom = initialView && initialView.zoom != null ? Number(initialView.zoom) : 12.5;

  const map = new maplibregl.Map({
    container: 'map',
    style,
    center: center,
    zoom: zoom,
    maxZoom: 18,
    preserveDrawingBuffer: true,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: true }));
  map.on('load', () => {
    state.mapReady = true;
    if (mapStatus) mapStatus.textContent = '表示中';
    if (state.roadsData) {
      addRoadLayer(state.roadsData);
    }
    loadGrid();
  });

  map.on('error', () => {
    if (mapStatus) mapStatus.textContent = '地図読み込みエラー';
  });

  state.map = map;
  window.addEventListener('grid:traffic:ensure', () => {
    ensureGridTraffic();
  });
}

window.addEventListener('viz:year:changed', (e) => {
  reloadGridMetrics(e.detail.year);
});

export function addRoadLayer(geojson) {
  if (!state.map || !state.mapReady) return;

  if (state.map.getSource('roads')) {
    state.map.getSource('roads').setData(geojson);
  } else {
    state.map.addSource('roads', { type: 'geojson', data: geojson });
    state.map.addLayer({
      id: 'roads-line',
      type: 'line',
      source: 'roads',
      paint: {
        'line-color': '#9a4d2e',
        'line-width': 2.0,
        'line-opacity': 0.6,
      },
    });
    state.map.addLayer({
      id: 'roads-halo',
      type: 'line',
      source: 'roads',
      paint: {
        'line-color': '#f7d2b8',
        'line-width': 4.5,
        'line-opacity': 0.5,
      },
    }, 'roads-line');
  }

  if (roadsStatus) roadsStatus.textContent = '読み込み済み';
}

export async function loadRoads() {
  if (roadsStatus) roadsStatus.textContent = '読み込み中...';
  try {
    const geojson = await loadRoadsData();
    state.roadsData = geojson;
    addRoadLayer(geojson);
    window.dispatchEvent(new Event('grid:traffic:ensure'));
  } catch (err) {
    if (roadsStatus) roadsStatus.textContent = '読み込み失敗';
    console.error(err);
  }
}

export function toggleRoads() {
  if (!state.map || !state.mapReady) return;
  const visible = state.roadsVisible;
  state.roadsVisible = !visible;
  const visibility = state.roadsVisible ? 'visible' : 'none';
  ['roads-line', 'roads-halo'].forEach((layerId) => {
    if (state.map.getLayer(layerId)) {
      state.map.setLayoutProperty(layerId, 'visibility', visibility);
    }
  });
}

export function addGridLayer(geojson) {
  if (!state.map || !state.mapReady) return;

  if (state.map.getSource('grid')) {
    state.map.getSource('grid').setData(geojson);
    return;
  }

  const beforeId = state.map.getLayer('roads-halo')
    ? 'roads-halo'
    : (state.map.getLayer('roads-line') ? 'roads-line' : undefined);

  state.map.addSource('grid', { type: 'geojson', data: geojson });
  state.map.addLayer({
    id: 'grid-fill',
    type: 'fill',
    source: 'grid',
    paint: {
      'fill-color': '#2b4f9c',
      'fill-opacity': 0.12,
    },
  }, beforeId);
  state.map.addLayer({
    id: 'grid-line',
    type: 'line',
    source: 'grid',
    paint: {
      'line-color': '#2b4f9c',
      'line-width': 0.6,
      'line-opacity': 0.45,
    },
  }, beforeId);

  ensureSelectedGridLayer();
  ensureReportRangeGridLayer();
  setReportRangeGridIds(state.reportRange?.gridIds || []);
  addGridPointLayer(geojson);
  bindGridEvents();
}

let gridEventsBound = false;

function bindGridEvents() {
  if (gridEventsBound || !state.map) return;
  gridEventsBound = true;

  state.map.on('click', 'grid-fill', (event) => {
    if (state.reportRange?.active || state.reportRangeInteractionState) return;
    const feature = event.features && event.features[0];
    if (!feature || !feature.properties) return;
    showPropertyPanel(feature.properties);
    setSelectedGridId(feature.properties.KEY_CODE);
  });

  state.map.on('mouseenter', 'grid-fill', () => {
    if (state.reportRange?.active || state.reportRangeInteractionState) return;
    state.map.getCanvas().style.cursor = 'pointer';
  });

  state.map.on('mouseleave', 'grid-fill', () => {
    if (state.reportRange?.active || state.reportRangeInteractionState) return;
    state.map.getCanvas().style.cursor = '';
  });

  state.map.on('click', (event) => {
    if (state.reportRange?.active || state.reportRangeInteractionState) return;
    const features = state.map.queryRenderedFeatures(event.point, { layers: ['grid-fill'] });
    if (!features.length) {
      hidePropertyPanel();
      clearSelectedGrid();
    }
  });
}

function ensureSelectedGridLayer() {
  if (!state.map || !state.map.getSource('grid')) return;
  if (state.map.getLayer('grid-selected')) return;
  const beforeId = state.map.getLayer('grid-line') ? 'grid-line' : undefined;
  state.map.addLayer({
    id: 'grid-selected',
    type: 'fill',
    source: 'grid',
    paint: {
      'fill-color': '#ffffff',
      'fill-opacity': 0.25,
    },
    filter: ['in', ['get', 'KEY_CODE'], ['literal', []]],
  }, beforeId);
}

function setSelectedGridId(id) {
  if (!state.map || !state.map.getLayer('grid-selected')) return;
  const filter = id
    ? ['in', ['get', 'KEY_CODE'], ['literal', [String(id)]]]
    : ['in', ['get', 'KEY_CODE'], ['literal', []]];
  state.map.setFilter('grid-selected', filter);
}

export function clearSelectedGrid() {
  setSelectedGridId(null);
}

export function focusGridById(id) {
  if (!state.map || !state.mapReady || !state.gridData) return;
  const feature = (state.gridData.features || []).find(
    (item) => String(item.properties?.KEY_CODE || '') === String(id)
  );
  if (!feature) return;
  const center = getGeometryCenter(feature.geometry);
  if (!center) return;
  ensureSelectedGridLayer();
  setSelectedGridId(id);
  showPropertyPanel(feature.properties);
  state.map.flyTo({
    center,
    zoom: Math.max(state.map.getZoom(), 15),
    speed: 1.2,
  });
}

let reportRangeHandlersBound = false;
let reportRangeClickHandler = null;
let reportRangeKeyHandler = null;

function ensureReportRangeLayer() {
  if (!state.map || !state.mapReady) return;
  if (state.map.getSource('report-range')) return;
  state.map.addSource('report-range', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  state.map.addLayer({
    id: 'report-range-line',
    type: 'line',
    source: 'report-range',
    paint: {
      'line-color': '#2563eb',
      'line-width': 2.6,
      'line-opacity': 0.95,
    },
  });
}

function ensureReportRangeGridLayer() {
  if (!state.map || !state.mapReady) return;
  if (!state.map.getSource('grid')) return;
  if (state.map.getLayer('grid-range')) return;
  const beforeId = state.map.getLayer('grid-top') ? 'grid-top' : undefined;
  state.map.addLayer({
    id: 'grid-range',
    type: 'line',
    source: 'grid',
    paint: {
      'line-color': '#2563eb',
      'line-width': 2.0,
      'line-opacity': 0.9,
    },
    filter: ['in', ['get', 'KEY_CODE'], ['literal', []]],
  }, beforeId);
  setReportRangeHighlightVisible(state.reportRangeVisible);
}

export function setReportRangeGridIds(ids) {
  if (!state.map || !state.mapReady) return;
  ensureReportRangeGridLayer();
  if (!state.map.getLayer('grid-range')) return;
  const filter = ids.length
    ? ['in', ['get', 'KEY_CODE'], ['literal', ids]]
    : ['in', ['get', 'KEY_CODE'], ['literal', []]];
  state.map.setFilter('grid-range', filter);
}

export function setReportRangeHighlightVisible(visible) {
  state.reportRangeVisible = Boolean(visible);
  if (!state.map || !state.map.getLayer('grid-range')) return;
  state.map.setLayoutProperty(
    'grid-range',
    'visibility',
    state.reportRangeVisible ? 'visible' : 'none'
  );
}

function updateReportRangeLine() {
  if (!state.map || !state.mapReady) return;
  const source = state.map.getSource('report-range');
  if (!source) return;
  const vertices = state.reportRange?.vertices || [];
  if (vertices.length < 2) {
    source.setData({ type: 'FeatureCollection', features: [] });
    return;
  }
  const ring = vertices.length >= 3 ? [...vertices, vertices[0]] : vertices;
  source.setData({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: ring },
      properties: {},
    }],
  });
}

function lockMapInteractionsForRange() {
  if (!state.map || state.reportRangeInteractionState) return;
  state.reportRangeInteractionState = {
    dragPan: state.map.dragPan.isEnabled(),
    scrollZoom: state.map.scrollZoom.isEnabled(),
    boxZoom: state.map.boxZoom.isEnabled(),
    doubleClickZoom: state.map.doubleClickZoom.isEnabled(),
    keyboard: state.map.keyboard.isEnabled(),
    touchZoomRotate: state.map.touchZoomRotate.isEnabled(),
  };
  state.map.dragPan.disable();
  state.map.scrollZoom.disable();
  state.map.boxZoom.disable();
  state.map.doubleClickZoom.disable();
  state.map.keyboard.disable();
  state.map.touchZoomRotate.disable();
}

function restoreMapInteractionsForRange() {
  if (!state.map || !state.reportRangeInteractionState) return;
  const prev = state.reportRangeInteractionState;
  if (prev.dragPan) state.map.dragPan.enable();
  else state.map.dragPan.disable();
  if (prev.scrollZoom) state.map.scrollZoom.enable();
  else state.map.scrollZoom.disable();
  if (prev.boxZoom) state.map.boxZoom.enable();
  else state.map.boxZoom.disable();
  if (prev.doubleClickZoom) state.map.doubleClickZoom.enable();
  else state.map.doubleClickZoom.disable();
  if (prev.keyboard) state.map.keyboard.enable();
  else state.map.keyboard.disable();
  if (prev.touchZoomRotate) state.map.touchZoomRotate.enable();
  else state.map.touchZoomRotate.disable();
  state.reportRangeInteractionState = null;
}

function pointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function finalizeReportRangeSelection() {
  const vertices = state.reportRange?.vertices || [];
  if (vertices.length < 3) return;
  const polygon = vertices.slice();
  const selectedIds = [];
  if (state.gridData?.features) {
    state.gridData.features.forEach((feature) => {
      const props = feature.properties || {};
      const key = props.KEY_CODE ? String(props.KEY_CODE) : null;
      if (!key) return;
      const center = getGeometryCenter(feature.geometry);
      if (!center) return;
      if (pointInPolygon(center, polygon)) {
        selectedIds.push(key);
      }
    });
  }
  state.reportRange = {
    ...state.reportRange,
    active: false,
    polygon,
    vertices: [],
    gridIds: selectedIds,
  };
  updateReportRangeLine();
  setReportRangeGridIds(selectedIds);
  restoreMapInteractionsForRange();
  const mapEl = document.getElementById('map');
  mapEl?.classList.remove('range-selecting');
  if (state.map) state.map.getCanvas().style.cursor = '';
  window.dispatchEvent(new CustomEvent('report:range:updated', {
    detail: { count: selectedIds.length },
  }));
}

export function startReportRangeSelection() {
  state.reportRange = {
    active: true,
    vertices: [],
    polygon: null,
    gridIds: [],
  };
  if (!state.map || !state.mapReady) return;
  ensureReportRangeLayer();
  hidePropertyPanel();
  setReportRangeGridIds([]);
  lockMapInteractionsForRange();
  const mapEl = document.getElementById('map');
  mapEl?.classList.add('range-selecting');
  if (!reportRangeHandlersBound) {
    reportRangeClickHandler = (event) => {
      if (!state.reportRange?.active) return;
      const coord = [event.lngLat.lng, event.lngLat.lat];
      state.reportRange.vertices = [...(state.reportRange.vertices || []), coord];
      updateReportRangeLine();
    };
    reportRangeKeyHandler = (event) => {
      if (!state.reportRange?.active) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        finalizeReportRangeSelection();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        clearReportRangeSelection();
      }
    };
    state.map.on('click', reportRangeClickHandler);
    window.addEventListener('keydown', reportRangeKeyHandler, true);
    reportRangeHandlersBound = true;
  }

  updateReportRangeLine();
  state.map.getCanvas().style.cursor = 'crosshair';
}

export function clearReportRangeSelection() {
  state.reportRange = {
    active: false,
    vertices: [],
    polygon: null,
    gridIds: [],
  };
  updateReportRangeLine();
  setReportRangeGridIds([]);
  restoreMapInteractionsForRange();
  const mapEl = document.getElementById('map');
  mapEl?.classList.remove('range-selecting');
  if (state.map) state.map.getCanvas().style.cursor = '';
  window.dispatchEvent(new CustomEvent('report:range:updated', { detail: { count: 0 } }));
}

async function hydrateGridMetrics(year) {
  if (mapStatus) mapStatus.textContent = `データ更新中 (${year}年)...`;
  if (!state.gridData) return;

  if (!year && vizYearRadios) {
    vizYearRadios.forEach(r => { if (r.checked) year = Number(r.value); });
  }
  if (!year) year = 2020;

  const { gridData, stats } = await computeGridMetrics(state.gridData, year);
  state.gridData = gridData;
  state.gridStats = stats;
  state.gridMetricsLoaded = true;
  state.gridTrafficLoaded = false;

  if (state.map && state.map.getSource('grid')) {
    state.map.getSource('grid').setData(state.gridData);
  }
  if (state.map && state.map.getSource('grid-points')) {
    const points = buildGridPoints(state.gridData);
    state.gridPointsData = points;
    state.map.getSource('grid-points').setData(points);
  }
  applyGridVisualization();
  if (mapStatus) mapStatus.textContent = '地図表示中';
}

export async function reloadGridMetrics(year) {
  await hydrateGridMetrics(year);
}

export async function loadGrid() {
  let year = 2020;
  if (vizYearRadios) {
    const selected = Array.from(vizYearRadios).find(r => r.checked);
    if (selected) year = Number(selected.value);
  }

  if (state.gridData) {
    addGridLayer(state.gridData);
    await hydrateGridMetrics(year);
    return;
  }
  try {
    const geojson = await loadGridData();
    state.gridData = geojson;
    addGridLayer(geojson);
    await hydrateGridMetrics(year);
  } catch (err) {
    console.error(err);
  }
}

async function ensureGridTraffic() {
  if (state.gridTrafficLoaded || !state.gridData) return;

  const roadsData = state.roadsData;
  if (!roadsData) return;

  try {
    const trafficByGrid = await computeGridTraffic(state.gridData, roadsData);
    const { gridData, trafficMax } = applyTrafficToGrid(state.gridData, trafficByGrid);
    state.gridData = gridData;
    state.gridStats.trafficMax = trafficMax;
    state.gridTrafficLoaded = true;
    if (state.map && state.map.getSource('grid')) {
      state.map.getSource('grid').setData(state.gridData);
    }
    if (state.map && state.map.getSource('grid-points')) {
      const points = buildGridPoints(state.gridData);
      state.gridPointsData = points;
      state.map.getSource('grid-points').setData(points);
    }
    applyGridVisualization();
  } catch (err) {
    console.error(err);
  }
}

function getGeometryCenter(geometry) {
  if (!geometry || !geometry.coordinates) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const pushCoord = (coord) => {
    const [x, y] = coord;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  if (geometry.type === 'Polygon') {
    geometry.coordinates.forEach((ring) => ring.forEach(pushCoord));
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach((poly) => {
      poly.forEach((ring) => ring.forEach(pushCoord));
    });
  } else {
    return null;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

function buildGridPoints(gridData) {
  if (!gridData) return { type: 'FeatureCollection', features: [] };
  const keepKeys = [
    'KEY_CODE',
    'traffic_value',
    'population_value',
    'labor_value',
    'floor_value',
    'traffic_norm',
    'population_norm',
    'labor_norm',
    'floor_norm',
    'road_area_total_norm',
    'road_area_nat_norm',
    'road_area_pref_norm',
    'road_area_muni_norm',
    'road_area_other_norm',
    'ratio_0_14',
    'ratio_15_64',
    'ratio_65_over',
    'score_norm',
  ];
  const features = (gridData.features || []).map((feature) => {
    const center = getGeometryCenter(feature.geometry);
    if (!center) return null;
    const props = feature.properties || {};
    const slimProps = {};
    keepKeys.forEach((key) => {
      if (props[key] != null) slimProps[key] = props[key];
    });
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: center,
      },
      properties: slimProps,
    };
  }).filter(Boolean);

  return { type: 'FeatureCollection', features };
}

function addGridPointLayer(gridData) {
  if (!state.map || !state.mapReady) return;
  const points = buildGridPoints(gridData);
  state.gridPointsData = points;

  if (state.map.getSource('grid-points')) {
    state.map.getSource('grid-points').setData(points);
    return;
  }

  const beforeId = state.map.getLayer('grid-line') ? 'grid-line' : undefined;
  state.map.addSource('grid-points', { type: 'geojson', data: points });
  state.map.addLayer({
    id: 'grid-circles',
    type: 'circle',
    source: 'grid-points',
    paint: {
      'circle-radius': 4,
      'circle-color': '#1f2937',
      'circle-opacity': 0.6,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
      'circle-pitch-scale': 'viewport',
    },
  }, beforeId);
}

function ensureGridTopLayer() {
  if (!state.map || !state.map.getSource('grid')) return;
  if (state.map.getLayer('grid-top')) return;
  state.map.addLayer({
    id: 'grid-top',
    type: 'line',
    source: 'grid',
    paint: {
      'line-color': '#dc2626',
      'line-width': 2.4,
      'line-opacity': 0.9,
    },
    filter: ['in', ['get', 'KEY_CODE'], ['literal', []]],
  });
}

function ensureRoadRoadTopLayer() {
  if (!state.map || !state.map.getSource('roads')) return;
  if (state.map.getLayer('roads-top')) return;
  state.map.addLayer({
    id: 'roads-top',
    type: 'line',
    source: 'roads',
    paint: {
      'line-color': '#dc2626',
      'line-width': 3.0,
      'line-opacity': 0.95,
    },
    filter: ['in', ['get', 'linkid'], ['literal', []]],
  });
}

export function setTopGridIds(ids) {
  if (!state.map || !state.mapReady) return;
  ensureGridTopLayer();
  if (!state.map.getLayer('grid-top')) return;
  const filter = ids.length
    ? ['in', ['get', 'KEY_CODE'], ['literal', ids]]
    : ['in', ['get', 'KEY_CODE'], ['literal', []]];
  state.map.setFilter('grid-top', filter);
}

export function setTopRoadIds(ids) {
  if (!state.map || !state.mapReady) return;
  ensureRoadRoadTopLayer();
  if (!state.map.getLayer('roads-top')) return;
  const filter = ids.length
    ? ['in', ['get', 'linkid'], ['literal', ids]]
    : ['in', ['get', 'linkid'], ['literal', []]];
  state.map.setFilter('roads-top', filter);
}

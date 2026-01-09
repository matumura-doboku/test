import {
  addressInput,
  addressResults,
  addressMoveBtn,
  addressClearBtn,
} from './dom.js';
import { state } from './state.js';

function renderSuggestions(list) {
  addressResults.innerHTML = '';
  if (!list.length) {
    addressResults.style.display = 'none';
    return;
  }
  list.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item.properties.title;
    li.addEventListener('click', () => {
      flyToAddress(item);
      addressResults.style.display = 'none';
    });
    addressResults.appendChild(li);
  });
  addressResults.style.display = 'block';
}

function parseLatLng(text) {
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  return [Number(match[2]), Number(match[1])];
}

function flyToAddress(item) {
  if (!state.map) return;
  const coords = item.geometry.coordinates;
  if (!coords || coords.length < 2) return;
  state.map.flyTo({ center: coords, zoom: 15.5 });
}

export function initAddressSearch() {
  if (!addressInput) return;

  let timer = null;
  addressInput.addEventListener('input', () => {
    const query = addressInput.value.trim();
    clearTimeout(timer);
    if (query.length < 2) {
      state.addressCandidates = [];
      renderSuggestions([]);
      return;
    }
    timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        state.addressCandidates = data || [];
        renderSuggestions(state.addressCandidates.slice(0, 8));
      } catch (err) {
        console.error(err);
        renderSuggestions([]);
      }
    }, 300);
  });

  addressInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && state.addressCandidates.length) {
      event.preventDefault();
      flyToAddress(state.addressCandidates[0]);
      addressResults.style.display = 'none';
    }
  });

  addressMoveBtn.addEventListener('click', () => {
    if (state.addressCandidates.length) {
      flyToAddress(state.addressCandidates[0]);
      addressResults.style.display = 'none';
      return;
    }
    const latlng = parseLatLng(addressInput.value.trim());
    if (latlng && state.map) {
      state.map.flyTo({ center: latlng, zoom: 15.5 });
    }
  });

  addressClearBtn.addEventListener('click', () => {
    addressInput.value = '';
    state.addressCandidates = [];
    renderSuggestions([]);
  });

  document.addEventListener('click', (event) => {
    if (!addressResults.contains(event.target) && event.target !== addressInput) {
      addressResults.style.display = 'none';
    }
  });
}

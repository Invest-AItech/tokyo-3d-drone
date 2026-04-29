import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('PlaceSearchDroneUI', () => {
  let mountPlaceSearchDrone;

  beforeEach(async () => {
    document.body.innerHTML = `
      <div id="ps-root">
        <input id="ps-input" type="text">
        <ul id="ps-suggest"></ul>
        <p id="ps-message"></p>
      </div>
    `;
    const mod = await import('../app/static/js/ui-place-search-drone.js');
    mountPlaceSearchDrone = mod.mountPlaceSearchDrone;
  });

  it('renders suggestions on input change', async () => {
    const mockApi = {
      autocomplete: vi.fn().mockResolvedValue({
        predictions: [
          { place_id: 'p1', description: '東京駅' },
          { place_id: 'p2', description: '東京タワー' },
        ],
        status: 'ok',
      }),
      getDetails: vi.fn(),
    };
    const onPick = vi.fn();
    mountPlaceSearchDrone({
      rootEl: document.getElementById('ps-root'),
      api: mockApi,
      onPick,
    });
    const input = document.getElementById('ps-input');
    input.value = '東京';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    const items = document.querySelectorAll('#ps-suggest .suggest-item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('東京駅');
    expect(mockApi.autocomplete).toHaveBeenCalledWith('東京');
  });

  it('calls onPick with details when suggestion clicked', async () => {
    const mockApi = {
      autocomplete: vi.fn().mockResolvedValue({
        predictions: [{ place_id: 'p1', description: '東京駅' }],
        status: 'ok',
      }),
      getDetails: vi.fn().mockResolvedValue({
        place_id: 'p1',
        lat: 35.6812,
        lon: 139.7671,
        name: '東京駅',
        in_tokyo23: true,
      }),
    };
    const onPick = vi.fn();
    mountPlaceSearchDrone({
      rootEl: document.getElementById('ps-root'),
      api: mockApi,
      onPick,
    });
    const input = document.getElementById('ps-input');
    input.value = '東京';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    const item = document.querySelector('.suggest-item');
    item.click();
    await new Promise(r => setTimeout(r, 50));
    expect(mockApi.getDetails).toHaveBeenCalledWith('p1');
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({
      lat: 35.6812,
      lon: 139.7671,
      name: '東京駅',
    }));
  });

  it('clears input and suggestions after pick', async () => {
    const mockApi = {
      autocomplete: vi.fn().mockResolvedValue({
        predictions: [{ place_id: 'p1', description: '東京駅' }],
        status: 'ok',
      }),
      getDetails: vi.fn().mockResolvedValue({
        place_id: 'p1', lat: 35.68, lon: 139.76, name: '東京駅', in_tokyo23: true,
      }),
    };
    const onPick = vi.fn();
    mountPlaceSearchDrone({
      rootEl: document.getElementById('ps-root'),
      api: mockApi,
      onPick,
    });
    const input = document.getElementById('ps-input');
    input.value = '東京';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    document.querySelector('.suggest-item').click();
    await new Promise(r => setTimeout(r, 50));
    expect(input.value).toBe('');
    expect(document.getElementById('ps-suggest').innerHTML).toBe('');
  });

  it('does not call onPick if details say in_tokyo23 = false', async () => {
    const mockApi = {
      autocomplete: vi.fn().mockResolvedValue({
        predictions: [{ place_id: 'p1', description: '横浜駅' }],
        status: 'ok',
      }),
      getDetails: vi.fn().mockResolvedValue({
        place_id: 'p1', lat: 35.4, lon: 139.6, name: '横浜駅', in_tokyo23: false,
      }),
    };
    const onPick = vi.fn();
    mountPlaceSearchDrone({
      rootEl: document.getElementById('ps-root'),
      api: mockApi,
      onPick,
    });
    const input = document.getElementById('ps-input');
    input.value = '横浜';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    document.querySelector('.suggest-item').click();
    await new Promise(r => setTimeout(r, 50));
    expect(onPick).not.toHaveBeenCalled();
  });
});

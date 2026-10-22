/* Small provider assets; whole-archive intake is a separate pending increment. */
import { fetchVerifiedAsset, smallAssets, INVENTORY_URL } from '../web/shared/download.js';
export function mountDownloadUI() {
  const $ = (id) => document.getElementById(id);
  const human = (n) => `${(n / 1048576).toFixed(2)} MiB`;
  let downloaded, url;
  $('fetch').onclick = async () => {
    downloaded = null;
    $('fetch').disabled = true;
    $('save').disabled = true;
    $('dl-status').textContent = 'Downloading from the provider…';
    try {
      const asset = JSON.parse($('asset').value);
      const result = await fetchVerifiedAsset(asset, (n, total) => {
        $('dl-status').textContent = `Downloading ${human(n)} of ${human(total)}…`;
      });
      downloaded = { asset, ...result };
      $('dl-status').textContent =
        `Verified provider checksum and pinned size (${human(result.size_bytes)}). Ready to save.`;
      $('save').disabled = false;
    } catch (error) {
      $('dl-status').textContent = 'Download failed: ' + error.message;
    } finally {
      $('fetch').disabled = !$('asset').options.length;
    }
  };
  $('save').onclick = () => {
    if (!downloaded) return;
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(new Blob([downloaded.bytes]));
    const link = document.createElement('a');
    link.href = url;
    link.download = downloaded.asset.name;
    link.click();
  };
  (async () => {
    $('fetch').disabled = true;
    try {
      const response = await fetch(INVENTORY_URL);
      if (!response.ok) throw Error(`Inventory HTTP ${response.status}`);
      const assets = smallAssets(await response.json());
      for (const asset of assets) {
        const option = document.createElement('option');
        option.value = JSON.stringify(asset);
        option.textContent = `${asset.record_id} · ${asset.name} · ${human(asset.size_bytes)}`;
        $('asset').append(option);
      }
      $('fetch').disabled = !assets.length;
      $('dl-status').textContent =
        `${assets.length} reviewed assets within the 8 MiB download limit.`;
    } catch (error) {
      $('dl-status').textContent = 'Inventory unavailable: ' + error.message;
    }
  })();
}

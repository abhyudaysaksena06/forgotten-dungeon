// Downloads every model once, counting bytes for the loading screen. The 3D loaders then get the
// files from the browser's cache (a cheap revalidation), so nothing is fetched twice.
export const download = { got: 0, total: 0, done: false };

export async function downloadAll(urls) {
  // Each batch counts from zero (the game loads in batches: see Scene's loadBatches).
  Object.assign(download, { got: 0, total: 0, done: false });
  const size = new Map(); // url -> bytes expected (0 while unknown)
  const got = new Map(); // url -> bytes received
  const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
  const update = () => {
    download.got = sum(got);
    download.total = Math.max(sum(size), download.got);
  };
  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url);
        // A compressed response's length is not the size of what is read, so it can't be trusted.
        const length = res.headers.get('content-encoding') ? 0 : Number(res.headers.get('content-length')) || 0;
        size.set(url, length);
        const reader = res.body.getReader();
        let n = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          n += value.length;
          got.set(url, n);
          update();
        }
        size.set(url, n);
        update();
      } catch {
        // The loader tries again; if it fails too, the fight shows the stand-in.
      }
    }),
  );
  download.done = true;
}

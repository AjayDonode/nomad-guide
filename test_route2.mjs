const wp = "-122.4194,37.7749;-122.4167,37.7833";
const target = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${wp}?overview=full&geometries=geojson&steps=true`;
try {
  const resp = await fetch(target);
  console.log("Status:", resp.status);
  const txt = await resp.text();
  console.log("Response:", txt.slice(0, 500));
} catch (e) {
  console.error(e);
}

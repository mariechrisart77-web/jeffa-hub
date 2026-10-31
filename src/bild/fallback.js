// Plain JS: test can import without TS loader
export function shouldFallback(status, bodyText) {
  if (status !== 503) return false;
  try {
    const data = JSON.parse(bodyText);
    return data?.error?.code === "not_configured";
  } catch {
    return false;
  }
}

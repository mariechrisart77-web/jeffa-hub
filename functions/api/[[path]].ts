export const onRequest: PagesFunction = async () =>
  new Response(JSON.stringify({ error: { code: "not_found", message: "Unbekannter API-Endpunkt" } }), {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

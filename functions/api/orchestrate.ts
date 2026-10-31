export const onRequestPost: PagesFunction = async () => {
  return new Response(JSON.stringify({ error: { code: "not_implemented", message: "Orchestrate noch nicht implementiert" } }), {
    status: 501,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};

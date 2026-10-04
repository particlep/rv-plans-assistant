// Deployed by `make placeholder` so the Worker exists (and Access can be enabled on it)
// before any plan content is uploaded.
export default { fetch: () => new Response("Not available", { status: 403 }) };

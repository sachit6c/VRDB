// tests/helpers/supabase-mock.js
// A chainable Supabase query-builder mock matching the subset of the JS client
// that lib/db.js uses: from().select()/upsert()/delete().eq()/.in()/.order()
// /.limit()/.maybeSingle()/.single(), awaited for { data, error, count }.
//
// Tests register handlers that receive the recorded query context and return
// the canned { data } / { error } / { count } result.

export function createSupabaseMock() {
  const handlers = { select: null, upsert: null, delete: null };

  function from(table) {
    const ctx = {
      table,
      op: 'select',
      cols: null,
      payload: null,
      opts: null,
      filters: [],   // [['eq', col, val], ['in', col, vals], ['order', col, opt], ['limit', n]]
      single: false,
      count: false,
      head: false,
    };

    const resolve = () => {
      const h = handlers[ctx.op];
      const res = h ? h(ctx) : {};
      return Promise.resolve(res);
    };

    const builder = {
      select(cols, opt) {
        ctx.op = 'select';
        ctx.cols = cols;
        if (opt?.count) ctx.count = true;
        if (opt?.head) ctx.head = true;
        return builder;
      },
      upsert(payload, opts) { ctx.op = 'upsert'; ctx.payload = payload; ctx.opts = opts; return builder; },
      delete() { ctx.op = 'delete'; return builder; },
      eq(col, val) { ctx.filters.push(['eq', col, val]); return builder; },
      in(col, vals) { ctx.filters.push(['in', col, vals]); return builder; },
      order(col, opt) { ctx.filters.push(['order', col, opt]); return builder; },
      limit(n) { ctx.filters.push(['limit', n]); return builder; },
      maybeSingle() { ctx.single = true; return resolve(); },
      single() { ctx.single = true; return resolve(); },
      // Thenable: awaiting the builder runs the query.
      then(onF, onR) { return resolve().then(onF, onR); },
      _ctx: ctx,
    };
    return builder;
  }

  return {
    from,
    onSelect(fn) { handlers.select = fn; },
    onUpsert(fn) { handlers.upsert = fn; },
    onDelete(fn) { handlers.delete = fn; },
  };
}

// Convenience: read a filter value by [kind, col].
export function filterValue(ctx, kind, col) {
  const f = ctx.filters.find((x) => x[0] === kind && x[1] === col);
  return f ? f[2] : undefined;
}

// Edge Function (Deno): saves today's mid-market rates (1 USD in each currency) to public.fx_rates.
// Run once a day by Supabase Cron ("Supabase Edge Function" job). The app only uses these rates to
// suggest a ledger rate (spec §6A.2); it never converts entries with them.
//
// Source: ExchangeRate-API's open endpoint (no key, updated daily). Its terms ask for the
// "Rates By Exchange Rate API" credit next to the rates, which the app shows with the suggestion.
//
// Writes with the service role key that Supabase gives every Edge Function. That key never goes in the app.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SOURCE_URL = 'https://open.er-api.com/v6/latest/USD';
const SOURCE = 'open.er-api.com';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** 1.52 -> "1.52", 25400 -> "25400": at most 10 decimals, as public.fx_rate_of expects. */
function rateText(value: number): string {
  return value.toFixed(10).replace(/\.?0+$/, '');
}

Deno.serve(async () => {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) return json({ error: `rate source answered ${response.status}` }, 502);
  const body = await response.json();
  if (body?.result !== 'success' || body.base_code !== 'USD' || typeof body.rates !== 'object') {
    return json({ error: 'unexpected answer from the rate source' }, 502);
  }

  const rates: Record<string, string> = {};
  for (const [code, value] of Object.entries(body.rates as Record<string, unknown>)) {
    if (/^[A-Z]{3}$/.test(code) && typeof value === 'number' && Number.isFinite(value) && value > 0) {
      const text = rateText(value);
      if (text !== '0') rates[code] = text;
    }
  }
  if (!rates.TWD || !rates.JPY) return json({ error: 'TWD or JPY missing from the rate source' }, 502);

  const updated =
    typeof body.time_last_update_unix === 'number' ? new Date(body.time_last_update_unix * 1000) : new Date();
  const date = updated.toISOString().slice(0, 10);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { error } = await supabase
    .from('fx_rates')
    .upsert({ date, base: 'USD', rates, source: SOURCE, fetched_at: new Date().toISOString() });
  if (error) return json({ error: error.message }, 500);
  return json({ date, currencies: Object.keys(rates).length });
});

// Deducts credits from a user's balance before an AI interaction.
// Call this BEFORE making the Claude API call. Returns 402 if insufficient.
//
// Body: { userId, cost, description? }
//   cost: credits to deduct (1 credit = 1 micro-cent of API spend = $0.00001).
//         Typical call: 2,000 credits (~$0.02 API cost).
//
// Returns: { balance, deducted } on success, or 402 { error: 'insufficient_credits', balance }
const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const DEFAULT_COST = 2000; // 2,000 credits = $0.02 API cost (3x markup = $0.06 user cost)
const STARTER_FREE_CREDITS = 14000; // 7 free interactions for new authenticated users (before first paid allocation)

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }

  try {
    const { userId, cost, description } = JSON.parse(event.body || '{}');
    if (!userId) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing userId' }) };
    }
    const deduction = Number.isFinite(cost) && cost > 0 ? Math.floor(cost) : DEFAULT_COST;

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Read current balance
    let { data: current, error: readErr } = await supabase
      .from('user_credits')
      .select('balance, subscription_status')
      .eq('user_id', userId)
      .maybeSingle();
    if (readErr) throw readErr;

    // First-time authenticated user: seed with starter free credits
    if (!current) {
      const { error: seedErr } = await supabase
        .from('user_credits')
        .insert({ user_id: userId, balance: STARTER_FREE_CREDITS, subscription_status: 'none' });
      if (seedErr && seedErr.code !== '23505') throw seedErr; // ignore unique violation from race
      await supabase.from('credit_transactions').insert({
        user_id: userId,
        amount: STARTER_FREE_CREDITS,
        type: 'allocation',
        description: 'Starter free credits (7 interactions)'
      });
      current = { balance: STARTER_FREE_CREDITS, subscription_status: 'none' };
    }

    const balance = current?.balance || 0;
    if (balance < deduction) {
      return {
        statusCode: 402,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'insufficient_credits',
          balance,
          required: deduction,
          subscription_status: current?.subscription_status || 'none'
        })
      };
    }

    const newBalance = balance - deduction;

    // Update balance
    const { error: updateErr } = await supabase
      .from('user_credits')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (updateErr) throw updateErr;

    // Log transaction (non-blocking for response latency; fail quietly)
    supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: -deduction,
      type: 'usage',
      description: description || 'AI interaction'
    }).then(({ error }) => {
      if (error) console.error('credit_transactions insert error:', error);
    });

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ balance: newBalance, deducted: deduction })
    };
  } catch (err) {
    console.error('use-credit error:', err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message })
    };
  }
};

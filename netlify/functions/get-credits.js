// Returns current credit balance + subscription status for an authenticated user.
// Body: { userId } (Supabase auth user id)
// Returns: { balance, monthly_allocation, subscription_status, last_allocation_date }
const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

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
    const { userId } = JSON.parse(event.body || '{}');
    if (!userId) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing userId' }) };
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from('user_credits')
      .select('balance, monthly_allocation, subscription_status, last_allocation_date, stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        balance: data?.balance || 0,
        monthly_allocation: data?.monthly_allocation || 0,
        subscription_status: data?.subscription_status || 'none',
        last_allocation_date: data?.last_allocation_date || null,
        has_stripe_customer: !!data?.stripe_customer_id
      })
    };
  } catch (err) {
    console.error('get-credits error:', err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message })
    };
  }
};

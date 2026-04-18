exports.handler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    stripeSubscriptionPriceId: process.env.STRIPE_SUBSCRIPTION_PRICE_ID || '',
    stripeTopupPriceId: process.env.STRIPE_TOPUP_PRICE_ID || ''
  })
});

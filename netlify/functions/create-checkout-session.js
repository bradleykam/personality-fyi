// Creates a Stripe Checkout Session for subscription or top-up purchase.
// Body: { priceId, mode: 'subscription' | 'payment', userEmail, userId }
// Returns: { url } for Stripe-hosted checkout
const Stripe = require('stripe');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Stripe not configured' }) };
    }
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    const { priceId, mode, userEmail, userId } = JSON.parse(event.body || '{}');
    if (!priceId || !mode || !userEmail) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing priceId, mode, or userEmail' }) };
    }
    if (mode !== 'subscription' && mode !== 'payment') {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid mode' }) };
    }

    const origin = event.headers.origin || event.headers.Origin || 'https://personality.fyi';

    const session = await stripe.checkout.sessions.create({
      mode,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: userEmail,
      success_url: origin + '/?checkout=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: origin + '/?checkout=cancel',
      metadata: {
        user_id: userId || '',
        user_email: userEmail,
        purchase_type: mode === 'subscription' ? 'subscription' : 'topup'
      },
      // For subscription mode, also attach metadata to the subscription itself
      subscription_data: mode === 'subscription' ? {
        metadata: {
          user_id: userId || '',
          user_email: userEmail
        }
      } : undefined
    });

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url, sessionId: session.id })
    };
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message })
    };
  }
};

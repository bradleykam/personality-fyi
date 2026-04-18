// Stripe webhook handler. Verifies signature, allocates credits to users on successful payments.
//
// Credit units: 1 credit = 1 micro-cent of API cost ($0.00001).
// Subscription/topup: 300,000 credits = $3 of API spend = ~150 interactions @ $0.02 each.
//
// Register endpoint in Stripe dashboard with events:
//   - checkout.session.completed
//   - invoice.paid
//   - customer.subscription.updated
//   - customer.subscription.deleted
// Copy signing secret to STRIPE_WEBHOOK_SECRET env var.
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const SUBSCRIPTION_CREDITS = 300000; // $3 of API spend
const TOPUP_CREDITS = 300000;        // $3 of API spend

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('Stripe env vars not set');
    return { statusCode: 500, body: 'Stripe not configured' };
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Supabase env vars not set');
    return { statusCode: 500, body: 'Supabase not configured' };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Verify signature
  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  let stripeEvent;
  try {
    // Netlify passes body as string. If isBase64Encoded, decode first.
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: 'Webhook Error: ' + err.message };
  }

  console.log('Received Stripe event:', stripeEvent.type, stripeEvent.id);

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        await handleCheckoutCompleted(supabase, stripe, session, stripeEvent.id);
        break;
      }
      case 'invoice.paid': {
        const invoice = stripeEvent.data.object;
        await handleInvoicePaid(supabase, stripe, invoice, stripeEvent.id);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = stripeEvent.data.object;
        await handleSubscriptionUpdated(supabase, sub);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object;
        await handleSubscriptionDeleted(supabase, sub);
        break;
      }
      default:
        console.log('Unhandled event type:', stripeEvent.type);
    }
  } catch (err) {
    console.error('Handler error:', err);
    return { statusCode: 500, body: 'Handler error: ' + err.message };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ received: true })
  };
};

async function resolveUserId(supabase, emailOrId) {
  if (!emailOrId) return null;
  // If looks like a UUID, return as-is
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(emailOrId)) {
    return emailOrId;
  }
  // Otherwise treat as email and look up
  try {
    const { data } = await supabase.auth.admin.listUsers();
    const user = (data?.users || []).find(u => (u.email || '').toLowerCase() === emailOrId.toLowerCase());
    return user?.id || null;
  } catch (err) {
    console.error('resolveUserId error:', err);
    return null;
  }
}

async function allocateCredits(supabase, userId, amount, type, description, stripeEventId, extraUpdates = {}) {
  if (!userId) {
    console.error('Cannot allocate credits: no userId');
    return;
  }

  // Idempotency check: has this stripe_event_id been processed?
  if (stripeEventId) {
    const { data: existing } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('stripe_event_id', stripeEventId)
      .maybeSingle();
    if (existing) {
      console.log('Event already processed:', stripeEventId);
      return;
    }
  }

  // Get current balance (if row exists)
  const { data: current } = await supabase
    .from('user_credits')
    .select('balance, monthly_allocation')
    .eq('user_id', userId)
    .maybeSingle();

  const newBalance = (current?.balance || 0) + amount;

  // Upsert user_credits row
  const updates = {
    user_id: userId,
    balance: newBalance,
    updated_at: new Date().toISOString(),
    ...extraUpdates
  };
  if (type === 'allocation' || type === 'topup') {
    updates.last_allocation_date = new Date().toISOString();
  }
  if (type === 'allocation') {
    updates.monthly_allocation = amount;
  }

  const { error: upsertErr } = await supabase
    .from('user_credits')
    .upsert(updates, { onConflict: 'user_id' });
  if (upsertErr) {
    console.error('upsert user_credits error:', upsertErr);
    throw upsertErr;
  }

  // Log transaction
  const { error: txErr } = await supabase
    .from('credit_transactions')
    .insert({
      user_id: userId,
      amount,
      type,
      description,
      stripe_event_id: stripeEventId || null
    });
  if (txErr) {
    console.error('insert credit_transactions error:', txErr);
    // Non-fatal — balance has been updated
  }

  console.log('Allocated', amount, 'credits to', userId, '(new balance:', newBalance, ')');
}

async function handleCheckoutCompleted(supabase, stripe, session, eventId) {
  const meta = session.metadata || {};
  const email = session.customer_email || session.customer_details?.email || meta.user_email;
  const userId = await resolveUserId(supabase, meta.user_id || email);
  if (!userId) {
    console.error('Could not resolve user for checkout session:', session.id);
    return;
  }

  const extraUpdates = {};
  if (session.customer) extraUpdates.stripe_customer_id = session.customer;
  if (session.subscription) {
    extraUpdates.stripe_subscription_id = session.subscription;
    extraUpdates.subscription_status = 'active';
  }

  if (session.mode === 'subscription') {
    // Initial subscription payment — allocate monthly credits
    // (invoice.paid will also fire but we process this first for faster credit availability)
    await allocateCredits(
      supabase, userId, SUBSCRIPTION_CREDITS, 'allocation',
      'Initial subscription allocation', eventId, extraUpdates
    );
  } else {
    // One-time top-up purchase
    await allocateCredits(
      supabase, userId, TOPUP_CREDITS, 'topup',
      'Top-up purchase', eventId, extraUpdates
    );
  }
}

async function handleInvoicePaid(supabase, stripe, invoice, eventId) {
  // Monthly renewal — allocate new credits on top of rollover balance.
  // Skip if this is the first invoice (already handled by checkout.session.completed).
  if (invoice.billing_reason === 'subscription_create') {
    console.log('Skipping first invoice — handled by checkout.session.completed');
    return;
  }
  if (invoice.billing_reason !== 'subscription_cycle' && invoice.billing_reason !== 'subscription_update') {
    return;
  }

  let email = invoice.customer_email;
  let userId = null;
  // Try subscription metadata first
  if (invoice.subscription) {
    try {
      const sub = await stripe.subscriptions.retrieve(invoice.subscription);
      userId = await resolveUserId(supabase, sub.metadata?.user_id || sub.metadata?.user_email || email);
    } catch (err) {
      console.error('retrieve subscription error:', err);
    }
  }
  if (!userId && email) {
    userId = await resolveUserId(supabase, email);
  }
  if (!userId) {
    console.error('Could not resolve user for invoice:', invoice.id);
    return;
  }

  await allocateCredits(
    supabase, userId, SUBSCRIPTION_CREDITS, 'allocation',
    'Monthly subscription renewal', eventId
  );
}

async function handleSubscriptionUpdated(supabase, sub) {
  const userId = await resolveUserId(supabase, sub.metadata?.user_id || sub.metadata?.user_email);
  if (!userId) return;
  await supabase
    .from('user_credits')
    .update({
      subscription_status: sub.status,
      stripe_subscription_id: sub.id,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);
}

async function handleSubscriptionDeleted(supabase, sub) {
  const userId = await resolveUserId(supabase, sub.metadata?.user_id || sub.metadata?.user_email);
  if (!userId) return;
  await supabase
    .from('user_credits')
    .update({
      subscription_status: 'canceled',
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);
}

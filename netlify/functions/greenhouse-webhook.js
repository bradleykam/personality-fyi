const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Greenhouse sends the signature in the "Signature" header (lowercased by Netlify)
    const signature = event.headers['signature'];

    if (!signature) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing signature header' })
      };
    }

    const rawBody = event.body;

    // Load all employers with a webhook secret
    const { data: employers, error: empErr } = await supabase
      .from('employers')
      .select('id, greenhouse_webhook_secret, send_rejection_suggestions, company_name')
      .not('greenhouse_webhook_secret', 'is', null);

    if (empErr || !employers || employers.length === 0) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No configured webhook secrets' })
      };
    }

    // Verify signature against each employer's secret
    let matchedEmployer = null;
    for (const employer of employers) {
      const hmac = crypto.createHmac('sha256', employer.greenhouse_webhook_secret);
      hmac.update(rawBody);
      const computed = hmac.digest('hex');

      try {
        if (crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))) {
          matchedEmployer = employer;
          break;
        }
      } catch (e) {
        // Length mismatch, try next employer
      }
    }

    if (!matchedEmployer) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid signature' })
      };
    }

    const payload = JSON.parse(rawBody);
    const action = payload.action;

    // Extract candidate email — Greenhouse nests it under application.candidate
    const candidate = payload.payload?.application?.candidate ||
                      payload.payload?.candidate || {};
    const emailObj = (candidate.email_addresses || [])[0];
    const candidateEmail = emailObj?.value || null;

    if (!candidateEmail) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ received: true, note: 'No email found in payload' })
      };
    }

    // Greenhouse rejection webhook: action is "reject" at the application level
    if (action === 'reject' || action === 'reject_candidate' || action === 'application_rejected') {
      if (matchedEmployer.send_rejection_suggestions) {
        const { data: assessment } = await supabase
          .from('assessments')
          .select('id, mbti_type')
          .eq('candidate_email', candidateEmail)
          .eq('employer_id', matchedEmployer.id)
          .order('completed_at', { ascending: false })
          .limit(1)
          .single();

        if (assessment && assessment.mbti_type) {
          const siteUrl = process.env.URL || 'https://personality.fyi';
          await fetch(`${siteUrl}/.netlify/functions/send-rejection-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              candidateEmail,
              mbtiType: assessment.mbti_type,
              companyName: matchedEmployer.company_name || 'the company'
            })
          });
        }
      }
    }

    // Greenhouse hire webhook
    if (action === 'hire' || action === 'hire_candidate' || action === 'candidate_hired') {
      await supabase
        .from('assessments')
        .update({ hired: true })
        .eq('candidate_email', candidateEmail)
        .eq('employer_id', matchedEmployer.id);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ received: true })
    };
  } catch (e) {
    console.error('Webhook error:', e.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message })
    };
  }
};

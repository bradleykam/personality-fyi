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
    // Lever sends signature in X-Lever-Signature header (lowercased by Netlify)
    const signature = event.headers['x-lever-signature'] || event.headers['lever-signature'] || '';
    const rawBody = event.body;

    // Load all employers with a Lever webhook token
    const { data: employers, error: empErr } = await supabase
      .from('employers')
      .select('id, lever_webhook_token, lever_send_rejection_suggestions, company_name, lever_api_key')
      .not('lever_webhook_token', 'is', null);

    if (empErr || !employers || employers.length === 0) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No configured webhook tokens' })
      };
    }

    // Verify HMAC signature against each employer's token
    let matchedEmployer = null;
    const sigClean = signature.replace(/^sha256=/, '');

    for (const employer of employers) {
      const hmac = crypto.createHmac('sha256', employer.lever_webhook_token);
      hmac.update(rawBody);
      const computed = hmac.digest('hex');

      try {
        if (crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sigClean))) {
          matchedEmployer = employer;
          break;
        }
      } catch (e) {
        // Length mismatch, try next
      }
    }

    // Fallback: Lever may also send a plain token in the body for verification
    if (!matchedEmployer) {
      const payload = JSON.parse(rawBody);
      if (payload.token) {
        for (const employer of employers) {
          if (payload.token === employer.lever_webhook_token) {
            matchedEmployer = employer;
            break;
          }
        }
      }
    }

    if (!matchedEmployer) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid signature or token' })
      };
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload.event || payload.type || '';

    // Try to extract candidate email from webhook payload
    // Lever webhooks often only include IDs, not full contact data
    let candidateEmail = null;

    // Try direct email paths in the payload
    candidateEmail =
      payload.data?.contact?.emails?.[0] ||
      payload.data?.emails?.[0] ||
      payload.data?.opportunity?.contact?.emails?.[0] ||
      null;

    // If no email in payload, fetch it from Lever API using the opportunity/contact ID
    if (!candidateEmail && matchedEmployer.lever_api_key) {
      const contactId = payload.data?.contactId || payload.data?.opportunity?.contact || payload.data?.contact;
      if (contactId && typeof contactId === 'string') {
        try {
          const encoded = Buffer.from(matchedEmployer.lever_api_key + ':').toString('base64');
          const contactRes = await fetch(`https://api.lever.co/v1/contacts/${contactId}`, {
            headers: { 'Authorization': `Basic ${encoded}` }
          });
          if (contactRes.ok) {
            const contactData = await contactRes.json();
            candidateEmail = contactData.data?.emails?.[0] || null;
          }
        } catch (e) {
          console.error('Failed to fetch contact from Lever:', e.message);
        }
      }
    }

    if (!candidateEmail) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ received: true, note: 'No email found in payload or via API' })
      };
    }

    // Handle archive/rejection events
    // Lever event types: candidateArchiveStateChange, archive_change, archiveStateChanged
    const isArchiveEvent = eventType === 'candidateArchiveStateChange' ||
                           eventType === 'archiveStateChanged' ||
                           eventType === 'candidateArchiveChange' ||
                           eventType === 'archive_change';

    if (isArchiveEvent && matchedEmployer.lever_send_rejection_suggestions) {
      // Check if archive reason indicates rejection
      const archiveReason = payload.data?.toArchiveReason?.text ||
                            payload.data?.archiveReason?.text ||
                            payload.data?.reason?.text || '';
      const reasonType = payload.data?.toArchiveReason?.type ||
                         payload.data?.archiveReason?.type ||
                         payload.data?.reason?.type || '';
      const isRejection = reasonType === 'rejected' ||
                          archiveReason.toLowerCase().includes('reject');

      if (isRejection) {
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

    // Handle hire events
    const isHireEvent = eventType === 'candidateHired' ||
                        eventType === 'hire' ||
                        eventType === 'candidate_hired';

    if (isHireEvent) {
      await supabase
        .from('assessments')
        .update({ lever_hired: true })
        .eq('candidate_email', candidateEmail)
        .eq('employer_id', matchedEmployer.id);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ received: true })
    };
  } catch (e) {
    console.error('Lever webhook error:', e.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message })
    };
  }
};

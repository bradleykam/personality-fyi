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
    const rawBody = event.body;
    let payload;

    // Workday business process integrations may send XML or JSON
    const contentType = event.headers['content-type'] || '';
    if (contentType.includes('xml')) {
      // Basic XML parsing for Workday payloads — extract key fields
      const emailMatch = rawBody.match(/<(?:Email|email|Email_Address)[^>]*>([^<]+)<\//i);
      const actionMatch = rawBody.match(/<(?:Event|Action|Business_Process)[^>]*>([^<]+)<\//i);
      const tenantMatch = rawBody.match(/<(?:Tenant|tenant)[^>]*>([^<]+)<\//i);
      payload = {
        email: emailMatch ? emailMatch[1].trim() : null,
        action: actionMatch ? actionMatch[1].trim().toLowerCase() : null,
        tenant: tenantMatch ? tenantMatch[1].trim() : null
      };
    } else {
      payload = JSON.parse(rawBody);
    }

    const candidateEmail = payload.email || payload.candidate_email || payload.Email_Address || null;
    const action = payload.action || payload.event || payload.Event_Type || '';
    const tenantName = payload.tenant || payload.tenant_name || payload.Tenant || null;

    if (!candidateEmail) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ received: true, note: 'No email found in payload' })
      };
    }

    // Find matching employer by tenant name or by checking all Workday-enabled employers
    let matchedEmployer = null;

    if (tenantName) {
      const { data: emp } = await supabase
        .from('employers')
        .select('id, workday_send_rejection_suggestions, company_name')
        .eq('workday_tenant_name', tenantName)
        .eq('workday_enabled', true)
        .single();
      matchedEmployer = emp;
    }

    // Fallback: find employer who has an assessment for this candidate email
    if (!matchedEmployer) {
      const { data: assessment } = await supabase
        .from('assessments')
        .select('employer_id')
        .eq('candidate_email', candidateEmail)
        .order('completed_at', { ascending: false })
        .limit(1)
        .single();

      if (assessment) {
        const { data: emp } = await supabase
          .from('employers')
          .select('id, workday_send_rejection_suggestions, company_name')
          .eq('id', assessment.employer_id)
          .eq('workday_enabled', true)
          .single();
        matchedEmployer = emp;
      }
    }

    if (!matchedEmployer) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ received: true, note: 'No matching employer found' })
      };
    }

    const actionLower = action.toLowerCase();

    // Handle rejection
    if (actionLower.includes('reject') || actionLower.includes('decline') || actionLower.includes('archive')) {
      if (matchedEmployer.workday_send_rejection_suggestions) {
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

    // Handle hire
    if (actionLower.includes('hire') || actionLower.includes('offer_accepted')) {
      await supabase
        .from('assessments')
        .update({ workday_hired: true })
        .eq('candidate_email', candidateEmail)
        .eq('employer_id', matchedEmployer.id);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ received: true })
    };
  } catch (e) {
    console.error('Workday webhook error:', e.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message })
    };
  }
};

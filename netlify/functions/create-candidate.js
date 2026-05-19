const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' } };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const {
      email, type, confidenceScore,
      percentages,   // { I: 74, N: 88, T: 61, J: 92 } — spectrum scoring per-axis (new 2026-04-22)
      employerId,
      axisIE, axisNS, axisTF, axisJP
    } = JSON.parse(event.body);

    // Verify employer exists
    const { data: employer, error: empErr } = await supabase
      .from('employers')
      .select('id')
      .eq('id', employerId)
      .single();

    if (empErr || !employer) {
      return { statusCode: 404, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Employer not found' }) };
    }

    // Silently create candidate account if it doesn't exist
    let candidateUserId = null;
    try {
      const { data: userData } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true
      });
      candidateUserId = userData?.user?.id || null;
    } catch(e) {
      // User may already exist — look them up
      try {
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const existing = users.find(u => u.email === email);
        candidateUserId = existing?.id || null;
      } catch(e2) { /* ignore */ }
    }

    // Store assessment result — include axis percentages as JSONB where supported.
    // Schema column `axis_percentages jsonb` — add it via `ALTER TABLE assessments
    // ADD COLUMN IF NOT EXISTS axis_percentages jsonb;`. If the column doesn't
    // exist yet, the insert still succeeds because we catch and retry without it.
    const row = {
      employer_id: employerId,
      candidate_email: email,
      candidate_user_id: candidateUserId,
      mbti_type: type,
      match_score: confidenceScore,
      confidence_score: confidenceScore,
      axis_ie: axisIE,
      axis_ns: axisNS,
      axis_tf: axisTF,
      axis_jp: axisJP,
      consent: true
    };
    if (percentages && typeof percentages === 'object') {
      row.axis_percentages = percentages;
    }
    let { error: insertErr } = await supabase.from('assessments').insert(row);
    if (insertErr && insertErr.message && insertErr.message.indexOf('axis_percentages') !== -1) {
      // Column missing — retry without it. Log for visibility.
      console.warn('assessments.axis_percentages column missing, retrying without');
      delete row.axis_percentages;
      const retry = await supabase.from('assessments').insert(row);
      insertErr = retry.error;
    }

    if (insertErr) {
      return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: insertErr.message }) };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };
  } catch(e) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};

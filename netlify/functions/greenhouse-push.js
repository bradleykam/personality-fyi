const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const { assessmentId } = JSON.parse(event.body);

    if (!assessmentId) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'assessmentId is required' })
      };
    }

    // Load assessment
    const { data: assessment, error: assessErr } = await supabase
      .from('assessments')
      .select('*')
      .eq('id', assessmentId)
      .single();

    if (assessErr || !assessment) {
      return {
        statusCode: 404,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Assessment not found' })
      };
    }

    // Load employer with greenhouse fields
    const { data: employer, error: empErr } = await supabase
      .from('employers')
      .select('id, greenhouse_api_key, greenhouse_user_id')
      .eq('id', assessment.employer_id)
      .single();

    if (empErr || !employer) {
      return {
        statusCode: 404,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Employer not found' })
      };
    }

    if (!employer.greenhouse_api_key) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Employer has no Greenhouse API key configured' })
      };
    }

    if (!employer.greenhouse_user_id) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Employer has no Greenhouse user ID. Reconnect your API key.' })
      };
    }

    const ghAuth = Buffer.from(employer.greenhouse_api_key + ':').toString('base64');

    // Search Greenhouse for candidate by email
    const searchRes = await fetch(
      `https://harvest.greenhouse.io/v1/candidates?email=${encodeURIComponent(assessment.candidate_email)}`,
      {
        method: 'GET',
        headers: { 'Authorization': `Basic ${ghAuth}` }
      }
    );

    if (!searchRes.ok) {
      return {
        statusCode: 502,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Greenhouse search failed: ${searchRes.status}` })
      };
    }

    const candidates = await searchRes.json();

    if (!candidates || candidates.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Candidate not found in Greenhouse' })
      };
    }

    const candidateId = candidates[0].id;

    // PATCH candidate with custom fields
    // name_key values must match the snake_case auto-generated keys in Greenhouse
    // UI instructs users to create: "typeread_type", "typeread_match_score", "typeread_confidence", "typeread_assessed_at"
    const patchRes = await fetch(
      `https://harvest.greenhouse.io/v1/candidates/${candidateId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Basic ${ghAuth}`,
          'Content-Type': 'application/json',
          'On-Behalf-Of': employer.greenhouse_user_id
        },
        body: JSON.stringify({
          custom_fields: [
            { name_key: 'typeread_type', value: assessment.mbti_type },
            { name_key: 'typeread_match_score', value: String(assessment.match_score) },
            { name_key: 'typeread_confidence', value: String(assessment.confidence_score) },
            { name_key: 'typeread_assessed_at', value: new Date().toISOString() }
          ]
        })
      }
    );

    if (!patchRes.ok) {
      const patchErr = await patchRes.text();
      return {
        statusCode: 502,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Greenhouse PATCH failed: ${patchRes.status}`, details: patchErr })
      };
    }

    // Update assessment record in Supabase
    const { error: updateErr } = await supabase
      .from('assessments')
      .update({
        pushed_to_greenhouse: true,
        pushed_at: new Date().toISOString(),
        greenhouse_candidate_id: String(candidateId)
      })
      .eq('id', assessmentId);

    if (updateErr) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Failed to update assessment: ${updateErr.message}` })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, greenhouse_candidate_id: candidateId })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message })
    };
  }
};

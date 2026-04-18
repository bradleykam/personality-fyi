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

    // Load employer with lever_api_key
    const { data: employer, error: empErr } = await supabase
      .from('employers')
      .select('id, lever_api_key')
      .eq('id', assessment.employer_id)
      .single();

    if (empErr || !employer) {
      return {
        statusCode: 404,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Employer not found' })
      };
    }

    if (!employer.lever_api_key) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Employer has no Lever API key configured' })
      };
    }

    // Lever uses HTTP Basic auth: API key as username, empty password
    const encoded = Buffer.from(employer.lever_api_key + ':').toString('base64');
    const headers = {
      'Authorization': `Basic ${encoded}`,
      'Content-Type': 'application/json'
    };

    // Search Lever for opportunities by candidate email
    const searchRes = await fetch(
      `https://api.lever.co/v1/opportunities?email=${encodeURIComponent(assessment.candidate_email)}`,
      { method: 'GET', headers }
    );

    if (!searchRes.ok) {
      return {
        statusCode: 502,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Lever search failed: ${searchRes.status}` })
      };
    }

    const searchData = await searchRes.json();
    const opportunity = searchData.data && searchData.data[0];

    if (!opportunity) {
      return {
        statusCode: 404,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Candidate not found in Lever' })
      };
    }

    // Write tags to the opportunity (Lever's most reliable way to attach metadata)
    // Also attempt custom fields via the links/custom endpoint
    const tagRes = await fetch(
      `https://api.lever.co/v1/opportunities/${opportunity.id}/addTags`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tags: [
            `TypeRead: ${assessment.mbti_type}`,
            `TypeRead Match: ${assessment.match_score}`,
            `TypeRead Confidence: ${assessment.confidence_score}`
          ]
        })
      }
    );

    if (!tagRes.ok) {
      const tagErr = await tagRes.text();
      return {
        statusCode: 502,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Lever tag update failed: ${tagRes.status}`, details: tagErr })
      };
    }

    // Update assessment record in Supabase
    const { error: updateErr } = await supabase
      .from('assessments')
      .update({
        pushed_to_lever: true,
        lever_pushed_at: new Date().toISOString(),
        lever_candidate_id: opportunity.contact || null,
        lever_opportunity_id: opportunity.id
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
      body: JSON.stringify({ success: true, lever_opportunity_id: opportunity.id })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message })
    };
  }
};

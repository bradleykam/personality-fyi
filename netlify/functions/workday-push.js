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

    // Load employer with Workday credentials
    const { data: employer, error: empErr } = await supabase
      .from('employers')
      .select('id, workday_tenant_url, workday_tenant_name, workday_client_id, workday_client_secret')
      .eq('id', assessment.employer_id)
      .single();

    if (empErr || !employer) {
      return {
        statusCode: 404,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Employer not found' })
      };
    }

    if (!employer.workday_client_id || !employer.workday_client_secret) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Employer has no Workday credentials configured' })
      };
    }

    const baseUrl = employer.workday_tenant_url.replace(/\/+$/, '');
    const tenant = employer.workday_tenant_name;

    // Step 1: Get OAuth access token
    const tokenUrl = `${baseUrl}/ccx/oauth2/${tenant}/token`;
    const encoded = Buffer.from(employer.workday_client_id + ':' + employer.workday_client_secret).toString('base64');

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${encoded}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenRes.ok) {
      return {
        statusCode: 502,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Failed to get Workday access token: ${tokenRes.status}` })
      };
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return {
        statusCode: 502,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No access token returned from Workday' })
      };
    }

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

    // Step 2: Search for candidate by email using the REST API
    const searchUrl = `${baseUrl}/api/v1/${tenant}/recruiting/candidates?email=${encodeURIComponent(assessment.candidate_email)}&limit=1`;
    const searchRes = await fetch(searchUrl, { method: 'GET', headers });

    if (!searchRes.ok) {
      return {
        statusCode: 502,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Workday candidate search failed: ${searchRes.status}` })
      };
    }

    const searchData = await searchRes.json();
    const candidates = searchData.data || searchData.candidates || [];
    const candidate = candidates[0];

    if (!candidate) {
      return {
        statusCode: 404,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Candidate not found in Workday' })
      };
    }

    const candidateId = candidate.id || candidate.workdayID;

    // Step 3: Add a comment/note to the candidate with TypeRead data
    // This is the most universally supported way to attach data in Workday
    const noteText = [
      `TypeRead Personality Assessment`,
      `Type: ${assessment.mbti_type}`,
      `Match Score: ${assessment.match_score}%`,
      `Confidence: ${assessment.confidence_score}%`,
      `Assessed: ${assessment.completed_at || new Date().toISOString()}`
    ].join('\n');

    // Try the candidate notes/comments endpoint
    const noteUrl = `${baseUrl}/api/v1/${tenant}/recruiting/candidates/${candidateId}/notes`;
    const noteRes = await fetch(noteUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text: noteText,
        visibility: 'private'
      })
    });

    // If notes endpoint fails, try updating candidate tags/custom data
    if (!noteRes.ok) {
      // Fallback: try PATCH on the candidate directly
      const patchUrl = `${baseUrl}/api/v1/${tenant}/recruiting/candidates/${candidateId}`;
      const patchRes = await fetch(patchUrl, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          summary: `TypeRead: ${assessment.mbti_type} | Match: ${assessment.match_score}% | Confidence: ${assessment.confidence_score}%`
        })
      });

      if (!patchRes.ok) {
        const patchErr = await patchRes.text();
        return {
          statusCode: 502,
          headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `Workday update failed: ${noteRes.status} / ${patchRes.status}`, details: patchErr })
        };
      }
    }

    // Update assessment record in Supabase
    const { error: updateErr } = await supabase
      .from('assessments')
      .update({
        pushed_to_workday: true,
        workday_pushed_at: new Date().toISOString(),
        workday_candidate_id: String(candidateId)
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
      body: JSON.stringify({ success: true, workday_candidate_id: candidateId })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message })
    };
  }
};

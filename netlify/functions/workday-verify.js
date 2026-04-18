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

  try {
    const { tenantUrl, clientId, clientSecret, tenantName } = JSON.parse(event.body);

    if (!tenantUrl || !clientId || !clientSecret || !tenantName) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ valid: false, error: 'All fields are required' })
      };
    }

    // Normalize tenant URL — strip trailing slash
    const baseUrl = tenantUrl.replace(/\/+$/, '');

    // Workday OAuth 2.0 Client Credentials Grant — exchange for access token
    const tokenUrl = `${baseUrl}/ccx/oauth2/${tenantName}/token`;

    const encoded = Buffer.from(clientId + ':' + clientSecret).toString('base64');

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
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ valid: false, error: `Token request failed: ${tokenRes.status}` })
      };
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ valid: false, error: 'No access token in response' })
      };
    }

    // Verify the token works by hitting a basic endpoint
    const testUrl = `${baseUrl}/api/v1/${tenantName}/workers?limit=1`;
    const testRes = await fetch(testUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (testRes.ok) {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ valid: true })
      };
    } else {
      // Token obtained but API call failed — possibly missing permissions
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valid: false,
          error: `Connected but API test failed (${testRes.status}). Check ISU security group permissions.`
        })
      };
    }
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ valid: false, error: e.message })
    };
  }
};

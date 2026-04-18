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
    const { apiKey } = JSON.parse(event.body);

    if (!apiKey) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ valid: false, error: 'API key is required' })
      };
    }

    const encoded = Buffer.from(apiKey + ':').toString('base64');

    // Verify key by fetching users list (also captures a user ID for On-Behalf-Of)
    const response = await fetch('https://harvest.greenhouse.io/v1/users?per_page=1', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${encoded}`
      }
    });

    if (response.ok) {
      const users = await response.json();
      // Return the first site admin user ID for On-Behalf-Of header
      let userId = null;
      if (users && users.length > 0) {
        userId = String(users[0].id);
      }
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ valid: true, userId })
      };
    } else {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ valid: false })
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

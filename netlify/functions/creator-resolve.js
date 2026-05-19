// Public lookup: slug -> { displayName, websiteUrl }. No PII (email/user_id excluded).
const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const slug = (event.queryStringParameters && event.queryStringParameters.slug || '').toLowerCase();
  if (!slug) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'slug required' }) };
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('creators')
    .select('display_name, website_url')
    .eq('slug', slug)
    .maybeSingle();
  if (error) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: error.message }) };
  if (!data) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Not found' }) };
  return { statusCode: 200, headers: CORS, body: JSON.stringify({ slug, displayName: data.display_name, websiteUrl: data.website_url || null }) };
};

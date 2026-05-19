/* GET /api/v1/badge/{code}
 *
 * Returns shields.io-compatible JSON so devs can render MBTI badges via the
 * shields.io endpoint pattern:
 *   https://img.shields.io/endpoint?url=https://personality.fyi/api/v1/badge/intj
 *
 * Spec: https://shields.io/badges/endpoint-badge
 */

const COLORS = {
  INTJ: '5c6bc0', INTP: '7e57c2', ENTJ: '3949ab', ENTP: '8e24aa',
  INFJ: '26a69a', INFP: '26c6da', ENFJ: '00897b', ENFP: '43a047',
  ISTJ: '546e7a', ISFJ: '78909c', ESTJ: '37474f', ESFJ: '6d4c41',
  ISTP: 'fb8c00', ISFP: 'ef6c00', ESTP: 'e53935', ESFP: 'd81b60',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=86400, immutable',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  // Path is /api/v1/badge/{code}
  const m = (event.path || '').match(/\/badge\/([a-zA-Z]{4})\/?$/);
  if (!m) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Bad path' }) };
  const code = m[1].toUpperCase();
  if (!COLORS[code]) {
    return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Unknown type: ' + code }) };
  }
  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      schemaVersion: 1,
      label: 'MBTI',
      message: code,
      color: COLORS[code],
      labelColor: '555',
      style: 'flat',
      isError: false,
      // Click-through URL for the shields.io badge.
      namedLogo: undefined
    })
  };
};

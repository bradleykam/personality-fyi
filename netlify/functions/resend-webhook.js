// Verified Resend events are append-only; reporting deduplicates by message/outcome.
const { Webhook } = require('svix');
const { createClient } = require('@supabase/supabase-js');
const { record } = require('../lib/email-reporting');
const TYPES = new Set(['sent','delivered','delivery_delayed','bounced','complained','opened','clicked','failed','suppressed']);
exports.handler = async event => {
  if(event.httpMethod!=='POST')return {statusCode:405,body:'Method Not Allowed'};
  if(!process.env.RESEND_WEBHOOK_SECRET)return {statusCode:503,body:'Webhook verification not configured'};
  let body;
  try {
    const raw=event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body;
    body=new Webhook(process.env.RESEND_WEBHOOK_SECRET).verify(raw,event.headers||{});
  } catch {return {statusCode:400,body:'Invalid signature'};}
  const kind=String(body.type||'').replace(/^email\./,''), d=body.data||{};
  if(!TYPES.has(kind))return {statusCode:200,body:'ignored'};
  if(!d.email_id)return {statusCode:400,body:'Missing email ID'};
  const tags=Array.isArray(d.tags)?Object.fromEntries(d.tags.map(t=>[t.name,t.value])):(d.tags||{});
  try {
    const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
    let userId = null;
    // Older messages have no campaign tags. Match their recipient for failure diagnostics.
    if (!tags.pf_token) {
      const recipient=String(Array.isArray(d.to)?d.to[0]:d.to||'').toLowerCase();
      if (recipient) for(let page=1;;page++) {
        const {data,error}=await sb.auth.admin.listUsers({page,perPage:1000});
        if(error) throw error;
        const user=data.users.find(u=>(u.email||'').toLowerCase()===recipient);
        if(user){userId=user.id;break;}
        if(data.users.length<1000)break;
      }
    }
    await record(sb,'mail_webhook' ,{event_id:event.headers['svix-id'],kind,message_id:d.email_id,
      email_token:tags.pf_token||null,campaign:tags.pf_campaign||null,user_id:userId,reason:String(d.failed?.reason||d.bounce?.message||d.suppressed?.reason||'').slice(0,300)},body.created_at);
    return {statusCode:200,body:'ok'};
  } catch {return {statusCode:500,body:'Event storage failed; retry'};}
};

const {createClient}=require('@supabase/supabase-js');
const {careerFilled,TYPES}=require('../lib/product-data');
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'POST, OPTIONS'};
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return {statusCode:204,headers,body:''};
 if(event.httpMethod!=='POST')return {statusCode:405,headers,body:''};
 let b;try{b=JSON.parse(event.body||'{}');}catch{return {statusCode:400,headers,body:''};}
 const name=String(b.event||'').slice(0,64);
 if(!name||/^(mail_|server_|account_|lifecycle_)/.test(name))return {statusCode:400,headers,body:'Reserved event'};
 const props={...(b.props||{})};delete props.server_verified;delete props.user_id;
 try{
  const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
  const token=(event.headers?.authorization||event.headers?.Authorization||'').replace(/^Bearer /i,'');
  let user=null;if(token){const {data,error}=await sb.auth.getUser(token);if(error)return {statusCode:401,headers,body:''};user=data?.user;}
  props.user_id=user?.id||null;props.identity_verified=!!user;
  const row={event:name,anon_id:String(b.anonId||'').slice(0,64),path:String(b.path||'').slice(0,200),props};
  const {error}=await sb.from('funnel_events').insert(row);if(error)throw error;
  const md=user?.user_metadata||{};
  const proven=(['type_saved','result_saved'].includes(name)&&TYPES.has(md.mbti_type))?'account_type_saved':name==='relationship_context_saved'&&md.people?.some(p=>p?.n)?'account_relationship_saved':name==='career_context_saved'&&careerFilled(md)?'account_career_saved':null;
  if(proven)await require('../lib/product-events').write(proven,user.id,{event_id:props.event_id,email_token:props.email_token,email_touch_at:props.email_touch_at});
  return {statusCode:204,headers,body:''};
 }catch(e){console.error('Event storage failed',e.message);return {statusCode:503,headers,body:'Event storage unavailable'};}
};

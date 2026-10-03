// A short-lived, opaque email token connects this visit to a campaign. No email address in URLs.
(function() {
  try {
    var query = new URLSearchParams(location.search), token=query.get('pf_email');
    if(!token || !/^[a-f0-9-]{36}$/i.test(token)) return;
    var touch={token:token,at:Date.now(),campaign:query.get('utm_campaign')||''};
    sessionStorage.setItem('pf_email_touch',JSON.stringify(touch));
    var anon=localStorage.getItem('pf_anon_id');
    if(!anon){anon=crypto.randomUUID();localStorage.setItem('pf_anon_id',anon);}
    fetch('/.netlify/functions/track-event',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,
      body:JSON.stringify({event:'email_landing',anonId:anon,path:location.pathname,props:{event_id:crypto.randomUUID(),email_token:token,email_touch_at:touch.at,email_campaign:touch.campaign}})}).catch(function(){});
  } catch(e) {}
})();

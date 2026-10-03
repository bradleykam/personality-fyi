(function(){
var S={"infp-isfj":70,"esfp-intj":38,"enfp-isfj":58,"infp-isfp":80,"enfp-isfp":70,"esfp-intp":38,"estj-istp":72,"entj-infp":50,"istj-istp":78,"entj-infj":70,"estj-istj":92,"istj-istj":82,"infp-istj":44,"enfp-istj":42,"esfp-infj":46,"infp-istp":50,"esfp-infp":58,"enfp-istp":48,"entj-intp":72,"estj-isfp":46,"intj-intp":85,"estj-isfj":78,"entj-intj":86,"intj-intj":72,"infj-istp":50,"esfj-infp":62,"enfj-istp":44,"infj-istj":56,"enfj-istj":62,"esfj-infj":60,"estp-isfj":48,"entp-intj":80,"entp-intp":86,"estp-isfp":62,"intp-intp":70,"infj-isfp":64,"enfj-isfp":68,"esfj-intp":34,"infj-isfj":68,"esfj-intj":38,"enfj-isfj":80,"entp-infj":72,"estp-istj":74,"estp-istp":84,"entp-infp":64,"istp-istp":80,"enfp-esfp":76,"enfp-esfj":62,"estj-estj":78,"estj-estp":82,"enfp-estp":52,"enfp-estj":40,"entj-entj":74,"entj-entp":82,"enfj-estj":68,"enfj-estp":54,"entp-entp":68,"enfj-esfj":84,"enfj-esfp":74,"estp-estp":76,"esfp-estp":80,"enfp-enfp":68,"esfp-estj":56,"entj-esfj":48,"entj-esfp":42,"enfp-entp":78,"esfp-esfp":72,"enfp-entj":62,"entj-estj":84,"entj-estp":72,"esfj-esfj":76,"enfj-entj":72,"enfj-entp":62,"esfj-esfp":84,"entp-estp":68,"entp-estj":60,"enfj-enfj":70,"esfj-estj":82,"esfj-estp":62,"enfj-enfp":86,"entp-esfp":48,"entp-esfj":40,"isfp-istj":58,"esfp-istj":52,"enfp-infj":88,"isfp-istp":74,"infp-infp":72,"enfp-infp":86,"esfp-istp":56,"estj-intp":56,"entj-isfp":38,"intj-isfp":36,"entj-isfj":50,"estj-intj":68,"intj-isfj":48,"infp-intj":58,"enfp-intj":72,"esfp-isfj":72,"infp-intp":62,"isfp-isfp":80,"esfp-isfp":84,"enfp-intp":66,"entj-istp":64,"estj-infp":38,"intj-istp":70,"estj-infj":48,"entj-istj":80,"intj-istj":74,"infj-intp":68,"isfj-isfp":78,"esfj-isfp":68,"enfj-intp":50,"isfj-isfj":80,"infj-intj":82,"enfj-intj":60,"esfj-isfj":92,"estp-infj":38,"entp-istj":54,"intp-istj":65,"entp-istp":70,"estp-infp":36,"intp-istp":82,"isfj-istp":56,"infj-infp":82,"enfj-infp":78,"esfj-istp":42,"infj-infj":74,"isfj-istj":86,"esfj-istj":76,"enfj-infj":86,"entp-isfj":42,"estp-intj":44,"intp-isfj":42,"estp-intp":55,"entp-isfp":44,"intp-isfp":42};
var T=['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'];
function lab(s){if(s>=85)return['Highly compatible','#0a7d2c'];if(s>=70)return['Strong match','#0a7d2c'];if(s>=55)return['Workable with effort','#b8730b'];return['Challenging','#c0392b'];}
function mount(el){
  var o=T.map(function(t){return '<option>'+t+'</option>';}).join('');
  el.innerHTML='<div style="border:1.5px solid var(--accent,#d4541e);border-radius:12px;padding:18px 20px;background:#fff;font-family:\'DM Mono\',monospace">'+
    '<div style="font-size:15px;font-weight:700;margin-bottom:4px">MBTI Compatibility Calculator</div>'+
    '<div style="font-size:12px;color:var(--muted,#7a7670);margin-bottom:12px">Pick any two of the 16 types for an instant compatibility score.</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'+
    '<select id="cc-a" style="font-family:inherit;font-size:14px;padding:8px 10px;border:1px solid var(--border,#d4cfc7);border-radius:8px;background:var(--cream,#f6f4ef)">'+o+'</select>'+
    '<span style="font-weight:700;color:var(--muted,#7a7670)">+</span>'+
    '<select id="cc-b" style="font-family:inherit;font-size:14px;padding:8px 10px;border:1px solid var(--border,#d4cfc7);border-radius:8px;background:var(--cream,#f6f4ef)">'+o+'</select>'+
    '<button id="cc-go" style="font-family:inherit;font-size:13px;font-weight:700;padding:9px 16px;border:none;border-radius:8px;background:var(--ink,#0e0e0e);color:#fff;cursor:pointer">Check →</button>'+
    '</div><div id="cc-res" style="margin-top:14px"></div></div>';
  var A=el.querySelector('#cc-a'),B=el.querySelector('#cc-b');
  A.selectedIndex=0;B.selectedIndex=4;
  el.querySelector('#cc-go').onclick=function(){calc(el);};
}
function calc(el){
  var a=el.querySelector('#cc-a').value.toLowerCase(),b=el.querySelector('#cc-b').value.toLowerCase();
  var key=(S[a+'-'+b]!=null)?a+'-'+b:((S[b+'-'+a]!=null)?b+'-'+a:null);
  var res=el.querySelector('#cc-res');
  if(key==null){res.textContent='No data for that pair.';return;}
  var s=S[key],L=lab(s),A=a.toUpperCase(),B=b.toUpperCase();
  res.innerHTML='<div style="display:flex;align-items:baseline;gap:10px"><span style="font-size:34px;font-weight:700;color:'+L[1]+'">'+s+'</span><span style="font-size:14px;color:var(--muted,#7a7670)">/100</span><span style="font-size:14px;font-weight:700;color:'+L[1]+'">'+L[0]+'</span></div>'+
    '<a href="/blog/'+key+'-compatibility" style="display:inline-block;margin-top:8px;font-size:13px;font-weight:700;color:var(--accent,#d4541e)">Read the full '+A+' + '+B+' breakdown →</a>';
}
function init(){var els=document.querySelectorAll('#compat-calc,.compat-calc');for(var i=0;i<els.length;i++){mount(els[i]);}}
if(document.readyState!=='loading')init();else document.addEventListener('DOMContentLoaded',init);
})();
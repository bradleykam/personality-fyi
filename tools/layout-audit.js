// Run read-only in browser previews at desktop, tablet, and phone widths.
// Returns actionable failures; ignores intentional fixed/sticky overlays.
function auditPageLayout() {
  const visible=el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
  const rect=el=>el.getBoundingClientRect();
  const failures=[];
  document.querySelectorAll('.cha-layout,.you-overview-layout,#career-overview').forEach(parent=>{
    if(!visible(parent))return;
    const children=[...parent.children].filter(el=>visible(el)&&!['fixed','absolute'].includes(getComputedStyle(el).position));
    for(let i=0;i<children.length;i++)for(let j=i+1;j<children.length;j++){
      const a=rect(children[i]),b=rect(children[j]);
      if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2)failures.push('Overlapping content: '+children[i].className+' / '+children[j].className);
    }
    children.forEach(el=>{
      if(getComputedStyle(el).overflowY==='visible'&&el.scrollHeight>el.clientHeight+4)failures.push('Content exceeds allocated height: '+(el.id||el.className));
    });
  });
  document.querySelectorAll('.cha-input-bar').forEach(el=>{if(!visible(el))return;const r=rect(el);if(r.left<0||r.right>innerWidth+1||r.bottom>innerHeight+1)failures.push('Composer outside viewport');});
  if(document.documentElement.scrollWidth>innerWidth+2)failures.push('Horizontal page overflow');
  return failures;
}
if(typeof module!=='undefined')module.exports=auditPageLayout;

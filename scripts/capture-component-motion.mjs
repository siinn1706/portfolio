import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { installMotionAudit } from './measure-materials.mjs';

// Visual evidence only: exact native WAAPI positions are deliberately paused.
// Separate unpaused recordVideo + CDP traces below are never used as FPS metrics.
const root = path.resolve(process.env.OUTPUT_DIR || 'dist');
const out = path.resolve(process.env.VISUAL_REPORT_DIR || path.join(process.env.QA_REPORT_DIR || '.qa/local', 'final-visual'));
const expected = process.env.EXPECTED_ARTIFACT_SHA256;
const material = process.env.MOTION_MATERIAL || 'expressive-css';
if (!['baseline-b', 'expressive-css', 'expressive-refractive', 'solid'].includes(material)) throw Error('Unknown MOTION_MATERIAL.');
async function walk(dir) { return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]))).flat(); }
async function hash(dir) { const h = createHash('sha256'); for (const f of (await walk(dir)).sort()) h.update(path.relative(dir,f).replaceAll('\\','/')).update('\0').update(await readFile(f)); return h.digest('hex'); }
await mkdir(out,{recursive:true});
const artifact = await hash(root);
if (expected && artifact !== expected) throw new Error(`Unexpected artifact: ${artifact}`);
const types = { '.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml' };
const server = createServer(async (req,res) => { try { let file=path.resolve(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)); if(file!==root&&!file.startsWith(root+path.sep)) throw 0; if((await stat(file)).isDirectory()) file=path.join(file,'index.html'); const body=await readFile(file); res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(body); } catch { res.writeHead(404).end('Not found'); } });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
let browser;
const videoOnly=process.env.VISUAL_MODE==='videos';
const prior = videoOnly && existsSync(path.join(out,'manifest.json')) ? JSON.parse(await readFile(path.join(out,'manifest.json'),'utf8')) : null;
if (prior && (prior.artifactSha256 !== artifact || prior.material !== material)) { await new Promise(r=>server.close(r)); throw Error('Video continuation must match the existing artifact and material; use a new report directory.'); }
const manifest=prior || { createdAt:new Date().toISOString(), artifactSha256:artifact, sourceSha256:await hash(path.resolve(process.env.SOURCE_DIR || '.','src')), node:process.version, executablePath, material, scenes:[], videos:[], errors:[], method:'Named component-motion and glass-motion WAAPI effects are paused only in explicitly static scenes. Start=0ms including backwards fill; midpoint=delay + 40% duration; settled=finished effects removed. Every document WAAPI/CSS effect is recorded with owner/type, including effects not paused. Static SSR reference is separately labelled. Static staging uses programmatic positioning. Images are warmed and decoded for visual review, never for performance measurements. Separate videos use native wheel/touch scrolling and real unpaused timelines; no FPS or continuous-review acceptance claim.' };
const profiles=[{name:'desktop',viewport:{width:1440,height:1000},deviceScaleFactor:1,isMobile:false,hasTouch:false},{name:'coarse',viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}];
if(prior){await writeFile(path.join(out,`prior-manifest-${Date.now()}.json`),JSON.stringify(manifest,null,2));manifest.previousCaptureErrors=manifest.errors;manifest.errors=[];manifest.priorVideos=manifest.videos;manifest.videos=[];}
manifest.harnessSha256=createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
manifest.sharedAuditSha256=createHash('sha256').update(await readFile(new URL('./measure-materials.mjs',import.meta.url))).digest('hex');
manifest.profiles=profiles;
const active='[data-open-desk]:not([hidden])';
const featuredOwners=`${active},.project-choices`;
async function contextFor(profile,extra={}) {
 const context=await browser.newContext({baseURL:origin,...profile,name:undefined,reducedMotion:'no-preference',serviceWorkers:'block',...extra});
 await context.addInitScript(installMotionAudit);
 await context.addInitScript(material=>{const apply=()=>{if(!document.documentElement)return false;document.documentElement.dataset.material=material;document.documentElement.dataset.glassLayout='foreground';return true;};if(!apply()){const observer=new MutationObserver(()=>{if(apply())observer.disconnect();});observer.observe(document,{childList:true});}},material);
 return context;
}
async function instrument(page,pause=true) { await page.addInitScript(pause=>{ window.visualPause=pause; window.visualRecords=[]; window.visualErrors=[]; addEventListener('unhandledrejection',e=>window.visualErrors.push(String(e.reason))); const original=Element.prototype.animate; Element.prototype.animate=function(...args){ const created=performance.now(),animation=original.apply(this,args),target=this; queueMicrotask(()=>{ const named=/^(component-motion|glass-motion):/.test(animation.id); const record={id:animation.id,owner:named?animation.id.split(':')[0]:'unprefixed-waapi',kind:target.getAttribute('data-component-motion'),target,animation,keyframes:animation.effect.getKeyframes(),timing:animation.effect.getTiming(),created};window.visualRecords.push(record);if(window.visualPause&&named){animation.pause();animation.currentTime=0;} });return animation; }; },pause); }
async function warm(page,selector='body') { await page.evaluate(async selector=>{ await document.fonts.ready; const roots=[...document.querySelectorAll(selector)];const images=[...new Set(roots.flatMap(el=>el.matches('img')?[el]:[...el.querySelectorAll('img')]))]; await Promise.all(images.map(async img=>{ img.loading='eager'; if(!img.complete)await new Promise((resolve,reject)=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',()=>reject(new Error('Image failed: '+img.src)),{once:true});}); if(!img.naturalWidth)throw Error('Empty image: '+img.src);await img.decode();})); },selector); }
async function scroll(page,selector) { await page.locator(selector).first().evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'})); }
async function finish(page) { await page.evaluate(()=>{window.visualPause=false;document.getAnimations().filter(a=>/^(component-motion|glass-motion):/.test(a.id)).forEach(a=>a.finish());}); await page.waitForTimeout(720); }
async function owned(page,selector,position) { return page.evaluate(({selector,position})=>{const roots=[...document.querySelectorAll(selector)];const targetMatch=t=>t instanceof Node&&roots.some(r=>r===t||r.contains(t));const effects=document.getAnimations().filter(a=>/^(component-motion|glass-motion):/.test(a.id));for(const a of effects){if(!targetMatch(a.effect.target)){a.finish();continue;}a.pause();const t=a.effect.getTiming();a.currentTime=position==='start'?0:Number(t.delay)+Number(t.duration)*.4;}return effects.filter(a=>targetMatch(a.effect.target)).length;},{selector,position}); }
async function snapshot(page,name,stage,selector) {const file=`${name}-${stage}.png`;await page.screenshot({path:path.join(out,file)}); const state=await page.evaluate(selector=>{const roots=[...document.querySelectorAll(selector)];return {url:location.href,material:{...document.documentElement.dataset},viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,coarse:matchMedia('(pointer:coarse)').matches,hover:matchMedia('(hover:hover)').matches},scrollY,overflow:document.documentElement.scrollWidth>innerWidth,groups:roots.flatMap(el=>[el,...el.querySelectorAll('[data-component-motion],[data-glass-backing],[data-glass-rim],[data-glass-selector]')]).filter(el=>el.getClientRects().length).map(el=>({tag:el.tagName,kind:el.getAttribute('data-component-motion'),glass:{backing:el.hasAttribute('data-glass-backing'),rim:el.hasAttribute('data-glass-rim'),selector:el.hasAttribute('data-glass-selector')},text:el.textContent?.trim().slice(0,90),transform:getComputedStyle(el).transform,opacity:getComputedStyle(el).opacity,backdropFilter:getComputedStyle(el).backdropFilter})),images:roots.flatMap(el=>[...el.querySelectorAll('img')]).map(img=>({src:img.currentSrc,complete:img.complete,width:img.naturalWidth})),effects:document.getAnimations().map(a=>({id:a.id,type:a.constructor.name,kind:a.effect?.target?.getAttribute?.('data-component-motion'),target:a.effect?.target?.className,playState:a.playState,time:a.currentTime,timing:a.effect?.getTiming(),keyframes:a.effect?.getKeyframes()})),audit:window.__motionAudit?.snapshot()};},selector); return {file,stage,...state};}
async function entry(profile,locale,scene,route,selector,{initial=false,detail=false}={}) {
 const name=`${locale}-${profile.name}-${scene}`, record={name,kind:'entry',captures:[]};manifest.scenes.push(record); const context=await contextFor(profile);const page=await context.newPage();await instrument(page);
 try {await page.goto(`/${locale}/${route}`,{waitUntil:'domcontentloaded'});await warm(page,selector);if(!initial) {record.captures.push(await snapshot(page,name,'before-scroll',selector));await scroll(page,selector);} for(let attempt=0;attempt<12;attempt++){const count=await owned(page,selector,'start');if(count){record.ownedCount=count;break;}await page.waitForTimeout(30);} if(!record.ownedCount)throw Error('No actual owned effect for '+name);record.captures.push(await snapshot(page,name,'start',selector));await owned(page,selector,'mid');record.captures.push(await snapshot(page,name,'mid',selector));await finish(page);record.captures.push(await snapshot(page,name,'settled',selector));if(detail){const file=`${name}-full-group.png`;await page.locator(selector).first().screenshot({path:path.join(out,file)});record.detail=file;} record.records=await page.evaluate(()=>window.visualRecords.map(({target,animation,...r})=>r));record.errors=await page.evaluate(()=>window.visualErrors);
 } finally {await context.close();}
 // Native no-script initial reference is not a fabricated pre-animation frame.
 if(initial){const ssr=await contextFor(profile,{javaScriptEnabled:false});const p=await ssr.newPage();try{await p.goto(`/${locale}/${route}`);await warm(p,selector);record.captures.unshift(await snapshot(p,name,'before-ssr-reference',selector));}finally{await ssr.close();}}
 console.log(name);await writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
}
async function featured(profile,locale) {
 const context=await contextFor(profile);const page=await context.newPage();await instrument(page,false);try {await page.goto(`/${locale}/`);await warm(page);await scroll(page,'[data-featured-projects]');await finish(page);
 for(const project of ['quan-ly-kho','healthos']){await page.locator(`button[data-project-choice="${project}"]`).click();await warm(page,active);await finish(page);}
 for(const kind of ['project','tab']){const name=`${locale}-${profile.name}-featured-${kind}`,record={name,kind,captures:[]};manifest.scenes.push(record);await scroll(page,active);record.captures.push(await snapshot(page,name,'before',featuredOwners));await page.evaluate(()=>window.visualPause=true);if(kind==='project')await page.locator('button[data-project-choice="quan-ly-kho"]').click();else await page.locator(`${active} [data-panel="context"]`).click();await warm(page,active);record.ownedCount=await owned(page,featuredOwners,'start');if(!record.ownedCount)throw Error('No owned featured '+name);record.captures.push(await snapshot(page,name,'start',featuredOwners));await owned(page,featuredOwners,'mid');record.captures.push(await snapshot(page,name,'mid',featuredOwners));await finish(page);record.captures.push(await snapshot(page,name,'settled',featuredOwners));console.log(name);}
 }finally{await context.close();} }
async function menu(profile,locale){const context=await contextFor(profile);const page=await context.newPage();await instrument(page,false);try{await page.goto(`/${locale}/`);await warm(page,'.hero');await finish(page);const name=`${locale}-${profile.name}-menu`,record={name,captures:[]};manifest.scenes.push(record);record.captures.push(await snapshot(page,name,'before','.site-header'));await page.evaluate(()=>window.visualPause=true);await page.locator('[data-menu-toggle]').click();await owned(page,'.header-controls','start');record.captures.push(await snapshot(page,name,'start','.site-header'));await owned(page,'.header-controls','mid');record.captures.push(await snapshot(page,name,'mid','.site-header'));await finish(page);record.captures.push(await snapshot(page,name,'settled','.site-header'));}finally{await context.close();}}
async function modes(profile,locale){for(const mode of ['reduced','off']){const context=await contextFor(profile,{reducedMotion:mode==='reduced'?'reduce':'no-preference'});const p=await context.newPage();if(mode==='off')await p.addInitScript(()=>{new MutationObserver(()=>{if(document.documentElement)document.documentElement.dataset.motionOff='true';}).observe(document,{childList:true,subtree:true});});try{await p.goto(`/${locale}/`);await warm(p);const name=`${locale}-${profile.name}-${mode}`;manifest.scenes.push({name,mode,captures:[await snapshot(p,name,'hero','.hero')]});await scroll(p,'[data-featured-projects]');await p.locator('button[data-project-choice="quan-ly-kho"]').click();await warm(p,active);manifest.scenes.at(-1).captures.push(await snapshot(p,name,'featured',active));}finally{await context.close();}}}
async function nativeScrollTo(page,cdp,profile,selector) {
 const inputs=[];
 for(let leg=0;leg<30;leg++){
  const delta=await page.locator(selector).first().evaluate(el=>{const r=el.getBoundingClientRect();return r.top+r.height/2-innerHeight/2;});
  const position=await page.evaluate(()=>({y:scrollY,max:document.documentElement.scrollHeight-innerHeight}));
  if(Math.abs(delta)<80||(delta>0&&position.y>=position.max-2)||(delta<0&&position.y<=2)) return {inputs,settledScroll:position.y};
  const direction=Math.sign(delta),distance=Math.min(Math.abs(delta),profile.viewport.height*.58);
  if(profile.hasTouch){
   const x=Math.round(profile.viewport.width*.5),fromY=Math.round(profile.viewport.height*(direction>0?.83:.17));
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:fromY}]});
   for(let step=1;step<=20;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:fromY-direction*distance*step/20}]});await page.waitForTimeout(20);}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   inputs.push({type:'cdp-touch',direction,distance});
  }else{await page.mouse.wheel(0,direction*distance);inputs.push({type:'wheel',direction,distance});}
  await page.waitForTimeout(180);
 }
 throw Error('Native scroll did not reach '+selector);
}
async function video(profile){
 const context=await contextFor(profile,{recordVideo:{dir:out,size:profile.viewport}}),page=await context.newPage();
 await instrument(page,false);const cdp=await context.newCDPSession(page),name=`vi-${profile.name}-unpaused-journey`,actions=[];
 await cdp.send('Tracing.start',{categories:'toplevel,devtools.timeline,blink.user_timing',transferMode:'ReturnAsStream'});
 try{
  for(const [route,selectors] of [['',['.hero','[data-featured-projects]','#contact']],['work/',['.work-list']],['work/healthos/',['.case-heading','.case-output']],['work/quan-ly-kho/',['.case-heading','.case-output']],['about/',['.about-story','.about-topic-list']]]){
   await page.goto(`/vi/${route}`,{waitUntil:'domcontentloaded'});await warm(page);await page.waitForTimeout(800);
   if(profile.hasTouch&&route===''){
    for(const action of ['open','close']){await page.locator('[data-menu-toggle]').click();await page.waitForTimeout(500);actions.push({route,menu:action,state:await page.locator('[data-menu-toggle]').getAttribute('aria-expanded')});}
   }
   for(const selector of selectors){
    const nativeInput=await nativeScrollTo(page,cdp,profile,selector);await page.waitForTimeout(800);
    if(selector==='[data-featured-projects]'){
     for(const choice of ['quan-ly-kho','healthos']){await page.locator(`button[data-project-choice="${choice}"]`).click();await warm(page,active);await page.waitForTimeout(500);}
     await page.locator(`${active} [data-panel="context"]`).click();await page.waitForTimeout(500);
    }
    const file=`${name}-${route.replaceAll('/','-')||'home'}-${selector.replaceAll(/[^a-z]/g,'')}.png`;
    await page.screenshot({path:path.join(out,file)});actions.push({route,selector,file,nativeInput});
   }
   actions.push({route,material:await page.evaluate(()=>({...document.documentElement.dataset})),records:await page.evaluate(()=>window.__motionAudit.scan().map(r=>({...r}))),cssEvents:await page.evaluate(()=>window.__motionAudit.events)});
  }
 }finally{
  const done=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');const {stream}=await done;let trace='';
  for(;;){const chunk=await cdp.send('IO.read',{handle:stream});trace+=chunk.data;if(chunk.eof)break;}await cdp.send('IO.close',{handle:stream});
  await writeFile(path.join(out,name+'.trace.json'),trace);const video=page.video();await context.close();const file=name+'.webm';await video.saveAs(path.join(out,file));
  manifest.videos.push({name,file,trace:name+'.trace.json',actions,unpaused:true,nativeScroll:true,continuousReview:'not scored by capture'});console.log(name);
 }
}
try{browser=await chromium.launch({executablePath});manifest.browser=browser.version();
if(!videoOnly)for(const profile of profiles)for(const locale of ['vi','en']){
 await entry(profile,locale,'hero','','.hero',{initial:true});
 await entry(profile,locale,'featured-entry','','[data-open-desk]:not([hidden])');
 await featured(profile,locale);
 await entry(profile,locale,'work-rows','work/','.work-list',{initial:true});
 await entry(profile,locale,'about-story','about/','.about-story',{initial:true});
 await entry(profile,locale,'about-portrait','about/','.about-portrait');
 await entry(profile,locale,'about-topics','about/','.about-topic-list');
 for(const project of ['healthos','quan-ly-kho']){await entry(profile,locale,`${project}-heading`,`work/${project}/`,'.case-heading',{initial:true});await entry(profile,locale,`${project}-evidence`,`work/${project}/`,'.case-output .evidence-figure',{detail:true});}
 await entry(profile,locale,'contact','','#contact');if(profile.hasTouch)await menu(profile,locale);await modes(profile,locale);
}
for(const profile of profiles)await video(profile);
}catch(error){manifest.errors.push(String(error.stack||error));console.error(error);}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));manifest.finalArtifactSha256=await hash(root);manifest.finalSourceSha256=await hash(path.resolve(process.env.SOURCE_DIR || '.','src'));manifest.closedAt=new Date().toISOString();manifest.passed=!manifest.errors.length&&manifest.finalArtifactSha256===artifact&&manifest.finalSourceSha256===manifest.sourceSha256;await writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({closed:true,passed:manifest.passed,scenes:manifest.scenes.length,out}));}
if(!manifest.passed)process.exitCode=1;

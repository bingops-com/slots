import { chromium } from 'playwright-core';
import axe from 'axe-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.SLOTS_URL ?? 'http://127.0.0.1:55462';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) throw new Error('Regression tests require an isolated loopback server');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? ['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].find(existsSync), args:['--no-sandbox'] });
const report = { scenarios:[], accessibility:[], errors:[] };
const output = process.env.SLOTS_E2E_REPORT_DIR ?? '/tmp/slots-regressions';
mkdirSync(output,{recursive:true});
const check = (ok,message) => { if (!ok) throw new Error(message); };
const games = ['bass','beard','bounty','neptune','reef','dogs','blackjack','bjtable','holdem','roulette','dice','mines','plinko','crash'];
const sizes = [[320,700],[390,844],[844,390],[1366,768]];
async function context(options={}) {
  const ctx=await browser.newContext({locale:'fr-FR',reducedMotion:'reduce',serviceWorkers:'block',...options});
  ctx.on('page',p=>p.on('pageerror',e=>report.errors.push(e.message)));
  return ctx;
}
async function ready(page,path='/') {
  await page.goto(base+path);
  await page.locator('.sound').first().waitFor({state:'attached'});
  if (path.startsWith('/g/')) await page.waitForFunction(()=>document.querySelector('.game')?.children.length>0);
}
async function menu(page) { const b=page.locator('.burger');if(await b.isVisible() && await b.getAttribute('aria-expanded')==='false')await b.click(); }
async function audit(page,label) {
  await page.evaluate(()=>document.fonts.ready);
  await page.addScriptTag({content:axe.source});
  const issues=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))issues.push({id:'horizontal-overflow'});
  report.accessibility.push({label,issues});
  if(issues.length)console.log(`A11Y ${label}: ${JSON.stringify(issues)}`);
}
async function scenario(name,work) {
  try { await work(); report.scenarios.push({name,passed:true});console.log(`ok ${name}`); }
  catch(e){report.scenarios.push({name,passed:false,error:e.message});console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`);}
}
try {
  await scenario('historical artwork and all game pages',async()=>{
    for(const [width,height] of sizes)for(const colorScheme of ['light','dark']) {
      const ctx=await context({viewport:{width,height},colorScheme});const page=await ctx.newPage();
      try {
        for(const path of ['/','/classement/',...games.map(id=>`/g/${id}/`)]) {
          await ready(page,path);await audit(page,`${width} ${colorScheme} ${path}`);
          const broken=await page.locator('img').evaluateAll(images=>images.filter(i=>i.complete&&!i.naturalWidth).map(i=>new URL(i.src).pathname));
          check(!broken.length,`broken assets: ${broken.join(',')}`);
        }
        await page.screenshot({path:`${output}/page-${width}-${colorScheme}.png`});
      } finally {await ctx.close();}
    }
  });
  await scenario('closable dialogs and mobile navigation',async()=>{
    for(const [width,height] of sizes) {
      const ctx=await context({viewport:{width,height}});const p=await ctx.newPage();
      try {
        await ready(p);await menu(p);
        for(const [name,method] of [['Se connecter','close'],['Créer un compte','escape'],['Se connecter','backdrop']]) {
          await menu(p);await p.getByRole('button',{name,exact:true}).first().click();
          const dialog=p.getByRole('dialog');await dialog.waitFor();await audit(p,`${width} ${name}`);
          await dialog.getByRole('button',{name:'Fermer la fenêtre',exact:true}).focus();
          await p.keyboard.press('Shift+Tab');
          check(await dialog.evaluate(el=>el.contains(document.activeElement)),'focus escaped the dialog');
          for(let i=0;i<8;i++)await p.keyboard.press('Tab');
          check(await dialog.evaluate(el=>el.contains(document.activeElement)),'Tab escaped the dialog');
          if(method==='close')await dialog.getByRole('button',{name:'Fermer la fenêtre',exact:true}).click();
          else if(method==='escape')await p.keyboard.press('Escape');
          else await p.mouse.click(2,2);
          await dialog.waitFor({state:'detached'});
        }
        if(await p.locator('.burger').isVisible()) {
          await menu(p);await p.keyboard.press('Escape');
          check(await p.locator('.burger').getAttribute('aria-expanded')==='false','Escape did not close the menu');
          check(await p.locator('.burger').evaluate(el=>document.activeElement===el),'menu focus was not restored');
        }
        await ready(p,'/g/dice/');await p.getByRole('button',{name:'Plein écran',exact:true}).click();
        await p.keyboard.press('Escape');
        await p.waitForFunction(()=>!document.documentElement.classList.contains('immersive'));
      } finally {await ctx.close();}
    }
  });
  await scenario('several blackjack hands and seat selection',async()=>{
    const ctxs=[await context(),await context()];const ps=await Promise.all(ctxs.map(c=>c.newPage()));
    try {
      for(const p of ps) {
        await ready(p);await p.getByRole('button',{name:'Créer un compte',exact:true}).first().click();
        const dialog=p.getByRole('dialog');await dialog.locator('[name=name]').fill('e2e_'+Math.random().toString(36).slice(2,9));
        await dialog.locator('[name=password]').fill('synthetic slots password');await dialog.getByRole('button',{name:'Créer le compte',exact:true}).click();
        await dialog.waitFor({state:'detached'});await ready(p,'/g/bjtable/');await p.locator('.tb-stage').waitFor();
      }
      const [host,guest]=ps;
      await host.locator('[data-pos="4"]').click();await host.locator('.tb-seat.you').waitFor();
      await host.locator('[data-pos="0"]').click();await host.waitForFunction(()=>document.querySelectorAll('.tb-seat.you').length===2);
      await guest.locator('[data-pos="2"]').click();await guest.locator('.tb-seat.you').waitFor();
      check(await host.locator('.tb-seat').count()===5,'five betting spots were not preserved');
      await host.locator('.tb-panel .play').click();await guest.locator('.tb-panel .play').click();
      await host.waitForFunction(()=>document.querySelectorAll('.tb-seat.you .pcard').length>=4);
      const rank=await host.evaluate(async()=>{const r=await fetch('/api/table');return r.status===200?await r.json():null;});
      if(rank) check(rank.table.seats.filter(s=>s.you).map(s=>s.pos).join() === '0,4','the selected hands were assigned to different seats');
      for(const [width,height] of sizes)for(const colorScheme of ['light','dark']) {
        await host.setViewportSize({width,height});await host.emulateMedia({colorScheme});
        await audit(host,`${width} ${colorScheme} multiplayer blackjack`);
      }
      await host.screenshot({path:`${output}/blackjack-multiple-hands.png`});
    } finally {for(const c of ctxs)await c.close();}
  });
  await scenario('offline practice uses the WASM engine',async()=>{
    const ctx=await context({serviceWorkers:'allow'});const p=await ctx.newPage();
    try {
      await ready(p,'/g/dice/');await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
      await ctx.setOffline(true);await p.reload();await p.locator('.dice-stage').waitFor();
      await p.locator('.game .play').click();await p.locator('#d-result').waitFor();
      check((await p.locator('#d-result').innerText()).length>0,'offline practice produced no roll');
    } finally {await ctx.close();}
  });
  await scenario('repayment preview, confirmation and mobile dialog',async()=>{
    for(const [width,height] of sizes)for(const colorScheme of ['light','dark']) {
      const ctx=await context({viewport:{width,height},colorScheme});const p=await ctx.newPage();
      try {
        // Browser-only HTTP fixtures. Atomicity, session/origin checks and the
        // real database are covered by TestRepaymentAPIAndConcurrentRequests.
        let paid=false, requests=0;
        const before={name:'RepaymentDemo',balance:200000,stake:0,loot:200000,debt:100000,banked:0,score:100000,wagered:100,rounds:1,rebuys:1,best:null,canAdvance:false,limits:{min:10,max:500000,start:1000000,advance:100000}};
        const after={...before,balance:187500,loot:187500,debt:87500,banked:12500,score:112500};
        await ctx.addInitScript(()=>localStorage.setItem('slots.signed','1'));
        await p.route('**/api/me',route=>route.fulfill({json:{user:paid?after:before,active:{}}}));
        await p.route('**/api/repay',async route=>{
          check(route.request().method()==='POST','repayment was not a POST');
          check(route.request().postDataJSON().amount===12500,'decimal credits were not converted to integer cents');
          requests++;paid=true;await route.fulfill({json:{user:after,repaid:12500}});
        });
        await ready(p,'/g/dice/');await menu(p);
        await p.getByRole('button',{name:'Rembourser',exact:true}).filter({visible:true}).click();
        const dialog=p.getByRole('dialog',{name:'Rembourser sa dette'});await dialog.waitFor();
        const field=dialog.getByRole('textbox',{name:'Montant à rembourser'});
        await field.fill('1000,01');check(await dialog.getByRole('button',{name:'Confirmer le remboursement',exact:true}).isDisabled(),'repayment above debt accepted');
        await field.fill('125,00');
        check((await dialog.locator('[data-testid="repay-after-balance"]').innerText()).replace(/\s/g,'')==='1875,00','balance preview is wrong');
        check((await dialog.locator('[data-testid="repay-after-score"]').innerText()).replace(/\s/g,'')==='1125,00','score preview is wrong');
        await audit(p,`${width} ${colorScheme} repayment dialog`);
        await p.keyboard.press('Escape');await dialog.waitFor({state:'detached'});check(requests===0,'cancelling repaid money');
        await menu(p);await p.getByRole('button',{name:'Rembourser',exact:true}).filter({visible:true}).click();
        await dialog.getByRole('textbox',{name:'Montant à rembourser'}).fill('125.00');
        await dialog.getByRole('button',{name:'Confirmer le remboursement',exact:true}).click();
        await dialog.waitFor({state:'detached'});check(requests===1,'repayment was submitted more than once');
        await p.reload();await menu(p);await p.getByRole('button',{name:'Rembourser',exact:true}).filter({visible:true}).click();
        check((await dialog.locator('[data-testid="repay-debt"]').innerText()).replace(/\s/g,'')==='875,00','debt was not refreshed after reload');
        await dialog.getByRole('button',{name:'Fermer la fenêtre',exact:true}).click();
        await dialog.waitFor({state:'detached'});
      } finally {await ctx.close();}
    }
  });
} finally {
  await browser.close();writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));
}
const failures=report.scenarios.filter(s=>!s.passed).length+report.accessibility.filter(s=>s.issues.length).length+report.errors.length;
console.log(`${report.scenarios.length} scenarios, ${report.accessibility.length} accessibility states, ${failures} failing checks`);
process.exitCode=failures?1:0;

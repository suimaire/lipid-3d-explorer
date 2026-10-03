/* Focused visual QA; use the same existing Playwright runtime as browser QA. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : "playwright");
const out = resolve(process.env.QA_OUT || "docs/qa/membrane-interior/after"); await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:"chrome"})});
const errors=[],report={screenshots:[],errors};
try{
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1150},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.QA_URL||'http://127.0.0.1:4173/?qa');
    await page.locator('#canvas-membrane.canvas-wrap--ok').waitFor();
    if(await page.locator('[data-m1="spin"]').getAttribute('aria-pressed')==='true')await page.locator('[data-m1="spin"]').click();
    await page.locator('[data-m1="interior"]').click();
    await page.waitForFunction(()=>document.querySelector('#canvas-membrane').dataset.view==='interior'&&document.querySelector('#canvas-membrane').getAttribute('aria-busy')==='false');
    const modes=mobile?['overview','triad']:['overview','sarcolemma','cross-section','tubule','lumen','sr','sr-lumen','cisterna','triad','triad-detail','membrane-zoom','compare'];
    for(const mode of modes){
      await page.locator(`[data-m1="interior-${mode}"]`).first().click();
      await page.waitForTimeout(1700);
      const name=`${mobile?'mobile':'desktop'}-${mode}`;
      await page.locator('#canvas-membrane').screenshot({path:resolve(out,name+'.png')});
      if(mode==='overview'||mode==='triad'||mode==='compare')await page.locator('#module-membrane .module__body').screenshot({path:resolve(out,name+'-layout.png')});
      report.screenshots.push(name);
    }
    report[mobile?'mobile':'desktop']=await page.locator('#qa-metrics pre').textContent();
    await context.close();
  }
}finally{await writeFile(resolve(out,'capture-report.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({screenshots:report.screenshots.length,errors}));

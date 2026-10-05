const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:720,height:1280}});
await p.goto('file://'+__dirname+'/cards.html'); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(300);
for (const id of ['open','brand','end']) await (await p.$('#'+id)).screenshot({path:`out/card-${id}.png`});
for (const id of ['chip1','chip2','chip3','chip4']) await (await p.$('#'+id)).screenshot({path:`out/${id}.png`,omitBackground:true});
console.log(await p.evaluate(()=>[...document.fonts].map(f=>f.family+':'+f.status).join(',')));await b.close();})();

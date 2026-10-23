#!/usr/bin/env node
// Read-only Mercado Livre login/origin compatibility check for an authorized
// persistent Linux Chrome. No scraping, affiliate-link generation, DB,
// Telegram/WhatsApp, credential export, or action triggering.
// CDP is *only* loopback. Returns aggregate status flags, never URLs,
// cookies, headers, identifiers, page body, tokens or screenshots.
const PORT=Number(process.env.MAVURI_CHROME_PORT||9222);
const report={
  mode:"read_only",no_publication:true,no_links_generated:true,
  no_database_writes:true,no_cookies_logged:true,
  chrome_cdp:false,hub_http:null,home_http:null,
  login_redirect:false,hub_authenticated:false,
  both_403:false,status:"not_checked"
};
let browser,context;
const print=()=>console.log(JSON.stringify(report,null,2));
try{
  if(!Number.isSafeInteger(PORT)||PORT<1024||PORT>65535)
    throw Error("invalid_local_port");
  // Import only after validating local port. No connection to a remote CDP.
  const {chromium}=await import("playwright-core");
  browser=await chromium.connectOverCDP("http://127.0.0.1:"+PORT,{timeout:8000});
  report.chrome_cdp=true;
  context=browser.contexts()[0];
  if(!context)throw Error("browser_context_missing");
  const hub=await context.newPage();
  try{
    const response=await hub.goto(
      "https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true",
      {waitUntil:"domcontentloaded",timeout:18000});
    report.hub_http=response?.status()??null;
    const location=new URL(hub.url());
    report.login_redirect=location.hostname!=="www.mercadolivre.com.br" ||
      /login|signin|entrar|identification|auth/i.test(location.pathname);
    if(report.hub_http===200&&!report.login_redirect){
      // Read a small collection of *boolean* cues after hydration; do not
      // extract account content or display identifiers.
      await hub.waitForTimeout(1800);
      const body=String(await hub.locator("body").innerText({timeout:4000})
        .catch(()=>"")).toLowerCase();
      report.hub_authenticated=body.includes("central de afiliados") ||
        body.includes("produtos selecionados");
    }
  }catch{
    report.status="hub_navigation_failed";
  }finally{await hub.close();}
  // Exactly one additional GET, only if Hub was denied. 403 on two unrelated
  // pages suggests an origin restriction, but is not definitive proof of one.
  if(report.hub_http===403){
    const home=await context.newPage();
    try{
      const response=await home.goto("https://www.mercadolivre.com.br/",
        {waitUntil:"domcontentloaded",timeout:14000});
      report.home_http=response?.status()??null;
    }catch{}finally{await home.close();}
  }
  report.both_403=report.hub_http===403&&report.home_http===403;
  report.status=report.both_403?"denied_both":
    report.hub_authenticated?"authorized_hub":
    report.hub_http===403?"hub_forbidden":
    report.login_redirect?"login_required":
    report.status==="hub_navigation_failed"?"hub_navigation_failed":"hub_not_verified";
  if(!report.hub_authenticated)process.exitCode=2;
}catch(e){
  report.status=e?.message==="invalid_local_port"?"invalid_local_port":
    e?.message==="browser_context_missing"?"browser_context_missing":
    "cdp_unavailable";
  process.exitCode=4;
}finally{
  try{await browser?.close()}catch{}
  print();
}

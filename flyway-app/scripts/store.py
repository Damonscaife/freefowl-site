# Needs the game served locally: from the repo root run `python3 -m http.server 8765`, then `pip install playwright && playwright install chromium`.
# App Store screenshots: 6.9" iPhone (1320x2868) and 13" iPad (2064x2752), each with a caption band.
from playwright.sync_api import sync_playwright
import os
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'appstore') + '/'
CAP = """([t,s])=>{ let d=document.getElementById('storecap'); if(!d){ d=document.createElement('div'); d.id='storecap'; document.body.appendChild(d); }
 d.style.cssText='position:fixed;left:0;right:0;top:0;padding:calc(env(safe-area-inset-top) + 7vh) 7vw 9vh;z-index:50;pointer-events:none;text-align:center;color:#fff;font-family:"Bricolage Grotesque",sans-serif;background:linear-gradient(rgba(6,12,31,.82),rgba(6,12,31,.55) 65%,rgba(6,12,31,0))';
 d.innerHTML='<div style="font-weight:800;font-size:min(9vw,64px);line-height:1.02;letter-spacing:-1px">'+t+'</div><div style="font-weight:600;font-size:min(4.4vw,26px);opacity:.88;margin-top:10px">'+s+'</div>';
 document.querySelector('.hud').style.opacity=0; d.style.right=(innerWidth-document.getElementById('stage').getBoundingClientRect().right)+'px'; }"""
SHOTS = [
  ('1-golden', 'Lisbon', 'Fly your bird around the world', 'From your city to every continent', "__flyway.side.forceHour=18.2", 1),
  ('2-globe', 'Tokyo', 'Watch it cross the planet', 'Zoom from the clouds to the Moon', "__flyway.side.forceHour=12; __flyway.setZoom(0.5)", 0),
  ('3-duel', 'Denver', 'Fight off hawks and owls', 'Every tap powers up your bird', "__flyway.side.forceHour=10; (()=>{const S=__flyway.S;S.arrivals=5;S.levels.flock=0})(); __flyway.forceThreat('hawk')", 1),
  ('4-aurora', 'Oslo', 'Chase auroras and rainbows', 'Weather that changes as you fly', "__flyway.side.forceHour=23.5", 1),
  ('5-sea', 'Honolulu', 'Soar over whales and waves', 'Ships, storms and giant breakers', "__flyway.side.forceHour=7.2; __flyway.seaLife().rogueT=0", 1),
]
import sys
DEV = [('ipad13', 1032, 1376, 2)] if 'ipad' in sys.argv else [('iphone69', 440, 956, 3), ('ipad13', 1032, 1376, 2)]
ONLY = sys.argv[2:]
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    for dev,w,h,dpr in DEV:
        for name, city, t, sub, js, wait in SHOTS:
            if ONLY and name not in ONLY: continue
            pg=b.new_page(viewport={'width':w,'height':h}, device_scale_factor=dpr); errs=[]
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto('http://localhost:8765/flyway/'); pg.wait_for_timeout(1500)
            pg.select_option('#cityPick', label=city); pg.click('#btnGo'); pg.wait_for_function("+document.getElementById('side').style.opacity > 0.99", timeout=120000); pg.wait_for_timeout(800)
            if name == '5-sea': pg.evaluate("__flyway.S.levels.wings=4"); pg.wait_for_timeout(9000); pg.evaluate("__flyway.S.levels.wings=0")
            pg.evaluate(js); pg.wait_for_timeout(3000 if name != '3-duel' else 0)
            if name == '3-duel': pg.wait_for_function("__flyway.side.threat && __flyway.side.threat.phase==='battle'", timeout=90000); pg.wait_for_timeout(1700)
            if name == '5-sea': pg.wait_for_timeout(1500)
            pg.evaluate(CAP, [t, sub]); pg.wait_for_timeout(300)
            pg.screenshot(path=OUT+f'{dev}-{name}.jpg', type='jpeg', quality=92)
            print(dev, name, errs or 'ok'); pg.close()
    b.close()

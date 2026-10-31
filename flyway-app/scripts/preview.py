# Needs the game served locally: from the repo root run `python3 -m http.server 8765`, then `pip install playwright && playwright install chromium`.
# Draft 30 s App Preview for 6.9" iPhone (886x1920), recorded from the web build.
import os, glob
from playwright.sync_api import sync_playwright
import tempfile
VID=tempfile.mkdtemp() + '/'
os.makedirs(VID, exist_ok=True)
for f in glob.glob(VID+'*'): os.remove(f)
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=b.new_context(viewport={'width':443,'height':960}, record_video_dir=VID, record_video_size={'width':443,'height':960})
    pg=ctx.new_page()
    pg.goto('http://localhost:8765/flyway/'); pg.wait_for_timeout(1200)
    pg.select_option('#cityPick', label='Lisbon'); pg.click('#btnGo')
    pg.wait_for_function("+document.getElementById('side').style.opacity > 0.99", timeout=60000)
    pg.evaluate("__flyway.side.forceHour=18.3; __flyway.S.levels.wings=3")
    for i in range(14): pg.click('#flap'); pg.wait_for_timeout(260)
    pg.wait_for_timeout(1500)
    pg.evaluate("__flyway.side.forceHour=12; (()=>{const S=__flyway.S;S.arrivals=5;S.levels.flock=0})(); __flyway.forceThreat('hawk')")
    pg.wait_for_timeout(600)
    for i in range(16): pg.click('#flap'); pg.wait_for_timeout(150)
    pg.wait_for_timeout(8000)
    pg.evaluate("__flyway.setZoom(0.95)"); pg.evaluate("window.ZT=0"); 
    pg.evaluate("(()=>{let z=0.97; const id=setInterval(()=>{z-=0.012; __flyway.setZoom(Math.max(0.42,z)); if(z<0.42) clearInterval(id)},50)})()")
    pg.wait_for_timeout(5500)
    pg.evaluate("(()=>{let z=0.42; const id=setInterval(()=>{z+=0.012; __flyway.setZoom(Math.min(1,z)); if(z>=1) clearInterval(id)},50)})()")
    pg.wait_for_timeout(5000)
    pg.evaluate("__flyway.side.forceHour=23")
    pg.wait_for_timeout(3000)
    ctx.close(); b.close()
print(glob.glob(VID+'*'))

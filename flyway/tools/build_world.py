# Builds world.png, world2.png and world.json for Flyway from open map data:
#  - elevation: NOAA ETOPO 10-minute (ice surface), via pyvista/vtk-data on GitHub (public domain)
#  - climate: Koppen-Geiger 1 km main groups (Beck et al. 2018, CC BY 4.0, via the koppengeiger
#    package) refined with the 0.5-degree full classes (Kottek/Rubel, via the CRAN kgc package)
#  - towns, rivers, lakes, roads, countries and named regions: Natural Earth (public domain)
# world.png RGB: R = sqrt(elevation)/sqrt(6500)*255, G = climate class (see CLS), B = flags
# (1 urban, 2 river, 4 lake, 8 road). world2.png RGB: R = country index, G/B = region index.
import json, numpy as np, pyreadr, math
from PIL import Image, ImageDraw
D='/tmp/claude-0/-home-claude/56e7d00a-0bff-5bc3-bffd-6e21e5a90f11/scratchpad/data/'
OUT='/home/claude/freefowl-site/flyway/'
W,H=2160,1080
lat=90-(np.arange(H)+0.5)/6; lon=-180+(np.arange(W)+0.5)/6
LON,LAT=np.meshgrid(lon,lat)
# ---- elevation (ETOPO 10', ice surface) ----
alt=np.load(D+'etopo/alt.npy'); NC=2161
ri=np.clip(np.round((90-LAT)*6).astype(int),0,1080); ci=np.round(((LON+360)%360)*6).astype(int)%2160
elev=alt[ri*NC+ci]
R=np.clip(np.round(np.sqrt(np.maximum(0,elev))/math.sqrt(6500)*255),0,255).astype(np.uint8)
# ---- climate: 1 km main group + 0.5 degree full Koppen ----
main=np.load(D+'kg.npy')            # 0 sea, 1 A, 2 B, 3 C, 4 D, 5 E
cz=pyreadr.read_r(D+'kgc/data/climatezones.rda')['climatezones']
full=np.full((360,720),'',dtype=object)
for la,lo,c in zip(cz.Lat,cz.Lon,cz.Cls): full[int((90-la)//0.5) if (90-la)<180 else 359, int((lo+180)//0.5)%720]=str(c)
CLS={'Af':1,'Am':1,'Aw':2,'As':2,'BWh':3,'BWk':4,'BSh':5,'BSk':6,'Csa':7,'Csb':7,'Csc':7,'Cfa':8,'Cwa':8,'Cfb':9,'Cfc':9,'Cwb':9,'Cwc':9,
     'Dfa':10,'Dfb':10,'Dwa':10,'Dwb':10,'Dsa':10,'Dsb':10,'Dfc':11,'Dfd':11,'Dwc':11,'Dwd':11,'Dsc':11,'Dsd':11,'ET':12,'EF':13}
DEF={1:2,2:6,3:9,4:10,5:12}; LET={1:'A',2:'B',3:'C',4:'D',5:'E'}
G=np.zeros((H,W),np.uint8)
for r in range(H):
    fr=min(359,r//3)
    for c in range(W):
        m=main[r,c]
        if not m: continue
        fc=c//3; got=None
        for d in range(0,4):
            for dr in range(-d,d+1):
                for dc in range(-d,d+1):
                    if max(abs(dr),abs(dc))!=d: continue
                    k=full[min(359,max(0,fr+dr)),(fc+dc)%720]
                    if k and k[0]==LET[m]: got=CLS.get(k); break
                if got: break
            if got: break
        G[r,c]=got or DEF[m]
# ---- Natural Earth: urban areas, rivers, lakes, roads ----
S=4  # draw at 4x, then any-pixel per cell
def canvas(): return Image.new('L',(W*S,H*S),0)
def px(p): return ((p[0]+180)/360*W*S, (90-p[1])/180*H*S)
def polys(geom):
    t=geom['type']; cs=geom['coordinates']
    if t=='Polygon': return [cs]
    if t=='MultiPolygon': return cs
    return []
def lines(geom):
    t=geom['type']; cs=geom['coordinates']
    if t=='LineString': return [cs]
    if t=='MultiLineString': return cs
    return []
def raster(fn, kind, width=1, filt=None):
    im=canvas(); d=ImageDraw.Draw(im)
    for f in json.load(open(D+'ne/'+fn))['features']:
        if filt and not filt(f['properties']): continue
        g=f['geometry']
        if not g: continue
        if kind=='poly':
            for poly in polys(g): d.polygon([px(p) for p in poly[0]], fill=255)
        else:
            for ln in lines(g):
                pts=[px(p) for p in ln]
                for a,b in zip(pts,pts[1:]):
                    if abs(a[0]-b[0])<W*S/2: d.line([a,b], fill=255, width=width)
    a=np.asarray(im).reshape(H,S,W,S).max(axis=(1,3))
    return a>0
urban=raster('ne_10m_urban_areas.geojson','poly')
river=raster('ne_10m_rivers_lake_centerlines.geojson','line',2, lambda p: (p.get('scalerank') or 9)<=7)
lake=raster('ne_10m_lakes.geojson','poly')
road=raster('ne_10m_roads.geojson','line',2, lambda p: p.get('type') in ('Major Highway','Secondary Highway','Beltway','Road'))
B=(urban*1 | river*2 | lake*4 | road*8).astype(np.uint8)
Image.fromarray(np.dstack([R,G,B]),'RGB').save(OUT+'world.png', optimize=True)
# ---- names: countries and physical regions ----
names={'countries':[''],'regions':['']}
cim=Image.new('L',(W,H),0); cd=ImageDraw.Draw(cim)
feats=json.load(open(D+'ne/ne_50m_admin_0_countries.geojson'))['features']
feats.sort(key=lambda f:-(f['properties'].get('POP_EST') or 0))
for f in feats:
    names['countries'].append(f['properties'].get('NAME') or f['properties'].get('ADMIN'))
    i=len(names['countries'])-1
    for poly in polys(f['geometry']): cd.polygon([((p[0]+180)/360*W,(90-p[1])/180*H) for p in poly[0]], fill=i)
rim=Image.new('I',(W,H),0); rd=ImageDraw.Draw(rim)
KEEP={'Range/mtn','Desert','Plateau','Plain','Basin','Valley','Lowland','Tundra','Wetlands','Delta','Geoarea','Coast','Foothills','Gorge','Peninsula'}
rf=[f for f in json.load(open(D+'ne/ne_10m_geography_regions_polys.geojson'))['features'] if f['properties'].get('FEATURECLA') in KEEP and f['geometry']]
def area(f):
    a=0
    for poly in polys(f['geometry']):
        ring=poly[0]; a+=abs(sum(x0*y1-x1*y0 for (x0,y0),(x1,y1) in zip(ring,ring[1:])))/2
    return a
rf.sort(key=lambda f:-area(f))
for f in rf:
    p=f['properties']; names['regions'].append([p.get('NAME'), p.get('FEATURECLA')]); i=len(names['regions'])-1
    for poly in polys(f['geometry']): rd.polygon([((q[0]+180)/360*W,(90-q[1])/180*H) for q in poly[0]], fill=i)
ra=np.asarray(rim).astype(np.uint16)
Image.fromarray(np.dstack([np.asarray(cim),(ra>>8).astype(np.uint8),(ra&255).astype(np.uint8)]),'RGB').save(OUT+'world2.png', optimize=True)
json.dump(names, open(OUT+'world.json','w'), ensure_ascii=False, separators=(',',':'))
print('classes', np.bincount(G.ravel(),minlength=14), 'flags urban',urban.sum(),'river',river.sum(),'lake',lake.sum(),'road',road.sum(), 'countries',len(names['countries']),'regions',len(names['regions']))

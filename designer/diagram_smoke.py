"""Browser acceptance for the object plan and the free wiring diagram."""
import os
from pathlib import Path
from playwright.sync_api import expect


def verify_diagrams(browser, url, tmp):
    ctx = browser.new_context(viewport={"width": 1600, "height": 1000})
    p = ctx.new_page()
    errors = []
    p.on("pageerror", lambda exc: errors.append(str(exc)))
    p.goto(url + "?project=demo#plan")
    p.set_default_timeout(8000)
    btn = lambda name: p.get_by_role("button", name=name, exact=True)

    def capture(name):
        target = Path(os.environ.get("AES_VISUAL_DIR", tmp))
        target.mkdir(parents=True, exist_ok=True)
        p.screenshot(path=target / (name + ".png"), animations="disabled")

    def geometry():
        # Inspect rendered segments against rendered card bounds in SVG coordinates.
        return p.locator(".orthoSvg").evaluate("""svg=>{
          const cards=[...svg.querySelectorAll('.mapcard>rect,.wirednode>rect')].map(el=>el.getBBox());
          const edges=[...svg.querySelectorAll('.routeedge')];
          if(!edges.length||edges.length!==diagramScene.edges.length)throw Error('Missing edges');
          for(const g of edges)for(const hit of g.querySelectorAll('[data-segment]')){
            const a=hit.getPointAtLength(0),b=hit.getPointAtLength(hit.getTotalLength());
            if(Math.abs(a.x-b.x)>.01&&Math.abs(a.y-b.y)>.01)throw Error('Diagonal');
            for(const r of cards){
              const vert=Math.abs(a.x-b.x)<.01;
              const cut=vert ? a.x>r.x+.02&&a.x<r.x+r.width-.02&&Math.max(a.y,b.y)>r.y+.02&&Math.min(a.y,b.y)<r.y+r.height-.02
                :a.y>r.y+.02&&a.y<r.y+r.height-.02&&Math.max(a.x,b.x)>r.x+.02&&Math.min(a.x,b.x)<r.x+r.width-.02;
              if(cut)throw Error('Segment crosses card '+g.getAttribute('aria-label'));
            }
          }
          return edges.length;
        }""")

    def drag_segment():
        target = p.locator(".orthoSvg").evaluate("""svg=>{
          const canvas=svg.parentElement.getBoundingClientRect();
          for(const group of svg.querySelectorAll('.routeedge')){
            for(const seg of group.querySelectorAll('[data-segment]')){
              if(seg.getTotalLength()<26)continue;
              for(const k of [.5,.25,.75]){
                const q=seg.getPointAtLength(seg.getTotalLength()*k).matrixTransform(seg.getScreenCTM());
                if(q.x<canvas.left||q.x>canvas.right||q.y<canvas.top||q.y>canvas.bottom||q.y>innerHeight-20)continue;
                if(document.elementFromPoint(q.x,q.y)?.closest('.routeedge')!==group)continue;
                const key=group.dataset.bundle||group.dataset.freeEdge, edge=diagramScene.edges.find(e=>e.key===key),i=+seg.dataset.segment;
                const horizontal=edge.path[i].y===edge.path[i+1].y;
                for(const delta of [14,-14])if(slideSegment(edge.path,i,delta,diagramScene.boxes)){
                  return [q.x,q.y,horizontal?0:delta,horizontal?delta:0,key];
                }
              }
            }
          }
          throw Error('Missing visible segment');
        }""")
        x, y, dx, dy, key = target
        p.mouse.move(x, y)
        p.mouse.down()
        p.mouse.move(x+dx, y+dy, steps=8)
        p.mouse.up()
        assert p.evaluate("k=>model.diagramRoutes?.some(r=>r.key===k&&r.view===diagramScene.view&&r.points?.length)", key)
        return key

    expect(p.get_by_role("heading", name="План объектов", exact=True)).to_be_visible()
    assert geometry() > 2
    colors = p.locator(".routeedge .routeink").evaluate_all("els=>els.map(e=>e.getAttribute('stroke'))")
    assert len(colors) == len(set(colors))
    key = drag_segment()
    p.get_by_label("Цвет группы").fill("#ce3467")
    assert p.evaluate("k=>diagramSettings('panels',k).color", key) == "#ce3467"
    geometry()
    capture("01-object-plan")
    p.reload()
    expect(p.locator(".mapsvg")).to_be_visible()
    assert p.evaluate("k=>diagramSettings('panels',k).points.length>1 && diagramSettings('panels',k).color==='#ce3467'", key)
    btn("Здания").click()
    geometry()
    btn("Щиты и помещения").click()
    p.locator(".routeedge").filter(has=p.locator('.routeink[stroke="#ce3467"]')).focus()
    p.keyboard.press("Enter")
    btn("Автоцвет").click()
    btn("Автопрокладка").click()
    assert not p.evaluate("k=>!!diagramSettings('panels',k)", key)
    btn("Отменить").click()
    btn("Сеть связей").click()
    expect(btn("По группам")).to_have_attribute("aria-pressed", "true")
    btn("Свободная сеть").click()
    btn("Вписать").click()
    assert geometry() == 28
    key = drag_segment()
    card = p.locator('.orthoSvg [data-node="q1"]')
    box = card.bounding_box()
    x, y = box["x"]+20, box["y"]+18
    p.mouse.move(x, y)
    p.mouse.down()
    p.mouse.move(x+16, y+18, steps=6)
    p.mouse.up()
    assert p.evaluate("!!node('q1').freeXY")
    geometry()
    source = p.locator('.orthoSvg [data-pin="q1:out"]').bounding_box()
    target = p.locator('.orthoSvg [data-pin="sa1:a"]').bounding_box()
    p.mouse.move(source["x"]+source["width"]/2,source["y"]+source["height"]/2)
    p.mouse.down()
    p.mouse.move(target["x"]+target["width"]/2,target["y"]+target["height"]/2,steps=10)
    p.mouse.up()
    dlg = p.get_by_role("dialog")
    dlg.get_by_label("Обозначение провода").fill("W-FREE")
    dlg.get_by_role("button",name="Сохранить провод").click()
    assert geometry() == 29
    btn("W-FREE").click()
    p.locator(".mapdetail").get_by_role("button",name="Фиолетовый",exact=True).click()
    p.locator(".orthoSvg").scroll_into_view_if_needed()
    expect(p.locator("#toast")).to_be_empty(timeout=6500)
    capture("02-free-network")
    before=p.evaluate("JSON.stringify(model)")
    btn("Сохранить").click()
    with p.expect_download() as result:
        dlg.get_by_role("button",name="HTML · редактор и модель").click()
    saved=tmp/"orthogonal.html"
    result.value.save_as(saved)
    offline=browser.new_context(offline=True)
    saved_page=offline.new_page()
    saved_page.goto(saved.as_uri()+"#network-free")
    expect(saved_page.locator(".orthoSvg")).to_be_visible()
    assert saved_page.evaluate("JSON.stringify(model)") == before
    offline.close()
    assert not errors, errors
    ctx.close()
    print("PASS rendered orthogonality and card clearance, both plan scopes, palette, segment drag, free node and port drag, per-wire edits, auto routing, undo and offline HTML")

"""Exercise the deployed HTML through the same controls used by a project author."""
import functools
import http.server
import json
import os
from pathlib import Path
import shutil
import tempfile
import threading

from playwright.sync_api import expect, sync_playwright

root = Path(__file__).resolve().parent.parent

class SilentHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def verify(playwright, url, tmp):
    chrome = os.environ.get("AES_CHROME") or shutil.which("google-chrome") or shutil.which("chromium")
    browser = playwright.chromium.launch(executable_path=chrome)
    desktop = browser.new_context(viewport={"width": 1440, "height": 960})
    page = desktop.new_page()
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.goto(url)
    dialog = page.get_by_role("dialog")

    def click(name):
        page.get_by_role("button", name=name, exact=True).click()

    def submit(name):
        dialog.get_by_role("button", name=name, exact=True).click()

    def export(label, path):
        click("Сохранить")
        with page.expect_download() as event:
            submit(label)
        event.value.save_as(path)

    def import_project(path):
        page.locator("#importfile").set_input_files(path)
        submit("Открыть")

    expect(page.get_by_role("heading", name="Главный щит", exact=True)).to_be_visible()
    click("Добавить щит")
    dialog.get_by_label("Название", exact=True).fill("Тестовый щит")
    submit("Добавить щит")
    click("Перестановка аппаратов")
    click("Рейка 2, добавить в позицию 4")
    dialog.get_by_role("combobox", name="Тип", exact=True).select_option("custom")
    dialog.get_by_label("Название", exact=True).fill("Лабораторный модуль")
    dialog.get_by_label("Обозначение").fill("ZZ1")
    submit("Добавить")
    expect(page.locator(".device.selected")).to_contain_text("ZZ1")
    click("Соединить")
    dialog.get_by_role("combobox", name="Откуда", exact=True).select_option("q1:out")
    target = dialog.get_by_role("combobox", name="Куда", exact=True).locator("option:checked").inner_text()
    assert target.startswith("ZZ1"), target
    dialog.get_by_label("Кабель / метка").fill("Межщитовая линия")
    submit("Создать связь")
    click("Свойства")
    dialog.get_by_role("combobox", name="Размещение", exact=True).select_option("reserve")
    dialog.get_by_label("DIN-рейка").fill("1")
    dialog.get_by_label("Первое место").fill("1")
    submit("Применить")
    expect(dialog.get_by_role("alert")).to_contain_text("занято")
    dialog.get_by_label("Первое место").fill("8")
    submit("Применить")
    expect(page.get_by_role("heading", name="Щит резерва", exact=True)).to_be_visible()
    click("Сеть дома")
    expect(page.get_by_role("row").filter(has_text="Межщитовая линия")).to_contain_text("ZZ1")
    page.reload()
    click("Ведомость")
    expect(page.get_by_role("row").filter(has_text="ZZ1")).to_contain_text("ЩР-02")
    export("JSON · только модель", tmp / "project.json")
    saved = json.loads((tmp / "project.json").read_bytes())
    device = next(n for n in saved["nodes"] if n["tag"] == "ZZ1")
    assert device["place"] == {"board": "reserve", "row": 1, "slot": 8}
    link = next(l for l in saved["links"] if l["label"] == "Межщитовая линия")
    assert link["to"] == {"node": device["id"], "port": "in"}
    # A rejected import must leave the previous working model intact.
    invalid = json.loads(json.dumps(saved))
    invalid["links"][0]["to"]["node"] = "missing"
    (tmp / "invalid.json").write_text(json.dumps(invalid))
    page.locator("#importfile").set_input_files(tmp / "invalid.json")
    expect(page.locator("#toast")).to_contain_text("Импорт отклонён")
    click("Проект")
    click("Новый проект")
    submit("Создать")
    expect(page.get_by_role("heading", name="Щиты проекта")).to_be_visible()
    import_project(tmp / "project.json")
    export("JSON · только модель", tmp / "imported.json")
    assert json.loads((tmp / "imported.json").read_bytes()) == saved
    export("HTML · редактор и модель", tmp / "project.html")
    # A new offline context must recover the embedded model without a draft or server.
    portable = browser.new_context(offline=True)
    page = portable.new_page()
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    dialog = page.get_by_role("dialog")
    page.goto((tmp / "project.html").as_uri())
    expect(page.locator("#savestate")).to_have_text("Снимок HTML")
    export("JSON · только модель", tmp / "offline.json")
    assert json.loads((tmp / "offline.json").read_bytes()) == saved
    click("Щит")
    dialog.get_by_label("Название", exact=True).fill("Щит после переноса")
    submit("Применить")
    export("HTML · редактор и модель", tmp / "next.html")
    page.goto((tmp / "next.html").as_uri())
    expect(page.get_by_role("heading", name="Щит после переноса")).to_be_visible()
    page.set_viewport_size({"width": 390, "height": 844})
    click("Навигация")
    click("Сеть дома")
    expect(page.get_by_role("heading", name="Сеть дома", exact=True)).to_be_visible()
    click("Вписать")
    assert page.locator(".netcanvas").evaluate("el => el.scrollWidth <= el.clientWidth + 1"), "Network fit"
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Page overflow on mobile"
    assert not errors, errors
    print("PASS: add, cross-panel link, collision, relocation, reload, rejected import, JSON roundtrip, offline HTML roundtrip, offline edit and re-export, mobile navigation")
    verify_wiring(browser, url, tmp)
    verify_studio(browser, url, tmp)
    browser.close()


def verify_wiring(browser, url, tmp):
    context = browser.new_context(viewport={"width": 1600, "height": 1000})
    page = context.new_page()
    page.set_default_timeout(10000)
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.goto(url)
    dlg = page.get_by_role("dialog")

    def button(name):
        return page.get_by_role("button", name=name, exact=True)

    def draft():
        return page.evaluate("JSON.parse(localStorage.getItem('aes-studio:AES2:work:'+location.pathname))")

    def drag_pin(start, end):
        source = page.locator(f'.wiringsvg [data-pin="{start}"]')
        target = page.locator(f'.wiringsvg [data-pin="{end}"]')
        source.scroll_into_view_if_needed()
        target.scroll_into_view_if_needed()
        a, b = source.bounding_box(), target.bounding_box()
        page.mouse.move(a['x']+a['width']/2, a['y']+a['height']/2)
        page.mouse.down()
        page.mouse.move(b['x']+b['width']/2, b['y']+b['height']/2, steps=12)
        page.mouse.up()
        expect(dlg.get_by_role("heading", name="Проложить провод")).to_be_visible()

    expect(page.locator(".boarddrawing")).to_be_visible()
    button("Подсветить провода аппарата").click()
    assert page.locator('.boarddrawing .drawedge[opacity="0.12"]').count() > 0
    button("Показать все провода").click()
    button("Масштаб 1:1").click()
    expect(button("Вписать щит")).to_be_visible()
    button("Вписать щит").click()
    drag_pin("q4:out", "q3:in")
    dlg.get_by_label("Обозначение провода").fill("W-ручной")
    dlg.get_by_role("combobox", name="Цвет провода").select_option("grey")
    button("Сохранить провод").click()
    model = draft()
    link = next(l for l in model["links"] if any(w["name"]=="W-ручной" for w in l["wires"]))
    wid = link["wires"][0]["id"]
    assert link["from"]["node"] == "q4" and link["to"]["node"] == "q3"
    page.locator(".wirecatalog summary").click()
    page.locator(f'[data-act="wireOptions"][data-id="{wid}"]').click()
    button("Ручная прокладка").click()
    page.locator(".wiringsvg").click(position={"x": 81, "y": 40})
    button("Сохранить трассу").click()
    route = next(l for l in draft()["links"] if l["id"]==link["id"])["wires"][0]["routes"]["main"]
    assert len(route)==1, route

    button("Сеть дома").click()
    drag_pin("q1:out", "sa1:a")
    dlg.get_by_label("Обозначение провода").fill("W-сеть")
    button("Сохранить провод").click()
    assert any(w["name"]=="W-сеть" for l in draft()["links"] for w in l["wires"])
    button("План объектов").click()
    button("Здания").click()
    card = page.locator('[data-mapid="house"]')
    a = card.bounding_box()
    page.mouse.move(a["x"]+30,a["y"]+25)
    page.mouse.down()
    page.mouse.move(a["x"]+67,a["y"]+65,steps=7)
    page.mouse.up()
    moved = next(a for a in draft()["areas"] if a["id"]=="house")["xy"]
    assert moved["x"] > 35 and moved["y"] > 45
    bundle = page.locator("[data-bundle]").first
    bundle.locator("rect").click()
    expect(page.locator(".mapdetail")).to_contain_text("Кабелей")
    button("Ведомость").click()
    button("Провода и кабели").click()
    expect(page.get_by_role("heading",name="Журнал соединений проводов")).to_be_visible()
    expect(page.locator(".matstats")).to_contain_text("м")
    button("Расчёты").click()
    stock = next(c for c in draft()["cables"] if c["design"]["members"]==["appliance"])
    button(stock["name"]).click()
    expect(page.locator("#calcresult")).to_contain_text("10 А")
    expect(page.locator("#calcresult")).to_contain_text("1.5 мм²")
    button("Сохранить условия").click()
    button("Сохранить").click()
    with page.expect_download() as result:
        button("HTML · редактор и модель").click()
    output = tmp / "wiring.html"
    result.value.save_as(output)
    offline = browser.new_context(offline=True)
    portable = offline.new_page()
    portable.goto(output.as_uri())
    expect(portable.locator(".boarddrawing")).to_be_visible()
    portable.get_by_role("button",name="Сохранить",exact=True).click()
    with portable.expect_download() as result:
        portable.get_by_role("button",name="JSON · только модель",exact=True).click()
    result.value.save_as(tmp / "wiring.json")
    assert json.loads((tmp / "wiring.json").read_bytes()) == draft()
    button("Конструктор щита").click()
    page.locator(".wirecatalog summary").click()
    page.locator(f'[data-act="wireOptions"][data-id="{wid}"]').click()
    dlg.get_by_role("button", name="Автопрокладка", exact=True).click()
    assert not next(l for l in draft()["links"] if l["id"]==link["id"])["wires"][0]["routes"].get("main")
    assert not errors, errors
    offline.close()
    context.close()
    print("PASS port drag in both views, conductor color, manual and automatic routes, site drag and bundles, BOM, circuit sizing, edited offline model")


def verify_studio(browser, url, tmp):
    context = browser.new_context(viewport={"width": 1500, "height": 1050})
    page = context.new_page()
    page.set_default_timeout(10000)
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.goto(url)
    version = page.get_by_role("button", name="Версия студии 2.1.0 · выбрать проект", exact=True)
    dialog = page.get_by_role("dialog")
    expect(version).to_be_visible()
    expect(page.locator(".boarddrawing .drawnDevice").first).to_be_visible()

    # Start from a former browser draft that already uses the current JSON format.
    fixture = page.evaluate("""() => {
      const m=makeDemo(),link=m.links.find(l=>l.wires.some(w=>w.role==='L') &&
        m.nodes.find(n=>n.id===l.from.node).place?.board==='main');
      link.wires=[link.wires.find(w=>w.role==='L')];
      m.links=[link];m.title='Мой рабочий щит';
      localStorage.setItem('aes-studio:v1:'+location.pathname,JSON.stringify(m));
      return m;
    }""")
    wid = fixture["links"][0]["wires"][0]["id"]
    page.reload()
    expect(page.locator(".projectcard")).to_have_text("Мой рабочий щит")
    edge = page.locator(f'.boarddrawing .drawedge[data-wire="{wid}"]')
    visible = edge.locator(".visiblewire")

    def endpoints():
        return visible.evaluate("""p=>[0,p.getTotalLength()].map(n=>{
          const v=p.getPointAtLength(n);return [v.x,v.y];})""")

    def hit():
        return visible.evaluate("""p=>{
          const g=p.closest('.drawedge'),m=p.getScreenCTM(),len=p.getTotalLength();
          for(let f=.5,step=0;step<90;step++,f=.05+step*.01){
            const q=p.getPointAtLength(f*len).matrixTransform(m);
            if(document.elementFromPoint(q.x,q.y)?.closest('.drawedge')===g)return [q.x,q.y];
          }
          throw Error('Wire missing a visible drag target');
        }""")

    def wire():
        return page.evaluate("""id=>JSON.parse(localStorage.getItem('aes-studio:AES2:work:'+location.pathname))
            .links.flatMap(l=>l.wires).find(w=>w.id===id)""", wid)

    ends = endpoints()
    page.mouse.click(*hit())
    inspector = page.locator(".wireinspector")
    inspector.get_by_role("button", name="Оранжевый", exact=True).click()
    expect(visible).to_have_attribute("stroke", "#b96713")
    assert wire()["color"] == "orange"
    x, y = hit()
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x+26, y+21, steps=8)
    page.mouse.up()
    route = wire()["routes"]["main"]
    assert route and endpoints() == ends
    expect(dialog).not_to_be_visible()
    page.reload()
    expect(visible).to_have_attribute("stroke", "#b96713")
    assert wire()["routes"]["main"] == route and endpoints() == ends
    # Escape must cancel a live preview and leave the saved route untouched.
    x, y = hit()
    old_path = visible.get_attribute("d")
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x+20, y+15, steps=5)
    page.keyboard.press("Escape")
    page.mouse.up()
    assert wire()["routes"]["main"] == route and visible.get_attribute("d") == old_path
    page.mouse.click(*hit())
    inspector.get_by_role("button", name="Автопрокладка", exact=True).click()
    assert not wire()["routes"].get("main")
    page.get_by_role("button", name="Отменить", exact=True).click()
    assert wire()["routes"]["main"] == route
    version.click()
    expect(dialog).to_contain_text("Формат проекта AES/2")
    dialog.get_by_role("link", name="Демопроект с проводкой").click()
    expect(page.locator(".workspacecrumb")).to_have_text("Демопроект")
    assert page.locator(".boarddrawing .drawedge[data-wire]").count() > 1
    page.locator(".projectcard").click()
    dialog.get_by_role("textbox").fill("Отдельная демонстрация")
    dialog.locator('button[type="submit"]').click()
    version.click()
    dialog.get_by_role("link", name="Рабочий проект").click()
    expect(page.locator(".projectcard")).to_have_text("Мой рабочий щит")
    assert wire()["routes"]["main"] == route and wire()["color"] == "orange"

    # A logical-only AES/2 draft stays editable and explains its empty wire layer.
    page.evaluate("""() => {const key='aes-studio:AES2:work:'+location.pathname;
      const m=JSON.parse(localStorage.getItem(key));m.links.forEach(l=>l.wires=[]);
      localStorage.setItem(key,JSON.stringify(m));}""")
    page.reload()
    expect(page.get_by_role("button", name="Добавить первый провод")).to_be_visible()
    raw_old = json.dumps({**fixture, "format": "AES/1"}, ensure_ascii=False)
    page.evaluate("""raw=>{
        localStorage.removeItem('aes-studio:AES2:work:'+location.pathname);
        localStorage.setItem('aes-studio:v1:'+location.pathname,raw);
    }""", raw_old)
    page.reload()
    assert page.locator(".boarddrawing .drawedge[data-wire]").count() > 1
    version.click()
    with page.expect_download() as event:
        dialog.get_by_role("button", name="Скачать прежний черновик").click()
    output = tmp / "old-draft.json"
    event.value.save_as(output)
    assert output.read_text() == raw_old
    assert page.evaluate("localStorage.getItem('aes-studio:v1:'+location.pathname)") == raw_old
    assert not errors, errors
    context.close()
    print("PASS studio release, old draft recovery, isolated demo, faceplates, direct wire drag, ends, palette, undo, cancel, persisted route and color")


if __name__ == "__main__":
    handler = functools.partial(SilentHandler, directory=root / "dist")
    with http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with tempfile.TemporaryDirectory() as tmp, sync_playwright() as playwright:
                verify(playwright, f"http://127.0.0.1:{server.server_port}/", Path(tmp))
        finally:
            server.shutdown()

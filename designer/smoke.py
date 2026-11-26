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
    submit("Новый проект")
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
    browser.close()


if __name__ == "__main__":
    handler = functools.partial(SilentHandler, directory=root / "dist")
    with http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with tempfile.TemporaryDirectory() as tmp, sync_playwright() as playwright:
                verify(playwright, f"http://127.0.0.1:{server.server_port}/", Path(tmp))
        finally:
            server.shutdown()
